# #7 View tests for accounts, integrations, SaaS, knowledge and cloud pages (RTM GAP-02)

## Document control
- Issue: #7 (bookchaowalit/life-dashboard-web)
- Branch: `autopilot/7-view-tests-for-accounts-integrations-saa`
- Attempt: 1 จาก 3
- วันที่: 2026-10-25
- Maker: Claude autopilot

## Definition of Ready
- [x] Requirement: เพิ่ม view test ให้หน้า accounts, integrations, SaaS, knowledge, cloud
- [x] Acceptance criteria ทดสอบได้ (ดูหัวข้อถัดไป)
- [x] Data/API impact: ไม่มี — test ใช้ fixture และ stub `fetch` เท่านั้น
- [x] Security/privacy impact: ไม่มี — ไม่แตะ auth และไม่เรียก service จริง
- [x] Dependencies: ไม่เพิ่ม dependency (repo ไม่มี Testing Library/jsdom จึงทำ harness เล็ก ๆ เอง)

## Requirement & acceptance criteria
- Given fixture data ของแต่ละหน้า When view render Then test ตรวจ heading, field หลักของหนึ่งแถว และ empty state
- Given backend เรียกไม่สำเร็จ When view render Then test ตรวจข้อความ error ที่หน้าแสดงอยู่ตอนนี้ (ไม่เปลี่ยนพฤติกรรม)
- test ไม่เรียก service จริง (fixture เท่านั้น)
- `DOCPACK/08-rtm.md` GAP-02 ระบุไฟล์ test ใหม่

## Design / approach
- ทั้ง 5 หน้าเป็น client component ที่โหลดข้อมูลใน `useEffect` จึง render ด้วย `renderToStaticMarkup` ตรง ๆ ไม่ได้ผล
- `tests/support/render-client.tsx`: hook runtime เล็ก ๆ (useState/useRef/useEffect/useMemo/useCallback) ใช้ผ่าน `vi.mock('react')`; `renderClient` render → รัน effect → รอ fetch → render ซ้ำจนนิ่ง
- `tests/metadata-views.test.tsx`: stub `fetch` ด้วย fixture แล้ว assert ข้อความ
- ทางเลือกที่ไม่เลือก: เพิ่ม `@testing-library/react` + jsdom (ห้ามแก้ `package.json`/เพิ่ม dependency); แก้ production code เพื่อ inject data (ไม่ต้องการ)

## Impact & risk
- Data: ไม่มี. Auth: ไม่เปลี่ยน (ไม่แตะ `requirePageOwner` หรือ route)
- Performance: test ใช้เวลาเพิ่มราว 0.7 วินาที. Accessibility: ไม่เกี่ยว
- Rollback: ลบไฟล์ test สองไฟล์และแถว GAP-02 ที่แก้
- ความเสี่ยง: harness จำลอง hook เอง หาก component ใช้ hook ชนิดอื่นเพิ่ม (เช่น useReducer) ต้องเพิ่มใน harness

## Implementation notes
- `tests/support/render-client.tsx` — hook runtime + `renderClient`
- `tests/metadata-views.test.tsx` — 17 test: 5 หน้า × (heading + แถว, empty state, error) + กรณี backend ไม่ตอบ
- `DOCPACK/08-rtm.md` — GAP-02 ระบุไฟล์ test ใหม่
- ไม่มีการแก้ production code

## Test evidence
- `npx vitest run tests/metadata-views.test.tsx` → 17 passed
- `npm test` → 19 files passed, 1 skipped; 196 passed, 5 skipped
- `npm run typecheck` → ผ่าน
- `npm run build` → N/A — ไม่ได้แตะ `app/`, `components/`, `modules/`, `lib/`

## Review evidence

- **test**: ผ่าน
  [32m✓[39m modules/production/api.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 55[2mms[22m[39m
   [32m✓[39m tests/cells-actions.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 57[2mms[22m[39m
   [32m✓[39m tests/action-analytics.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 69[2mms[22m[39m
   [32m✓[39m tests/browser-analytics.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 26[2mms[22m[39m
   [32m✓[39m tests/consent-banner.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 21[2mms[22m[39m
   [32m✓[39m tests/api-proxy-route.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 34[2mms[22m[39m
   [32m✓[39m tests/backends.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
   [32m✓[39m tests/sentry.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 10[2mms[22m[39m
   [32m✓[39m tests/event-catalog.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 27[2mms[22m[39m
   [32m✓[39m tests/scope-css.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
   [32m✓[39m tests/posthog-adapter.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
   [32m✓[39m tests/modules-visibility.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 7[2mms[22m[39m
   [2m[90m↓[39m[22m tests/service-auth-parity.test.ts [2m([22m[2m5 tests[22m[2m | [22m[33m5 skipped[39m[2m)[22m

  [2m Test Files [22m [1m[32m19 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (20)[39m
  [2m      Tests [22m [1m[32m196 passed[39m[22m[2m | [22m[33m5 skipped[39m[90m (201)[39m
  [2m   Start at [22m 23:35:33
  [2m   Duration [22m 2.32s[2m (import 40%, tests 39%, transform 18%, worker 3%)[22m

  [2m    Isolate [22m [33m20 workers spawned[39m[2m · ~138ms startup each (spawn + environment, per file)[22m
  [2m            [22m [2mat least ~784ms faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m


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
  [P3] tests/support/render-client.tsx:299 Hand-rolled hook runtime (useState/useRef/useEffect/useMemo/useCallback only) is brittle: views using other hooks such as useReducer or useId will break the harness. useMemo and useCallback also ignore deps. The issue pointed to Testing Library, which the repo lacks. → If a view gains other hooks, extend the harness, or add @testing-library/react with jsdom in a dependency-approved task.
- Run: https://github.com/bookchaowalit/life-dashboard-web/actions/runs/40245248684 · 2026-10-26 06:35 ICT

## Visual review

N/A — งานนี้ไม่ได้แตะไฟล์ UI และ issue ไม่ได้ระบุ UI pages (loop ตรวจจาก diff)

## Definition of Done
- [x] heading, field หนึ่งแถว และ empty state ของ 5 หน้า
- [x] ข้อความ error ปัจจุบันของแต่ละหน้า
- [x] ไม่เรียก service จริง (stub `fetch`)
- [x] RTM GAP-02 ระบุไฟล์ test

## Release / deploy
Merge เข้า main = deploy production ผ่าน Vercel Git; loop เปิด PR และ owner อนุมัติด้วย label `autopilot:approved`. การเปลี่ยนนี้เป็น test/เอกสารเท่านั้น ไม่กระทบ runtime
