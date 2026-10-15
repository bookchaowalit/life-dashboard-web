# Solo Web

หน้าเว็บเดียวของ Solo Empire แต่ละส่วนเรียก backend ของตัวเองแยกกัน
ตาม [spec](../../docs/superpowers/specs/2026-09-30-unified-web-shell-design.md)

| Module | หน้า | Backend (env) | ค่าเริ่มต้น |
|---|---|---|---|
| วันนี้/งาน | `/tasks` (`/today` redirect มาที่นี่) | `EMPIRE_TASKS_API` + `EMPIRE_CELL_TOKEN` | ไม่มี (ต้องตั้งค่า) |
| เป้าหมาย | `/goals` | `EMPIRE_GOALS_API` + `EMPIRE_CELL_TOKEN` | ไม่มี |
| นิสัย | `/habits` | `EMPIRE_HABITS_API` + `EMPIRE_CELL_TOKEN` | ไม่มี |
| การตัดสินใจ | `/decisions`, `/decisions/<id>` | `EMPIRE_DECISIONS_API` + `EMPIRE_CELL_TOKEN` | ไม่มี |
| รายได้ | `/revenue` | `EMPIRE_CRM_LEDGER_API` + `EMPIRE_CRM_LEDGER_TOKEN` | ไม่มี |
| งานผลิต | `/production` | `PRODUCTION_HUB_API_ORIGIN` | `http://127.0.0.1:3460` |
| คลังความรู้ | `/knowledge` | `KNOWLEDGE_API_ORIGIN` | `http://127.0.0.1:3430` |
| คลาวด์ | `/cloud` | `CLOUD_API_ORIGIN` | `http://127.0.0.1:3440` |
| AI Usage | `/ai-usage` | `AI_USAGE_API_ORIGIN` | `http://127.0.0.1:3520` |
| บัญชี | `/accounts` | `ACCOUNTS_API_ORIGIN` | `http://127.0.0.1:3470` |
| แอปและ API | `/integrations` | `INTEGRATIONS_API_ORIGIN` | `http://127.0.0.1:3480` |
| SaaS ฟรี | `/saas` | `SAAS_CATALOG_API_ORIGIN` | `http://127.0.0.1:3490` |
| CRM, วิดีโอ | ลิงก์ไปแอปเดิม | — | ย้ายในรอบถัดไป |

## Owner modules ที่เรียก cell โดยตรง (server side)

หน้า `/tasks`, `/goals`, `/habits`, `/decisions`, `/revenue` เป็น server component ที่อ่าน cell API ตรง ๆ
จาก `lib/cells/*` (ไม่ผ่าน BFF proxy และไม่มีค่าใดอยู่ใน client bundle หรือ `NEXT_PUBLIC_*`)
ทุกหน้าต้องมี owner session เหมือนโมดูลอื่น; ถ้า env ขาดหรือ cell ล้มเหลว หน้าจะแสดงสถานะ
"ไม่พร้อมใช้งาน" แบบสั้น ไม่แสดง body ของ upstream หรือโทเค็น

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `EMPIRE_TASKS_API` | Tasks API (empire-platform) |
| `EMPIRE_GOALS_API` | goals cell |
| `EMPIRE_HABITS_API` | habits cell |
| `EMPIRE_DECISIONS_API` | decisions cell |
| `EMPIRE_CELL_TOKEN` | automation token `solo-web` ตัวเดียวสำหรับทุก cell ข้างบน (audience ครบทุก cell; scope: read ทุก cell, `tasks.status:write`, `habits.habit:write`) |
| `EMPIRE_CRM_LEDGER_API` | CRM ledger (income instance) |
| `EMPIRE_CRM_LEDGER_TOKEN` | owner token ของ CRM ledger |

URL ต้องเป็น https (http เฉพาะ loopback) ไม่มี credentials/query; ส่ง `Authorization: Bearer` และ
`X-Empire-Channel: api` ไม่ตาม redirect และจำกัดเวลา 10 วินาทีต่อคำขอ

Action เขียน (POST, ผ่าน Host/Origin/`application/json` guard เดียวกับ proxy และ owner session):

- `POST /api/owner/tasks/status` `{number, status}`: `done` เรียก `/complete` ส่วนสถานะอื่นเป็น PATCH
- `POST /api/owner/habits/log` `{habit_id, completed}`: บันทึกหรือยกเลิกของ "วันนี้" (เซิร์ฟเวอร์เลือกวันที่ตามเวลา Asia/Bangkok เอง)

ทั้งสองเป็น idempotent โดยธรรมชาติ (ตั้งสถานะ/ upsert log รายวัน); Tasks API ยังไม่รองรับ `expected_version`
หน้า decisions เป็นอ่านอย่างเดียว และซ่อนข้อความของรายการ `privacy_class=sensitive`

## เปิดใช้งาน

เปิด backend ที่ต้องใช้แยกกัน (เช่น
`python -m production_hub.api` ใน `services/production-hub` ของ
repository `book-production-platform`) แล้ว:

```bash
cd apps/solo-web
npm ci
# ตั้ง SOLO_WEB_LOCAL_DEMO=true ใน .env.local เฉพาะการพัฒนาแบบ loopback
npm run dev
```

เปิด `http://127.0.0.1:3600`

## ความคุ้มค่า AI subscription

เปิด `/ai-subscriptions` จากเมนู **ความคุ้มค่า AI** หรือจากหน้าการเงิน เพื่อเพิ่ม
สมาชิกจากผู้ให้บริการใดก็ได้ หรือจัดหมวด subscription เดิมเป็น `ai` แล้วบันทึก
งานที่ใช้ AI ช่วย ยอดจ่ายจริงพร้อมช่วงบริการ และการทบทวนรายเดือน
ดู [วิธีใช้และเกณฑ์การประเมิน](docs/ai-subscriptions.md)

หน้าใหม่นี้ใช้ `EMPIRE_SUBSCRIPTIONS_API` และ `EMPIRE_CELL_TOKEN` ของ Subscriptions
cell เดิม ต้องลง migration `0003_subscription_usage_and_charges.sql` และปรับ
permissions ของ cell ก่อนเปิดใช้งาน ไม่สร้างฐานข้อมูลสำรองใน browser และไม่
ยกเลิกหรือต่ออายุบริการแทนเจ้าของ การเก็บผลงานและใบเสร็จรุ่นนี้เป็นการบันทึกเอง
ไม่อ่านบทสนทนา ไม่ดึงบัญชี AI อัตโนมัติ และไม่นำโควตาหรือราคา token มาสรุปเป็นผลงาน

## AI Usage (โควตา Claude/Codex เดิม)

เปิด metadata API ด้วย `PYTHONPATH=packages/service-auth .venv/bin/python services/ai-usage-api/server.py` จาก repository root
แล้วเปิด `/ai-usage` ดู Claude/Codex แยกโควตาแต่ละรอบ ค่าสมาชิกรายเดือน และคำเตือนก่อนรีเซ็ต
ราคากับแพ็กอ่านจาก configuration ของ backend ไม่ฝังข้อมูลบัญชีหรือราคาเจ้าของใน frontend
ดูการตั้งค่า collector และค่าสมาชิกที่ [AI Usage API](../../services/ai-usage-api/README.md)
ใน hosted mode ตั้ง `AI_USAGE_API_ORIGIN` เป็น HTTPS และ `AI_USAGE_API_ALLOW_REMOTE=true`
พร้อม service-auth issuer, owner allowlist และ public key ฝั่ง backend ตามรูปแบบเดียวกับ metadata APIs

หน้าเว็บอ่านใหม่ทุก 60 วินาทีเมื่อ visible; ข้อมูลเก่าหรือผิดพลาดระบุชัดเจน และรอบที่เลยเวลารีเซ็ต
ไม่ถือเป็นโควตาปัจจุบัน ปุ่มแจ้งเตือนขอ browser permission เมื่อผู้ใช้กดเท่านั้น ไม่มี service worker
หรือการส่งข้อความภายนอก จึงต้องเปิดหน้านี้ไว้ การแจ้งเตือนใช้เฉพาะ snapshot สดและบันทึกเฉพาะ
ID ของเหตุการณ์กับเวลารีเซ็ตใน localStorage เพื่อไม่เตือนซ้ำในรอบเดิม
ค่า API ที่เรียกเก็บจริงยังไม่เชื่อมต่อ; ค่าเซสชันเป็นค่าประเมิน ไม่รวมเป็นค่า API หรือมูลค่าการใช้ทั้งเดือน

## Proxy

`/api/<service>/<path>` ส่งต่อไปที่ `<ORIGIN>/api/<path>` ตามทะเบียนใน `lib/backends.ts`
ซึ่งกำหนด method และ path ที่อนุญาต ทุก GET/write ต้องผ่าน Host/Origin guard และ owner session ก่อนเรียก backend
ไม่ส่งต่อ caller `Authorization`, cookie หรือ `X-Owner` ไป backend ส่วน mutation ต้องมี Origin ตรงกับ HTTPS origin ของ request
พร้อม `Content-Type: application/json` ค่า `X-Forwarded-Host` ไม่ใช้เป็นหลักฐานอนุญาต domain
remote backend ต้องเป็น HTTPS origin ที่กำหนดใน server env และเปิด `<SERVICE>_ALLOW_REMOTE=true`
ไม่รับ credentials, path, query หรือ fragment ใน origin และไม่ตาม upstream redirects
production ไม่มี loopback/default-origin fallback; metadata จำกัดเวลา 8–15 วินาที, Production 30 วินาที

## Authentication และ Vercel

ตั้ง Root Directory ของ Vercel เป็น `apps/solo-web`; `vercel.json` ใช้ Next.js และ function budget 60 วินาที
ตัว build ทำงานได้โดยไม่มี runtime secrets แต่ private API ปฏิเสธการเข้าถึงจน configuration และ session พร้อม
ยังไม่มีการ provision IdP, ตั้งค่า deployment จริง หรือ deploy จากงานนี้

- ตั้ง `SOLO_WEB_PUBLIC_ORIGIN` เป็น HTTPS origin หลัก และ `SOLO_WEB_PREVIEW_ORIGINS` เป็นรายการ exact HTTPS origins คั่นด้วย comma หากต้องใช้ preview; ไม่อนุญาต wildcard `*.vercel.app`
- ตั้ง OIDC issuer, confidential client ID/secret ผ่าน server environment ตาม `.env.example` และลงทะเบียน callback `<origin>/api/auth/callback` แยกทุก origin ที่อนุญาต เลือก MFA/recovery policy ที่ IdP ตามข้อกำหนดเจ้าของ
- `SOLO_WEB_OWNER_SUBJECTS` เป็น JSON array ของ OIDC `sub` ที่อนุญาต ใช้ owner tenant เดียว (`tenant_id=owner`); การเพิ่มหลาย tenant/object policy ต้องออกแบบแยกก่อนเปิด
- ตั้ง `SOLO_WEB_SESSION_KEY` ด้วย secret 32 random bytes แบบ unpadded base64url และ `SOLO_WEB_SERVICE_PRIVATE_KEY` เป็น PKCS8 RSA private PEM ผ่านระบบ secret ของ deployment เท่านั้น ไม่เก็บใน Git หรือ `NEXT_PUBLIC_*`
- ตั้ง HTTPS origins ของ accounts/integrations/saas/knowledge และ flag remote ของแต่ละบริการ; ให้แต่ละ backend รับ **public** PEM ที่ตรงกันและ issuer หลักเดียวกัน

`/login` เป็นหน้าสาธารณะ ภาษาไทย; `/api/auth/login` ใช้ authorization code + S256 PKCE + state + nonce
`openid-client` ตรวจ ID-token issuer/audience/time/nonce พร้อม signature verification ผ่าน `enableNonRepudiationChecks`
cookie transaction และ session เป็น JWE (`dir`/`A256GCM`) แบบ `__Host-`, Secure, HttpOnly, SameSite=Lax, Path=/
transaction อายุ 10 นาที; session อายุไม่เกิน 1 ชั่วโมงและไม่เกิน ID-token expiration โดยไม่เก็บ provider/access/refresh token
server ตรวจ session ก่อน render หน้า module; `/api/auth/session` แสดงเฉพาะ authenticated boolean

logout รับ POST ที่ Origin ตรงกันและลบ cookies การเพิกถอนทุก session ทำได้ด้วยการหมุน session key หรือถอด subject จาก allowlist
ยังไม่มี distributed session-revocation store หรือ IdP backchannel logout: สำเนา cookie ที่ถูกขโมยยังใช้ได้จนหมดอายุ/หมุน key/ถอด subject
ห้ามอ้างว่า logout นี้เพิกถอน provider session หรือ access tokens ที่ IdP; app ไม่เก็บ provider tokens

BFF ออก RS256 token ใหม่ต่อ request: `iss=SOLO_WEB_PUBLIC_ORIGIN` ที่ normalize แล้ว, `sub=OIDC sub`,
`tenant_id=owner`, `iat`, `nbf`, `exp<=iat+120` และ `jti` ใหม่ โดย expiry ไม่เกิน owner session
audience/scope คือ `accounts-api`/`accounts:read`, `integrations-api`/`integrations:read`,
`saas-catalog-api`/`saas:read`, `knowledge-api`/`knowledge:read`, `ai-usage-api`/`ai-usage:read`
Today/Cloud/Production บน hosted mode ตอบ `service_auth_unavailable` จน backend รองรับ scoped owner auth;
legacy Hub token ใช้เฉพาะ explicit nonproduction loopback demo

`GET /api/health` แสดงเฉพาะชื่อ configuration และสถานะ, ไม่มีค่า env/subject/secret/token
ready เป็น configuration readiness ของ identity และ metadata services ทั้งสี่ ไม่ใช่การตรวจ live backend หรือการยืนยันว่า module อื่นพร้อม
เมื่อ configuration ไม่ครบตอบ 503 และหน้า login แสดงข้อความสำหรับผู้ดูแล
ตั้ง production และ preview secrets แยกกัน; preview ใช้เฉพาะ isolated test destinations/keys ที่ผู้ดูแลอนุญาต

แนวทาง library: [openid-client example](https://github.com/panva/openid-client/blob/main/examples/oauth.ts),
[Next.js authentication](https://nextjs.org/docs/app/guides/authentication)

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
