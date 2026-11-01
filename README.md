# Workbook

To-do และบันทึกประชุมสำหรับงานซ่อมบำรุงและงานคอนเทนต์ ใช้คนเดียวบนคอม Windows ข้อมูลเก็บในเบราว์เซอร์ของเครื่อง (IndexedDB) ไม่มีเซิร์ฟเวอร์

## ใช้งาน
1. เปิดลิงก์ GitHub Pages ของ repo นี้ใน Edge หรือ Chrome
2. กดไอคอน "ติดตั้งแอป" ที่แถบที่อยู่ จะได้ไอคอนบน Taskbar/Start
3. สำรองข้อมูลทุกสัปดาห์จากเมนู "สำรอง / กู้คืนข้อมูล" (จุดสีส้มจะขึ้นเมื่อไม่ได้สำรองเกิน 7 วัน)

คีย์ลัด: `n` งานใหม่ · `/` หรือ `Ctrl+K` ค้นหา · `Esc` ปิดหน้าต่าง

## พัฒนา
```
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```
Push ขึ้น `main` แล้ว GitHub Actions จะ build และ deploy ไป GitHub Pages ให้อัตโนมัติ (ตั้ง Settings → Pages → Source เป็น "GitHub Actions" ครั้งแรกครั้งเดียว)

## สถานะ
- [x] เฟส 0–1: To-do, วันครบกำหนด, Priority, Tag, พื้นที่งานพร้อมฟิลด์เฉพาะ, งานซ้ำ, หน้าวันนี้, ค้นหาภาษาไทย, สำรอง/กู้คืน
- [x] เฟส 2: บันทึกประชุม 5 เทมเพลต (Daily Maintenance, Breakdown 5 WHY, Weekly PM, Content Planning, ทั่วไป), ผู้เข้าร่วม, Action Item → To-do พร้อมลิงก์กลับ
- [ ] เฟส 3: แจ้งเตือน Windows, สำรองอัตโนมัติลงโฟลเดอร์
