---
title: Life Dashboard — KPI and Instrumentation Plan
status: draft
tags: [measurement, kpi, analytics, pilot, adr-0005]
created: 2026-10-23
updated: 2026-10-23
description: KPI tree, metric definitions, event specification, baseline collection and instrumentation checks for the owner's life dashboard (life-dashboard-web), a Big Loop W4 analytics pilot.
source_template: architecture-docs templates/sdlc/kpi-and-instrumentation-plan.md
---

# Life Dashboard — KPI and Instrumentation Plan

Big Loop W4 pilot of ADR-0005 (product analytics standard). The life dashboard
has exactly one user: the owner, signed in with Google and allow-listed by
`sub` (`PRODUCT.md`). The goal is not growth. The goal is that **the owner uses
the dashboard every day to run the day and the life systems** — act on tasks
and habits without a terminal (`PRODUCT.md` "Success"). Every metric below is
therefore a count of the owner's own days or actions, not a rate across users.

All events stay **off** until the owner sets the three variables in
[GO-LIVE.md](GO-LIVE.md) and deploys, and then wait for the owner's consent on
each device. Event catalog: [EVENTS.md](EVENTS.md). Learn stage:
[OUTCOME-REVIEW-001.md](OUTCOME-REVIEW-001.md) (OR-301) and
[EXPERIMENT-LOG.md](EXPERIMENT-LOG.md). This plan closes the open measure in
`PRODUCT.md` "Measures" ("days per week the owner opens the dashboard and
completes at least one task or habit — needs privacy-safe analytics").

Only what exists is measured: the two owner writes
(`POST /api/owner/habits/log`, `POST /api/owner/tasks/status`) and page views.
`/today` is a server redirect to `/tasks` (`app/today/page.tsx`), so the daily
review is the `/tasks` page. Goals, decisions, revenue and finance are
read-only and are only counted as page views.

## North star and input metrics

| Role | KPI | Why it is tied to the goal ("run the day from the dashboard") |
|---|---|---|
| **North star** | KPI-O-01 Owner active days per week | A day with at least one habit logged or task status changed from the dashboard is a day the dashboard ran the day |
| Input 1 | KPI-L-01 Daily review days per week | Opening `/tasks` (today's tasks) is the first step of the daily routine |
| Input 2 | KPI-L-02 Habit logging days per week | The habits half of the routine |
| Input 3 | KPI-L-03 Task status updates per week | The tasks half: work actually moves |
| Input 4 | KPI-L-04 Module coverage per week | The dashboard runs the life systems, not just tasks |
| Guardrail | KPI-G-01 Owner write failure rate | Daily use must not come with broken saves |

## Document control

| Field | Value |
|---|---|
| Project / product ID | Life Dashboard (`book-products/life-dashboard-web`, Vercel `owner-web`) |
| Version | 0.1 |
| Status | draft — instrumented behind a flag (off by default, W4 pilot 2026-10-23) |
| Metric owner | Owner (bookchaowalit) |
| AI maker | Claude Code (session w4c-loop-pilot) |
| AI reviewer | Fresh read-only Claude reviewer — pending |
| Charter objectives | OBJ-01 from `PRODUCT.md`: "the owner opens one page each day and can act on tasks and habits without opening a terminal" |
| Analytics / data source of truth | PostHog Cloud EU, shared own-products project, `product = "life-dashboard"` (ADR-0005 D-2). Cross-check: the habits and tasks cells (system of record for the writes) |
| Dashboard | PostHog dashboard "Life Dashboard pilot" — spec in [`analytics/posthog/dashboard.json`](../../analytics/posthog/dashboard.json), created by the owner after sign-up (A-1) |
| Next review | OR-301 ([OUTCOME-REVIEW-001.md](OUTCOME-REVIEW-001.md)) — due 2026-11-25 (go-live 2026-10-26 + 30 days) |

## KPI tree

```text
OBJ-01 Run the day and the life systems from the dashboard
  └─ KPI-O-01 Owner active days per week
       ├─ KPI-L-01 Daily review days per week   ($pageview /tasks)
       ├─ KPI-L-02 Habit logging days per week  (habit_logged)
       ├─ KPI-L-03 Task status updates per week (task_status_changed)
       ├─ KPI-L-04 Module coverage per week     ($pageview)
       └─ KPI-G-01 Owner write failure rate     (owner_write_failed)
```

## KPI definitions

Days are Asia/Bangkok calendar days (the cells use the same day:
`bangkokDate()`), weeks start Monday. A week is **measurable** only when it is
complete and has at least one event: with one owner, a week with no events
cannot be told apart from "no consent on this device" or "analytics off", so it
is reported as `not measurable`, never as 0.

| KPI ID | Type | Name | Objective | Formula (numerator / denominator) | Unit | Min volume for a rate | Segment / filter | Data source and event(s) | Baseline (value, period, evidence) | Target (value, by date) | Alert threshold | Cadence | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| KPI-O-01 | outcome | Owner active days per week | OBJ-01 | distinct days in the week with ≥ 1 `habit_logged` or `task_status_changed` | days (0–7) | count, not a rate: complete week with ≥ 1 event | `product = life-dashboard` | PostHog: `habit_logged`, `task_status_changed` | not yet measured — events not live | provisional ≥ 5 days/week by go-live + 60 days **[ต้องยืนยัน]** | < 3 days in a measurable week (noted in the next review, no page) | weekly | Owner |
| KPI-L-01 | leading | Daily review days per week | OBJ-01 | distinct days with a `$pageview` whose `$pathname` = `/tasks` (includes `/today`, which redirects) | days (0–7) | complete week with ≥ 1 event | same | PostHog: `$pageview` | not yet measured | provisional ≥ 6 days/week by go-live + 60 days **[ต้องยืนยัน]** | — | weekly | Owner |
| KPI-L-02 | leading | Habit logging days per week | OBJ-01 | distinct days with ≥ 1 `habit_logged` where `change = done` | days (0–7) | complete week with ≥ 1 event | same | PostHog: `habit_logged`; cross-check: habits cell week log | not yet measured | provisional ≥ 5 days/week by go-live + 60 days **[ต้องยืนยัน]** | — | weekly | Owner |
| KPI-L-03 | leading | Task status updates per week | OBJ-01 | count of `task_status_changed` (both `in_progress` and `done`; `done` also shown on its own) | updates | complete week with ≥ 1 event | same | PostHog: `task_status_changed`; cross-check: tasks API "done in last 7 days" | not yet measured | provisional ≥ 10/week by go-live + 60 days **[ต้องยืนยัน]** | — | weekly | Owner |
| KPI-L-04 | leading | Module coverage per week | OBJ-01 | distinct visible modules (`tasks`, `goals`, `habits`, `decisions`, `revenue`, `finance`, `knowledge`, `accounts`, `integrations`, `saas` — first path segment) with ≥ 1 `$pageview` | modules (0–10) | complete week with ≥ 1 event | same | PostHog: `$pageview` | not yet measured | provisional ≥ 4 modules/week by go-live + 60 days **[ต้องยืนยัน]** | — | weekly | Owner |
| KPI-G-01 | guardrail | Owner write failure rate | OBJ-01 | `owner_write_failed` / (`habit_logged` + `task_status_changed` + `owner_write_failed`), per week; `reason` split shown beside it | % | 10 writes per week | same | PostHog: `owner_write_failed`; beside it: Sentry error count for `life-dashboard-web` the same week | not yet measured | must stay ≤ 2% | > 10% over 7 days with ≥ 10 writes | weekly | Owner |

Pilot rule: targets are provisional (owner to confirm **[ต้องยืนยัน]**) and are
restated after two baseline weeks. "go-live" is the date of the first
production event (GO-LIVE.md step 5); write the real dates into this table on
that day. Counts cover only devices where the owner chose Allow; a device left
on "Decline" or never answered is invisible, which under-counts every KPI.

Known limits: habits logged or tasks changed outside the dashboard (other
clients of the cells) are not counted — that is intended, the KPIs measure the
dashboard. Retried clicks after a failure count once as a failure and once as a
success. A redirect from `/today` is recorded as `/tasks`.

## Event and data specification

All events are sent from the browser through the provider-neutral
`lib/browser-analytics.ts`, only after the owner allows analytics in the
consent banner. Owner writes are counted in `submitAction`
(`modules/cells/action-button.tsx`) after the owner route answered. Full
catalog with call sites and tests: [EVENTS.md](EVENTS.md).

| Event / field | Trigger (exact user or system action) | Properties | Personal data (incl. IDs / IP)? | Emitted by | Requirement / story | Status |
|---|---|---|---|---|---|---|
| `$pageview` | Route change in the browser, after consent | `$pathname`, `$current_url` with no query string, fragment or id segments | PostHog anonymous browser id (pseudonymous); IP discarded | frontend | W4 pilot | implemented (tests), off |
| `habit_logged` | Owner presses "ทำแล้ววันนี้" / "ยกเลิกวันนี้" and `POST /api/owner/habits/log` returns 2xx | `change` (`done` / `undone`) — never the habit name or id | browser id | frontend | W4 pilot | implemented (tests), off |
| `task_status_changed` | Owner presses "เริ่มทำ" / "เสร็จแล้ว" and `POST /api/owner/tasks/status` returns 2xx | `status` (`in_progress` / `done`) — never the title or number | browser id | frontend | W4 pilot | implemented (tests), off |
| `owner_write_failed` | Either owner write returns non-2xx or the request fails | `action` (`habit_log` / `task_status`), `reason` (`client_error` / `server_error` / `network`) — never the error message | browser id | frontend | W4 pilot | implemented (tests), off |
| identify | not used: the session's only id is the Google `sub` | — | — | — | — | by design |
| every event | — | `product = "life-dashboard"`, `$ip` removed, `$geoip_disable = true` | — | wrapper | W4 pilot | implemented (tests) |

Never sent: task titles or numbers, habit names or ids, money amounts, notes,
decision text, goal names, search text, URLs with queries, ids in paths,
email, name, error messages. The wrapper drops any event or value not on the
allow-list.

Privacy and data rules:

- The PostHog anonymous id is pseudonymous but still personal data under PDPA;
  the owner is both the data subject and the controller.
- Lawful basis / consent: consent. The banner
  (`components/analytics/consent-banner.tsx`, rendered from `app/layout.tsx`
  only when analytics is configured) offers "ไม่อนุญาต (Decline)" and
  "อนุญาต (Allow)" with the same size and the same look. Before a choice, and
  after Decline, the PostHog SDK is **not loaded at all** — no cookies, no
  storage, no request. This is stricter than PostHog's cookieless mode, which
  still loads the SDK and sends events. The choice is stored in `localStorage`
  (`life-dashboard.analytics-consent.v1`) and can be changed from "Analytics
  choices" in the footer of every page.
- Retention: PostHog free plan default **[ต้องยืนยัน at sign-up]**.
- Analytics vendor as data processor: PostHog, DPA and sub-processor list read
  at sign-up (ADR-0005 D-6 condition, owner action A-1).
- Cross-border transfer (PDPA section 28/29): PostHog EU; safeguard = vendor
  DPA/SCC **[ต้องยืนยัน]**.
- Deletion: delete the person(s) in PostHog with the delete-events option, or
  delete the project; the app stores nothing.
- No CSP is set on pages (`next.config.ts`, `vercel.json`; the only CSP is on
  proxied API responses), so `https://eu.i.posthog.com` needs no allow-list
  entry. If a page CSP is added later, add the host to `connect-src`.

## Dashboards and alerts

| Dashboard / alert | KPIs shown | Audience | Location | Refresh | Alert channel | Status |
|---|---|---|---|---|---|---|
| Life Dashboard pilot | KPI-O-01, KPI-L-01…04, KPI-G-01, first-event check | Owner | PostHog (EU), spec `analytics/posthog/dashboard.json` | live | — | planned (A-1) |
| Write failure alert | KPI-G-01 | Owner | PostHog alert | daily | email to owner, or Telegram `book_noti_bot` via webhook **[ต้องยืนยัน PostHog free-plan alerts]** | planned |

## Instrumentation verification (before G10)

| # | Check | Evidence | Result |
|---|---|---|---|
| 1 | Every event fires once per real action (unit tests, then one manual pass against PostHog live events) | `tests/action-analytics.test.ts` + PostHog capture | pass in tests — manual pass pending |
| 2 | `habit_logged` days reconcile with the habits cell week log, and `task_status_changed` `done` with tasks "done in last 7 days", for the same week (devices with consent only) | numbers in OR-301 | pending |
| 3 | No personal data in payloads (sample of 20 events) | `tests/browser-analytics.test.ts` "no PII"; sample file at go-live | pass in tests — sample pending |
| 4 | Dashboard renders every KPI from the first week of real events | screenshot | pending |
| 5 | Write-failure alert fires on a forced test condition | alert message | pending |
| 6 | Baselines captured or a dated action recorded | "Baseline collection" below | pending (waivable with a dated action) |
| 7 | Tracking respects consent | `tests/browser-analytics.test.ts` (no SDK import, no adapter load and no request when off, before consent or after Decline) | pass in tests — recheck on production with the browser network panel at go-live |

## Owner actions

| ID | Action | Needed before |
|---|---|---|
| A-1 | Create the PostHog Cloud account in the **EU** region; confirm free-plan limits and retention; read the DPA and sub-processor list; turn on "discard client IP data"; create the "Life Dashboard pilot" dashboard | first production event |
| A-2 | Put the project key in Infisical `/posthog` and set the three `NEXT_PUBLIC_*` variables on Vercel `owner-web` | first production event |
| A-3 | Deploy: link `owner-web` to Git or name a D9 exception (no agent CLI prod deploy) | first production event |
| A-4 | Choose Allow on every device used for the dashboard | baseline |

## Baseline collection

| KPI | How the baseline is collected | When |
|---|---|---|
| KPI-O-01, KPI-L-01…04 | Read the PostHog insights in `analytics/posthog/dashboard.json` for the first two **complete** weeks after go-live (Monday–Sunday, Asia/Bangkok). Paste the two weekly values and their mean into OR-301 as the baseline; a week below the minimum volume is written `not measurable` | weeks 1–2 after go-live |
| KPI-L-02 cross-check | For the same two weeks, count days with ≥ 1 completed habit in the habits cell (the `/habits` week strip) and write it beside the PostHog value; a gap means a device without consent or habits logged elsewhere | weeks 1–2 after go-live |
| KPI-L-03 cross-check | Tasks "เสร็จล่าสุด (7 วัน)" count on `/tasks` at the end of each week vs `task_status_changed` with `status = done` | weeks 1–2 after go-live |
| KPI-G-01 | Same two weeks; also note the Sentry error count for `life-dashboard-web` | weeks 1–2 after go-live |

Targets are restated (Change history below) once the baseline exists.

## Change history of definitions

| Date | KPI ID | Change | Reason | Baseline restated? | Approved by |
|---|---|---|---|---|---|
| 2026-10-23 | all | First definitions | Big Loop W4 pilot | n/a (no baseline yet) | pending |

## Quality gate and approval

| Gate | Condition | Decision | Approver | Date | Evidence |
|---|---|---|---|---|---|
| G5 (06 Requirements) | The objective has outcome, leading, and guardrail KPIs with formulas | pending | Owner — "no external signatory" (own product) | | AI review pending |
| G10 (11 Deployment) | Checks 1–5 and 7 pass; check 6 passes or is waived with a dated action | pending | Owner | | |
| G11 (12 Operations) | Dashboard live, first outcome review scheduled | pending | Owner | | |
