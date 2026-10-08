---
title: Solo Web — Runbook การติดตั้งและดูแลระบบ
doc_id: SWB-DOC-04
doc_type: runbook
version: 0.1
date: 2026-10-07
status: ร่างเพื่อพิจารณา
owner: DevOps (ผู้ดูแลระบบของเจ้าของ)
related: 02-architecture.md, 03-nfr-security.md, 07-test-uat.md, 12-trd-api-data.md
---

# 04 — Runbook การติดตั้งและดูแลระบบ

> เอกสารนี้สรุปจาก runbook ต้นทาง `operations/runbooks/SOLO-WEB-STAGING.md` เมื่อขัดกันให้ยึดต้นทาง ทุกขั้นตอนที่สร้าง resource, ตั้ง secret, deploy หรือใช้จ่ายเงินต้องได้รับอนุมัติจากเจ้าของก่อน

## 1. Environments

| Environment | Web | APIs | สถานะ |
|---|---|---|---|
| local dev | `npm run dev` ที่ `http://127.0.0.1:3600` | รัน backend ที่ loopback ตามพอร์ตใน `lib/backends.ts` | ใช้งานได้ |
| local demo | ตั้ง `SOLO_WEB_LOCAL_DEMO=true` (non-production, loopback เท่านั้น) | loopback; อนุญาต legacy Hub token | ใช้งานได้ |
| staging (preview) | Vercel project `solo-web-staging`, root `apps/solo-web`, Node `22.x` | Railway project `solo-metadata-staging`, env `staging` | `scaffold_staged_not_deployed` |
| production | — | — | **[ต้องยืนยัน]** ยังไม่มี target; ห้ามใช้ project ของลูกค้าแทน |

## 2. Build / deploy

### 2.1 Local

```bash
cd apps/solo-web
npm ci
npm run dev          # http://127.0.0.1:3600
npm run typecheck
npm test
npm run build
```

### 2.2 Staging (ลำดับตาม runbook ต้นทาง)

1. ยืนยัน target จริงและบันทึกใน `deployment/staging-targets.json` (IDs, origins, revision, checksum, rollback revision)
2. ตั้ง identity: Google OIDC Web application, callback `<SOLO_WEB_PUBLIC_ORIGIN>/api/auth/callback` ตรงทุกตัวอักษร, scope `openid`
3. ตรวจ config ก่อนส่งขึ้น provider (ไม่อ่าน `.env`/secret store):

   ```bash
   NODE_ENV=production node apps/solo-web/scripts/staging-preflight.mjs --web --json
   node apps/solo-web/scripts/staging-preflight.mjs --api accounts-api --json
   node apps/solo-web/scripts/staging-preflight.mjs --api integrations-api --json
   node apps/solo-web/scripts/staging-preflight.mjs --api saas-catalog-api --json
   node apps/solo-web/scripts/staging-preflight.mjs --api knowledge-api --json
   NODE_ENV=production node apps/solo-web/scripts/staging-preflight.mjs --all --json
   ```

4. Export build context ของ API ทั้งสี่ (นอก source checkout) แล้วตรวจ `release-manifest.json` (`includes_uncommitted_changes=false`):

   ```bash
   task services:export -- --service <service> --output "$STAGING_RELEASE_DIR/<service>"
   ```

5. Build image จาก exported context (Railway Dockerfile builder, healthcheck `/ready`); ไม่ผูก Git root โดยตรง
6. Deploy Solo Web บน Vercel (`vercel.json`: `npm ci`, `npm run build`, framework `nextjs`) **[ต้องยืนยัน]** วิธี deploy (Git integration หรือ CLI) — ปัจจุบันยังไม่ผูก Git source
7. รัน smoke และ browser acceptance (หัวข้อ 4)

## 3. Config / secret (ชื่อตัวแปรเท่านั้น)

### 3.1 Solo Web (server env)

| ตัวแปร | ประเภท | หมายเหตุ |
|---|---|---|
| `NODE_ENV` | config | `production` บน hosted |
| `SOLO_WEB_PUBLIC_ORIGIN` | config | HTTPS origin หลัก |
| `SOLO_WEB_PREVIEW_ORIGINS` | config | exact HTTPS origins คั่น comma; ห้าม wildcard |
| `SOLO_WEB_OIDC_ISSUER` | config | เช่น Google issuer |
| `SOLO_WEB_OIDC_CLIENT_ID` | secret | |
| `SOLO_WEB_OIDC_CLIENT_SECRET` | secret | |
| `SOLO_WEB_OWNER_SUBJECTS` | private config | JSON array ของ OIDC `sub` |
| `SOLO_WEB_SESSION_KEY` | secret | 32 bytes base64url ไม่ padding |
| `SOLO_WEB_SERVICE_PRIVATE_KEY` | secret | PKCS8 RSA ≥2048 bits |
| `ACCOUNTS_API_ORIGIN`, `INTEGRATIONS_API_ORIGIN`, `SAAS_CATALOG_API_ORIGIN`, `KNOWLEDGE_API_ORIGIN`, `AI_USAGE_API_ORIGIN` | config | HTTPS origin |
| `<NAME>_API_ALLOW_REMOTE` | config | `true` เพื่ออนุญาต remote HTTPS |
| `TODAY_API_ORIGIN`, `CLOUD_API_ORIGIN`, `PRODUCTION_HUB_API_ORIGIN` | config | ยังไม่ใช้บน hosted |
| `PRODUCTION_HUB_API_TOKEN` | secret (local demo) | ใช้เฉพาะ loopback demo |
| `SOLO_WEB_LOCAL_DEMO` | config (dev) | ห้ามใช้บน hosted |

### 3.2 Metadata APIs (ต่อบริการ, prefix เช่น `ACCOUNTS_API_`)

`<NAME>_API_ENV`, `<NAME>_API_HOST`, `PORT`, `<NAME>_API_AUTH_ISSUER` (= Solo Web public origin), `<NAME>_API_AUTH_PUBLIC_KEY` (คู่กับ private key ของ Web), `<NAME>_API_AUTH_SUBJECTS` (CSV ตรงกับ owner allowlist)

ค่าลับเก็บใน Infisical ตาม `systems/cloud-platform/secret-management.md`; ห้ามใส่ใน Git, `NEXT_PUBLIC_*`, command arguments หรือรายงาน Reference ของ Google client สำหรับ Solo Web **[ต้องยืนยัน]**

## 4. Health check

| ตรวจ | วิธี | ผ่านเมื่อ |
|---|---|---|
| Web config readiness | `GET /api/health` | 200 `status: ready` (503 `configuration_required` ถ้าไม่ครบ) |
| API readiness | `GET <api>/ready` | 200 พร้อม `source: available`, `auth: ready` |
| API liveness | `GET <api>/health` | 200 (ไม่พิสูจน์ว่า metadata ใช้ได้) |
| Hosted smoke | `node apps/solo-web/scripts/staging-smoke.mjs --json` | 13/13: web health + API `/ready` ×4 + anonymous direct ×4 (401/403) + anonymous BFF ×4 (401/403) |
| Owner journey | browser: login → อ่าน 4 module → logout, session หมดอายุ, owner ไม่อยู่ใน allowlist, preview Origin, backend ล่ม | **[ต้องยืนยัน]** ยังไม่มีชุดทดสอบอัตโนมัติ |

## 5. Rollback

- Web: promote/redeploy revision ก่อนหน้าบน Vercel ที่ auth contract เข้ากับ keys ปัจจุบัน แล้วตรวจ `/api/health`
- API: redeploy image/revision ก่อนหน้าบน Railway แล้วตรวจ `/ready` และ anonymous 401/403
- การกด redeploy ไม่ถือว่า recovery สำเร็จจนตรวจ `/ready`/auth ผ่าน
- `rollback_revision` ใน target record ยังว่าง **[ต้องยืนยัน]** ก่อน go-live

## 6. Incident / troubleshooting

| อาการ | สาเหตุที่เป็นไปได้ | การแก้ |
|---|---|---|
| `/login` แสดง "ยังตั้งค่าการเข้าสู่ระบบไม่ครบ" | `authReadiness` ไม่ครบ | ดู `/api/health` → `authentication.checks` แล้วตั้งตัวแปรที่ `missing_or_invalid` |
| `403 host_not_allowed` | Host ไม่อยู่ใน public/preview origins | เพิ่ม exact origin ใน `SOLO_WEB_PREVIEW_ORIGINS` |
| `403 cross_origin` / `415` | mutation ไม่มี Origin ตรง หรือไม่ใช่ JSON | ตรวจ client; ไม่ผ่อนปรน guard |
| `/login?error=denied` | ID token ไม่ผ่าน หรือ `sub` ไม่อยู่ใน allowlist | ตรวจ `SOLO_WEB_OWNER_SUBJECTS` |
| `/login?error=unavailable` | OIDC discovery ล้มเหลว | ตรวจ issuer/เครือข่าย |
| `503 origin_not_allowed` / `origin_invalid` | `*_ORIGIN` ผิดรูปแบบ หรือไม่ได้เปิด `*_ALLOW_REMOTE` | แก้ค่า env |
| `503 service_auth_unavailable` | ไม่มี signing key หรือ module ไม่มี scoped auth (Today/Cloud/Production) | ตั้ง `SOLO_WEB_SERVICE_PRIVATE_KEY`; module ที่ยังไม่รองรับเป็นพฤติกรรมที่คาดไว้ |
| `503 backend_unavailable` | backend ล่ม/timeout | ตรวจ `/ready` ของ API นั้น |
| API ตอบ 401/403 กับเจ้าของ | issuer/public key/subjects ไม่ตรงกับ Web | รัน `staging-preflight.mjs --all` |
| ต้องเพิกถอนทุก session | cookie รั่ว | หมุน `SOLO_WEB_SESSION_KEY` หรือถอด `sub` ออกจาก allowlist |

## 7. Backup / restore

- Solo Web ไม่มีข้อมูลถาวรฝั่ง server — ไม่มี backup
- Metadata APIs อ่าน snapshot ที่ bake ใน image; restore = rebuild จาก revision/checksum ที่บันทึก
- backup/restore ของ DB (Today/CRM/Production) เป็นงานของ WP5+ ไม่อยู่ใน phase นี้

## การอนุมัติ

| บทบาท | สถานะ | วันที่ | ลงนาม |
|---|---|---|---|
| DevOps | รอพิจารณา | — | __________ |

## แหล่งข้อมูล

- `operations/runbooks/SOLO-WEB-STAGING.md`, `operations/runbooks/SOLO-WEB-CLOUD-READINESS.md`
- `apps/solo-web/README.md`, `apps/solo-web/package.json`, `apps/solo-web/vercel.json`
- `apps/solo-web/lib/{auth.ts,backends.ts,request-guard.ts,auth-routes.ts}`, `apps/solo-web/app/api/health/route.ts`
- `apps/solo-web/scripts/staging-preflight.mjs`, `apps/solo-web/scripts/staging-smoke.mjs`
- `apps/solo-web/deployment/staging-targets.json`, `apps/solo-web/deployment/staging-decision.md`
- `services/accounts-api/railway.toml`, `services/*/contracts/*.v1.md`
