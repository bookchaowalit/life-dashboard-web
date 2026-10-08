---
title: Solo Web — Software Requirements (SRS)
doc_id: SWB-DOC-05
doc_type: srs
version: 0.1
date: 2026-10-07
status: ร่างเพื่อพิจารณา
owner: BA
related: 01-prd.md, 06-ux-flows.md, 07-test-uat.md, 08-rtm.md, 12-trd-api-data.md
---

# 05 — Software Requirements (SRS)

ข้อกำหนดในเอกสารนี้สะท้อน **พฤติกรรมที่มีอยู่ใน source** ณ 2026-10-07 (as-built) ไม่ใช่ข้อกำหนดใหม่

## 1. บทบาทและสิทธิ์

| บทบาท | ระบุตัวตนอย่างไร | สิทธิ์ |
|---|---|---|
| Anonymous | ไม่มี session | เปิด `/login`, `GET /api/health`, `GET /api/auth/session` (ได้ `authenticated:false`), เริ่ม login; ทุกหน้า module redirect ไป `/login`; proxy ตอบ 401 |
| Owner | OIDC `sub` อยู่ใน `SOLO_WEB_OWNER_SUBJECTS`, `tenant_id=owner` | ทุกหน้า module; อ่าน metadata ผ่าน BFF; mutation (Today PATCH, Production POST) เฉพาะเมื่อ backend รองรับ |
| Local demo | `SOLO_WEB_LOCAL_DEMO=true`, non-production, loopback | เท่ากับ owner (`sub=local-demo`) อายุ 60 วินาทีต่อการตรวจ; อนุญาต legacy Hub token ไป loopback |
| Backend service | ตรวจ service JWT (audience/scope ราย API) | อ่านข้อมูลของตนเองเท่านั้น |

## 2. Use cases / user stories

| ID | เรื่อง | Acceptance criteria |
|---|---|---|
| UC-01 | เจ้าของ login | (1) `/login` แสดงปุ่ม "เข้าสู่ระบบ" เมื่อ config ครบ (2) `GET /api/auth/login` redirect 303 ไป IdP พร้อม PKCE S256/state/nonce และตั้ง cookie transaction อายุ 600 วินาที (3) callback ที่ถูกต้องตั้ง session cookie แล้ว redirect `/` (4) ล้มเหลว → `/login?error=denied` และลบ session |
| UC-02 | ผู้ไม่ได้รับอนุญาตพยายามเข้า | `sub` ไม่อยู่ใน allowlist → ไม่มี session; หน้า module redirect `/login`; proxy ตอบ 401 `authentication_required` |
| UC-03 | เจ้าของ logout | POST `/api/auth/logout` ที่ Origin ตรง → ลบ cookie ทั้งสองแล้ว redirect `/login`; Origin ไม่ตรง → 403 |
| UC-04 | เจ้าของเปิดหน้าแรกและเลือก module | หน้า `/` แสดงการ์ดทุก module; module ที่ย้ายแล้วเป็นลิงก์ภายใน, CRM/วิดีโอเปิดแท็บใหม่ |
| UC-05 | เจ้าของดูบัญชีทุกแพลตฟอร์ม | กรอง `status`/`platform`/`kind`/`q`; เห็นสรุปและกลุ่ม; anonymous identities แสดงเป็นตัวเลขรวมเท่านั้น |
| UC-06 | เจ้าของดูแอปและ API ที่เชื่อม | กรอง `status`/`category`/`q`; แสดง guide pointer ถ้ามี |
| UC-07 | เจ้าของค้น SaaS free tier | กรอง `category`/`card`/`commercial`/`q`, แบ่งหน้า (`limit` 1–100), ดู starter stacks |
| UC-08 | เจ้าของค้นเอกสารในคลังความรู้ | ค้น/กรองตามหมวด, แบ่งหน้า, เปิดรายละเอียดและเอกสารที่เชื่อมโยง (parent/related/child); ไม่มี body เอกสาร |
| UC-09 | เจ้าของดูโควตา AI | เห็นโควตา Claude/Codex รายรอบ, ค่าสมาชิก, คำเตือนก่อนรีเซ็ต; รีเฟรชทุก 60 วินาทีเมื่อ visible; ขอ permission แจ้งเตือนเมื่อกดเท่านั้น; ไม่เตือนซ้ำในรอบเดิม |
| UC-10 | เจ้าของจัดการงานวันนี้ | ดูคิววันนี้; PATCH `status`/`priority`/`progress_percent`/`due_date`/`estimated_minutes`/`actual_minutes`; hosted → `service_auth_unavailable` |
| UC-11 | เจ้าของดูคลาวด์ | ดู usage, PaaS inventory, action policy แบบอ่านอย่างเดียว; hosted → `service_auth_unavailable` |
| UC-12 | เจ้าของใช้ Production Console | คลังไฟล์ + lineage, โปรเจกต์ (review/assign/package), ส่งต่อไฟล์, flows/templates, เส้นทางแปลงไฟล์; hosted → `service_auth_unavailable` |
| UC-13 | ผู้ดูแลตรวจความพร้อม | `GET /api/health` คืนสถานะ config โดยไม่มีค่า; 503 เมื่อไม่ครบ |

## 3. Functional requirements

| ID | ข้อกำหนด | UC | Priority | Phase | สถานะ |
|---|---|---|---|---|---|
| FR-01 | ระบบต้อง login ด้วย OIDC authorization code + PKCE S256 + state + nonce และตรวจ ID token (signature/issuer/audience/time/nonce) | UC-01 | Must | 1 | สร้างแล้ว |
| FR-02 | ระบบต้องอนุญาตเฉพาะ `sub` ใน `SOLO_WEB_OWNER_SUBJECTS` และกำหนด `tenant_id=owner` | UC-01, UC-02 | Must | 1 | สร้างแล้ว |
| FR-03 | session ต้องเป็น JWE ใน cookie `__Host-solo-session` อายุ ≤1 ชม. และ ≤ ID-token `exp`; ไม่เก็บ provider token | UC-01 | Must | 1 | สร้างแล้ว |
| FR-04 | logout ต้องรับเฉพาะ POST ที่ Origin ตรงและลบ cookie | UC-03 | Must | 1 | สร้างแล้ว |
| FR-05 | ทุกหน้า module ต้องตรวจ owner session ฝั่ง server ก่อน render มิฉะนั้น redirect `/login` | UC-02 | Must | 1 | สร้างแล้ว |
| FR-06 | หน้าแรกและเมนูต้องแสดงทุก module จาก `lib/modules.ts`; module ที่ยังไม่ย้ายเปิดแอปเดิมในแท็บใหม่ | UC-04 | Must | 1 | สร้างแล้ว |
| FR-07 | proxy `/api/<service>/<path>` ต้องอนุญาตเฉพาะ method/path ในทะเบียน มิฉะนั้น 404 | UC-05–UC-12 | Must | 1 | สร้างแล้ว |
| FR-08 | ทุก request ต้องมี Host ที่อนุญาต; mutation ต้องมี Origin ตรงและ `application/json` (403/415) | UC-03, UC-10, UC-12 | Must | 1 | สร้างแล้ว |
| FR-09 | proxy ต้องไม่ส่งต่อ `Authorization`/cookie ของผู้เรียก และแนบ service JWT RS256 ใหม่ (audience/scope ราย API, ≤120 วินาที) | UC-05–UC-09 | Must | 1 | สร้างแล้ว |
| FR-10 | production ต้องไม่ fallback ไป loopback; remote backend ต้อง HTTPS + `<SERVICE>_ALLOW_REMOTE=true`; ไม่ตาม redirect | ทั้งหมด | Must | 1 | สร้างแล้ว |
| FR-11 | `GET /api/health` ต้องคืนสถานะ config รายชื่อโดยไม่มีค่า, 200 เมื่อพร้อม/503 เมื่อไม่ครบ | UC-13 | Must | 1 | สร้างแล้ว |
| FR-12 | Module บัญชี: อ่าน `/v1/accounts` พร้อมตัวกรองและแสดง anonymous เป็น count | UC-05 | Must | 1 | สร้างแล้ว |
| FR-13 | Module แอปและ API: อ่าน `/v1/integrations` พร้อมตัวกรอง | UC-06 | Must | 1 | สร้างแล้ว |
| FR-14 | Module SaaS ฟรี: อ่าน `/v1/saas` พร้อมตัวกรองและแบ่งหน้า | UC-07 | Must | 1 | สร้างแล้ว |
| FR-15 | Module คลังความรู้: อ่าน `/v1/knowledge` และ `/v1/knowledge/document` | UC-08 | Must | 1 | สร้างแล้ว |
| FR-16 | Module AI Usage: อ่าน `/v1/ai-usage`, รีเฟรช 60 วินาที, แจ้งเตือน opt-in และ dedupe ใน `localStorage` | UC-09 | Should | **[ต้องยืนยัน]** | สร้างแล้ว |
| FR-17 | Module วันนี้: อ่าน `/v1/today` และ PATCH `/v1/tasks/<id>` | UC-10 | Should | 2 | local เท่านั้น |
| FR-18 | Module คลาวด์: อ่าน `/v1/cloud/usage`, `/v1/paas/inventory`, `/v1/paas/actions` | UC-11 | Should | 2 | local เท่านั้น |
| FR-19 | Production Console: route ในทะเบียน production (artifacts, projects, send, flows, jobs, templates, formats, runtimes, path) | UC-12 | Should | 3 | local เท่านั้น |
| FR-20 | ข้อความ error ต้องเป็นภาษาไทย และ backend ล่มต้องได้ `503 backend_unavailable` โดยไม่รั่ว exception | ทั้งหมด | Must | 1 | สร้างแล้ว |

## การอนุมัติ

| บทบาท | สถานะ | วันที่ | ลงนาม |
|---|---|---|---|
| BA | รอพิจารณา | — | __________ |
| Product / เจ้าของ | รอพิจารณา | — | __________ |

## แหล่งข้อมูล

- `apps/solo-web/lib/{auth.ts,auth-routes.ts,page-auth.ts,request-guard.ts,backends.ts,modules.ts}`
- `apps/solo-web/app/**/page.tsx`, `apps/solo-web/app/api/**/route.ts`
- `apps/solo-web/modules/*/api.ts`, `apps/solo-web/modules/*/client.tsx`
- `services/*/contracts/*.v1.md`
- `apps/solo-web/README.md`
