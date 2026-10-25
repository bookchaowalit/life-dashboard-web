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
pending

## Visual review
N/A — ไม่มีการเปลี่ยน UI

## Definition of Done
- [x] ทุก page ยกเว้น login ถูกตรวจว่าเรียก `requirePageOwner()`
- [x] red run ที่ระบุชื่อไฟล์ และ green run
- [x] `DOCPACK/08-rtm.md` ปิด GAP-04 พร้อมชื่อไฟล์ test

## Release / deploy
merge เข้า main = deploy production ผ่าน Vercel Git; loop เปิด PR และเจ้าของอนุมัติด้วย label `autopilot:approved` (ไม่มีผลต่อ runtime)
