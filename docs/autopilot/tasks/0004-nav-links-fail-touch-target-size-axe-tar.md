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
pending
## Visual review
pending
## Definition of Done
- [x] ขนาด target ตาม criteria (CSS)
- [x] view test ใหม่
- [ ] visual gate (pending)
## Release / deploy
Merge เข้า main = deploy production ผ่าน Vercel Git; loop เปิด PR และเจ้าของอนุมัติด้วย label `autopilot:approved`
