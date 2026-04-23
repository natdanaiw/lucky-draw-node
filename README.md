# 🎁 Lucky Draw — Node.js + SQLite

ระบบสุ่มของรางวัล พร้อม backend Node.js และฐานข้อมูล SQLite

---

## โครงสร้างโปรเจกต์

```
lucky-draw-node/
├── server.js          ← Express server (entry point)
├── db.js              ← SQLite logic ทั้งหมด
├── database.db        ← ไฟล์ฐานข้อมูล (สร้างอัตโนมัติตอน run ครั้งแรก)
├── package.json
└── public/            ← Static files (HTML/CSS/JS ฝั่ง browser)
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

---

## วิธีติดตั้งและรัน

### ขั้นที่ 1 — ติดตั้ง Node.js
ดาวน์โหลดจาก https://nodejs.org (แนะนำ LTS)

### ขั้นที่ 2 — เปิดโปรเจกต์ใน VSCode
```
File → Open Folder → เลือกโฟลเดอร์ lucky-draw-node
```

### ขั้นที่ 3 — ติดตั้ง dependencies
เปิด Terminal ใน VSCode (`Ctrl+`` `) แล้วพิมพ์:
```bash
npm install
```

### ขั้นที่ 4 — รัน server
```bash
npm start
```

เปิดเบราว์เซอร์ไปที่ **http://localhost:3000** ✅

---

## เปิดดูฐานข้อมูล SQLite ใน VSCode

1. กด `Ctrl+Shift+X` → ค้นหา **SQLite Viewer**
2. ติดตั้ง extension ของ **Florian Klampfer**
3. คลิกที่ไฟล์ **`database.db`** ในโฟลเดอร์
4. จะเห็นตาราง `stock` และ `history` ได้เลย

---

## ตาราง SQLite

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
| prize      | TEXT | รางวัลที่ได้รับ    |
| unit       | TEXT | หน่วย              |
| icon       | TEXT | อีโมจิ             |
| created_at | TEXT | วันเวลาที่สุ่ม     |

---

## Reset ข้อมูล (เริ่มกิจกรรมใหม่)

ลบไฟล์ `database.db` แล้ว restart server — ระบบจะสร้าง stock ใหม่อัตโนมัติ

```bash
# Windows
del database.db

# Mac / Linux
rm database.db
```

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

จากนั้นลบ `database.db` แล้ว restart server

---

## API Endpoints

| Method | Path               | คำอธิบาย                          |
|--------|--------------------|-----------------------------------|
| GET    | /api/stock         | ดู stock ที่เหลือทั้งหมด          |
| GET    | /api/check/:phone  | ตรวจสอบว่าเบอร์นี้เคยสุ่มแล้วหรือไม่ |
| POST   | /api/draw          | สุ่มรางวัล + บันทึกประวัติ        |
| GET    | /api/history       | ดูประวัติผู้รับรางวัลทั้งหมด      |
