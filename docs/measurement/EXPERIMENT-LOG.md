---
title: Life Dashboard — Experiment Log
status: draft
created: 2026-10-23
updated: 2026-10-23
description: Pre-registered product experiments for the life dashboard. Empty until events are live and the first outcome review (OR-301) proposes a test.
---

# Life Dashboard — Experiment Log

Prepared from architecture-docs `templates/sdlc/experiment-log.md`. Fill
sections 1–4 of a card **before** the experiment starts and do not edit them
afterwards. PostHog feature flags are switched off in the browser adapter
(`advanced_disable_flags`) until the first approved card needs them. With one
user there is no randomised split: experiments here are before/after or
alternating-week designs on the owner's own use.

## Document control

| Field | Value |
|---|---|
| Project / product ID | Life Dashboard (`book-products/life-dashboard-web`) |
| Log owner | Owner (bookchaowalit) |
| Version | 0.1 |
| Status | active — no experiments yet (pending go-live) |
| KPI source | [KPI-PLAN.md](KPI-PLAN.md) |
| Experiment tooling | Before/after or alternating weeks on the owner's own use; PostHog feature flags off until needed |
| AI maker | Claude Code |
| AI reviewer | Fresh read-only Claude reviewer per card |
| Last updated | 2026-10-23 |
| Next review | with OR-301 (go-live + 30 days) |

## Register

| EXP ID | Title | Phase | Primary KPI | Status | Start | End | Decision | Card |
|---|---|---|---|---|---|---|---|---|

No experiments yet. A follow-up task from an experiment uses key
`experiment/<EXP-id>` (set by hand: the sync worker does not read this file).
