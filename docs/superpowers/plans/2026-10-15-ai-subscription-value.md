# AI subscription value tracking

Goal: extend the existing subscriptions flow with durable provider-neutral usage and actual-payment evidence, and an owner-only monthly dashboard. The user approved the proposed outcome and asked to proceed. Reuse the clean checkouts; preserve existing APIs, authentication and quota collectors.

Correlation: chat-ai-subscription-value-2026-10-15. Task MCP registration was attempted and failed because its automation token is unavailable. No shadow task store is created.

## Tasks

- [x] T1 (storage worker): extend finance-subscriptions-api/cell.yaml with subscription-usage, subscription-charge and explicit usage completeness/hourly value on reviews. Append migration 0003; keep prior migrations unchanged. Prove arbitrary providers, null measurements, invoice periods, idempotency, authorization and isolation using disposable local PostgreSQL.
- [x] T2 (main): implement lib/subscription-value.ts and tests/subscription-value.test.ts. Calculate net saved minutes, allocate payments over covered service dates, keep currencies separate, require complete evidence, invalidate completeness after usage changes, and keep the current month provisional.
- [x] T3 (main): implement lib/cells/ai-subscriptions.ts and owner action routes using the existing ownerAction guard and cellRequest. Support adding or adopting a subscription, logging usage, recording payment, saving a monthly review and correcting a usage/charge record. Reject invalid/future dates, unknown fields and unsafe IDs; retain idempotency on retries.
- [x] T4 (UI worker after types): add /ai-subscriptions with Thai forms, monthly selector, report cards, activity/payment history, explicit unknown states and accessible errors. Add visible navigation and a link from finance. Preserve existing visual language.
- [x] T5 (main): run complete test suites, typecheck, build, and an end-to-end local journey against the real isolated service where feasible. Run an independent review, fix blocking findings, commit only scoped files and push the feature branches if remote access works. Production deployment is manual and requires its existing release authorization.

## Calculation contract

- Outcomes completed/partial/discarded are work evidence, not tokens or quota percentage.
- Saved time for completed work is baseline minus actual time minus rework. Partial/discarded work contributes negative actual+rework time; it cannot claim the baseline as saved.
- Unknown baseline/actual time is null, never zero. Without complete logs and known measurements the recommendation remains insufficient_data.
- Actual charges include payment date, amount, currency, service start/end and evidence. Allocate by inclusive service days. Gaps, overlaps and currency mismatches prevent a final verdict. The configured fee is labeled an estimate.
- Hourly value is an owner estimate in the subscription's currency, saved with that month's review. Do not add attributed revenue to time value or perform currency conversion.
- Completeness is the owner's explicit statement bound to the exact period and usage record versions. A change invalidates it. An open month cannot recommend cancellation.
- Store source metadata and task references, never prompts, conversations, credentials or automatic provider account access.
- No subscription is cancelled, downgraded or renewed automatically.

## Review focus

1. Annual invoices paid outside the displayed month must still allocate correctly.
2. Missing logs or failed pagination must never become a zero-use verdict.
3. Changes after confirming completeness must require reconfirmation.
4. Zero prices, mixed currencies, overlapping coverage and future records must remain honest and finite.
5. All mutations must use the existing owner/session/origin guards and backend audit/idempotency.

Verification: npm test, npm run typecheck, npm run build in life-dashboard-web; .venv/bin/pytest -q in finance-subscriptions-api. Existing web baseline: 129 passed, 5 skipped (Python service-auth parity dependency unavailable); report skips explicitly.

## Verified delivery

- Web: 174 tests passed, including Python verifier parity; production build passed.
- API: 58 passed, seven structurally inapplicable generic cases skipped; one upstream Starlette deprecation warning.
- Real Chromium / Next / FastAPI / disposable PostgreSQL journey passed, including stale-window rejection, edits, retry identity, persisted evidence and mobile layout.
- Independent review covered 47cf103 and 7e560f6, then fix 6ec5063. Four correctness findings were fixed. Escalated review of a8be31d cleared the remaining calendar-boundary finding and checked UTC rollover across 1,200 months. No blocking findings remain.
- Draft PRs: https://github.com/bookchaowalit/life-dashboard-web/pull/2 and https://github.com/bookchaowalit/finance-subscriptions-api/pull/1.
- Production migration, permission refresh and deployment remain unperformed pending the existing production authorization rule.
- Review rounds: 3; first-pass acceptance: no; escalation: 1; findings: 4 fixed, 0 open. Subtask workers and initial reviews used gpt-6.1-sol; final boundary review used gpt-6-astra. Exact total/task-bookkeeping timing was not recorded.
