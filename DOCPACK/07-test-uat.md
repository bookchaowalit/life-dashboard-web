---
title: Solo Web — Test Strategy และ UAT
doc_id: SWB-DOC-07
doc_type: test-uat
version: 0.1
date: 2026-10-07
status: ร่างเพื่อพิจารณา
owner: QA
related: 03-nfr-security.md, 04-runbook.md, 05-srs.md, 08-rtm.md
---

# 07 — Test Strategy และ UAT

## 1. ระดับการทดสอบ

| ระดับ | เครื่องมือ | ขอบเขต | สถานะ |
|---|---|---|---|
| Unit | `vitest` (`npm test`) | auth, request guard, backend registry, proxy route, scope-css, client API ของ production/ai-usage | มี: 6 ไฟล์ผ่าน, 1 ไฟล์ข้าม |
| Integration ข้ามภาษา | `tests/service-auth-parity.test.ts` + Python `packages/service-auth` | token ที่ Web ออก ต้องผ่าน/ถูกปฏิเสธตรงกับ Python verifier | มี แต่ข้ามเมื่อไม่ตั้ง `SERVICE_AUTH_PYTHON` |
| Tooling | `node --test` | `staging-preflight.mjs`, `staging-smoke.mjs` ด้วยข้อมูลจำลอง | มี: 23 ผ่าน |
| Backend unit | `services/*/tests/test_server.py` | scoped auth, readiness, projection ของ API | มีใน service (ไม่ได้รันในงานนี้) |
| Type/build | `npm run typecheck`, `npm run build` | type และ build Next.js | ไม่ได้รันในงานนี้ **[ต้องยืนยัน]** |
| Hosted smoke | `staging-smoke.mjs --json` | 13 checks บน staging จริง | ยังรันไม่ได้ (ไม่มี deployment) |
| E2E / browser | — | owner login/read/logout และกรณีผิดพลาด | **ยังไม่มี** **[ต้องยืนยัน]** เครื่องมือ (เช่น Playwright) |
| UAT | เจ้าของทดสอบเอง | journey ในหัวข้อ 4 | ยังไม่เริ่ม |

## 2. สภาพแวดล้อม

| Env | ใช้ทดสอบ | ข้อจำกัด |
|---|---|---|
| local (`127.0.0.1:3600`) | unit, local demo | ไม่พิสูจน์ hosted auth |
| CI | **[ต้องยืนยัน]** ไม่พบ pipeline ของ `apps/solo-web` ใน evidence ที่อ่าน | — |
| staging (Vercel preview + Railway staging) | smoke, E2E, UAT | ยังไม่ deploy |

## 3. Test cases

| ID | กรณีทดสอบ | ผลคาดหวัง | FR/NFR | หลักฐาน |
|---|---|---|---|---|
| TC-01 | config ไม่ครบ | readiness ไม่ ready, ไม่เปิดเผยค่า | FR-11 | `auth.test.ts` "requires complete configuration without exposing values" — ผ่าน |
| TC-02 | OIDC code exchange จริงด้วย PKCE S256 | ได้ session cookie | FR-01, FR-03 | `auth.test.ts` "performs actual OIDC code exchange with S256 PKCE…" — ผ่าน |
| TC-03 | transaction/state ขาดหรือผิด | ปฏิเสธ | FR-01 | `auth.test.ts` "rejects missing…" — ผ่าน |
| TC-04 | session ของ tenant อื่น | ปฏิเสธ | FR-02 | `auth.test.ts` "rejects an encrypted session for another tenant" — ผ่าน |
| TC-05 | อายุ session | ≤1 ชม., ปฏิเสธ IdP claim ที่หมดอายุ | FR-03, NFR-07 | `auth.test.ts` "limits session expiry to an hour…" — ผ่าน |
| TC-06 | preview origin และ write Origin | เชื่อเฉพาะ origin ที่ระบุ, write ต้องมี HTTPS Origin ตรง | FR-08 | `auth.test.ts` "only trusts explicit preview origins…" — ผ่าน |
| TC-07 | Host ตรงแม้ request URL เป็น loopback ภายใน | ใช้ origin จาก config | FR-08 | `auth.test.ts` "uses exact configured Host…" — ผ่าน |
| TC-08 | แทน credential ผู้เรียกด้วย service JWT | ไม่ส่งต่อ caller token | FR-09 | `auth.test.ts` "replaces caller credentials with per-owner service authorization" — ผ่าน |
| TC-09 | anonymous hosted mutation แม้มี token กว้าง | 401 | FR-05, FR-09 | `auth.test.ts` "denies anonymous same-origin hosted mutations…" — ผ่าน |
| TC-10 | backend error | ไม่รั่ว credential/exception | FR-20 | `auth.test.ts` "sanitizes backend failures…" — ผ่าน |
| TC-11 | RSA key <2048 / ผิดชนิด | health ไม่ ready, ไม่ลงนาม | NFR-09 | `auth.test.ts` 2 กรณี — ผ่าน |
| TC-12 | cookie attributes | `__Host-`, Secure, HttpOnly, SameSite=Lax | FR-03 | `auth.test.ts` "sets protected transaction/session cookies…" — ผ่าน |
| TC-13 | CSRF logout, forged forwarded host, callback redirect | ปฏิเสธ | FR-04, FR-08 | `auth.test.ts` "rejects CSRF logout…" — ผ่าน |
| TC-14 | health + login redirect เมื่อ config ไม่ครบ | ไม่มีค่า, redirect `/login?error=configuration` | FR-11 | `auth.test.ts` "reports safe configuration-only health…" — ผ่าน |
| TC-15 | production ไม่ fallback loopback | origin ถูกปฏิเสธ | FR-10 | `backends.test.ts` — ผ่าน |
| TC-16 | origin มี credentials | ปฏิเสธ | FR-10 | `backends.test.ts` "refuses backend credentials…" — ผ่าน |
| TC-17 | timeout ทุก backend | ≤30 วินาที | NFR-01 | `backends.test.ts` — ผ่าน |
| TC-18 | origin env แยกทุก module | ไม่ซ้ำ | NFR-06 | `backends.test.ts` — ผ่าน |
| TC-19 | method/route ที่ไม่ลงทะเบียน | ไม่อนุญาต | FR-07 | `backends.test.ts` "allows only registered methods and routes" — ผ่าน |
| TC-20 | remote origin ไม่เปิด ALLOW_REMOTE หรือไม่ใช่ HTTPS | ปฏิเสธ | FR-10 | `backends.test.ts` — ผ่าน |
| TC-21 | cross-site POST/PATCH, text/plain, non-JSON, DNS rebinding | 403/415 โดยไม่เรียก backend | FR-08 | `api-proxy-route.test.ts` 5 กรณี — ผ่าน |
| TC-22 | anonymous read (local ไม่เปิด demo / HTTPS / forged host) | 401/403 | FR-05, NFR-10 | `api-proxy-route.test.ts` 3 กรณี — ผ่าน |
| TC-23 | same-origin JSON POST + loopback read ในโหมด demo | proxy สำเร็จ | FR-07, FR-19 | `api-proxy-route.test.ts` — ผ่าน |
| TC-24 | AI Usage contract, freshness, reset cycle, notification dedupe | ตาม spec | FR-16 | `modules/ai-usage/api.test.ts` 14 กรณี — ผ่าน |
| TC-25 | Production client API (filters, flows, send, jobs, routes, review transitions) | ตาม spec | FR-19 | `modules/production/api.test.ts` — ผ่าน |
| TC-26 | scope-css | ครอบ selector, ปฏิเสธ at-rule ที่ scope ไม่ได้ | — | `scope-css.test.ts` — ผ่าน |
| TC-27 | parity service JWT กับ Python verifier | ผลตรงกัน | FR-09 | `service-auth-parity.test.ts` ข้าม (ไม่ตั้ง `SERVICE_AUTH_PYTHON`) |
| TC-28 | preflight config (origin, issuer, subjects, key, NEXT_PUBLIC) | ready เฉพาะเมื่อครบ | NFR-09 | `staging-preflight.test.mjs` 18 กรณี — ผ่าน |
| TC-29 | smoke logic (anonymous 200 = fail, redirect/503 = fail, ไม่รั่ว) | ตาม spec | NFR-10 | `staging-smoke.test.mjs` 5 กรณี — ผ่าน |
| TC-30 | Hosted smoke 13 checks | 13/13 ผ่าน | NFR-10, FR-11 | รอ deployment |
| TC-31 | Owner login → อ่าน 4 module → logout บน staging | สำเร็จ | FR-01–FR-06, FR-12–FR-15 | ยังไม่มี |
| TC-32 | owner ไม่อยู่ใน allowlist / session หมดอายุ / wrong audience-key / backend ล่ม บน staging | ปฏิเสธหรือ 503 ชัดเจน | FR-02, FR-09, FR-20 | ยังไม่มี |
| TC-33 | UI module metadata: ตัวกรอง, แบ่งหน้า, รายละเอียดเอกสาร | แสดงถูกต้อง | FR-12–FR-15 | ไม่มี component/E2E test |

## 4. UAT (เจ้าของ)

| ID | Journey | เกณฑ์ผ่าน |
|---|---|---|
| UAT-01 | login ด้วย Google ของเจ้าของ | เข้าหน้าแรกได้, เห็นทุก module |
| UAT-02 | อ่านบัญชี/แอป/SaaS/ความรู้ | ข้อมูลตรงกับไฟล์ต้นทางใน repo ณ revision ที่ deploy |
| UAT-03 | ใช้บัญชี Google อื่น | ถูกปฏิเสธ |
| UAT-04 | logout แล้วเปิดหน้า module | ถูกส่งไป `/login` |
| UAT-05 | ปิดเครื่อง local แล้วใช้ 4 module | ยังใช้ได้ (หลักฐาน laptop-off ของ phase แรก) |

## 5. เกณฑ์ผ่าน (entry / exit)

- **Entry ของ staging test:** `npm test` ผ่าน, `staging-preflight.mjs --all` ได้ `ready: true`, release context `includes_uncommitted_changes=false`, metadata publication review อนุมัติ
- **Exit ของ phase 1:** TC-30 ผ่าน 13/13, TC-31/TC-32 ผ่าน, UAT-01–UAT-05 ผ่าน, rollback ทดสอบแล้ว, ไม่มี finding ความปลอดภัยระดับสูงค้าง
- การผ่าน local tests ไม่ถือว่า hosted setup ครบ (`staging-decision.md`)

## 6. หลักฐานที่มี

- รันวันที่ 2026-10-07 ใน `apps/solo-web`: `npx vitest run` → Test Files 6 passed | 1 skipped (7); Tests 87 passed | 5 skipped (92)
- รันวันที่ 2026-10-07: `node --test apps/solo-web/scripts/staging-preflight.test.mjs apps/solo-web/scripts/staging-smoke.test.mjs` → 23 pass, 0 fail
- ไม่มีผล hosted smoke, E2E หรือ UAT

## การอนุมัติ

| บทบาท | สถานะ | วันที่ | ลงนาม |
|---|---|---|---|
| QA | รอพิจารณา | — | __________ |
| เจ้าของ (UAT) | รอพิจารณา | — | __________ |

## แหล่งข้อมูล

- `apps/solo-web/tests/{auth,backends,api-proxy-route,scope-css,service-auth-parity}.test.ts`
- `apps/solo-web/modules/ai-usage/api.test.ts`, `apps/solo-web/modules/production/api.test.ts`
- `apps/solo-web/scripts/staging-preflight.test.mjs`, `apps/solo-web/scripts/staging-smoke.test.mjs`
- `operations/runbooks/SOLO-WEB-STAGING.md` §5–6, `apps/solo-web/deployment/staging-decision.md`
- ผลรันคำสั่งทดสอบวันที่ 2026-10-07
