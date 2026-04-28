function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function getAdminConfig(env) {
  return {
    username: String(env.ADMIN_USERNAME || 'admin'),
    password: String(env.ADMIN_PASSWORD || 'Admin@1234'),
    token: String(env.ADMIN_ACCESS_TOKEN || 'lucky-draw-admin-token')
  };
}

function getBearerToken(request) {
  const authHeader = String(request.headers.get('Authorization') || '');
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return '';
  }
  return parts[1].trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.th',
  'ymail.com',
  'rocketmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'zoho.com'
]);

function getEmailDomain(email) {
  const value = String(email || '').trim().toLowerCase();
  const atIndex = value.lastIndexOf('@');
  if (atIndex < 0) return '';
  return value.slice(atIndex + 1);
}

function isPublicEmailDomain(email) {
  const domain = getEmailDomain(email);
  return PUBLIC_EMAIL_DOMAINS.has(domain);
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

function pickWinner(available) {
  if (!available.length) return null;

  const total = available.reduce((sum, item) => sum + Number(item.remaining), 0);
  let rand = Math.random() * total;

  for (const item of available) {
    rand -= Number(item.remaining);
    if (rand <= 0) {
      return item;
    }
  }

  return available[available.length - 1];
}

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function all(DB, sql, params = []) {
  const stmt = DB.prepare(sql);
  const result = params.length ? await stmt.bind(...params).all() : await stmt.all();
  return result?.results || [];
}

async function first(DB, sql, params = []) {
  const stmt = DB.prepare(sql);
  return params.length ? await stmt.bind(...params).first() : await stmt.first();
}

async function run(DB, sql, params = []) {
  const stmt = DB.prepare(sql);
  return params.length ? await stmt.bind(...params).run() : await stmt.run();
}

async function findByPhone(DB, phone) {
  const normalized = normalizePhone(phone);
  return first(
    DB,
    `SELECT *
       FROM history
      WHERE replace(replace(phone, '-', ''), ' ', '') = ?
      LIMIT 1`,
    [normalized]
  );
}

async function findByEmail(DB, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  return first(
    DB,
    `SELECT *
       FROM history
      WHERE lower(trim(email)) = ?
      LIMIT 1`,
    [normalized]
  );
}

async function addPrize(DB, input) {
  const name = String(input?.name || '').trim();
  const unit = String(input?.unit || '').trim();
  const icon = String(input?.icon || '🎁').trim() || '🎁';
  const quantity = Number(input?.quantity);

  if (!name || !unit || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('ข้อมูลของรางวัลไม่ถูกต้อง');
  }

  const existing = await first(DB, 'SELECT * FROM stock WHERE name = ? AND unit = ? LIMIT 1', [name, unit]);
  if (existing) {
    await run(DB, 'UPDATE stock SET remaining = remaining + ? WHERE id = ?', [quantity, existing.id]);
    return first(DB, 'SELECT * FROM stock WHERE id = ? LIMIT 1', [existing.id]);
  }

  await run(DB, 'INSERT INTO stock (name, unit, icon, remaining) VALUES (?, ?, ?, ?)', [name, unit, icon, quantity]);
  return first(DB, 'SELECT * FROM stock WHERE name = ? AND unit = ? ORDER BY id DESC LIMIT 1', [name, unit]);
}

async function updateStock(DB, id, quantityInput) {
  const stockId = Number(id);
  const quantity = Number(quantityInput);

  if (!Number.isInteger(stockId) || stockId <= 0) {
    throw new Error('รหัส stock ไม่ถูกต้อง');
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('จำนวนต้องเป็นตัวเลขจำนวนเต็มที่ไม่น้อยกว่า 0');
  }

  const existing = await first(DB, 'SELECT * FROM stock WHERE id = ? LIMIT 1', [stockId]);
  if (!existing) {
    throw new Error('ไม่พบรางวัลที่ต้องการปรับปรุง');
  }

  if (quantity === 0) {
    await run(DB, 'DELETE FROM stock WHERE id = ?', [stockId]);
    return { id: stockId, deleted: true };
  }

  await run(DB, 'UPDATE stock SET remaining = ? WHERE id = ?', [quantity, stockId]);
  return first(DB, 'SELECT * FROM stock WHERE id = ? LIMIT 1', [stockId]);
}

async function clearTable(DB, tableName) {
  const before = await first(DB, `SELECT COUNT(*) as cnt FROM ${tableName}`);
  const deleted = Number(before?.cnt || 0);
  await run(DB, `DELETE FROM ${tableName}`);
  return deleted;
}

async function saveHistory(DB, data) {
  await run(
    DB,
    `INSERT INTO history
      (fname, lname, phone, email, company, position, interest, note, prize, unit, icon)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
}

export default {
  async fetch(request, env) {
    const DB = env.DB;
    if (!DB) {
      return json({ error: 'D1 binding (DB) not configured' }, 500);
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();
    const adminConfig = getAdminConfig(env);

    try {
      if (path === '/api/auth/login' && method === 'POST') {
        const body = await parseBody(request);
        const username = String(body?.username || '').trim();
        const password = String(body?.password || '');

        if (username !== adminConfig.username || password !== adminConfig.password) {
          return json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, 401);
        }

        return json({ token: adminConfig.token });
      }

      const needsAdminAuth = path === '/api/history' || path.startsWith('/api/admin/');
      if (needsAdminAuth) {
        const token = getBearerToken(request);
        if (!token || token !== adminConfig.token) {
          return json({ error: 'Unauthorized' }, 401);
        }
      }

      const checkPhoneMatch = path.match(/^\/api\/check\/(.+)$/);
      if (method === 'GET' && checkPhoneMatch) {
        const phone = normalizePhone(decodeURIComponent(checkPhoneMatch[1] || ''));
        const row = await findByPhone(DB, phone);
        return json(row ? { duplicate: true, field: 'phone', record: row } : { duplicate: false });
      }

      if (path === '/api/check-duplicate' && (method === 'GET' || method === 'POST')) {
        const body = method === 'POST' ? await parseBody(request) : {};
        const phone = method === 'GET' ? url.searchParams.get('phone') : body.phone;
        const email = method === 'GET' ? url.searchParams.get('email') : body.email;

        const duplicatePhone = phone ? await findByPhone(DB, phone) : null;
        if (duplicatePhone) return json({ duplicate: true, field: 'phone', record: duplicatePhone });

        const duplicateEmail = email ? await findByEmail(DB, email) : null;
        if (duplicateEmail) return json({ duplicate: true, field: 'email', record: duplicateEmail });

        return json({ duplicate: false });
      }

      if (path === '/api/stock' && method === 'GET') {
        return json(await all(DB, 'SELECT * FROM stock ORDER BY id'));
      }

      if (path === '/api/admin/prizes' && method === 'POST') {
        const body = await parseBody(request);
        try {
          const prize = await addPrize(DB, body);
          return json({ message: 'บันทึกของรางวัลเรียบร้อย', prize }, 201);
        } catch (error) {
          return json({ error: error.message || 'บันทึกของรางวัลไม่สำเร็จ' }, 400);
        }
      }

      if (path === '/api/admin/prizes/import' && method === 'POST') {
        const body = await parseBody(request);
        const items = Array.isArray(body?.items) ? body.items : [];
        if (items.length === 0) {
          return json({ error: 'ไม่พบข้อมูลสำหรับ import' }, 400);
        }

        try {
          const results = [];
          for (const item of items) {
            results.push(await addPrize(DB, item));
          }
          return json({
            message: `นำเข้าของรางวัลสำเร็จ ${results.length} รายการ`,
            count: results.length
          }, 201);
        } catch (error) {
          return json({ error: error.message || 'นำเข้าของรางวัลไม่สำเร็จ' }, 400);
        }
      }

      const stockUpdateMatch = path.match(/^\/api\/admin\/stock\/(\d+)$/);
      if (stockUpdateMatch && method === 'PATCH') {
        const body = await parseBody(request);
        try {
          const result = await updateStock(DB, stockUpdateMatch[1], body.quantity);
          if (result.deleted) {
            return json({
              message: 'ลบรางวัลออกจาก stock เรียบร้อย',
              deleted: true,
              prizeId: result.id
            });
          }
          return json({
            message: `อัปเดต stock เรียบร้อย (จำนวนใหม่: ${result.remaining})`,
            prize: result
          });
        } catch (error) {
          const status = String(error.message || '').includes('ไม่พบ') ? 404 : 400;
          return json({ error: error.message || 'ปรับปรุง stock ไม่สำเร็จ' }, status);
        }
      }

      if (path === '/api/admin/stock/clear' && method === 'POST') {
        const deleted = await clearTable(DB, 'stock');
        return json({ message: `ลบรายการของรางวัลออกจาก stock เรียบร้อย (${deleted} รายการ)` });
      }

      if (path === '/api/admin/history/clear' && method === 'POST') {
        const deleted = await clearTable(DB, 'history');
        return json({ message: `ลบประวัติผู้รับรางวัลเรียบร้อย (${deleted} รายการ)` });
      }

      const adminNoteMatch = path.match(/^\/api\/admin\/history\/(\d+)\/admin-note$/);
      if (adminNoteMatch && method === 'PATCH') {
        const historyId = Number(adminNoteMatch[1]);
        const body = await parseBody(request);
        const adminNote = String(body?.adminNote || '').trim();

        if (!Number.isInteger(historyId) || historyId <= 0) {
          return json({ error: 'รหัสประวัติไม่ถูกต้อง' }, 400);
        }
        if (adminNote.length > 1000) {
          return json({ error: 'หมายเหตุทีมงานยาวเกินไป (ไม่เกิน 1000 ตัวอักษร)' }, 400);
        }

        await run(DB, 'UPDATE history SET admin_note = ? WHERE id = ?', [adminNote, historyId]);
        const record = await first(DB, 'SELECT * FROM history WHERE id = ? LIMIT 1', [historyId]);
        if (!record) {
          return json({ error: 'ไม่พบรายการประวัติที่ต้องการบันทึก' }, 404);
        }

        return json({ message: 'บันทึกหมายเหตุทีมงานเรียบร้อย', record });
      }

      const historyDeleteMatch = path.match(/^\/api\/admin\/history\/(\d+)$/);
      if (historyDeleteMatch && method === 'DELETE') {
        const historyId = Number(historyDeleteMatch[1]);

        if (!Number.isInteger(historyId) || historyId <= 0) {
          return json({ error: 'รหัสประวัติไม่ถูกต้อง' }, 400);
        }

        const result = await run(DB, 'DELETE FROM history WHERE id = ?', [historyId]);
        if (Number(result?.changes || 0) === 0) {
          return json({ error: 'ไม่พบรายการประวัติที่ต้องการลบ' }, 404);
        }

        return json({
          message: 'ลบรายการประวัติเรียบร้อย',
          record: { id: historyId, deleted: true }
        });
      }

      if (path === '/api/draw' && method === 'POST') {
        const fields = await parseBody(request);
        const required = ['fname', 'lname', 'phone', 'email', 'company', 'position', 'interest'];
        if (required.some(key => !fields[key])) {
          return json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, 400);
        }

        if (!isValidEmail(fields.email)) {
          return json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' }, 400);
        }

        if (isPublicEmailDomain(fields.email)) {
          return json({ error: 'ไม่อนุญาตให้อีเมลสาธารณะ กรุณาใช้อีเมลองค์กร' }, 400);
        }

        if (!isValidPhone(fields.phone)) {
          return json({ error: 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (ต้องเป็น 10 หลัก)' }, 400);
        }

        const note = String(fields.note || '').trim();
        if (note.length > 500) {
          return json({ error: 'หมายเหตุยาวเกินไป (ไม่เกิน 500 ตัวอักษร)' }, 400);
        }

        const phone = normalizePhone(fields.phone);
        const email = normalizeEmail(fields.email);

        if (await findByPhone(DB, phone)) {
          return json({ error: 'เบอร์นี้เคยรับรางวัลแล้ว' }, 409);
        }

        if (await findByEmail(DB, email)) {
          return json({ error: 'อีเมลนี้เคยรับรางวัลแล้ว' }, 409);
        }

        const available = await all(DB, 'SELECT * FROM stock WHERE remaining > 0');
        const prize = pickWinner(available);
        if (!prize) {
          return json({ error: 'ของรางวัลหมดแล้ว' }, 410);
        }

        await run(DB, 'UPDATE stock SET remaining = remaining - 1 WHERE id = ?', [prize.id]);
        await saveHistory(DB, {
          ...fields,
          phone,
          email,
          note,
          prize: prize.name,
          unit: prize.unit,
          icon: prize.icon
        });

        return json({ prize });
      }

      if (path === '/api/history' && method === 'GET') {
        const history = await all(DB, 'SELECT * FROM history ORDER BY id DESC');
        return json(history);
      }

      if (path === '/api/admin/db-mode' && method === 'GET') {
        return json({
          mode: 'd1-binding',
          d1Enabled: true,
          d1Mode: 'binding',
          hasD1RestCredentials: false
        });
      }

      // Serve static files from ./public for non-API routes
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return json({ error: 'Not Found' }, 404);
    } catch (error) {
      return json({ error: error.message || 'Internal Server Error' }, 500);
    }
  }
};
