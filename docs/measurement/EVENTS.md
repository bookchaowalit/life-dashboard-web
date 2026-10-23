---
title: Life Dashboard — Event catalog
status: draft
created: 2026-10-23
updated: 2026-10-23
description: Every analytics event the life dashboard can send, the metric it feeds, where it fires and which test covers it. All events are off until NEXT_PUBLIC_ANALYTICS_ENABLED=true and a PostHog key are set, and then wait for the owner's consent.
---

# Life Dashboard — Event catalog

Metric definitions: [KPI-PLAN.md](KPI-PLAN.md). Go-live steps: [GO-LIVE.md](GO-LIVE.md).
`tests/event-catalog.test.ts` fails when an event below has no call site or no
test, when a property value in `lib/browser-analytics.ts` is not listed here,
or when the code can send an event that is not listed here.

All events are browser events sent through `lib/browser-analytics.ts`, only
after the owner chose "อนุญาต (Allow)" in the consent banner. Every event
carries `product = "life-dashboard"`. `before_send` (`lib/posthog-adapter.ts`)
removes query strings, fragments, id segments, referrer paths and `$ip`, and
sets `$geoip_disable`. Owner writes are counted in the browser after the owner
route answered (`submitAction` in `modules/cells/action-button.tsx`); the
server routes send nothing.

## Events

| Event | Emitted by | Properties (allow-list) | Feeds metric | Call site | Test |
|---|---|---|---|---|---|
| `$pageview` | browser, after consent | `$pathname`, `$current_url` (cleaned: no query, fragment or id segments, e.g. `/decisions/:id`) | KPI-L-01 (`/tasks` days), KPI-L-04 (modules opened) | `components/analytics/analytics-provider.tsx` (`analytics.page` on route change) | `tests/browser-analytics.test.ts`, `tests/posthog-adapter.test.ts` |
| `habit_logged` | browser, after a 2xx from `POST /api/owner/habits/log` | `change` ∈ `done`, `undone` | KPI-O-01, KPI-L-02, KPI-G-01 (writes) | `modules/habits/view.tsx` (`tracking` prop of the log button) | `tests/action-analytics.test.ts`, `tests/browser-analytics.test.ts` |
| `task_status_changed` | browser, after a 2xx from `POST /api/owner/tasks/status` | `status` ∈ `in_progress`, `done` | KPI-O-01, KPI-L-03, KPI-G-01 (writes) | `modules/tasks/view.tsx` (`tracking` for the start and done buttons) | `tests/action-analytics.test.ts`, `tests/browser-analytics.test.ts` |
| `owner_write_failed` | browser, after a non-2xx or a network error on either owner write | `action` ∈ `habit_log`, `task_status`; `reason` ∈ `client_error`, `server_error`, `network` | KPI-G-01 | `modules/cells/action-button.tsx` (`submitAction`) | `tests/action-analytics.test.ts`, `tests/browser-analytics.test.ts` |

## Identity

| Call | When | Value | Test |
|---|---|---|---|
| `identify` | not called | The session holds only the owner's Google `sub`, an identifier issued by Google rather than a pseudonymous id of our own; with one user there is nothing to link, so events stay on PostHog's anonymous id. The module still refuses emails and free text if a caller is added later | `tests/browser-analytics.test.ts` |
| `forgetIdentity` → `reset` | on `/login` (the signed-out state), after consent, only if an id was stored by `identify` on this browser — a no-op today | — | `tests/browser-analytics.test.ts`, `tests/posthog-adapter.test.ts` |

## Never sent

Task titles or numbers, habit names or ids, money amounts, notes, decision
text, goal names, search text, URLs with queries, ids in paths, email, name,
error messages and request bodies. There is no autocapture (forms and inputs
are never read), no session recording, no heatmaps, no surveys and no feature
flags.
