# 01 — Business process (As-Is / To-Be)

life-dashboard-web (Solo Web) คือเว็บ Next.js บน Vercel สำหรับ owner คนเดียว ใช้เปิดงานวันนี้ เป้าหมาย นิสัย การตัดสินใจ รายได้ และหน้าการเงิน โดยเป็นแค่ UI กับ BFF บาง ๆ ที่อ่านข้อมูลจาก cell/backend แต่ละตัวฝั่ง server ไม่เก็บข้อมูลเองและไม่ส่ง token ไป client

Last reviewed: 2026-11-27 · commit `66b1c78`

## As-Is (จากโค้ดวันนี้)

```mermaid
flowchart TD
  OWNER["Owner browser"] --> LOGIN["GET /api/auth/login: PKCE S256 + state + nonce"]
  LOGIN --> IDP["Google OIDC"]
  IDP --> CB["GET /api/auth/callback: verify ID token, owner sub allowlist"]
  CB -->|denied| LOGINPAGE["redirect /login?error=denied"]
  CB -->|ok| SESSION["JWE session cookie, max 1 h"]
  SESSION --> GUARD{"Host/Origin guard and requirePageOwner"}
  GUARD -->|no session| LOGINPAGE
  GUARD -->|ok| ROUTE{"request type"}
  ROUTE -->|"owner pages: tasks, goals, habits, decisions, revenue, finance"| LOADERS["server loaders lib/cells/*, one token EMPIRE_CELL_TOKEN or ledger token"]
  ROUTE -->|"GET /api/service/path for other modules"| PROXY["BFF proxy: allow-list of routes, https origins only"]
  ROUTE -->|"POST /api/owner/tasks/status or habits/log"| WRITE["idempotent write to Tasks or Habits cell"]
  LOADERS --> CELLS["Tasks, goals, habits, decisions, ledger, finance cells"]
  WRITE --> CELLS
  PROXY --> SVCJWT["mint RS256 service JWT per request, 120 s, audience per service"]
  SVCJWT --> META["accounts, integrations, saas, knowledge, ai-usage APIs"]
  PROXY -.->|"today, cloud, production hub on hosted"| UNAVAIL["503 service_auth_unavailable"]
  CELLS -->|"error or env missing"| STATE["page shows short unavailable state"]
  CELLS --> PAGE["Rendered page"]
  META --> PAGE
```

บทบาทอื่นจากโค้ด: `GET /api/health` ตอบสถานะ configuration (ไม่ใช่ live backend), `/.well-known/jwks.json` เปิดกุญแจสาธารณะให้ backend ตรวจ JWT, analytics (PostHog) ปิดเป็นค่าเริ่มต้นและรอ consent, Sentry ส่งเฉพาะ error ที่ผ่าน allowlist ใน `lib/sentry.ts` และมี `.autopilot/` + `.github/workflows/autopilot.yml` รันตาม cron [ต้องยืนยัน] ว่า autopilot เปิดใช้จริงอยู่ในตอนนี้ และ [ต้องยืนยัน] ว่า Vercel project `owner-web` ยังไม่ผูก Git (PRODUCT.md เขียนไว้แบบนั้น) หรือผูกแล้ว

Sources: `lib/auth-routes.ts`, `lib/auth.ts`, `lib/page-auth.ts`, `app/api/[service]/[...path]/route.ts`, `lib/backends.ts`, `lib/cells/core.ts`, `lib/cells/loaders.ts`, `app/api/owner/*/route.ts`, `app/api/health/route.ts`, `README.md`, `PRODUCT.md`, `DOCPACK/02-architecture.md`

## To-Be (DOCPACK/08-rtm.md, docs/measurement/GO-LIVE.md, DOCPACK/02-architecture.md)

```mermaid
flowchart TD
  OWNER["Owner browser"] --> LOGIN["OIDC login: PKCE S256 + state + nonce"]
  LOGIN --> IDP["Google OIDC"]
  IDP --> CB["callback: verify ID token, owner sub allowlist"]
  CB --> SESSION["JWE session cookie, max 1 h"]
  SESSION --> GUARD{"Host/Origin guard and requirePageOwner"}
  GUARD --> ROUTE{"request type"}
  ROUTE -->|"owner pages"| LOADERS["server loaders lib/cells/*"]
  ROUTE -->|"other modules"| PROXY["BFF proxy with allow-list"]
  ROUTE -->|"owner writes"| WRITE["idempotent write"]
  LOADERS --> CELLS["cells"]
  WRITE --> CELLS
  PROXY --> SVCJWT["service JWT RS256"]
  SVCJWT --> META["metadata APIs and ai-usage API"]
  SVCJWT --> SCOPED["today, cloud, production hub with scoped owner auth"]
  CELLS --> PAGE["Rendered page"]
  META --> PAGE
  SCOPED --> PAGE
  PAGE --> EVENTS["consented analytics events to PostHog"]
  EVENTS --> REVIEW["KPI baseline and outcome review OR-301"]
```

Sources: `DOCPACK/08-rtm.md` §Gaps (GAP-01, GAP-02, GAP-03, GAP-05, GAP-06), `DOCPACK/02-architecture.md` §Context diagram, `docs/measurement/GO-LIVE.md` steps 5-8

## Gap

| ID | As-Is → To-Be | Status | Owner | Evidence |
|---|---|---|---|---|
| G1 | today/cloud/production hub ตอบ `service_auth_unavailable` บน hosted → backend รองรับ scoped owner auth และหน้าใช้งานได้ | blocked | claude | `DOCPACK/02-architecture.md` context diagram; `README.md` §Authentication และ Vercel |
| G2 | ไม่มี browser E2E ของ owner journey (login Google จริง) → ชุด browser acceptance | todo | claude | `DOCPACK/08-rtm.md` GAP-01 |
| G3 | hosted smoke/UAT ยังไม่ได้รัน → รัน smoke/UAT และเก็บหลักฐาน | todo | owner | `DOCPACK/08-rtm.md` GAP-05 |
| G4 | ไม่มี NFR วัดได้ (latency, uptime, RTO, RPO) → owner กำหนดเป้าหมาย | decide | owner | `DOCPACK/08-rtm.md` GAP-06 |
| G5 | parity test JWT Web ↔ Python ถูกข้ามใน CI → ตั้ง `SERVICE_AUTH_PYTHON` ใน CI | todo | claude | `DOCPACK/08-rtm.md` GAP-03 |
| G6 | PostHog insight check และ dashboard "Life Dashboard pilot" ยังไม่ทำ → สร้าง dashboard, เก็บ baseline, ทำ outcome review | doing | owner | `docs/measurement/GO-LIVE.md` steps 5-8; `docs/measurement/OUTCOME-REVIEW-001.md` |

## Open questions

- Vercel project `owner-web` ผูกกับ Git แล้วหรือยัง (PRODUCT.md และ GO-LIVE.md บอกว่ายังไม่ผูก; ต้องยืนยันกับ Vercel)
- สถานะ GAP-02 และ GAP-07 ใน RTM: GAP-02 ปิดส่วน view test แล้ว, GAP-07 มี `.github/workflows/ci.yml` ใน repo แล้ว แต่ RTM ยังไม่อัปเดตให้ตรง
