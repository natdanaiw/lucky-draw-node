-- D1 initial schema + seed for lucky-draw-node

CREATE TABLE IF NOT EXISTS stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  icon TEXT NOT NULL,
  remaining INTEGER NOT NULL
);

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
);

CREATE INDEX IF NOT EXISTS idx_history_phone ON history(phone);
CREATE INDEX IF NOT EXISTS idx_history_email ON history(email);

INSERT INTO stock (name, unit, icon, remaining)
SELECT 'ปากกา', 'แท่ง', '✏️', 10
WHERE NOT EXISTS (SELECT 1 FROM stock WHERE name = 'ปากกา' AND unit = 'แท่ง');

INSERT INTO stock (name, unit, icon, remaining)
SELECT 'สมุด', 'เล่ม', '📒', 5
WHERE NOT EXISTS (SELECT 1 FROM stock WHERE name = 'สมุด' AND unit = 'เล่ม');

INSERT INTO stock (name, unit, icon, remaining)
SELECT 'ผ้าห่ม', 'ผืน', '🛏️', 1
WHERE NOT EXISTS (SELECT 1 FROM stock WHERE name = 'ผ้าห่ม' AND unit = 'ผืน');
