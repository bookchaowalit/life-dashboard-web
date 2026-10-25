---
title: "Autopilot loop — life-dashboard-web (W6)"
status: active
created: 2026-10-24
updated: 2026-10-24
owner: bookchaowalit (approver) · Claude autopilot (maker) · Claude reviewer session แยก (checker)
---

# Autopilot loop (life-dashboard-web)

copy ของ loop จาก pilot `bookchaowalit-website/productivity-tracking-web` (merge งานจริงตั้งแต่ 2026-10-22)
ขยายมาที่ repo นี้ใน Big Loop **W6** (เจ้าของอนุมัติ 2026-10-24: "เริ่ม W6: ขยาย autopilot ไป portfolio-site-web และ life-dashboard-web ตามเพดานเดิม")
repo นี้เป็นเจ้าของ copy ของตัวเอง (ไม่มี shared package ตามที่เจ้าของตัดสินใจ) ถ้าแก้ engine ที่ pilot ให้ copy มาแก้ที่นี่เองและจดไว้ในหัวข้อ "ต่างจาก pilot"

## ⚠️ กติกาที่ต่างจาก pilot: merge = deploy production → ต้องอนุมัติทุก PR

repo นี้ต่อ Vercel Git อยู่ (project `owner-web`, production branch `main`)
การ merge เข้า `main` จึง**เท่ากับ deploy production** และใช้โควตา Vercel free plan **100 deploy/24 ชม. ที่ใช้ร่วมกันทั้ง team**
ต่างจาก pilot ที่ merge แล้วยังไม่ deploy ดังนั้น copy นี้**ไม่ merge เองเลย** (`merge.mode: pr-approval`):

1. งานที่ผ่านทุก gate จะถูก push เป็น branch `autopilot/<N>-…` แล้ว**เปิด PR เสมอ** พร้อมหลักฐานทุก gate ใส่ `autopilot:needs-human` ที่ issue และแจ้ง Telegram
2. คุณอนุมัติด้วยการใส่ label **`autopilot:approved`** ที่ PR (loop เช็กจาก event ของ issue ว่าคนที่ใส่ label เป็นคน ไม่ใช่ bot)
3. run ถัดไป (หรือ Run workflow เอง) จะ**นับโควตา Vercel ก่อน** ใน step ที่แยกจาก agent: นับ deploy ทั้ง team ใน 24 ชม. ล่าสุด
   ถ้า merge แล้วยังเหลือ**อย่างน้อย 20** (`merge.min_free_vercel_deploys`) จึง merge ใน clone ของ runner แล้ว push (merge-locally ไม่ใช้ `gh pr merge`)
   ถ้าไม่พอ หรือนับไม่ได้ (ไม่มี `VERCEL_TOKEN` หรือ API error) ให้**เลื่อน**ไป run ถัดไป บันทึก `postponed_quota` ใน ledger และแจ้ง Telegram ⏳
4. ถ้า `main` ขยับไปแล้ว loop จะรัน gate คำสั่งทั้งหมดใหม่บน tree ที่ merge แล้วก่อน push
5. หลัง push Vercel deploy production เอง และ `deploy-smoke.yml` ตรวจหน้าจริงจาก deployment status

branch `autopilot/*` ไม่สร้าง preview deploy (`vercel.json` → `git.deploymentEnabled: {"autopilot/*": false}`) เพื่อไม่ให้กินโควตาร่วม
**CI บน PR ของ autopilot (เจ้าของสั่ง 2026-10-26):** PR ที่เปิดด้วย `GITHUB_TOKEN` ไม่ trigger workflow อื่น (ข้อจำกัดของ GitHub) loop จึง**สั่ง `ci.yml` ด้วย `workflow_dispatch` บน branch ของ PR เอง** (ต้องมี `actions: write`) ทั้งหลังเปิด PR และทุกต้น run สำหรับ PR ที่ยังไม่มี CI บน head
ผลของ run ผูกกับ `head_sha` ของ branch จึงขึ้นเป็น check บน commit ของ PR · ก่อน merge PR ที่อนุมัติ loop ดู run ล่าสุดของ `ci.yml` บน `Autopilot-Head`:
เขียว → ไปต่อ (โควตา Vercel ฯลฯ) · ยังรัน หรือยังไม่มี (สั่งให้) → `waiting_ci` รอ run ถัดไป · ไม่ผ่าน → คอมเมนต์ ถอด label ไม่ merge (`ci_failed`) · ถูก cancel หรือค้าง `action_required` (run ของ `pull_request` ที่ bot เปิดต้องให้คนกด approve) → สั่ง dispatch ใหม่
run แบบ dispatch ไม่ผูกกับ PR (แท็บ Checks ของ PR จะว่าง) `ci.yml` จึงมี job `CI (autopilot PR)` ที่รันเฉพาะ `workflow_dispatch` และโพสต์ commit status ผลรวมพร้อม link ของ run ไว้บน head commit ซึ่ง PR แสดง (ใช้แค่ `statuses: write` ของ `GITHUB_TOKEN`) · มีผลกับ branch ที่แตกจาก main หลังเปลี่ยนนี้
test ของ gate นี้: `python3 -m unittest discover -s .autopilot/tests`

ห้ามเปลี่ยน `merge.mode` กลับเป็น `local-merge` จนกว่าเจ้าของจะตัดสินใจใหม่

## ภาพรวม

```
cron 01:40, 04:40 ICT (GitHub Actions, ubuntu-latest) — pilot :00 · portfolio :20 · life-dashboard :40
  │
  ├─ step นับโควตา Vercel (มีแค่ step นี้ที่เห็น VERCEL_TOKEN) → VERCEL_FREE_DEPLOYS
  ├─ preflight: มี issue "Autopilot paused" ไหม · โควตาวันนี้ (ledger) · `npm test` บน main เขียวไหม
  ├─ merge PR ที่มี label autopilot:approved (คนใส่) เมื่อโควตา Vercel เหลือ > 20
  │
  └─ loop สูงสุด 3 งานต่อ run
       หยิบ issue autopilot:todo ที่ priority สูงสุด (P0→P3) และ dependency ปิดแล้ว
       ├─ MAKER (Claude): ทำงาน + เขียน task record docs/autopilot/tasks/NNNN-*.md
       ├─ gate 1: npm test (vitest) · npm run typecheck · npm run build (repo นี้ไม่มี lint script)
       ├─ gate 2: REVIEWER = Claude session แยก (read-only)
       ├─ gate 3: VISUAL (เมื่อแตะ app/, components/, modules/ หรือ issue มี "UI pages"; ค่าเริ่มต้น `/login`) ui_review.mjs 375/768/1440 main เทียบ branch + Claude visual reviewer · หน้าเจ้าของต้อง login จึงถ่ายไม่ได้ ใช้ view test ใน tests/ แทน และคุณดูเองตอนอนุมัติ PR
       ├─ ไม่ผ่าน → ส่งปัญหากลับให้ maker แก้ (สูงสุด 3 รอบ, ปัญหาซ้ำ = stuck หยุดทันที)
       └─ ผ่าน → เปิด PR รออนุมัติเสมอ
  │
  └─ backlog ว่าง → PLANNER (Claude) เสนองานใหม่ ≤5 งานเป็น autopilot:proposed รอคุณอนุมัติ
       อ่าน PRODUCT.md, DESIGN.md, DOCPACK/, docs/measurement/ (KPI plan, outcome review, experiment log),
       spec และ issue สัญญาณที่เปิดอยู่ (`source:sentry`, `source:outcome-review`, `source:incident`, `source:experiment`)
```

## Backlog = GitHub Issues

เลือก Issues เพราะอยู่ติดโค้ด เปิดดูบนมือถือได้ อนุมัติด้วยการเปลี่ยน label และ comment ทุกอันเป็นหลักฐานที่มีวันที่

| Label | ความหมาย | ใครเปลี่ยน |
|---|---|---|
| `autopilot` | issue นี้อยู่ใน backlog ของ autopilot | คุณ / planner |
| `autopilot:proposed` | planner เสนอมา ยังไม่ได้อนุมัติ | planner |
| `autopilot:todo` | พร้อมให้ทำ | คุณ (อนุมัติ) |
| `autopilot:in-progress` | กำลังทำใน run นี้ | loop |
| `autopilot:needs-human` | ต้องให้คนตอบ หรือมี PR รออนุมัติ | loop |
| `autopilot:blocked` | ทำไม่ผ่าน มีสาเหตุเขียนไว้ใน comment | loop |
| `autopilot:approved` | (ใส่ที่ PR) อนุมัติให้ merge | คุณ |
| `autopilot:paused` | issue ปิดสวิตช์ทั้งระบบ | loop / คุณ |
| `P0`–`P3` | priority (P0 ทำก่อน) | คุณ / planner |
| `risk:low` / `risk:medium` / `risk:high` | ความเสี่ยง (ไม่ใส่ = medium) | คุณ / planner |

รูปแบบ body ของ issue:

```markdown
<ปัญหา / เหตุผล>

Depends on #12            ← (ถ้ามี) รอให้ #12 ปิดก่อน

## Acceptance criteria
- [ ] Given … When … Then …   ← ต้องทดสอบได้ reviewer ถือว่าข้อที่ทำไม่ครบเป็น P1

## UI pages
- `/`                       ← (ถ้ามี) หน้าที่ visual gate ต้องถ่ายและตรวจ
```


## เงื่อนไขหยุด

### ระดับงาน (ต่อ issue)

| เงื่อนไข | ผลลัพธ์ |
|---|---|
| ผ่าน test, lint, build, review และ visual (ถ้ามี) | **เสร็จ** → merge หรือเปิด PR |
| maker ตอบ `needs_human` (ต้องใช้ secret, login, การตัดสินใจเชิง product, คำตอบลูกค้า, บริการเสียเงิน, production) | `needs-human` + คำถามใน issue + Telegram |
| maker ตอบ `cannot_do` | `blocked` |
| ไม่ผ่าน gate ครบ 3 รอบ (`max_attempts_per_task`) | `blocked` + log ปัญหาล่าสุด + push branch ที่ทำค้างไว้ให้คนทำต่อได้ |
| ปัญหารอบนี้ซ้ำกับรอบก่อน (fingerprint เดิม = วนอยู่ที่เดิม) | `blocked` ทันที ไม่ต้องรอครบ 3 รอบ |
| ใช้ประมาณการเกิน $6 ต่องาน | `blocked` |
| maker ไม่ได้แก้ไฟล์อะไรเลย | นับเป็นรอบที่ล้มเหลว |

### ระดับ run

| เงื่อนไข | ผลลัพธ์ |
|---|---|
| ทำครบ 3 งาน หรือไม่มีงานพร้อมทำแล้ว | จบปกติ + สรุปเข้า ledger |
| ใช้เวลาครบ 50 นาที (job timeout 60) | หยุด คืนงานที่ทำค้างเป็น `todo` |
| Claude ติด usage/rate limit | หยุดทันที + Telegram (โควตา subscription เต็ม) |
| ครบเพดานรายวัน (ดูหัวข้อถัดไป) | หยุด + Telegram |
| `npm test` บน main ไม่ผ่านตั้งแต่ก่อนเริ่ม | **pause** ไม่เริ่มงานใหม่บนฐานที่พังอยู่แล้ว |
| งานล้มเหลวติดกัน 3 งาน (circuit breaker) | **pause** |
| gate รันไม่ได้เอง (เช่น browser เปิดไม่ขึ้น) | งานนั้น `blocked` ว่าเป็นปัญหาที่ระบบ ไม่ส่งไปให้ maker แก้ |
| error ที่ไม่คาดคิด | job fail + Telegram + บันทึก ledger |

**Pause** คือ loop เปิด issue ชื่อ "Autopilot paused" (label `autopilot:paused`) ไว้ ทุก run จะเช็กก่อนเริ่มแล้วจบทันทีถ้ามี
แก้สาเหตุเสร็จแล้ว**ปิด issue นั้น** loop ก็จะกลับมาทำงานต่อ ตัวนับงานที่ล้มเหลวติดกันจะเริ่มนับใหม่หลัง pause
คุณกด pause เองได้ด้วยการสร้าง issue ที่มี label นี้ หรือปิดทั้งระบบด้วยการตั้ง repo variable `AUTOPILOT_ENABLED` เป็นค่าอื่นที่ไม่ใช่ `true`


สวิตช์ปิด: issue ที่มี label `autopilot:paused` (เปิดไว้ = หยุด) และ repo variable `AUTOPILOT_ENABLED` (ไม่ใช่ `true` = cron ไม่รัน)

## เพดานโควตา

| เพดาน | ค่า (pilot) | ทำไม |
|---|---|---|
| run ต่อวัน | 2 (cron 01:40, 04:40 ICT) | ไม่ไปแย่งโควตา Claude ช่วงกลางวันที่คุณใช้เอง |
| งานต่อ run | 3 | ให้ 1 run จบใน 50 นาที |
| งานต่อวัน | 6 | นับงานที่ maker ทำ (จบเป็น PR, blocked หรือ needs-human) เพราะ repo นี้ไม่ merge เอง |
| Claude call ต่อวัน | 24 | รวม maker, reviewer, visual และ planner |
| ประมาณการ $ ต่องาน / ต่อวัน | 6 / 30 | `total_cost_usd` จาก Claude CLI ใช้ subscription จึงไม่ได้จ่ายจริง แต่ใช้วัดขนาดการใช้โควตาได้ |
| turn ต่อ call | maker 60 · reviewer 25 · visual 20 | กัน agent วนไม่จบ |
| เวลาต่อ call | 25 นาที | |
| รอบแก้ต่องาน | 3 | |
| โควตา Vercel ก่อน merge | เหลือ > 20 จาก 100 deploy/24 ชม. | โควตาใช้ร่วมกันทั้ง team ถ้าไม่พอให้เลื่อนไป run ถัดไป |

ยอดใช้รายวันคิดจาก **ledger issue** ("Autopilot ledger") ที่เก็บ JSON หนึ่ง comment ต่อหนึ่ง run (วัน = วันที่ตามเวลาไทย)
ค่าทั้งหมดอยู่ใน `.autopilot/config.json` → `limits`


## Telegram

ส่งผ่าน `book_noti_bot` (Infisical `/telegram` → `TELEGRAM_NOTI_BOT_TOKEN`, `TELEGRAM_NOTI_CHAT_ID`) ใน GitHub ต้องตั้งเป็น secret `TELEGRAM_BOT_TOKEN` และ `TELEGRAM_CHAT_ID`

| Event | ตัวอย่างข้อความ |
|---|---|
| `task_done` | ✅ #4 Fix … merge แล้ว a1b2c3d · 2 รอบ · ~$1.8 |
| `pr_opened` | 🟡 #6 … ผ่านทุก gate แต่ต้องอนุมัติ: แตะ package.json · PR link |
| `needs_human` | 🙋 #9 … ต้องการคน: ต้องใช้ API key ของ X |
| `task_blocked` | ⛔ #7 … วนแก้ปัญหาเดิมซ้ำ (stuck) |
| `proposals` | 📝 backlog ว่าง เสนองานใหม่ 4 งาน (รออนุมัติ) + link |
| `budget_hit` / `rate_limited` | ⚠️ ครบเพดาน Claude 24 ครั้ง/วัน · ⏳ เลื่อน merge เพราะโควตา Vercel เหลือไม่พอ |
| `paused` | ⏸️ หยุด autopilot ชั่วคราว สาเหตุ … |
| `run_error` | 💥 run error … + link ของ run |
| สรุป run | 📊 จบ run: … merge 2/3 งาน · Claude 7 ครั้ง · วันนี้ 7/24 |

สรุป run จะส่งเฉพาะตอนที่มีงานเกิดขึ้น (`notify.run_summary: when_something_happened`) run ที่ว่างจะไม่ส่งอะไร



## หลักฐาน (evidence trail)

| ที่ไหน | มีอะไร |
|---|---|
| `docs/autopilot/tasks/NNNN-*.md` | task record ต่องานที่ maker เขียน มีหัวข้อครบตาม DoR/DoD: requirement, design, impact & risk, test evidence, review, visual, release (ไม่เกี่ยวให้เขียน N/A พร้อมเหตุผล) |
| comment ใน issue | ผลแต่ละ gate, จำนวนรอบ, ค่าใช้จ่ายประมาณการ, link ของ run, สาเหตุที่หยุด |
| commit / PR | `autopilot(#N): …` และ PR ที่มีผลทุก gate · merge commit `Closes #N` + ชื่อคนที่ใส่ label |
| ledger issue | JSON ต่อ run: calls, $, นาที, ผลของทุกงาน, สาเหตุที่จบ |
| GitHub Actions log | log เต็มของ run |


## การตั้งค่า

| สิ่งที่ต้องมี | ที่มา | สถานะ |
|---|---|---|
| secret `CLAUDE_CODE_OAUTH_TOKEN` | Infisical `/anthropic` (ตัวเดียวกับ pilot) | ✅ ตั้งแล้ว 2026-10-24 (จาก Infisical) |
| secret `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Infisical `/telegram` → `TELEGRAM_NOTI_BOT_TOKEN`, `TELEGRAM_NOTI_CHAT_ID` (book_noti_bot) | ✅ ตั้งแล้ว 2026-10-24 |
| secret `VERCEL_TOKEN`, `VERCEL_TEAM_ID` | Infisical `/vercel` ใช้แค่นับโควตา (step แยก agent ไม่เห็น) | ✅ ตั้งแล้ว 2026-10-24 |
| variable `AUTOPILOT_ENABLED` | `true` เปิด cron | `true` หลัง dry-run บน Actions ผ่าน (2026-10-24) |

ตั้ง secret จาก Infisical โดยไม่แสดงค่า:

```bash
source ~/.config/solo-empire/environment.sh
infisical run --projectId "$INFISICAL_PROJECT_ID" --env dev --path /anthropic --silent -- sh -c 'printf %s "$CLAUDE_CODE_OAUTH_TOKEN" | gh secret set CLAUDE_CODE_OAUTH_TOKEN -R bookchaowalit/life-dashboard-web'
infisical run --projectId "$INFISICAL_PROJECT_ID" --env dev --path /telegram --silent -- sh -c 'printf %s "$TELEGRAM_NOTI_BOT_TOKEN" | gh secret set TELEGRAM_BOT_TOKEN -R bookchaowalit/life-dashboard-web && printf %s "$TELEGRAM_NOTI_CHAT_ID" | gh secret set TELEGRAM_CHAT_ID -R bookchaowalit/life-dashboard-web'
infisical run --projectId "$INFISICAL_PROJECT_ID" --env dev --path /vercel --silent -- sh -c 'printf %s "$VERCEL_TOKEN" | gh secret set VERCEL_TOKEN -R bookchaowalit/life-dashboard-web && printf %s "$VERCEL_TEAM_ID" | gh secret set VERCEL_TEAM_ID -R bookchaowalit/life-dashboard-web'
```

ทดสอบ: Actions → autopilot → Run workflow → `mode: dry-run` (ไม่เรียก Claude ไม่เขียนอะไร แสดงงานที่จะหยิบและโควตา Vercel)
เปิด cron: `gh variable set AUTOPILOT_ENABLED -R bookchaowalit/life-dashboard-web --body true` · ปิด: `--body false` หรือเปิด issue ที่มี label `autopilot:paused`

## รันในเครื่อง (ใช้ทดสอบเท่านั้น)

```bash
GH_TOKEN=$(gh auth token) python3 .autopilot/autopilot.py --dry-run
```

ต้องส่ง `GH_TOKEN` เพราะ loop ใช้ `GH_CONFIG_DIR` ใหม่ทุก run (ไม่อ่าน login ของ gh ในเครื่อง)

`--sandbox` รัน agent และ gate จริงบน branch ปัจจุบัน แต่ไม่ push ไม่เขียน GitHub ไม่ merge
บน WSL ต้อง `source ~/ai-stack/ui-test-env.sh` และตั้ง `AUTOPILOT_SKILLS_DIR="$UI_SKILLS"` ก่อน

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `.autopilot/autopilot.py` | engine (Python stdlib + `gh`, `git`, `claude`) |
| `.autopilot/config.json` | เพดาน, gate, protected paths, `merge.mode: pr-approval`, `min_free_vercel_deploys` |
| `.autopilot/prompts/{maker,reviewer,visual,planner}.md` | prompt ของแต่ละ agent (ปรับให้ตรง repo นี้) |
| `.github/workflows/autopilot.yml` | cron + manual run + step นับโควตา Vercel |
| `vercel.json` | `git.deploymentEnabled` ปิด preview ของ `autopilot/*` |

## ต่างจาก pilot

- `merge.mode: pr-approval`: ทุกงานจบที่ PR, merge ต่อเมื่อคนใส่ `autopilot:approved` และโควตา Vercel เหลือ > 20
- `max_tasks_per_day` นับงานที่ maker ทำ (ไม่ใช่งานที่ merge) เพราะ repo นี้ไม่ merge เอง
- `postponed_quota` ไม่นับเป็นความล้มเหลวของ circuit breaker
- ความปลอดภัย (จาก security review ของ commit แรก 2026-10-24):
  - หยิบเฉพาะ issue ที่คนเขียนอยู่ใน `backlog.trusted_authors` (เจ้าของ + planner bot) เพราะ repo เป็น public ใครก็เปิด issue ได้ และ maker ทำตาม body ของ issue
  - คำสั่งของ repo (`npm …`, `next start`) และ agent ไม่ได้รับ `GH_TOKEN`, Telegram หรือ Vercel token (`code_env()`) Claude ได้แค่ `CLAUDE_CODE_OAUTH_TOKEN` ของตัวเอง checkout ใช้ `persist-credentials: false` และ push ผ่าน `gh auth setup-git`
  - ledger นับเฉพาะ comment ของ `github-actions[bot]` และเฉพาะค่าที่ไม่ติดลบ
  - PR บันทึก `Autopilot-Head: <sha>` ที่ gate ตรวจ ถ้า head ของ PR ไม่ตรง (มี push ใหม่) loop จะถอด label อนุมัติออกและไม่ merge
  - git ทุกคำสั่งของ loop รันด้วย `core.hooksPath=/dev/null` และ `core.fsmonitor=false` และถ้า git config ส่วนที่เกี่ยวกับความปลอดภัย (credential helper, url, alias, include ฯลฯ) เปลี่ยนระหว่าง run ให้ pause ก่อนใช้ token · maker แก้ไฟล์ใน `.git/` ไม่ได้
  - merge เฉพาะ PR ที่ bot เปิดจาก branch ใน repo นี้ (`backlog.pr_authors`, ไม่ใช่ fork) และ commit ที่ fetch มาต้องตรงกับ head ที่อนุมัติ
  - prompt ของทุก agent อ่านครั้งเดียวตอนเริ่ม run (maker แก้ prompt ของ reviewer กลาง run ไม่ได้) · input `max_tasks` ผ่าน env และต้องเป็น 1–3
  - label อนุมัติมีผลเฉพาะเมื่อคนที่ใส่อยู่ใน `merge.approvers` (ตอนนี้ `bookchaowalit` คนเดียว) · `git`/`gh` ใช้ path ที่ resolve ตอนเริ่ม run
  - process ของ loop ตั้ง `PR_SET_DUMPABLE=0` โค้ดของ repo ที่รันด้วย user เดียวกันจึงอ่าน `/proc/<pid>/environ` ของ loop ไม่ได้
  - ก่อน push loop fetch main ล่าสุดมาเช็กว่า merge commit มี parent เป็น main บน remote กับ head ที่อนุมัติพอดี แล้ว push sha นั้นตรง ๆ (`<sha>:refs/heads/main`) ไม่ใช้ ref ในเครื่อง
  - gate `agent-config`: ถ้า diff แตะ `.claude/`, `CLAUDE.md`, `AGENTS.md`, `.gitattributes`, `.mcp.json`, `.autopilot/` หรือ `.github/` จะไม่ผ่านทันที และ reviewer/visual/planner รันด้วย `--setting-sources user` (ไม่โหลด hook หรือ setting ของ project)
  - secret อยู่แค่ใน step `Git identity` และ `Run autopilot` (ไม่อยู่ตอน `npm ci`)
  - **ข้อจำกัดที่ยังเหลือ (สำคัญ):** ข้อข้างบนเป็นแค่การป้องกันชั้นเสริม ทุกอย่างรันด้วย user เดียวกันใน job เดียว และ runner ของ GitHub มี sudo ที่ไม่ต้องใส่รหัส โค้ดที่ maker เขียนแล้ว gate รัน จึงยังอาจเข้าถึง `GH_TOKEN` (สิทธิ์ contents/issues/PR write ของ repo นี้) ได้ ส่วนคำสั่งที่ maker รันผ่าน Claude (`npm test`, `npx vitest` ฯลฯ) เห็น `CLAUDE_CODE_OAUTH_TOKEN` ได้แน่นอน จึงพึ่งข้อแรก (issue จากคนที่เชื่อถือเท่านั้น) · ทางแก้เต็มคือแยก maker/gate ไป job หรือ container ที่ไม่มี secret แล้วให้อีก job push/เปิด PR (งานต่อ ทำพร้อมกับ pilot)
- planner อ่าน `docs/measurement/` และ issue สัญญาณ (patch `w4a-loop-docs-planner.patch` ซึ่ง apply ที่ pilot ด้วย `59d67ee`) และใช้ `planner.context_command`
- gate: vitest + typecheck + build (ไม่มี lint), Node 22, planner ใช้ผล `npm run typecheck` แทน lint
- visual gate เห็นแค่ `/login` เพราะหน้าอื่นต้องเป็นเจ้าของ ไม่เพิ่มทางเลี่ยง auth: UI ของหน้าเจ้าของตรวจด้วย view test และคุณดู PR เอง
- protected paths เพิ่ม auth (`lib/auth*`, `lib/page-auth.ts`, `lib/request-guard.ts`, `app/login/`), `lib/sentry.ts`, `deployment/`
