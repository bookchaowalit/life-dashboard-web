---
title: Solo Web — Requirements Traceability Matrix (RTM)
doc_id: SWB-DOC-08
doc_type: rtm
version: 0.1
date: 2026-10-07
status: ร่างเพื่อพิจารณา
owner: BA + QA
related: 05-srs.md, 06-ux-flows.md, 07-test-uat.md, 12-trd-api-data.md
---

# 08 — Requirements Traceability Matrix (RTM)

สถานะหลักฐาน: **ผ่าน (unit)** = มี automated test ผ่านวันที่ 2026-10-07, **ข้าม** = มี test แต่ไม่ได้รัน, **ไม่มี** = ยังไม่มี test, **รอ hosted** = ต้องทดสอบบน staging

## 1. ตาราง FR ↔ UC ↔ หน้าจอ ↔ TC

| FR | UC | หน้าจอ / endpoint | TC | สถานะหลักฐาน |
|---|---|---|---|---|
| FR-01 OIDC login | UC-01 | SCR-01, `/api/auth/login`, `/api/auth/callback` | TC-02, TC-03, TC-31 | ผ่าน (unit); รอ hosted |
| FR-02 owner allowlist | UC-01, UC-02 | SCR-01 | TC-04, TC-32, UAT-03 | ผ่าน (unit); รอ hosted |
| FR-03 encrypted session | UC-01 | cookie `__Host-solo-session` | TC-02, TC-05, TC-12 | ผ่าน (unit) |
| FR-04 logout | UC-03 | เมนู "ออกจากระบบ", `/api/auth/logout` | TC-13, UAT-04 | ผ่าน (unit); รอ hosted |
| FR-05 page guard | UC-02 | SCR-02–SCR-10 | TC-09, TC-22, UAT-04 | ผ่านบางส่วน (proxy); **ไม่มี** test ของ `requirePageOwner` โดยตรง |
| FR-06 shell + เมนู | UC-04 | SCR-02, EXT-01, EXT-02 | UAT-01 | **ไม่มี** automated test |
| FR-07 proxy allowlist | UC-05–UC-12 | `/api/[service]/[...path]` | TC-19, TC-23 | ผ่าน (unit) |
| FR-08 Host/Origin/JSON guard | UC-03, UC-10, UC-12 | ทุก API route | TC-06, TC-07, TC-13, TC-21 | ผ่าน (unit) |
| FR-09 service JWT | UC-05–UC-09 | proxy → APIs | TC-08, TC-09, TC-27, TC-32 | ผ่าน (unit); parity **ข้าม**; รอ hosted |
| FR-10 origin policy | ทั้งหมด | `lib/backends.ts` | TC-15, TC-16, TC-20 | ผ่าน (unit) |
| FR-11 health | UC-13 | `/api/health` | TC-01, TC-14, TC-30 | ผ่าน (unit); รอ hosted |
| FR-12 บัญชี | UC-05 | SCR-08 | TC-31, TC-33, UAT-02 | **ไม่มี** UI test; backend test ใน `services/accounts-api/tests` |
| FR-13 แอปและ API | UC-06 | SCR-09 | TC-31, TC-33, UAT-02 | **ไม่มี** UI test; backend test ใน service |
| FR-14 SaaS ฟรี | UC-07 | SCR-10 | TC-31, TC-33, UAT-02 | **ไม่มี** UI test; backend test ใน service |
| FR-15 คลังความรู้ | UC-08 | SCR-05 | TC-31, TC-33, UAT-02 | **ไม่มี** UI test; backend test ใน service |
| FR-16 AI Usage | UC-09 | SCR-07 | TC-24 | ผ่าน (unit) |
| FR-17 วันนี้ | UC-10 | SCR-03 | TC-21 (PATCH guard) | ผ่านเฉพาะ guard; **ไม่มี** test ของ client |
| FR-18 คลาวด์ | UC-11 | SCR-06 | — | **ไม่มี** |
| FR-19 Production Console | UC-12 | SCR-04 | TC-23, TC-25 | ผ่าน (unit) |
| FR-20 error ภาษาไทย / sanitize | ทั้งหมด | ทุก route | TC-10, TC-29 | ผ่าน (unit) |

## 2. NFR ↔ TC

| NFR | TC | สถานะหลักฐาน |
|---|---|---|
| NFR-01 timeout | TC-17 | ผ่าน (unit) |
| NFR-06 origin แยก | TC-18 | ผ่าน (unit) |
| NFR-07 session ≤1 ชม. | TC-05 | ผ่าน (unit) |
| NFR-09 RSA ≥2048 | TC-11, TC-28 | ผ่าน (unit) |
| NFR-10 anonymous 401/403 | TC-22, TC-29, TC-30 | ผ่าน (unit); รอ hosted |
| NFR-12 health ไม่รั่วค่า | TC-14 | ผ่าน (unit) |
| NFR-03, NFR-04 latency/uptime | — | **ไม่มี** เป้าหมายและ test |

## 3. ช่องว่างที่ยังไม่ครอบคลุม

| ID | ช่องว่าง | ผลกระทบ | ข้อเสนอ |
|---|---|---|---|
| GAP-01 | ไม่มี E2E/browser test ของ owner journey | ไม่พิสูจน์ login จริงกับ Google และ UX บน hosted | เพิ่มชุด browser acceptance ก่อน exit phase 1 |
| GAP-02 | ไม่มี UI/component test ของ module metadata (FR-12–FR-15) และคลาวด์ (FR-18) | regression ด้าน UI ตรวจไม่พบ | **ปิดส่วน view test แล้ว:** `tests/metadata-views.test.tsx` (accounts, integrations, SaaS, knowledge, cloud; fixture เท่านั้น) + `tests/support/render-client.tsx` (harness). ยังไม่มี E2E |
| GAP-03 | parity test ข้าม (TC-27) | ความเข้ากันของ JWT Web ↔ Python ไม่ถูกตรวจทุกครั้ง | ตั้ง `SERVICE_AUTH_PYTHON` ใน CI |
| GAP-04 | ไม่มี test ของ `requirePageOwner` และ shell (FR-05, FR-06) | หน้าที่ลืมเรียก guard อาจหลุด | เพิ่ม test ตรวจว่าทุก `app/*/page.tsx` เรียก guard |
| GAP-05 | hosted smoke/UAT ยังไม่ได้รัน | ยังไม่มีหลักฐาน phase 1 | ทำหลัง activation prerequisites ครบ |
| GAP-06 | ไม่มี NFR วัดได้สำหรับ latency/uptime/RTO/RPO | ประเมิน go-live ไม่ได้ | เจ้าของกำหนดเป้าหมาย **[ต้องยืนยัน]** |
| GAP-07 | ไม่พบ CI pipeline ของ `apps/solo-web` | test อาจไม่ถูกรันก่อน deploy | **[ต้องยืนยัน]** แผน CI (WP8) |

## การอนุมัติ

| บทบาท | สถานะ | วันที่ | ลงนาม |
|---|---|---|---|
| BA | รอพิจารณา | — | __________ |
| QA | รอพิจารณา | — | __________ |

## แหล่งข้อมูล

- `05-srs.md`, `06-ux-flows.md`, `07-test-uat.md` ในแพ็กนี้
- `apps/solo-web/tests/*.test.ts`, `apps/solo-web/modules/*/api.test.ts`, `apps/solo-web/scripts/*.test.mjs`
- `services/{accounts-api,integrations-api,saas-catalog-api,knowledge-api}/tests/`
- ผลรันทดสอบวันที่ 2026-10-07
