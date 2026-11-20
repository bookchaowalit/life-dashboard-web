---
title: Life Dashboard — Outcome Review 001 (T+30)
status: draft
created: 2026-10-23
updated: 2026-11-20
description: First outcome review of the life-dashboard KPI pilot, prepared before go-live. Due 30 days after the first production event; status stays "pending" until then (go-live 2026-10-26). Read by empire-backlog-sync once its status is "decided".
---

# Life Dashboard — Outcome Review 001 (T+30)

Prepared from architecture-docs `templates/sdlc/outcome-review.md`. When this
review is `decided`, `empire-backlog-sync` turns each row of "Decisions and
actions" into one task in tasks-api with key `outcome-review/OR-301#<row>`
(architecture-docs `docs/lifecycle/OUTCOME-REVIEW-TO-BACKLOG.md`). Review IDs
are unique across products because the key has no repository in it: the life
dashboard uses OR-301…OR-399.

## Document control

| Field | Value |
|---|---|
| Review ID | OR-301 |
| Project / product ID | Life Dashboard (`book-products/life-dashboard-web`, Vercel `owner-web`) |
| Version | 0.2 |
| Release(s) covered | Production redeploy of `bb02d18` with analytics on (dpl_2i9SRQRqZqNqAgHFpJMqtsxedEjY, 2026-10-26) |
| Review period | 2026-10-26 – 2026-11-25 |
| Review type | T+30 |
| Status | pending owner decision (data filled 2026-11-20 from PostHog; due 2026-11-25) |
| Owner | Owner (bookchaowalit) |
| AI maker | Claude Code (session w4c-loop-pilot) prepared the empty review |
| AI reviewer | Fresh read-only Claude reviewer at review time |
| KPI plan version | [KPI-PLAN.md](KPI-PLAN.md) v0.1 |
| Data snapshot | PostHog insight exports from `analytics/posthog/dashboard.json` and the habits / tasks cell history for the cross-check — aggregates only |
| Previous review | none (first review) |
| Phase gate record | G11 record — fill in at review |
| Due | 2026-11-25 (go-live 2026-10-26 + 30 days) |

## Summary

Data snapshot: PostHog project 318524 (EU), HogQL over `events` from 2026-10-20 to 2026-11-20 03:30 UTC; live bundles checked the same day.

| Objective | Outcome KPI | Verdict | One-line reason |
|---|---|---|---|
| OBJ-01 | KPI-O-01 (north star) | not measurable | 1 PostHog event in 30 days (go-live test pageview 2026-10-25), none since |

Overall decision (proposed, owner to confirm): **not measurable → fix the data path first** — the
only user is the owner, so the first step is to accept consent on the owner's own devices, then
take the baseline at OR-302 (T+60, 2026-12-25).


## KPI results

| KPI ID | Type | Baseline | Target (by date) | Previous review | This period | Change vs baseline | Status | Data quality note |
|---|---|---|---|---|---|---|---|---|
| KPI-O-01 | outcome (north star) | not yet measured | ≥ 5 days / week, go-live + 60 days (provisional) | — | 0 days every week | — | not measurable | No complete week has ≥ 1 event |
| KPI-L-01 | leading | not yet measured | ≥ 6 days / week, go-live + 60 days (provisional) | — | 0 days every week | — | not measurable | |
| KPI-L-02 | leading | not yet measured | ≥ 5 days / week, go-live + 60 days (provisional) | — | 0 `habit_logged` | — | not measurable | Habits cell cross-check not run in this pass |
| KPI-L-03 | leading | not yet measured | ≥ 10 / week, go-live + 60 days (provisional) | — | 0 `task_status_changed` | — | not measurable | Tasks API cross-check not run in this pass |
| KPI-L-04 | leading | not yet measured | ≥ 4 modules / week, go-live + 60 days (provisional) | — | 0 modules | — | not measurable | |
| KPI-G-01 | guardrail | not yet measured | ≤ 2% | — | 0 writes | — | not measurable | Below 10 writes per week |

Instrumentation check 2026-11-20: solo-web-one.vercel.app answers 200 and its bundle carries the
PostHog project key. The page HTML shows no consent text before hydration, so the banner is
client-rendered; whether the owner's devices ever accepted it is unknown.

## Attribution

| KPI ID | Evidence type | Confidence | Other possible causes checked |
|---|---|---|---|
| all | before-after only (first period is the baseline) | low | — |

## Qualitative signals

| Source | Volume this period | Top themes | Link |
|---|---|---|---|
| Owner notes (daily brief, evening check-in) | not collected in this pass | — | — |
| Sentry errors (`personal-yu0` / `life-dashboard-web`) | not collected in this pass | — | — |

## Decisions and actions

Filled in at the review. Allowed types: backlog item, experiment, discovery
question, KPI definition change, retire feature, change request, roadmap
change. One action per row; write the task key or issue into "Tracked in".

| # | Decision | Type | Owner | Due | Tracked in |
|---|---|---|---|---|---|
| 1 | [proposed] Accept analytics consent on each device the owner uses, then confirm one `$pageview` per device in PostHog | backlog item | Owner | 2026-11-27 | outcome-review/OR-301#1 |
| 2 | [proposed] Run the habits-cell and tasks-API cross-checks for the same weeks to see whether the dashboard is used at all | discovery question | Claude | 2026-11-27 | outcome-review/OR-301#2 |
| 3 | [proposed] Keep the KPIs; take the baseline at OR-302 (T+60, 2026-12-25) | KPI definition change | Owner | 2026-11-25 | outcome-review/OR-301#3 |

Continuous discovery: open questions from this review go here.

- Is the dashboard used and simply not measured (consent), or not used? → decision #2
- Should a single-user owner tool record events without the consent step (owner-only, documented)? → owner
## Approval and sign-off

| Decision | Approver | Date | Evidence |
|---|---|---|---|
| accept review and decisions | Owner | — | — |
| next review scheduled (OR-302, T+60) | Owner | — | task `outcome-review/life-dashboard/<date>` |
