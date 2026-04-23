/**
 * db.js
 * จัดการ SQLite ทั้งหมด — stock และ history
 * ไฟล์ฐานข้อมูลจะถูกสร้างเป็น database.db ในโฟลเดอร์ project
 */

const Database = require('better-sqlite3');
const path     = require('path');

// ─── เชื่อมต่อ / สร้างไฟล์ .db ───────────────────────────────
const db = new Database(path.join(__dirname, 'database.db'));

// ─── กำหนดรางวัลและ stock เริ่มต้น ────────────────────────────
const INITIAL_PRIZES = [
  { name: 'ปากกา', unit: 'แท่ง', icon: '✏️', stock: 10 },
  { name: 'สมุด',  unit: 'เล่ม', icon: '📒', stock: 5  },
  { name: 'ผ้าห่ม', unit: 'ผืน', icon: '🛏️', stock: 1  },
];

// ─── สร้างตาราง ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS stock (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    unit      TEXT    NOT NULL,
    icon      TEXT    NOT NULL,
    remaining INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    fname     TEXT NOT NULL,
    lname     TEXT NOT NULL,
    phone     TEXT NOT NULL,
    email     TEXT NOT NULL,
    company   TEXT NOT NULL,
    position  TEXT NOT NULL,
    interest  TEXT NOT NULL,
    note      TEXT NOT NULL DEFAULT '',
    admin_note TEXT NOT NULL DEFAULT '',
    prize     TEXT NOT NULL,
    unit      TEXT NOT NULL,
    icon      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ─── Migration: เพิ่มคอลัมน์ note ให้ DB เดิม ────────────────
const historyColumns = db.prepare('PRAGMA table_info(history)').all();
const hasNoteColumn = historyColumns.some(col => col.name === 'note');
if (!hasNoteColumn) {
  db.exec("ALTER TABLE history ADD COLUMN note TEXT NOT NULL DEFAULT ''");
}

const hasAdminNoteColumn = historyColumns.some(col => col.name === 'admin_note');
if (!hasAdminNoteColumn) {
  db.exec("ALTER TABLE history ADD COLUMN admin_note TEXT NOT NULL DEFAULT ''");
}

// ─── Seed stock ถ้าตารางยังว่างอยู่ ────────────────────────────
const stockCount = db.prepare('SELECT COUNT(*) as cnt FROM stock').get().cnt;
if (stockCount === 0) {
  const insert = db.prepare(
    'INSERT INTO stock (name, unit, icon, remaining) VALUES (?, ?, ?, ?)'
  );
  for (const p of INITIAL_PRIZES) {
    insert.run(p.name, p.unit, p.icon, p.stock);
  }
  console.log('✅ สร้าง stock รางวัลเริ่มต้นเรียบร้อย');
}

// ─── Export functions ──────────────────────────────────────────

/** ดึง stock ทั้งหมด */
function getStock() {
  return db.prepare('SELECT * FROM stock ORDER BY id').all();
}

/**
 * เพิ่มรางวัลใหม่ หรือเติมจำนวนให้รางวัลเดิมถ้ามีอยู่แล้ว
 * @param {Object} prize
 */
function addPrize(prize) {
  const name = prize.name.trim();
  const unit = prize.unit.trim();
  const icon = String(prize.icon || '🎁').trim() || '🎁';
  const quantity = Number(prize.quantity);

  if (!name || !unit || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('ข้อมูลของรางวัลไม่ถูกต้อง');
  }

  const existing = db.prepare(
    'SELECT * FROM stock WHERE name = ? AND unit = ?'
  ).get(name, unit);

  if (existing) {
    db.prepare('UPDATE stock SET remaining = remaining + ? WHERE id = ?').run(quantity, existing.id);
    return db.prepare('SELECT * FROM stock WHERE id = ?').get(existing.id);
  }

  const result = db.prepare(
    'INSERT INTO stock (name, unit, icon, remaining) VALUES (?, ?, ?, ?)'
  ).run(name, unit, icon, quantity);

  return db.prepare('SELECT * FROM stock WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * สุ่มรางวัลโดยใช้ remaining เป็น weight แล้วลด stock
 * @returns {Object|null}
 */
function drawPrize() {
  const available = db.prepare('SELECT * FROM stock WHERE remaining > 0').all();
  if (available.length === 0) return null;

  const total = available.reduce((s, p) => s + p.remaining, 0);
  let rand = Math.random() * total;
  let winner = null;

  for (const prize of available) {
    rand -= prize.remaining;
    if (rand <= 0) { winner = prize; break; }
  }
  if (!winner) winner = available[available.length - 1];

  // ลด stock ใน DB
  db.prepare('UPDATE stock SET remaining = remaining - 1 WHERE id = ?').run(winner.id);
  return winner;
}

/**
 * ค้นหาประวัติด้วยเบอร์โทร (normalize ลบ - และ space)
 * @param {string} phone
 */
function findByPhone(phone) {
  const normalized = phone.replace(/[-\s]/g, '');
  // เปรียบเทียบโดย normalize ทั้งสองฝั่ง
  const rows = db.prepare('SELECT * FROM history').all();
  return rows.find(r => r.phone.replace(/[-\s]/g, '') === normalized) || null;
}

/**
 * ค้นหาประวัติด้วยอีเมล (compare แบบ case-insensitive)
 * @param {string} email
 */
function findByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  const rows = db.prepare('SELECT * FROM history').all();
  return rows.find(r => String(r.email || '').trim().toLowerCase() === normalized) || null;
}

/**
 * บันทึกประวัติลงตาราง history
 * @param {Object} data
 */
function saveHistory(data) {
  db.prepare(`
    INSERT INTO history (fname, lname, phone, email, company, position, interest, note, prize, unit, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.fname, data.lname, data.phone, data.email,
    data.company, data.position, data.interest, data.note || '',
    data.prize, data.unit, data.icon
  );
}

/** ดึงประวัติทั้งหมด เรียงล่าสุดขึ้นบน */
function getHistory() {
  return db.prepare('SELECT * FROM history ORDER BY id DESC').all();
}

/**
 * บันทึกโน้ตของทีมงานหลังบ้าน
 * @param {number} id
 * @param {string} adminNote
 */
function updateAdminNote(id, adminNote) {
  const historyId = Number(id);
  if (!Number.isInteger(historyId) || historyId <= 0) {
    throw new Error('รหัสประวัติไม่ถูกต้อง');
  }

  const normalizedNote = String(adminNote || '').trim();
  if (normalizedNote.length > 1000) {
    throw new Error('หมายเหตุทีมงานยาวเกินไป (ไม่เกิน 1000 ตัวอักษร)');
  }

  const result = db.prepare('UPDATE history SET admin_note = ? WHERE id = ?').run(normalizedNote, historyId);
  if (result.changes === 0) {
    throw new Error('ไม่พบรายการประวัติที่ต้องการบันทึก');
  }

  return db.prepare('SELECT * FROM history WHERE id = ?').get(historyId);
}

/**
 * ปรับปรุงจำนวนรางวัล
 * @param {number} id
 * @param {number} newQuantity - จำนวนใหม่ (ต้องมากกว่า 0)
 */
function updateStock(id, newQuantity) {
  const stockId = Number(id);
  const qty = Number(newQuantity);

  if (!Number.isInteger(stockId) || stockId <= 0) {
    throw new Error('รหัส stock ไม่ถูกต้อง');
  }

  if (!Number.isInteger(qty) || qty < 0) {
    throw new Error('จำนวนต้องเป็นตัวเลขจำนวนเต็มที่ไม่น้อยกว่า 0');
  }

  const existing = db.prepare('SELECT * FROM stock WHERE id = ?').get(stockId);
  if (!existing) {
    throw new Error('ไม่พบรางวัลที่ต้องการปรับปรุง');
  }

  if (qty === 0) {
    // ถ้าเป็น 0 ให้ลบออก
    const result = db.prepare('DELETE FROM stock WHERE id = ?').run(stockId);
    if (result.changes === 0) {
      throw new Error('ไม่สามารถลบรางวัลได้');
    }
    return { id: stockId, deleted: true };
  }

  const result = db.prepare('UPDATE stock SET remaining = ? WHERE id = ?').run(qty, stockId);
  if (result.changes === 0) {
    throw new Error('ไม่สามารถปรับปรุง stock ได้');
  }

  return db.prepare('SELECT * FROM stock WHERE id = ?').get(stockId);
}

/**
 * ลบรายการ stock ทั้งหมด
 */
function clearStock() {
  const tx = db.transaction(() => {
    const deleted = db.prepare('DELETE FROM stock').run().changes;
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'stock'").run();
    return deleted;
  });
  return tx();
}

/**
 * ลบประวัติผู้รับรางวัลทั้งหมด
 */
function clearHistory() {
  const tx = db.transaction(() => {
    const deleted = db.prepare('DELETE FROM history').run().changes;
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'history'").run();
    return deleted;
  });
  return tx();
}

module.exports = { getStock, addPrize, drawPrize, findByPhone, findByEmail, saveHistory, getHistory, updateAdminNote, updateStock, clearStock, clearHistory };
