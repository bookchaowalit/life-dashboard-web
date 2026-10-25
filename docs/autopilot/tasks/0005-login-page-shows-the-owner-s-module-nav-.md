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
pending
## Visual review
pending
## Definition of Done
- [x] `/login` แสดงแบรนด์อย่างเดียว
- [x] หน้าอื่นไม่เปลี่ยน
- [x] มี view test
## Release / deploy
merge เข้า main = deploy production ผ่าน Vercel Git; loop เปิด PR และเจ้าของอนุมัติด้วย label `autopilot:approved`
