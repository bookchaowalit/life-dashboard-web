# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- The Solo Empire owner, alone: every page needs the owner session (Google OIDC, owner
  allowlisted by `sub`). There are no other user accounts.

## Product Purpose

One web app for running a solo business and a personal life from the domain cells: today's
tasks, goals, habits, decisions, revenue and the finance pages, plus knowledge, cloud, AI usage,
accounts, integrations and the free-SaaS catalog. It replaces the retired local dashboard.

Success: the owner opens one page each day and can act on tasks and habits without opening a
terminal, and every page shows live cell data or a short "unavailable" state, never a stale copy.

## Positioning

A thin frontend over independently deployed backends: owner pages read the cells server-side
(`lib/cells/*`) with one automation token (`solo-web`), and other modules go through the
`/api/<service>` proxy with an allow-list of routes per backend. No cell data or token reaches
the client bundle or `NEXT_PUBLIC_*`.

## Operating Context

- Production: Vercel project `owner-web` (`https://solo-web-one.vercel.app`, health
  `/api/health`), functions in `sin1`. The project is not linked to Git, so a merge to `main`
  does not deploy; production deploys need the owner (no CLI `--prod` deploys, decision D9).
- Backends: the Tasks API (`platform-empire`), the goals, habits and decisions cells, the CRM
  ledger (income instance) and the other cells named in the README.
- Errors go to Sentry (org `personal-yu0`, project `life-dashboard-web`) when
  `NEXT_PUBLIC_SENTRY_DSN` is set: errors only, no tracing; each event is rebuilt from an allowlist
  (error type, redacted message, stack locations, level, release, runtime) in `lib/sentry.ts`.

## Capabilities and Constraints

- Owner pages: `/tasks` (with `/today`), `/goals`, `/habits`, `/decisions`, `/revenue` and the
  finance pages; decisions hide the text of `privacy_class=sensitive` records.
- Writes: `POST /api/owner/tasks/status` and `POST /api/owner/habits/log`, behind the
  Host/Origin/`application/json` guard and the owner session; both are idempotent.
- Proxy: only `GET`/`PATCH`/`POST` routes on each backend's allow-list, https origins only
  (http on loopback), no redirects, 8 to 15 second timeouts.
- Out of scope: multi-user access, public pages, and storing any cell data in the web app.

## Measures

- Days per week the owner opens the dashboard and completes at least one task or habit
  ([ต้องยืนยัน] needs privacy-safe analytics, see ADR-0005 / D4).
- Pages that render the "unavailable" state per day, by backend (target: 0).
- Client and server error events in Sentry per release.
