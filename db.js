/**
 * db.js
 * Hybrid data layer: Cloudflare D1 (primary) + SQLite local fallback
 */

const Database = require('better-sqlite3');
const path = require('path');

const localDb = new Database(path.join(__dirname, 'database.db'));

const INITIAL_PRIZES = [
  { name: 'ปากกา', unit: 'แท่ง', icon: '✏️', stock: 10 },
  { name: 'สมุด', unit: 'เล่ม', icon: '📒', stock: 5 },
  { name: 'ผ้าห่ม', unit: 'ผืน', icon: '🛏️', stock: 1 }
];

const D1_ACCOUNT_ID = process.env.CF_D1_ACCOUNT_ID || '';
const D1_DATABASE_ID = process.env.CF_D1_DATABASE_ID || '';
const D1_API_TOKEN = process.env.CF_D1_API_TOKEN || '';
const D1_ENABLED = String(process.env.CF_D1_ENABLED || '').toLowerCase() === 'true';

let d1SchemaReady = false;
let d1DisabledByError = false;

function isD1Configured() {
  return Boolean(D1_ENABLED && D1_ACCOUNT_ID && D1_DATABASE_ID && D1_API_TOKEN && !d1DisabledByError);
}

async function d1Query(sql, params = []) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${D1_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params })
  });

  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const errorMessage = payload.errors?.[0]?.message || 'D1 query failed';
    throw new Error(errorMessage);
  }

  const first = Array.isArray(payload.result) ? payload.result[0] : null;
  return {
    rows: first?.results || [],
    meta: first?.meta || {}
  };
}

async function ensureD1Schema() {
  if (!isD1Configured() || d1SchemaReady) {
    return;
  }

  await d1Query(`
    CREATE TABLE IF NOT EXISTS stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      icon TEXT NOT NULL,
      remaining INTEGER NOT NULL
    )
  `);

  await d1Query(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fname TEXT NOT NULL,
      lname TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT NOT NULL,
      position TEXT NOT NULL,
      interest TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      admin_note TEXT NOT NULL DEFAULT '',
      prize TEXT NOT NULL,
      unit TEXT NOT NULL,
      icon TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  const stockCountResult = await d1Query('SELECT COUNT(*) as cnt FROM stock');
  const count = Number(stockCountResult.rows?.[0]?.cnt || 0);
  if (count === 0) {
    for (const p of INITIAL_PRIZES) {
      await d1Query('INSERT INTO stock (name, unit, icon, remaining) VALUES (?, ?, ?, ?)', [p.name, p.unit, p.icon, p.stock]);
    }
  }

  d1SchemaReady = true;
}

async function tryD1(executor) {
  if (!isD1Configured()) {
    return { used: false, value: null };
  }

  try {
    await ensureD1Schema();
    return { used: true, value: await executor() };
  } catch (error) {
    d1DisabledByError = true;
    console.warn('[db] D1 unavailable, fallback to SQLite:', error.message);
    return { used: false, value: null };
  }
}

function initializeLocalDb() {
  localDb.exec(`
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

  const historyColumns = localDb.prepare('PRAGMA table_info(history)').all();
  const hasNoteColumn = historyColumns.some(col => col.name === 'note');
  if (!hasNoteColumn) {
    localDb.exec("ALTER TABLE history ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  }

  const hasAdminNoteColumn = historyColumns.some(col => col.name === 'admin_note');
  if (!hasAdminNoteColumn) {
    localDb.exec("ALTER TABLE history ADD COLUMN admin_note TEXT NOT NULL DEFAULT ''");
  }

  const stockCount = localDb.prepare('SELECT COUNT(*) as cnt FROM stock').get().cnt;
  if (stockCount === 0) {
    const insert = localDb.prepare('INSERT INTO stock (name, unit, icon, remaining) VALUES (?, ?, ?, ?)');
    for (const p of INITIAL_PRIZES) {
      insert.run(p.name, p.unit, p.icon, p.stock);
    }
    console.log('✅ สร้าง stock รางวัลเริ่มต้นเรียบร้อย');
  }
}

initializeLocalDb();

async function getStock() {
  const d1 = await tryD1(async () => {
    const result = await d1Query('SELECT * FROM stock ORDER BY id');
    return result.rows;
  });
  if (d1.used) return d1.value;

  return localDb.prepare('SELECT * FROM stock ORDER BY id').all();
}

async function addPrize(prize) {
  const name = String(prize.name || '').trim();
  const unit = String(prize.unit || '').trim();
  const icon = String(prize.icon || '🎁').trim() || '🎁';
  const quantity = Number(prize.quantity);

  if (!name || !unit || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('ข้อมูลของรางวัลไม่ถูกต้อง');
  }

  const d1 = await tryD1(async () => {
    const existingRes = await d1Query('SELECT * FROM stock WHERE name = ? AND unit = ? LIMIT 1', [name, unit]);
    const existing = existingRes.rows[0];
    if (existing) {
      await d1Query('UPDATE stock SET remaining = remaining + ? WHERE id = ?', [quantity, existing.id]);
      const updated = await d1Query('SELECT * FROM stock WHERE id = ? LIMIT 1', [existing.id]);
      return updated.rows[0];
    }

    await d1Query('INSERT INTO stock (name, unit, icon, remaining) VALUES (?, ?, ?, ?)', [name, unit, icon, quantity]);
    const inserted = await d1Query('SELECT * FROM stock WHERE name = ? AND unit = ? ORDER BY id DESC LIMIT 1', [name, unit]);
    return inserted.rows[0];
  });
  if (d1.used) return d1.value;

  const existing = localDb.prepare('SELECT * FROM stock WHERE name = ? AND unit = ?').get(name, unit);
  if (existing) {
    localDb.prepare('UPDATE stock SET remaining = remaining + ? WHERE id = ?').run(quantity, existing.id);
    return localDb.prepare('SELECT * FROM stock WHERE id = ?').get(existing.id);
  }

  const result = localDb.prepare('INSERT INTO stock (name, unit, icon, remaining) VALUES (?, ?, ?, ?)').run(name, unit, icon, quantity);
  return localDb.prepare('SELECT * FROM stock WHERE id = ?').get(result.lastInsertRowid);
}

function pickWinner(available) {
  if (available.length === 0) return null;
  const total = available.reduce((sum, p) => sum + Number(p.remaining), 0);
  let rand = Math.random() * total;
  for (const prize of available) {
    rand -= Number(prize.remaining);
    if (rand <= 0) return prize;
  }
  return available[available.length - 1];
}

async function drawPrize() {
  const d1 = await tryD1(async () => {
    const res = await d1Query('SELECT * FROM stock WHERE remaining > 0');
    const winner = pickWinner(res.rows);
    if (!winner) return null;
    await d1Query('UPDATE stock SET remaining = remaining - 1 WHERE id = ?', [winner.id]);
    return winner;
  });
  if (d1.used) return d1.value;

  const available = localDb.prepare('SELECT * FROM stock WHERE remaining > 0').all();
  const winner = pickWinner(available);
  if (!winner) return null;
  localDb.prepare('UPDATE stock SET remaining = remaining - 1 WHERE id = ?').run(winner.id);
  return winner;
}

async function findByPhone(phone) {
  const normalized = String(phone || '').replace(/[-\s]/g, '');
  const d1 = await tryD1(async () => {
    const res = await d1Query('SELECT * FROM history');
    return res.rows.find(r => String(r.phone || '').replace(/[-\s]/g, '') === normalized) || null;
  });
  if (d1.used) return d1.value;

  const rows = localDb.prepare('SELECT * FROM history').all();
  return rows.find(r => r.phone.replace(/[-\s]/g, '') === normalized) || null;
}

async function findByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  const d1 = await tryD1(async () => {
    const res = await d1Query('SELECT * FROM history WHERE lower(trim(email)) = ? LIMIT 1', [normalized]);
    return res.rows[0] || null;
  });
  if (d1.used) return d1.value;

  const rows = localDb.prepare('SELECT * FROM history').all();
  return rows.find(r => String(r.email || '').trim().toLowerCase() === normalized) || null;
}

async function saveHistory(data) {
  const d1 = await tryD1(async () => {
    await d1Query(
      'INSERT INTO history (fname, lname, phone, email, company, position, interest, note, prize, unit, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        data.fname,
        data.lname,
        data.phone,
        data.email,
        data.company,
        data.position,
        data.interest,
        data.note || '',
        data.prize,
        data.unit,
        data.icon
      ]
    );
    return true;
  });
  if (d1.used) return;

  localDb.prepare(`
    INSERT INTO history (fname, lname, phone, email, company, position, interest, note, prize, unit, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.fname,
    data.lname,
    data.phone,
    data.email,
    data.company,
    data.position,
    data.interest,
    data.note || '',
    data.prize,
    data.unit,
    data.icon
  );
}

async function getHistory() {
  const d1 = await tryD1(async () => {
    const res = await d1Query('SELECT * FROM history ORDER BY id DESC');
    return res.rows;
  });
  if (d1.used) return d1.value;

  return localDb.prepare('SELECT * FROM history ORDER BY id DESC').all();
}

async function updateAdminNote(id, adminNote) {
  const historyId = Number(id);
  if (!Number.isInteger(historyId) || historyId <= 0) {
    throw new Error('รหัสประวัติไม่ถูกต้อง');
  }

  const normalizedNote = String(adminNote || '').trim();
  if (normalizedNote.length > 1000) {
    throw new Error('หมายเหตุทีมงานยาวเกินไป (ไม่เกิน 1000 ตัวอักษร)');
  }

  const d1 = await tryD1(async () => {
    await d1Query('UPDATE history SET admin_note = ? WHERE id = ?', [normalizedNote, historyId]);
    const row = await d1Query('SELECT * FROM history WHERE id = ? LIMIT 1', [historyId]);
    if (!row.rows[0]) {
      throw new Error('ไม่พบรายการประวัติที่ต้องการบันทึก');
    }
    return row.rows[0];
  });
  if (d1.used) return d1.value;

  const result = localDb.prepare('UPDATE history SET admin_note = ? WHERE id = ?').run(normalizedNote, historyId);
  if (result.changes === 0) {
    throw new Error('ไม่พบรายการประวัติที่ต้องการบันทึก');
  }
  return localDb.prepare('SELECT * FROM history WHERE id = ?').get(historyId);
}

async function updateStock(id, newQuantity) {
  const stockId = Number(id);
  const qty = Number(newQuantity);

  if (!Number.isInteger(stockId) || stockId <= 0) {
    throw new Error('รหัส stock ไม่ถูกต้อง');
  }
  if (!Number.isInteger(qty) || qty < 0) {
    throw new Error('จำนวนต้องเป็นตัวเลขจำนวนเต็มที่ไม่น้อยกว่า 0');
  }

  const d1 = await tryD1(async () => {
    const existing = await d1Query('SELECT * FROM stock WHERE id = ? LIMIT 1', [stockId]);
    if (!existing.rows[0]) {
      throw new Error('ไม่พบรางวัลที่ต้องการปรับปรุง');
    }

    if (qty === 0) {
      await d1Query('DELETE FROM stock WHERE id = ?', [stockId]);
      return { id: stockId, deleted: true };
    }

    await d1Query('UPDATE stock SET remaining = ? WHERE id = ?', [qty, stockId]);
    const updated = await d1Query('SELECT * FROM stock WHERE id = ? LIMIT 1', [stockId]);
    return updated.rows[0];
  });
  if (d1.used) return d1.value;

  const existing = localDb.prepare('SELECT * FROM stock WHERE id = ?').get(stockId);
  if (!existing) {
    throw new Error('ไม่พบรางวัลที่ต้องการปรับปรุง');
  }

  if (qty === 0) {
    const result = localDb.prepare('DELETE FROM stock WHERE id = ?').run(stockId);
    if (result.changes === 0) {
      throw new Error('ไม่สามารถลบรางวัลได้');
    }
    return { id: stockId, deleted: true };
  }

  const result = localDb.prepare('UPDATE stock SET remaining = ? WHERE id = ?').run(qty, stockId);
  if (result.changes === 0) {
    throw new Error('ไม่สามารถปรับปรุง stock ได้');
  }
  return localDb.prepare('SELECT * FROM stock WHERE id = ?').get(stockId);
}

async function clearStock() {
  const d1 = await tryD1(async () => {
    const before = await d1Query('SELECT COUNT(*) as cnt FROM stock');
    const deleted = Number(before.rows?.[0]?.cnt || 0);
    await d1Query('DELETE FROM stock');
    return deleted;
  });
  if (d1.used) return d1.value;

  const tx = localDb.transaction(() => {
    const deleted = localDb.prepare('DELETE FROM stock').run().changes;
    localDb.prepare("DELETE FROM sqlite_sequence WHERE name = 'stock'").run();
    return deleted;
  });
  return tx();
}

async function clearHistory() {
  const d1 = await tryD1(async () => {
    const before = await d1Query('SELECT COUNT(*) as cnt FROM history');
    const deleted = Number(before.rows?.[0]?.cnt || 0);
    await d1Query('DELETE FROM history');
    return deleted;
  });
  if (d1.used) return d1.value;

  const tx = localDb.transaction(() => {
    const deleted = localDb.prepare('DELETE FROM history').run().changes;
    localDb.prepare("DELETE FROM sqlite_sequence WHERE name = 'history'").run();
    return deleted;
  });
  return tx();
}

module.exports = {
  getStock,
  addPrize,
  drawPrize,
  findByPhone,
  findByEmail,
  saveHistory,
  getHistory,
  updateAdminNote,
  updateStock,
  clearStock,
  clearHistory
};
