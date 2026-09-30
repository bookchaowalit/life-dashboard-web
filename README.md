# Solo Web

หน้าเว็บเดียวของ Solo Empire แต่ละส่วนเรียก backend ของตัวเองแยกกัน
ตาม [spec](../../docs/superpowers/specs/2026-09-30-unified-web-shell-design.md)

| Module | หน้า | Backend (env) | ค่าเริ่มต้น |
|---|---|---|---|
| วันนี้ | `/today` | `TODAY_API_ORIGIN` | `http://127.0.0.1:3410` |
| งานผลิต | `/production` | `PRODUCTION_HUB_API_ORIGIN` | `http://127.0.0.1:3460` |
| คลังความรู้ | `/knowledge` | `KNOWLEDGE_API_ORIGIN` | `http://127.0.0.1:3430` |
| คลาวด์ | `/cloud` | `CLOUD_API_ORIGIN` | `http://127.0.0.1:3440` |
| CRM, วิดีโอ | ลิงก์ไปแอปเดิม | — | ย้ายในรอบถัดไป |

## เปิดใช้งาน

เปิด backend ที่ต้องใช้แยกกัน (เช่น `python services/today-api/server.py`,
`python -m production_hub.api` ใน `services/production-hub`) แล้ว:

```bash
cd apps/solo-web
npm ci
npm run dev
```

เปิด `http://127.0.0.1:3600`

## Proxy

`/api/<service>/<path>` ส่งต่อไปที่ `<ORIGIN>/api/<path>` ตามทะเบียนใน `lib/backends.ts`
ซึ่งกำหนด method และ path ที่อนุญาต, การส่งต่อ `Authorization` และ header ฝั่ง server
ของแต่ละ backend จึงย้าย backend ไปเครื่องอื่นหรือเพิ่ม replica ได้โดยแก้แค่ env
proxy ผ่าน `lib/request-guard.ts` ก่อนเสมอ: `Host` ต้องเป็น loopback บนพอร์ตแอป (`PORT` หรือ 3600)
เพื่อกัน DNS rebinding และ POST/PATCH ต้องมาจาก origin เดียวกันพร้อม `Content-Type: application/json`
ไม่เช่นนั้นตอบ 403/415 โดยไม่ส่งต่อ token ฝั่ง server

## เพิ่ม module

1. คัดลอก client และ `lib/api.ts` ไปที่ `modules/<module>/` แล้วเปลี่ยน path เป็น `/api/<module>/v1/...`
2. `npm run scope-css -- <module> <globals.css เดิม> modules/<module>/module.css`
3. สร้าง `app/<module>/page.tsx` ครอบด้วย `<div className="m-<module>">`
4. ลงทะเบียน backend ใน `lib/backends.ts` และเมนูใน `lib/modules.ts`

## ตรวจสอบ

```bash
npm run typecheck
npm test
npm run build
```
