---
title: Solo Web — ภาพรวมระบบและสารบัญเอกสาร
doc_id: SWB-DOC-00
doc_type: overview
version: 0.1
date: 2026-10-07
status: ร่างเพื่อพิจารณา
owner: Product (เจ้าของ Solo Empire)
related: 01-prd.md, 02-architecture.md, 03-nfr-security.md, 04-runbook.md, 05-srs.md, 06-ux-flows.md, 07-test-uat.md, 08-rtm.md, 12-trd-api-data.md
---

# 00 — ภาพรวมระบบและสารบัญเอกสาร

## สรุประบบ

Solo Web (`apps/solo-web`) คือ **หน้าเว็บเดียวของ Solo Empire** ที่รวม module งานของเจ้าของ (วันนี้, งานผลิต, คลังความรู้, คลาวด์, AI Usage, บัญชี, แอปและ API, SaaS ฟรี) ไว้ใน Next.js แอปเดียว โดยแต่ละ module เรียก backend ของตัวเองแยกกันผ่าน thin BFF proxy `/api/<service>/<path>` ที่มีทะเบียน method/path อนุญาตใน `lib/backends.ts` ผู้ใช้เข้าถึงข้อมูลได้หลัง login ด้วย OIDC ของเจ้าของ (owner allowlist ตาม `sub`) และ BFF ออก service JWT แบบ RS256 อายุสั้นให้ metadata APIs ทั้งสี่ (accounts, integrations, saas-catalog, knowledge) รวมถึง ai-usage แผน phase แรกคือ Solo Web บน Vercel + metadata APIs สี่ตัวบน Railway

> **[ต้องยืนยัน]** ทะเบียน `docpack-coverage.yaml` เรียกระบบนี้ว่า "Solo Web (our website)" แต่ source ปัจจุบันเป็น **แอปส่วนตัวของเจ้าของ** — ทุกหน้า module ต้องมี owner session และหน้าเดียวที่เปิดสาธารณะคือ `/login` ไม่มีหน้า marketing/landing สาธารณะใน `apps/solo-web` ต้องให้เจ้าของยืนยันว่า "เว็บไซต์ของเรา" หมายถึงแอปนี้ หรือมีเว็บสาธารณะแยก

## สถานะปัจจุบัน

| ด้าน | สถานะ ณ 2026-10-07 | หลักฐาน |
|---|---|---|
| Source | มี 8 module ภายใน + ลิงก์ CRM/วิดีโอไปแอปเดิม; auth OIDC, proxy, health endpoint | `lib/modules.ts`, `lib/backends.ts`, `lib/auth.ts` |
| Unit tests | `vitest`: 87 ผ่าน, 5 ข้าม (parity ข้ามภาษาเมื่อไม่ตั้ง `SERVICE_AUTH_PYTHON`); staging scripts: 23 ผ่าน | รันในเครื่องวันที่ 2026-10-07 |
| Deployment | `scaffold_staged_not_deployed` — Vercel project ว่าง (ยังไม่ deploy), Railway APIs สี่ตัวเป็น `staged-create` | `deployment/staging-targets.json` |
| Identity | เจ้าของเลือก Google OIDC; client reference ใน secret store **[ต้องยืนยัน]** | `deployment/staging-decision.md` |
| Metadata publication | `publication_status: not_approved` | `deployment/staging-targets.json` |
| Hosted Today/Cloud/Production | ตอบ `service_auth_unavailable` ใน hosted mode จนกว่า backend รองรับ scoped owner auth | `app/api/health/route.ts`, `README.md` |

## ผู้ใช้หลัก

| บทบาท | คำอธิบาย |
|---|---|
| เจ้าของ (Owner) | ผู้ใช้เดียวที่ได้รับอนุญาต (`tenant_id=owner`) ใช้ทุก module |
| ผู้ดูแลระบบ / release runner | ตั้ง configuration, รัน preflight/smoke, deploy และ rollback (บทบาทเดียวกับเจ้าของในปัจจุบัน **[สมมติฐาน]**) |
| AI agent ภายใน repo | อ่าน/แก้ source ตาม `AGENTS.md`; ไม่ใช่ผู้ใช้ runtime |

## ตารางรายการเอกสาร

| รหัส | ไฟล์ | ชื่อเอกสาร | ผู้อ่านหลัก |
|---|---|---|---|
| SWB-DOC-00 | `00-overview.md` | ภาพรวมระบบและสารบัญเอกสาร | ทุกคน |
| SWB-DOC-01 | `01-prd.md` | Product Requirements (PRD) | Product, เจ้าของ |
| SWB-DOC-02 | `02-architecture.md` | System Architecture (SA) | Solution Architect, Dev |
| SWB-DOC-03 | `03-nfr-security.md` | NFR และความปลอดภัย | Architect, Security |
| SWB-DOC-04 | `04-runbook.md` | Runbook การติดตั้งและดูแลระบบ | DevOps, ผู้ดูแล |
| SWB-DOC-05 | `05-srs.md` | Software Requirements (SRS) | BA, Dev, QA |
| SWB-DOC-06 | `06-ux-flows.md` | User Flow และ Screen Inventory | UX/UI, Dev |
| SWB-DOC-07 | `07-test-uat.md` | Test Strategy และ UAT | QA |
| SWB-DOC-08 | `08-rtm.md` | Requirements Traceability Matrix | BA, QA |
| SWB-DOC-12 | `12-trd-api-data.md` | TRD: API และ Data Model | Architect, Dev |

## วิธีอ่าน

1. เริ่มที่ `01-prd.md` เพื่อเข้าใจเป้าหมายและขอบเขต phase แรก
2. อ่าน `02-architecture.md` คู่กับ `12-trd-api-data.md` สำหรับโครงสร้าง BFF, auth และ API
3. ใช้ `05-srs.md` → `06-ux-flows.md` → `07-test-uat.md` → `08-rtm.md` ตามลำดับเพื่อไล่ FR ถึงหลักฐานทดสอบ
4. ผู้ดูแล deploy อ่าน `04-runbook.md` และ runbook ต้นทาง `operations/runbooks/SOLO-WEB-STAGING.md`
5. ข้อความ **[ต้องยืนยัน]** คือข้อเท็จจริงที่เจ้าของต้องยืนยัน, **[สมมติฐาน]** คือสมมติฐานทำงาน

## การอนุมัติ

| บทบาท | สถานะ | วันที่ | ลงนาม |
|---|---|---|---|
| Product / เจ้าของ | รอพิจารณา | — | __________ |

## แหล่งข้อมูล

- `apps/solo-web/README.md`, `apps/solo-web/lib/modules.ts`, `apps/solo-web/lib/backends.ts`, `apps/solo-web/lib/auth.ts`
- `apps/solo-web/deployment/staging-targets.json`, `apps/solo-web/deployment/staging-decision.md`
- `repository-catalog/registries/docpack-coverage.yaml` (รายการ `solo-web`, tier L2)
- `repository-catalog/registries/service-deployments.yaml`
- ผลรัน `npx vitest run` และ `node --test apps/solo-web/scripts/*.test.mjs` วันที่ 2026-10-07
