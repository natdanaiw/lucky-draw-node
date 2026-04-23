/**
 * server.js
 * Express server + SQLite backend สำหรับ Lucky Draw
 */

const fs = require('fs');
const express = require('express');
const path    = require('path');

// โหลดค่า .env แบบไม่พึ่ง dependency เพิ่มเติม
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sep = trimmed.indexOf('=');
    if (sep <= 0) continue;
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

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
app.get('/api/check/:phone', async (req, res) => {
  try {
    const phone = normalizePhone(req.params.phone);
    const row = await db.findByPhone(phone);
    if (row) {
      return res.json({ duplicate: true, field: 'phone', record: row });
    }
    res.json({ duplicate: false });
  } catch (error) {
    res.status(400).json({ error: error.message || 'ตรวจสอบข้อมูลซ้ำไม่สำเร็จ' });
  }
});

// ─── API: ตรวจสอบอีเมล/เบอร์ซ้ำก่อนบันทึก ─────────────────────
async function findDuplicateRecord(phoneInput, emailInput) {
  const phone = normalizePhone(phoneInput);
  const email = normalizeEmail(emailInput);

  if (phone) {
    const phoneRecord = await db.findByPhone(phone);
    if (phoneRecord) {
      return { duplicate: true, field: 'phone', record: phoneRecord };
    }
  }

  if (email) {
    const emailRecord = await db.findByEmail(email);
    if (emailRecord) {
      return { duplicate: true, field: 'email', record: emailRecord };
    }
  }

  return { duplicate: false };
}

app.get('/api/check-duplicate', async (req, res) => {
  try {
    const result = await findDuplicateRecord(req.query?.phone, req.query?.email);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'ตรวจสอบข้อมูลซ้ำไม่สำเร็จ' });
  }
});

app.post('/api/check-duplicate', async (req, res) => {
  try {
    const result = await findDuplicateRecord(req.body?.phone, req.body?.email);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'ตรวจสอบข้อมูลซ้ำไม่สำเร็จ' });
  }
});

// ─── API: ดึง stock ───────────────────────────────────────────
app.get('/api/stock', async (req, res) => {
  try {
    res.json(await db.getStock());
  } catch (error) {
    res.status(500).json({ error: error.message || 'โหลด stock ไม่สำเร็จ' });
  }
});

// ─── API: เพิ่มของรางวัล / เติม stock ─────────────────────────
app.post('/api/admin/prizes', async (req, res) => {
  const { name, unit, quantity } = req.body || {};

  try {
    const prize = await db.addPrize({ name, unit, quantity });
    res.status(201).json({ message: 'บันทึกของรางวัลเรียบร้อย', prize });
  } catch (error) {
    res.status(400).json({ error: error.message || 'บันทึกของรางวัลไม่สำเร็จ' });
  }
});

// ─── API: import ของรางวัลผ่าน CSV (แปลงเป็น JSON ฝั่ง client) ──
app.post('/api/admin/prizes/import', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ error: 'ไม่พบข้อมูลสำหรับ import' });
  }

  try {
    const results = [];
    for (const item of items) {
      results.push(await db.addPrize(item));
    }
    res.status(201).json({
      message: `นำเข้าของรางวัลสำเร็จ ${results.length} รายการ`,
      count: results.length
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'นำเข้าของรางวัลไม่สำเร็จ' });
  }
});

// ─── API: ปรับปรุงจำนวน stock ─────────────────────────────────
app.patch('/api/admin/stock/:id', async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body || {};

  try {
    const result = await db.updateStock(id, quantity);
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
app.post('/api/admin/stock/clear', async (req, res) => {
  try {
    const changedRows = await db.clearStock();
    res.json({
      message: `ลบรายการของรางวัลออกจาก stock เรียบร้อย (${changedRows} รายการ)`
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'เคลียร์ stock ไม่สำเร็จ' });
  }
});

// ─── API: ล้างประวัติผู้รับรางวัลทั้งหมด ───────────────────────
app.post('/api/admin/history/clear', async (req, res) => {
  try {
    const changedRows = await db.clearHistory();
    res.json({
      message: `ลบประวัติผู้รับรางวัลเรียบร้อย (${changedRows} รายการ)`
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'ล้างประวัติไม่สำเร็จ' });
  }
});

// ─── API: บันทึกโน้ตทีมงานหลังบ้าน ─────────────────────────
app.patch('/api/admin/history/:id/admin-note', async (req, res) => {
  const { id } = req.params;
  const { adminNote } = req.body || {};

  try {
    const record = await db.updateAdminNote(id, adminNote);
    res.json({ message: 'บันทึกหมายเหตุทีมงานเรียบร้อย', record });
  } catch (error) {
    const message = error.message || 'บันทึกหมายเหตุทีมงานไม่สำเร็จ';
    const status = message.includes('ไม่พบรายการ') ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

// ─── API: สุ่มรางวัล + บันทึกประวัติ ─────────────────────────
app.post('/api/draw', async (req, res) => {
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

  try {
    // เช็คซ้ำอีกครั้งฝั่ง server
    const phone = normalizePhone(fields.phone);
    const email = normalizeEmail(fields.email);
    if (await db.findByPhone(phone)) {
      return res.status(409).json({ error: 'เบอร์นี้เคยรับรางวัลแล้ว' });
    }

    if (await db.findByEmail(email)) {
      return res.status(409).json({ error: 'อีเมลนี้เคยรับรางวัลแล้ว' });
    }

    // สุ่มรางวัล
    const prize = await db.drawPrize();
    if (!prize) {
      return res.status(410).json({ error: 'ของรางวัลหมดแล้ว' });
    }

    // บันทึกประวัติ
    await db.saveHistory({ ...fields, phone, email, note, prize: prize.name, unit: prize.unit, icon: prize.icon });

    res.json({ prize });
  } catch (error) {
    res.status(500).json({ error: error.message || 'บันทึกข้อมูลไม่สำเร็จ' });
  }
});

// ─── API: ดูประวัติทั้งหมด ─────────────────────────────────────
app.get('/api/history', async (req, res) => {
  try {
    res.json(await db.getHistory());
  } catch (error) {
    res.status(500).json({ error: error.message || 'โหลดประวัติไม่สำเร็จ' });
  }
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎁 Lucky Draw พร้อมใช้งานที่ http://localhost:${PORT}\n`);
});
