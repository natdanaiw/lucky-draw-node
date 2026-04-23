/**
 * server.js
 * Express server + SQLite backend สำหรับ Lucky Draw
 */

const express = require('express');
const path    = require('path');
const db      = require('./db');

const app  = express();
const PORT = 3000;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[-\s]/g, '');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidPhone(phone) {
  return /^0\d{9}$/.test(normalizePhone(phone));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── API: ตรวจสอบเบอร์ซ้ำ ─────────────────────────────────────
app.get('/api/check/:phone', (req, res) => {
  const phone = normalizePhone(req.params.phone);
  const row   = db.findByPhone(phone);
  if (row) {
    res.json({ duplicate: true, field: 'phone', record: row });
  } else {
    res.json({ duplicate: false });
  }
});

// ─── API: ตรวจสอบอีเมล/เบอร์ซ้ำก่อนบันทึก ─────────────────────
function findDuplicateRecord(phoneInput, emailInput) {
  const phone = normalizePhone(phoneInput);
  const email = normalizeEmail(emailInput);

  if (phone) {
    const phoneRecord = db.findByPhone(phone);
    if (phoneRecord) {
      return { duplicate: true, field: 'phone', record: phoneRecord };
    }
  }

  if (email) {
    const emailRecord = db.findByEmail(email);
    if (emailRecord) {
      return { duplicate: true, field: 'email', record: emailRecord };
    }
  }

  return { duplicate: false };
}

app.get('/api/check-duplicate', (req, res) => {
  const result = findDuplicateRecord(req.query?.phone, req.query?.email);
  res.json(result);
});

app.post('/api/check-duplicate', (req, res) => {
  const result = findDuplicateRecord(req.body?.phone, req.body?.email);
  res.json(result);
});

// ─── API: ดึง stock ───────────────────────────────────────────
app.get('/api/stock', (req, res) => {
  res.json(db.getStock());
});

// ─── API: เพิ่มของรางวัล / เติม stock ─────────────────────────
app.post('/api/admin/prizes', (req, res) => {
  const { name, unit, quantity } = req.body || {};

  try {
    const prize = db.addPrize({ name, unit, quantity });
    res.status(201).json({ message: 'บันทึกของรางวัลเรียบร้อย', prize });
  } catch (error) {
    res.status(400).json({ error: error.message || 'บันทึกของรางวัลไม่สำเร็จ' });
  }
});

// ─── API: import ของรางวัลผ่าน CSV (แปลงเป็น JSON ฝั่ง client) ──
app.post('/api/admin/prizes/import', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ error: 'ไม่พบข้อมูลสำหรับ import' });
  }

  try {
    const results = items.map(item => db.addPrize(item));
    res.status(201).json({
      message: `นำเข้าของรางวัลสำเร็จ ${results.length} รายการ`,
      count: results.length
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'นำเข้าของรางวัลไม่สำเร็จ' });
  }
});

// ─── API: ปรับปรุงจำนวน stock ─────────────────────────────────
app.patch('/api/admin/stock/:id', (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body || {};

  try {
    const result = db.updateStock(id, quantity);
    if (result.deleted) {
      res.json({
        message: 'ลบรางวัลออกจาก stock เรียบร้อย',
        deleted: true,
        prizeId: result.id
      });
    } else {
      res.json({
        message: `อัปเดต stock เรียบร้อย (จำนวนใหม่: ${result.remaining})`,
        prize: result
      });
    }
  } catch (error) {
    const message = error.message || 'ปรับปรุง stock ไม่สำเร็จ';
    const status = message.includes('ไม่พบ') ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

// ─── API: เคลียร์ stock ทั้งหมด ──────────────────────────────
app.post('/api/admin/stock/clear', (req, res) => {
  try {
    const changedRows = db.clearStock();
    res.json({
      message: `ลบรายการของรางวัลออกจาก stock เรียบร้อย (${changedRows} รายการ)`
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'เคลียร์ stock ไม่สำเร็จ' });
  }
});

// ─── API: ล้างประวัติผู้รับรางวัลทั้งหมด ───────────────────────
app.post('/api/admin/history/clear', (req, res) => {
  try {
    const changedRows = db.clearHistory();
    res.json({
      message: `ลบประวัติผู้รับรางวัลเรียบร้อย (${changedRows} รายการ)`
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'ล้างประวัติไม่สำเร็จ' });
  }
});

// ─── API: บันทึกโน้ตทีมงานหลังบ้าน ─────────────────────────
app.patch('/api/admin/history/:id/admin-note', (req, res) => {
  const { id } = req.params;
  const { adminNote } = req.body || {};

  try {
    const record = db.updateAdminNote(id, adminNote);
    res.json({ message: 'บันทึกหมายเหตุทีมงานเรียบร้อย', record });
  } catch (error) {
    const message = error.message || 'บันทึกหมายเหตุทีมงานไม่สำเร็จ';
    const status = message.includes('ไม่พบรายการ') ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

// ─── API: สุ่มรางวัล + บันทึกประวัติ ─────────────────────────
app.post('/api/draw', (req, res) => {
  const fields = req.body;

  // validate required fields
  const required = ['fname', 'lname', 'phone', 'email', 'company', 'position', 'interest'];
  if (required.some(k => !fields[k])) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  }

  if (!isValidEmail(fields.email)) {
    return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
  }

  if (!isValidPhone(fields.phone)) {
    return res.status(400).json({ error: 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (ต้องเป็น 10 หลัก)' });
  }

  const note = String(fields.note || '').trim();
  if (note.length > 500) {
    return res.status(400).json({ error: 'หมายเหตุยาวเกินไป (ไม่เกิน 500 ตัวอักษร)' });
  }

  // เช็คซ้ำอีกครั้งฝั่ง server
  const phone = normalizePhone(fields.phone);
  const email = normalizeEmail(fields.email);
  if (db.findByPhone(phone)) {
    return res.status(409).json({ error: 'เบอร์นี้เคยรับรางวัลแล้ว' });
  }

  if (db.findByEmail(email)) {
    return res.status(409).json({ error: 'อีเมลนี้เคยรับรางวัลแล้ว' });
  }

  // สุ่มรางวัล
  const prize = db.drawPrize();
  if (!prize) {
    return res.status(410).json({ error: 'ของรางวัลหมดแล้ว' });
  }

  // บันทึกประวัติ
  db.saveHistory({ ...fields, phone, email, note, prize: prize.name, unit: prize.unit, icon: prize.icon });

  res.json({ prize });
});

// ─── API: ดูประวัติทั้งหมด ─────────────────────────────────────
app.get('/api/history', (req, res) => {
  res.json(db.getHistory());
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎁 Lucky Draw พร้อมใช้งานที่ http://localhost:${PORT}\n`);
});
