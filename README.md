# 🎁 Lucky Draw — Node.js + SQLite / Cloudflare D1

ระบบสุ่มของรางวัล รองรับ 3 deployment modes:

| Mode | Runtime | Database |
|------|---------|----------|
| 🖥️ Local | Node.js / Express | SQLite (local) |
| 🐳 Docker | Container | SQLite (volume) |
| ☁️ Cloudflare Workers | Workers runtime | Cloudflare D1 (binding) |

---

## โครงสร้างโปรเจกต์

```
lucky-draw-node/
├── server.js                    ← Express server (Local / Docker mode)
├── src/worker.js                ← Cloudflare Worker handler (Worker mode)
├── db.js                        ← Database abstraction layer (SQLite + D1)
├── database.db                  ← SQLite file (สร้างอัตโนมัติ, Local mode)
├── wrangler.toml                ← Cloudflare Workers config
├── Dockerfile                   ← Docker build config
├── .env.example                 ← ตัวอย่าง environment variables
├── migrations/d1/001_init.sql   ← D1 schema + seed SQL
├── package.json
└── public/                      ← Static files (HTML/CSS/JS)
    ├── index.html
    ├── css/style.css
    └── js/app.js
```


---

## 🖥️ Mode 1: Local (Node.js + SQLite)

ใช้สำหรับ development หรือ run บนเครื่องโดยตรง

### ขั้นที่ 1 — ติดตั้ง Node.js
ดาวน์โหลดจาก https://nodejs.org (แนะนำ LTS)

### ขั้นที่ 2 — ติดตั้ง dependencies
```bash
npm install
```

### ขั้นที่ 3 — รัน server
```bash
npm start
```

เปิดเบราว์เซอร์ไปที่ **http://localhost:3000** ✅

> ไฟล์ `database.db` จะถูกสร้างอัตโนมัติพร้อม seed data ตอน run ครั้งแรก

---

## 🐳 Mode 2: Docker

### ขั้นที่ 1 — Build image
```bash
docker build -t lucky-draw-node .
```

### ขั้นที่ 2 — Run container (พร้อม persistent volume)
```bash
docker run -p 3000:3000 -v lucky-draw-data:/app lucky-draw-node
```

เปิดเบราว์เซอร์ไปที่ **http://localhost:3000** ✅

> ข้อมูล `database.db` จะถูกเก็บไว้ใน Docker volume `lucky-draw-data` ไม่หายเมื่อ container ถูก stop

---

## ☁️ Mode 3: Cloudflare Workers + D1 (Binding Mode)

ใช้ Cloudflare D1 เป็นฐานข้อมูล deploy บน Workers runtime

### ขั้นที่ 1 — ติดตั้ง Wrangler CLI
```bash
npm install -g wrangler
```

### ขั้นที่ 2 — Login Cloudflare
```bash
npx wrangler login
```
เบราว์เซอร์จะเปิดหน้า Cloudflare ให้กด Authorize

### ขั้นที่ 3 — สร้าง D1 Database (ถ้ายังไม่มี)

สร้างผ่าน Cloudflare Dashboard:
- เข้า [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **D1**
- กด **Create database** → ตั้งชื่อ `luckydraw`
- บันทึก **Database ID** ที่ได้

หรือสร้างผ่าน Wrangler:
```bash
npx wrangler d1 create luckydraw
```

### ขั้นที่ 4 — ตรวจสอบ wrangler.toml

ไฟล์ `wrangler.toml` ในโปรเจกต์ถูกตั้งค่าไว้แล้ว:

```toml
name = "lucky-draw-api"
main = "src/worker.js"
compatibility_date = "2026-04-28"

[[d1_databases]]
binding = "DB"
database_name = "luckydraw"
database_id = "d47c4554-7e4c-4916-9810-81ffe5eb7033"
```

> ถ้า database_id ต่างออกไป ให้แก้ `database_id` ให้ตรงกับ D1 ที่สร้างไว้

### ขั้นที่ 5 — รัน Migration (สร้าง schema + seed data)
```bash
npm run d1:migrate
```

> คำสั่งนี้รัน `migrations/d1/001_init.sql` บน D1 จริง (remote) เป็น idempotent ทำซ้ำได้ปลอดภัย

### ขั้นที่ 6 — ทดสอบ local
```bash
npm run worker:dev
```

Worker จะรันที่ **http://localhost:8787** และยิงไปยัง D1 บน cloud จริง ✅

### ขั้นที่ 7 — Deploy ขึ้น Cloudflare
```bash
npm run worker:deploy
```

Worker URL จะแสดงในหน้า Terminal เช่น `https://lucky-draw-api.<account>.workers.dev` ✅

---

## NPM Scripts สรุป

| Script | คำอธิบาย |
|--------|---------|
| `npm start` | รัน Express server (Local mode) |
| `npm run dev` | รัน Express server พร้อม hot reload |
| `npm run worker:dev` | รัน Cloudflare Worker แบบ local |
| `npm run worker:deploy` | Deploy Worker ขึ้น Cloudflare |
| `npm run d1:migrate` | รัน migration SQL บน D1 (remote) |
| `npm run d1:migrate:local` | รัน migration SQL แบบ local D1 |

---

## เปิดดูฐานข้อมูล SQLite ใน VSCode

1. กด `Ctrl+Shift+X` → ค้นหา **SQLite Viewer**
2. ติดตั้ง extension ของ **Florian Klampfer**
3. คลิกที่ไฟล์ **`database.db`** ในโฟลเดอร์
4. จะเห็นตาราง `stock` และ `history` ได้เลย

---

## ตาราง Database

### `stock` — รางวัลและจำนวนคงเหลือ
| คอลัมน์   | ชนิด    | คำอธิบาย          |
|-----------|---------|-------------------|
| id        | INTEGER | Primary key       |
| name      | TEXT    | ชื่อรางวัล        |
| unit      | TEXT    | หน่วย             |
| icon      | TEXT    | อีโมจิ            |
| remaining | INTEGER | จำนวนที่เหลือ     |

### `history` — ประวัติผู้รับรางวัล
| คอลัมน์    | ชนิด | คำอธิบาย           |
|------------|------|--------------------|
| id         | INTEGER | Primary key     |
| fname      | TEXT | ชื่อ               |
| lname      | TEXT | นามสกุล            |
| phone      | TEXT | เบอร์โทร (unique)  |
| email      | TEXT | อีเมล              |
| company    | TEXT | บริษัท             |
| position   | TEXT | ตำแหน่ง            |
| interest   | TEXT | ความสนใจ           |
| note       | TEXT | หมายเหตุ           |
| admin_note | TEXT | หมายเหตุจากแอดมิน  |
| prize      | TEXT | รางวัลที่ได้รับ    |
| unit       | TEXT | หน่วย              |
| icon       | TEXT | อีโมจิ             |
| created_at | TEXT | วันเวลาที่สุ่ม     |

---

## Reset ข้อมูล (เริ่มกิจกรรมใหม่)

**Local / Docker:**
```bash
# Windows
del database.db

# Mac / Linux
rm database.db
```
แล้ว restart server — ระบบจะสร้าง stock ใหม่อัตโนมัติ

**Cloudflare D1:**
ใช้หน้า Admin → Clear History และ Clear Stock ใน UI

---

## แก้ไขรางวัล

เปิดไฟล์ `db.js` แล้วแก้ที่ `INITIAL_PRIZES`:

```js
const INITIAL_PRIZES = [
  { name: 'ปากกา', unit: 'แท่ง', icon: '✏️', stock: 10 },
  { name: 'สมุด',  unit: 'เล่ม', icon: '📒', stock: 5  },
  { name: 'ผ้าห่ม', unit: 'ผืน', icon: '🛏️', stock: 1  },
  // เพิ่มรางวัลใหม่ที่นี่
];
```

สำหรับ D1: แก้ seed data ใน `migrations/d1/001_init.sql` แล้วรัน `npm run d1:migrate` อีกครั้ง

---

## API Endpoints

| Method | Path | คำอธิบาย |
|--------|------|---------|
| GET | /api/stock | ดู stock ที่เหลือทั้งหมด |
| GET | /api/check/:phone | ตรวจสอบเบอร์โทรว่าเคยสุ่มแล้วหรือไม่ |
| POST | /api/check-duplicate | ตรวจสอบ phone หรือ email ซ้ำ |
| POST | /api/draw | สุ่มรางวัล + บันทึกประวัติ |
| GET | /api/history | ดูประวัติผู้รับรางวัลทั้งหมด |
| POST | /api/admin/prizes | เพิ่มรางวัลใหม่ |
| POST | /api/admin/prizes/import | Import รางวัลจาก CSV |
| PATCH | /api/admin/stock/:id | แก้จำนวน stock |
| POST | /api/admin/stock/clear | ล้าง stock ทั้งหมด |
| POST | /api/admin/history/clear | ล้างประวัติทั้งหมด |
| PATCH | /api/admin/history/:id/admin-note | แก้ admin note |
| GET | /api/admin/db-mode | ตรวจสอบ database mode ที่ใช้งานอยู่ |
