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
pending

## Visual review
N/A — หน้า owner ต้อง login; ตรวจด้วย view test

## Definition of Done
- [x] heading, field หนึ่งแถว และ empty state ของ 5 หน้า
- [x] ข้อความ error ปัจจุบันของแต่ละหน้า
- [x] ไม่เรียก service จริง (stub `fetch`)
- [x] RTM GAP-02 ระบุไฟล์ test

## Release / deploy
Merge เข้า main = deploy production ผ่าน Vercel Git; loop เปิด PR และ owner อนุมัติด้วย label `autopilot:approved`. การเปลี่ยนนี้เป็น test/เอกสารเท่านั้น ไม่กระทบ runtime
