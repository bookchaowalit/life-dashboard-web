# #4 Nav links fail touch-target size (axe target-size) at 375/768px
## Document control
- Issue: #4 (bookchaowalit/life-dashboard-web)
- Branch: autopilot/4-nav-links-fail-touch-target-size-axe-tar
- Attempt: 1
- Date: 2026-10-25
- Maker: Claude autopilot
## Definition of Ready
- [x] Requirement ชัดเจน
- [x] Acceptance criteria ทดสอบได้
- [x] Data/API impact: ไม่มี
- [x] Security/privacy impact: ไม่มี (ไม่แตะ auth)
- [x] Dependencies: ไม่มี
## Requirement & acceptance criteria
- `/login` ที่ 375, 768, 1440px: axe ไม่มี `target-size` violation
- ลิงก์ nav และปุ่ม logout สูงอย่างน้อย 44px ที่ ≤ 700px (24px ขึ้นไปบน desktop) และ focus มองเห็นได้
- view test ใต้ `tests/` ตรวจว่า nav แสดงลิงก์โมดูลที่มองเห็นทุกตัว
## Design / approach
- `app/globals.css`: ลิงก์ nav เป็น `inline-flex` สูงขั้นต่ำ 32px; ปุ่ม logout มีสไตล์เดียวกัน (เดิมเป็นปุ่ม default); ที่ ≤ 700px ทั้งลิงก์และปุ่มสูงขั้นต่ำ 44px และ gap 6px
- ทางเลือกที่ไม่ใช้: เมนู hamburger (เกินขอบเขต)
## Impact & risk
- Data/auth: ไม่มี. Performance: ไม่มี. Accessibility: ดีขึ้น, `:focus-visible` outline คงอยู่ทั้งลิงก์และปุ่ม
- Rollback: revert CSS
## Implementation notes
- `app/globals.css`: ขนาดลิงก์/ปุ่ม nav และ media query ≤ 700px
- `tests/shell-nav.test.tsx`: view test ใหม่
## Test evidence
- `npm test`, `npm run typecheck`, `npm run build` — ผลอยู่ในสรุปของ maker
## Review evidence

- **test**: ผ่าน
  [32m✓[39m tests/action-analytics.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 43[2mms[22m[39m
   [32m✓[39m modules/production/api.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 64[2mms[22m[39m
   [32m✓[39m tests/api-proxy-route.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 27[2mms[22m[39m
   [32m✓[39m tests/browser-analytics.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 27[2mms[22m[39m
   [32m✓[39m tests/shell-nav.test.tsx [2m([22m[2m2 tests[22m[2m)[22m[32m 32[2mms[22m[39m
   [32m✓[39m tests/event-catalog.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 25[2mms[22m[39m
   [32m✓[39m tests/consent-banner.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 20[2mms[22m[39m
   [32m✓[39m tests/backends.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 12[2mms[22m[39m
   [32m✓[39m tests/sentry.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
   [32m✓[39m tests/scope-css.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 8[2mms[22m[39m
   [32m✓[39m tests/posthog-adapter.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
   [32m✓[39m tests/modules-visibility.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
   [2m[90m↓[39m[22m tests/service-auth-parity.test.ts [2m([22m[2m5 tests[22m[2m | [22m[33m5 skipped[39m[2m)[22m

  [2m Test Files [22m [1m[32m19 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (20)[39m
  [2m      Tests [22m [1m[32m181 passed[39m[22m[2m | [22m[33m5 skipped[39m[90m (186)[39m
  [2m   Start at [22m 21:17:38
  [2m   Duration [22m 1.99s[2m (import 47%, tests 36%, transform 12%, worker 4%)[22m

  [2m    Isolate [22m [33m20 workers spawned[39m[2m · ~135ms startup each (spawn + environment, per file)[22m
  [2m            [22m [2mat least ~762ms faster with [22m[33misolate: false[39m[2m — reuses workers across files instead of one per file[22m


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
  [P3] next-env.d.ts:1 Generated Next.js file committed; unrelated to the task and not gitignored. → Drop it from the commit or add it to .gitignore.
- Run: https://github.com/bookchaowalit/life-dashboard-web/actions/runs/40234530094 · 2026-10-26 04:18 ICT

## Visual review

- **visual-ai**: ผ่าน — audit {'blocker': 0, 'major': 0, 'minor': 0}; AI verdict pass; checked ['/login @375', '/login @768', '/login @1440']

## Definition of Done
- [x] ขนาด target ตาม criteria (CSS)
- [x] view test ใหม่
- [ ] visual gate (pending)
## Release / deploy
Merge เข้า main = deploy production ผ่าน Vercel Git; loop เปิด PR และเจ้าของอนุมัติด้วย label `autopilot:approved`
