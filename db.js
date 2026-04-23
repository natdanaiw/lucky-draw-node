/**
 * db.js
 * Shared data layer for:
 * - SQLite local fallback
 * - Cloudflare D1 via REST API (Node/Express mode)
 * - Cloudflare D1 via binding (Worker mode)
 */

const Database = require('better-sqlite3');
const path = require('path');

const localDb = new Database(path.join(__dirname, 'database.db'));

const INITIAL_PRIZES = [
  { name: 'ปากกา', unit: 'แท่ง', icon: '✏️', stock: 10 },
  { name: 'สมุด', unit: 'เล่ม', icon: '📒', stock: 5 },
  { name: 'ผ้าห่ม', unit: 'ผืน', icon: '🛏️', stock: 1 }
];

const CREATE_STOCK_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    icon TEXT NOT NULL,
    remaining INTEGER NOT NULL
  )
`;

const CREATE_HISTORY_TABLE_SQL = `
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
`;

const D1_MODE = String(process.env.CF_D1_MODE || '').trim().toLowerCase();
const D1_ENABLED = String(process.env.CF_D1_ENABLED || '').toLowerCase() === 'true';
const D1_ACCOUNT_ID = process.env.CF_D1_ACCOUNT_ID || '';
const D1_DATABASE_ID = process.env.CF_D1_DATABASE_ID || '';
const D1_API_TOKEN = process.env.CF_D1_API_TOKEN || '';

const runtimeState = {
  binding: null,
  remoteDisabled: false,
  remoteSchemaReady: false,
  remoteMode: 'sqlite'
};

function resetRemoteState(mode) {
  runtimeState.remoteDisabled = false;
  runtimeState.remoteSchemaReady = false;
  runtimeState.remoteMode = mode;
}

function configureD1Binding(binding) {
  runtimeState.binding = binding || null;
  if (runtimeState.binding) {
    resetRemoteState('d1-binding');
  }
}

function hasRestCredentials() {
  return Boolean(D1_ACCOUNT_ID && D1_DATABASE_ID && D1_API_TOKEN);
}

function isRestModeEnabled() {
  if (!D1_ENABLED || runtimeState.remoteDisabled) {
    return false;
  }
  if (D1_MODE && D1_MODE !== 'rest') {
    return false;
  }
  return hasRestCredentials();
}

function isBindingModeEnabled() {
  if (!D1_ENABLED || runtimeState.remoteDisabled) {
    return false;
  }
  if (D1_MODE && D1_MODE !== 'binding') {
    return false;
  }
  return Boolean(runtimeState.binding);
}

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function createSQLiteAdapter(db) {
  return {
    mode: 'sqlite',
    async exec(sql) {
      db.exec(sql);
    },
    async selectAll(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async selectOne(sql, params = []) {
      return db.prepare(sql).get(...params) || null;
    },
    async run(sql, params = []) {
      const result = db.prepare(sql).run(...params);
      return {
        changes: result.changes || 0,
        lastInsertRowid: result.lastInsertRowid || null
      };
    }
  };
}

function createD1RestAdapter() {
  return {
    mode: 'd1-rest',
    async raw(sql, params = []) {
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
        throw new Error(payload.errors?.[0]?.message || 'D1 REST query failed');
      }

      const first = Array.isArray(payload.result) ? payload.result[0] : {};
      return {
        rows: normalizeRows(first),
        meta: first?.meta || {}
      };
    },
    async exec(sql) {
      await this.raw(sql);
    },
    async selectAll(sql, params = []) {
      const result = await this.raw(sql, params);
      return result.rows;
    },
    async selectOne(sql, params = []) {
      const rows = await this.selectAll(sql, params);
      return rows[0] || null;
    },
    async run(sql, params = []) {
      const result = await this.raw(sql, params);
      return {
        changes: Number(result.meta?.changes || 0),
        lastInsertRowid: result.meta?.last_row_id || null
      };
    }
  };
}

function createD1BindingAdapter(binding) {
  return {
    mode: 'd1-binding',
    prepare(sql, params = []) {
      const statement = binding.prepare(sql);
      return params.length > 0 ? statement.bind(...params) : statement;
    },
    async exec(sql) {
      await this.prepare(sql).run();
    },
    async selectAll(sql, params = []) {
      const result = await this.prepare(sql, params).all();
      return normalizeRows(result);
    },
    async selectOne(sql, params = []) {
      const row = await this.prepare(sql, params).first();
      return row || null;
    },
    async run(sql, params = []) {
      const result = await this.prepare(sql, params).run();
      return {
        changes: Number(result?.meta?.changes || 0),
        lastInsertRowid: result?.meta?.last_row_id || null
      };
    }
  };
}

const sqliteAdapter = createSQLiteAdapter(localDb);

function getRemoteAdapter() {
  if (isBindingModeEnabled()) {
    return createD1BindingAdapter(runtimeState.binding);
  }
  if (isRestModeEnabled()) {
    return createD1RestAdapter();
  }
  return null;
}

async function ensureHistoryColumns(adapter) {
  const columns = await adapter.selectAll('PRAGMA table_info(history)');
  const hasNote = columns.some(col => col.name === 'note');
  if (!hasNote) {
    await adapter.exec("ALTER TABLE history ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  }

  const hasAdminNote = columns.some(col => col.name === 'admin_note');
  if (!hasAdminNote) {
    await adapter.exec("ALTER TABLE history ADD COLUMN admin_note TEXT NOT NULL DEFAULT ''");
  }
}

async function seedInitialStock(adapter) {
  const row = await adapter.selectOne('SELECT COUNT(*) as cnt FROM stock');
  const count = Number(row?.cnt || 0);
  if (count !== 0) {
    return;
  }

  for (const prize of INITIAL_PRIZES) {
    await adapter.run(
      'INSERT INTO stock (name, unit, icon, remaining) VALUES (?, ?, ?, ?)',
      [prize.name, prize.unit, prize.icon, prize.stock]
    );
  }
}

async function ensureSchema(adapter) {
  await adapter.exec(CREATE_STOCK_TABLE_SQL);
  await adapter.exec(CREATE_HISTORY_TABLE_SQL);
  await ensureHistoryColumns(adapter);
  await seedInitialStock(adapter);
}

async function initializeSQLite() {
  await ensureSchema(sqliteAdapter);
}

initializeSQLite().catch(error => {
  console.error('[db] SQLite initialization failed:', error.message);
});

async function ensureRemoteSchema(adapter) {
  if (!adapter || runtimeState.remoteSchemaReady) {
    return;
  }
  await ensureSchema(adapter);
  runtimeState.remoteSchemaReady = true;
}

async function tryRemote(executor) {
  const adapter = getRemoteAdapter();
  if (!adapter) {
    return { used: false, value: null };
  }

  try {
    await ensureRemoteSchema(adapter);
    runtimeState.remoteMode = adapter.mode;
    return { used: true, value: await executor(adapter) };
  } catch (error) {
    runtimeState.remoteDisabled = true;
    runtimeState.remoteMode = 'sqlite';
    console.warn(`[db] ${adapter.mode} unavailable, fallback to SQLite:`, error.message);
    return { used: false, value: null };
  }
}

function getDbMode() {
  return runtimeState.remoteMode;
}

function validatePrizeInput(prize) {
  const name = String(prize.name || '').trim();
  const unit = String(prize.unit || '').trim();
  const icon = String(prize.icon || '🎁').trim() || '🎁';
  const quantity = Number(prize.quantity);

  if (!name || !unit || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('ข้อมูลของรางวัลไม่ถูกต้อง');
  }

  return { name, unit, icon, quantity };
}

function pickWinner(available) {
  if (available.length === 0) return null;

  const total = available.reduce((sum, prize) => sum + Number(prize.remaining), 0);
  let rand = Math.random() * total;

  for (const prize of available) {
    rand -= Number(prize.remaining);
    if (rand <= 0) {
      return prize;
    }
  }

  return available[available.length - 1];
}

async function addPrizeUsing(adapter, prize) {
  const { name, unit, icon, quantity } = validatePrizeInput(prize);
  const existing = await adapter.selectOne(
    'SELECT * FROM stock WHERE name = ? AND unit = ? LIMIT 1',
    [name, unit]
  );

  if (existing) {
    await adapter.run('UPDATE stock SET remaining = remaining + ? WHERE id = ?', [quantity, existing.id]);
    return adapter.selectOne('SELECT * FROM stock WHERE id = ? LIMIT 1', [existing.id]);
  }

  await adapter.run(
    'INSERT INTO stock (name, unit, icon, remaining) VALUES (?, ?, ?, ?)',
    [name, unit, icon, quantity]
  );

  return adapter.selectOne(
    'SELECT * FROM stock WHERE name = ? AND unit = ? ORDER BY id DESC LIMIT 1',
    [name, unit]
  );
}

async function drawPrizeUsing(adapter) {
  const available = await adapter.selectAll('SELECT * FROM stock WHERE remaining > 0');
  const winner = pickWinner(available);
  if (!winner) return null;

  await adapter.run('UPDATE stock SET remaining = remaining - 1 WHERE id = ?', [winner.id]);
  return winner;
}

async function findByPhoneUsing(adapter, phone) {
  const normalized = String(phone || '').replace(/[-\s]/g, '');
  const rows = await adapter.selectAll('SELECT * FROM history');
  return rows.find(row => String(row.phone || '').replace(/[-\s]/g, '') === normalized) || null;
}

async function findByEmailUsing(adapter, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  return adapter.selectOne('SELECT * FROM history WHERE lower(trim(email)) = ? LIMIT 1', [normalized]);
}

async function updateAdminNoteUsing(adapter, id, adminNote) {
  const historyId = Number(id);
  if (!Number.isInteger(historyId) || historyId <= 0) {
    throw new Error('รหัสประวัติไม่ถูกต้อง');
  }

  const normalizedNote = String(adminNote || '').trim();
  if (normalizedNote.length > 1000) {
    throw new Error('หมายเหตุทีมงานยาวเกินไป (ไม่เกิน 1000 ตัวอักษร)');
  }

  const result = await adapter.run('UPDATE history SET admin_note = ? WHERE id = ?', [normalizedNote, historyId]);
  if (result.changes === 0) {
    throw new Error('ไม่พบรายการประวัติที่ต้องการบันทึก');
  }

  return adapter.selectOne('SELECT * FROM history WHERE id = ? LIMIT 1', [historyId]);
}

async function updateStockUsing(adapter, id, newQuantity) {
  const stockId = Number(id);
  const qty = Number(newQuantity);

  if (!Number.isInteger(stockId) || stockId <= 0) {
    throw new Error('รหัส stock ไม่ถูกต้อง');
  }
  if (!Number.isInteger(qty) || qty < 0) {
    throw new Error('จำนวนต้องเป็นตัวเลขจำนวนเต็มที่ไม่น้อยกว่า 0');
  }

  const existing = await adapter.selectOne('SELECT * FROM stock WHERE id = ? LIMIT 1', [stockId]);
  if (!existing) {
    throw new Error('ไม่พบรางวัลที่ต้องการปรับปรุง');
  }

  if (qty === 0) {
    await adapter.run('DELETE FROM stock WHERE id = ?', [stockId]);
    return { id: stockId, deleted: true };
  }

  await adapter.run('UPDATE stock SET remaining = ? WHERE id = ?', [qty, stockId]);
  return adapter.selectOne('SELECT * FROM stock WHERE id = ? LIMIT 1', [stockId]);
}

async function clearTableUsing(adapter, tableName) {
  const before = await adapter.selectOne(`SELECT COUNT(*) as cnt FROM ${tableName}`);
  const deleted = Number(before?.cnt || 0);
  await adapter.run(`DELETE FROM ${tableName}`);

  if (adapter.mode === 'sqlite') {
    await adapter.run("DELETE FROM sqlite_sequence WHERE name = ?", [tableName]);
  }

  return deleted;
}

async function withFallback(remoteExecutor, localExecutor) {
  const remote = await tryRemote(remoteExecutor);
  if (remote.used) {
    return remote.value;
  }
  return localExecutor(sqliteAdapter);
}

async function getStock() {
  return withFallback(
    adapter => adapter.selectAll('SELECT * FROM stock ORDER BY id'),
    adapter => adapter.selectAll('SELECT * FROM stock ORDER BY id')
  );
}

async function addPrize(prize) {
  return withFallback(
    adapter => addPrizeUsing(adapter, prize),
    adapter => addPrizeUsing(adapter, prize)
  );
}

async function drawPrize() {
  return withFallback(
    adapter => drawPrizeUsing(adapter),
    adapter => drawPrizeUsing(adapter)
  );
}

async function findByPhone(phone) {
  return withFallback(
    adapter => findByPhoneUsing(adapter, phone),
    adapter => findByPhoneUsing(adapter, phone)
  );
}

async function findByEmail(email) {
  return withFallback(
    adapter => findByEmailUsing(adapter, email),
    adapter => findByEmailUsing(adapter, email)
  );
}

async function saveHistory(data) {
  return withFallback(
    adapter => adapter.run(
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
    ),
    adapter => adapter.run(
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
    )
  );
}

async function getHistory() {
  return withFallback(
    adapter => adapter.selectAll('SELECT * FROM history ORDER BY id DESC'),
    adapter => adapter.selectAll('SELECT * FROM history ORDER BY id DESC')
  );
}

async function updateAdminNote(id, adminNote) {
  return withFallback(
    adapter => updateAdminNoteUsing(adapter, id, adminNote),
    adapter => updateAdminNoteUsing(adapter, id, adminNote)
  );
}

async function updateStock(id, newQuantity) {
  return withFallback(
    adapter => updateStockUsing(adapter, id, newQuantity),
    adapter => updateStockUsing(adapter, id, newQuantity)
  );
}

async function clearStock() {
  return withFallback(
    adapter => clearTableUsing(adapter, 'stock'),
    adapter => clearTableUsing(adapter, 'stock')
  );
}

async function clearHistory() {
  return withFallback(
    adapter => clearTableUsing(adapter, 'history'),
    adapter => clearTableUsing(adapter, 'history')
  );
}

module.exports = {
  configureD1Binding,
  getDbMode,
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
