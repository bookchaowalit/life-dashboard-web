# #6 Test that every owner page calls requirePageOwner() (RTM GAP-04)

## Document control
- Issue: bookchaowalit/life-dashboard-web#6
- Branch: `autopilot/6-test-that-every-owner-page-calls-require`
- Attempt: 1 จาก 3
- วันที่: 2026-10-25
- Maker: Claude autopilot

## Definition of Ready
- [x] Requirement ชัดเจน (RTM GAP-04, FR-05, FR-06)
- [x] Acceptance criteria ทดสอบได้ (static check ของ source)
- [x] ผลต่อ data/API: ไม่มี (เพิ่ม test กับแก้เอกสารเท่านั้น)
- [x] ผลต่อ security/privacy: ไม่แตะโค้ด auth; เพิ่มการป้องกันหน้าที่ลืม guard
- [x] Dependencies: ไม่มี

## Requirement & acceptance criteria
- Given ทุก `page.tsx` ใต้ `app/` ยกเว้น `app/login/page.tsx`, When รัน test, Then แต่ละหน้าเรียก `requirePageOwner()` ก่อน render data
- Given หน้าที่ไม่มี guard, When รัน test, Then fail และระบุชื่อไฟล์ (แสดง red run)
- `DOCPACK/08-rtm.md` ระบุ GAP-04 ว่าปิดแล้วพร้อมชื่อไฟล์ test

## Design / approach
- `tests/owner-page-guard.test.ts` ค้นหา `page.tsx` ทั้งหมดใต้ `app/` แบบ recursive (รวม `decisions/[id]`), ข้าม `login/page.tsx`
- ตรวจ source ว่า import `requirePageOwner` จาก `@/lib/page-auth`, มี `await requirePageOwner()` และไม่มี `await` อื่นใน default export ก่อนหน้านั้น
- ข้อยกเว้นแคบ ๆ: หน้าที่เป็น `redirect('/path')` ล้วน ๆ ไม่ render data (ปัจจุบันคือ `app/today/page.tsx`) — การเพิ่ม await/โค้ดอื่นจะทำให้ไม่เข้าข้อยกเว้นและ test fail
- ทางเลือกที่ไม่เลือก: บังคับให้ `/today` เรียก guard (ต้องแก้โค้ดใน `app/` เกินขอบเขต และเปลี่ยนพฤติกรรม redirect)

## Impact & risk
- Data/auth/performance/accessibility: ไม่กระทบ runtime (test + เอกสาร)
- ความเสี่ยง: regex เป็น static check จึงอาจ false positive กับรูปแบบโค้ดใหม่ — ผลคือ fail ปลอดภัย
- Rollback: ลบไฟล์ test และย้อนบรรทัด GAP-04

## Implementation notes
- `tests/owner-page-guard.test.ts` — test ใหม่ (รวมเคสลบ: หน้าไม่มี guard, โหลด data ก่อน guard, redirect ที่โหลด data)
- `DOCPACK/08-rtm.md` — ปิด GAP-04 ระบุไฟล์ test

## Test evidence
- Red: สร้างไฟล์ชั่วคราว `app/zz-tmp/page.tsx` (ไม่มี guard) แล้วรัน `npx vitest run tests/owner-page-guard.test.ts` → `1 failed | 22 passed`, `AssertionError: app/zz-tmp/page.tsx does not import requirePageOwner from @/lib/page-auth` (ลบไฟล์ชั่วคราวแล้ว)
- Green: `npx vitest run tests/owner-page-guard.test.ts` → `22 passed`
- รันครั้งแรกพบว่า `app/today/page.tsx` เป็น redirect ล้วนจึงเพิ่มข้อยกเว้นข้างต้น
- `npm test` → 19 files passed, 1 skipped; 201 passed, 5 skipped
- `npm run typecheck` → ผ่าน
- `npm run build`: N/A — ไม่ได้แตะ `app/`, `components/`, `modules/`, `lib/`

## Review evidence

- **test**: ผ่าน
  [32m✓[39m modules/production/api.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 70[2mms[22m[39m
   [32m✓[39m tests/action-analytics.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 63[2mms[22m[39m
   [32m✓[39m tests/browser-analytics.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 25[2mms[22m[39m
   [32m✓[39m tests/api-proxy-route.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 39[2mms[22m[39m
   [32m✓[39m tests/event-catalog.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 17[2mms[22m[39m
   [32m✓[39m tests/consent-banner.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 23[2mms[22m[39m
   [32m✓[39m tests/owner-page-guard.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 14[2mms[22m[39m
   [32m✓[39m tests/backends.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 8[2mms[22m[39m
   [32m✓[39m tests/posthog-adapter.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
   [32m✓[39m tests/modules-visibility.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
   [32m✓[39m tests/sentry.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
   [32m✓[39m tests/scope-css.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
   [2m[90m↓[39m[22m tests/service-auth-parity.test.ts [2m([22m[2m5 tests[22m[2m | [22m[33m5 skipped[39m[2m)[22m

  [2m Test Files [22m [1m[32m19 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (20)[39m
  [2m      Tests [22m [1m[32m201 passed[39m[22m[2m | [22m[33m5 skipped[39m[90m (206)[39m
  [2m   Start at [22m 21:16:14
  [2m   Duration [22m 1.98s[2m (import 46%, tests 38%, transform 12%, worker 4%)[22m

  [2m    Isolate [22m [33m20 workers spawned[39m[2m · ~139ms startup each (spawn + environment, per file)[22m
  [2m            [22m [2mat least ~790ms faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m


  [90mstderr[2m | tests/auth.test.ts[2m > [22m[2mowner OIDC and encrypted sessions[2m > [22m[2mrejects invalid OIDC subject
  [22m[39m{"event":"solo-web.owner_not_allowed","sub":"another-owner"}
- **typecheck**: ผ่าน
  > solo-empire-solo-web@0.1.0 typecheck
  > tsc --noEmit
- **build**: ผ่าน
  ├ ƒ /api/auth/login
  ├ ƒ /api/auth/logout
  ├ ƒ /api/auth/session
  ├ ƒ /api/health
  ├ ƒ /api/owner/habits/log
  ├ ƒ /api/owner/tasks/status
  ├ ƒ /cloud
  ├ ƒ /decisions
  ├ ƒ /decisions/[id]
  ├ ƒ /finance
  ├ ƒ /goals
  ├ ƒ /habits
  ├ ƒ /integrations
  ├ ƒ /knowledge
  ├ ƒ /login
  ├ ƒ /owner-cash
  ├ ƒ /production
  ├ ƒ /revenue
  ├ ƒ /saas
  ├ ƒ /tasks
  └ ○ /today


  ○  (Static)   prerendered as static content
  ƒ  (Dynamic)  server-rendered on demand
- **claude-review**: ผ่าน
  approve; 1 finding(s)
  [P3] tests/owner-page-guard.test.ts:117 The call regex runs on raw source, so a commented-out `await requirePageOwner()` still passes. → Run the call regex on the comment-stripped `code` instead of `source`.
- Run: https://github.com/bookchaowalit/life-dashboard-web/actions/runs/40234530094 · 2026-10-26 04:16 ICT

## Visual review

N/A — งานนี้ไม่ได้แตะไฟล์ UI และ issue ไม่ได้ระบุ UI pages (loop ตรวจจาก diff)

## Definition of Done
- [x] ทุก page ยกเว้น login ถูกตรวจว่าเรียก `requirePageOwner()`
- [x] red run ที่ระบุชื่อไฟล์ และ green run
- [x] `DOCPACK/08-rtm.md` ปิด GAP-04 พร้อมชื่อไฟล์ test

## Release / deploy
merge เข้า main = deploy production ผ่าน Vercel Git; loop เปิด PR และเจ้าของอนุมัติด้วย label `autopilot:approved` (ไม่มีผลต่อ runtime)
