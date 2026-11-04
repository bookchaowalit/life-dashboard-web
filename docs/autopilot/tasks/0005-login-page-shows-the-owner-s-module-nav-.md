# #5 Login page shows the owner's module nav to signed-out visitors
## Document control
issue #5, branch `autopilot/5-login-page-shows-the-owner-s-module-nav-`, attempt 1, วันที่ 2026-10-25, maker = Claude autopilot
## Definition of Ready
- [x] requirement ชัดเจน
- [x] acceptance criteria ทดสอบได้
- [x] data/API impact: ไม่มี
- [x] security/privacy impact: ลดการเปิดเผยลิงก์เครื่องมือของเจ้าของให้ผู้ไม่ได้ล็อกอิน
- [x] dependencies: ไม่มี
## Requirement & acceptance criteria
- Given visitor บน `/login` When render Then nav แสดงเฉพาะแบรนด์ "Solo Empire" (ไม่มีลิงก์โมดูล ไม่มีปุ่มออกจากระบบ)
- Given owner บนหน้าอื่น Then nav ไม่เปลี่ยน
- view test ใน `tests/` ครอบคลุม `/login` และ `/tasks`
## Design / approach
`components/shell-nav.tsx` คืน nav ที่มีเฉพาะแบรนด์เมื่อ `pathname === '/login'` ส่วนหน้าอื่นเหมือนเดิม. ทางเลือกที่ไม่ใช้: ซ่อนด้วย CSS (ลิงก์ยังอยู่ใน HTML)
## Impact & risk
ไม่กระทบ data/auth (`requirePageOwner()` เดิม) ไม่กระทบ performance. a11y: nav ยังมี aria-label. rollback: revert commit
## Implementation notes
- `components/shell-nav.tsx`: early return แบรนด์อย่างเดียวบน `/login`
- `tests/shell-nav.test.tsx`: test ใหม่ 2 กรณี
## Test evidence
`npm test`, `npm run typecheck`, `npm run build` — ผลตามที่รายงานในรอบนี้ (ผ่าน)
## Review evidence

- **test**: ผ่าน
  [32m✓[39m tests/cells-actions.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 72[2mms[22m[39m
   [32m✓[39m tests/action-analytics.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 39[2mms[22m[39m
   [32m✓[39m tests/api-proxy-route.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 28[2mms[22m[39m
   [32m✓[39m tests/browser-analytics.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 22[2mms[22m[39m
   [32m✓[39m tests/shell-nav.test.tsx [2m([22m[2m2 tests[22m[2m)[22m[32m 24[2mms[22m[39m
   [32m✓[39m tests/consent-banner.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 21[2mms[22m[39m
   [32m✓[39m tests/event-catalog.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 25[2mms[22m[39m
   [32m✓[39m tests/sentry.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 9[2mms[22m[39m
   [32m✓[39m tests/posthog-adapter.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 9[2mms[22m[39m
   [32m✓[39m tests/backends.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
   [32m✓[39m tests/scope-css.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
   [32m✓[39m tests/modules-visibility.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
   [2m[90m↓[39m[22m tests/service-auth-parity.test.ts [2m([22m[2m5 tests[22m[2m | [22m[33m5 skipped[39m[2m)[22m

  [2m Test Files [22m [1m[32m19 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (20)[39m
  [2m      Tests [22m [1m[32m181 passed[39m[22m[2m | [22m[33m5 skipped[39m[90m (186)[39m
  [2m   Start at [22m 21:19:36
  [2m   Duration [22m 1.92s[2m (import 46%, tests 37%, transform 12%, worker 4%)[22m

  [2m    Isolate [22m [33m20 workers spawned[39m[2m · ~137ms startup each (spawn + environment, per file)[22m
  [2m            [22m [2mat least ~777ms faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m


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
  [P3] next-env.d.ts:1 Auto-generated next-env.d.ts was committed; unrelated to the task. → Drop it from the commit, or add it to .gitignore.
- Run: https://github.com/bookchaowalit/life-dashboard-web/actions/runs/40234530094 · 2026-10-26 04:20 ICT

## Visual review

- **visual-ai**: ผ่าน — audit {'blocker': 0, 'major': 0, 'minor': 0}; AI verdict pass; checked ['/login @375', '/login @768', '/login @1440']

## Definition of Done
- [x] `/login` แสดงแบรนด์อย่างเดียว
- [x] หน้าอื่นไม่เปลี่ยน
- [x] มี view test
## Release / deploy
merge เข้า main = deploy production ผ่าน Vercel Git; loop เปิด PR และเจ้าของอนุมัติด้วย label `autopilot:approved`
