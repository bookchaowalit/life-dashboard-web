---
title: Life Dashboard — Analytics go-live checklist (owner)
status: draft
created: 2026-10-23
updated: 2026-10-23
description: The owner's steps to turn on life-dashboard analytics. Until step 3 is done and deployed every event is off and no request goes to PostHog.
---

# Life Dashboard — Analytics go-live checklist (owner)

Everything is built and tested with analytics **off**. Nothing reaches PostHog
until step 3 is done and a deploy carries it. The Vercel project `owner-web`
is not linked to Git, so a merge to `main` does not deploy, and decision D9
forbids CLI `--prod` deploys: step 4 is an owner action.

| # | Step | Detail | Done |
|---|---|---|---|
| 1 | Sign up for PostHog Cloud **EU** (free plan) | One shared project for own products (ADR-0005 D-2); confirm free limits and retention on the pricing page; turn on "Discard client IP data" in project settings | ☐ |
| 2 | Accept the DPA | Read the DPA and sub-processor list; record the links in ADR-0005 (D-6 condition) and in KPI-PLAN.md "Privacy and data rules" | ☐ |
| 3 | Set 3 env vars on Vercel `owner-web` (Production) and Infisical `/posthog` | `NEXT_PUBLIC_ANALYTICS_ENABLED=true` · `NEXT_PUBLIC_POSTHOG_KEY=<project API key, phc_…>` · `NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`. They are build-time (`NEXT_PUBLIC_*`), so they take effect on the next build | ☑ 2026-10-26 |
| 4 | Deploy | Owner action: link `owner-web` to Git and deploy `main`, or name a one-off exception to D9. Not a CLI prod deploy by an agent | ☑ 2026-10-26 (Vercel redeploy API) |
| 5 | Check the first event | Open the dashboard in a private window and sign in: the banner shows; before a choice the network panel has **no** request to `posthog.com` and no `posthog-js` chunk. Choose "อนุญาต (Allow)", open `/tasks`, change one task status and log one habit. In PostHog run the "First-event check" insight: `$pageview`, `task_status_changed`, `habit_logged` appear with `product = life-dashboard`, URLs have no query string. Write today's date as **go-live** in KPI-PLAN.md and OUTCOME-REVIEW-001.md. On every other device you use, choose Allow too, or that device is not counted | ◐ 2026-10-26: banner, no request before a choice, POST 200 after Allow; PostHog insight check left to the owner |
| 6 | Create the dashboard | Dashboard "Life Dashboard pilot": one SQL insight per entry in `analytics/posthog/dashboard.json` | ☐ |
| 7 | Collect the baseline | The first two complete weeks after go-live: read the KPI insights; cross-check KPI-L-02 against the habits cell log for the same days (KPI-PLAN.md "Baseline collection"). Paste aggregates into OR-301 | ☐ |
| 8 | First outcome review | **OR-301 due = go-live + 30 days.** Run it, set status `decided`; empire-backlog-sync then files one task per decision row (`outcome-review/OR-301#<row>`) | ☐ |

Turning it off again: set `NEXT_PUBLIC_ANALYTICS_ENABLED=false` (or remove the
key) and redeploy. Consent can be withdrawn at any time from "Analytics
choices" at the bottom of every page.
