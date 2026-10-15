import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAiSubscriptions } from '../lib/cells/ai-subscriptions';
import { POST } from '../app/api/owner/ai-subscriptions/route';

const HOST = '127.0.0.1:3600';
const env = { EMPIRE_SUBSCRIPTIONS_API: 'https://subscriptions.example', EMPIRE_CELL_TOKEN: 'test-private-token' };
const sub = { id: 7, version: 1, name: 'Custom AI', provider: 'Independent provider', category: 'ai', status: 'active', amount: 20, currency: 'USD', billing_interval: 'monthly' };
let writes: Array<{ path: string; init: RequestInit; body: Record<string, unknown> }>;
let rows: Record<string, unknown[]>;
const fakeFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const plural = url.pathname.split('/')[2];
  if (init.method === 'GET') {
    const id = url.pathname.split('/')[3];
    return id ? Response.json(rows[plural]?.find((r: any) => r.id === Number(id)) ?? {}, { status: rows[plural]?.some((r: any) => r.id === Number(id)) ? 200 : 404 })
      : Response.json({ items: rows[plural] ?? [] });
  }
  const body = JSON.parse(String(init.body));
  writes.push({ path: url.pathname, init, body });
  return Response.json({ id: 42, version: 1, ...body }, { status: init.method === 'POST' ? 201 : 200 });
}) as typeof fetch;
const post = (body: unknown, headers: Record<string, string> = {}) => new NextRequest(`http://${HOST}/api/owner/ai-subscriptions`, {
  method: 'POST', body: JSON.stringify(body), headers: { host: HOST, origin: `http://${HOST}`, 'content-type': 'application/json', ...headers },
});
const usageBody = () => ({ action: 'usage', subscription_id: 7, used_on: '2026-09-15', title: 'Client delivery', outcome: 'completed', baseline_minutes: null, actual_minutes: 20, rework_minutes: 5, idempotency_key: 'repeatable-request-001' });

beforeEach(() => {
  writes = [];
  rows = { subscriptions: [sub, { ...sub, id: 8, name: 'Existing software', category: 'software' }], 'subscription-usages': [], 'subscription-charges': [], 'subscription-reviews': [] };
  vi.stubEnv('SOLO_WEB_LOCAL_DEMO', 'true');
  vi.stubEnv('EMPIRE_SUBSCRIPTIONS_API', env.EMPIRE_SUBSCRIPTIONS_API);
  vi.stubEnv('EMPIRE_CELL_TOKEN', env.EMPIRE_CELL_TOKEN);
  vi.stubGlobal('fetch', fakeFetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('AI subscription loader', () => {
  it('tracks arbitrary providers and makes existing subscriptions available for explicit adoption', async () => {
    const result = await loadAiSubscriptions(env, { fetch: fakeFetch, month: '2026-09', now: new Date('2026-10-15T00:00:00Z') });
    expect(result).toMatchObject({ ok: true, data: { period: { month: '2026-09', closed: true }, rows: [{ subscription: { provider: 'Independent provider' }, verdict: 'insufficient_data' }], availableSubscriptions: [{ id: 8 }] } });
  });
  it('refuses malformed or incomplete pagination instead of pretending the logs are complete', async () => {
    const malformed = (async () => Response.json({ detail: 'not an item page' })) as typeof fetch;
    expect(await loadAiSubscriptions(env, { fetch: malformed })).toMatchObject({ ok: false, code: 'upstream' });
    const full = (async () => Response.json({ items: Array.from({ length: 500 }, (_, i) => ({ ...sub, id: i + 1 })) })) as typeof fetch;
    expect(await loadAiSubscriptions(env, { fetch: full })).toMatchObject({ ok: false, code: 'upstream' });
    const duplicates = (async () => Response.json({ items: [sub, sub] })) as typeof fetch;
    expect(await loadAiSubscriptions(env, { fetch: duplicates })).toMatchObject({ ok: false, code: 'upstream' });
  });
  it('keeps unavailable service and invalid month states distinct', async () => {
    expect(await loadAiSubscriptions({}, {})).toMatchObject({ ok: false, code: 'not_configured' });
    expect(await loadAiSubscriptions(env, { month: '2026-99' })).toMatchObject({ ok: false, code: 'invalid' });
  });
});

describe('owner subscription evidence writes', () => {
  it('enforces the existing origin/session/content-type guard before touching evidence', async () => {
    expect((await POST(post(usageBody(), { origin: 'https://other.example' }))).status).toBe(403);
    expect((await POST(post(usageBody(), { 'content-type': 'text/plain' }))).status).toBe(415);
    vi.stubEnv('SOLO_WEB_LOCAL_DEMO', 'false');
    expect((await POST(post(usageBody()))).status).toBe(401);
    expect(writes).toEqual([]);
  });
  it('creates a user-supplied provider without inferring a price and supplies an idempotency key', async () => {
    const response = await POST(post({ action: 'subscription', name: 'New AI', provider: 'Any company', amount: 7.5, currency: 'THB', billing_interval: 'monthly', idempotency_key: 'repeatable-request-002' }));
    expect(response.status).toBe(200);
    expect(writes[0].body).toMatchObject({ category: 'ai', provider: 'Any company', amount: 7.5, status: 'active' });
    expect((writes[0].init.headers as Record<string, string>)['Idempotency-Key']).toBe('repeatable-request-002');
    expect(JSON.stringify(await response.json())).not.toContain(env.EMPIRE_CELL_TOKEN);
  });
  it('stores unknown usage times as null, and edits require the original subscription and record version', async () => {
    expect((await POST(post(usageBody()))).status).toBe(200);
    expect(writes[0].body.baseline_minutes).toBeNull();
    rows['subscription-usages'] = [{ id: 11, version: 2, subscription_id: 7 }];
    expect((await POST(post({ ...usageBody(), record_id: 11, expected_version: 2, baseline_minutes: 90 }))).status).toBe(200);
    expect(writes[1]).toMatchObject({ path: '/v1/subscription-usages/11', init: { method: 'PATCH' }, body: { expected_version: 2, baseline_minutes: 90 } });
    rows['subscription-usages'] = [{ id: 11, version: 2, subscription_id: 8 }];
    expect((await POST(post({ ...usageBody(), record_id: 11, expected_version: 2 }))).status).toBe(400);
  });
  it('rejects future/impossible dates, negative time and unknown fields without writing', async () => {
    for (const patch of [{ used_on: '2099-01-01' }, { used_on: '2026-02-30' }, { actual_minutes: -1 }, { subscription_id: '7' }, { source: 'invented-auto-collector' }]) {
      expect((await POST(post({ ...usageBody(), ...patch }))).status).toBe(400);
    }
    expect(writes).toEqual([]);
  });
  it('requires a real charge reference, ordered service dates and matching currency', async () => {
    const body = { action: 'charge', subscription_id: 7, paid_on: '2026-09-01', period_start: '2026-09-01', period_end: '2026-09-30', amount: 20, currency: 'USD', evidence: 'receipt-21', idempotency_key: 'repeatable-request-003' };
    expect((await POST(post({ ...body, evidence: '' }))).status).toBe(400);
    expect((await POST(post({ ...body, period_end: '2026-08-31' }))).status).toBe(400);
    expect((await POST(post({ ...body, currency: 'THB' }))).status).toBe(400);
    expect((await POST(post(body))).status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({ amount: 20, evidence: 'receipt-21', period_end: '2026-09-30' });
  });
  it('saves a review snapshot bound to the usage versions and never trusts a caller verdict', async () => {
    rows['subscription-usages'] = [{ id: 11, version: 3, subscription_id: 7, used_on: '2026-09-15', title: 'Report', outcome: 'completed', baseline_minutes: 180, actual_minutes: 30, rework_minutes: 30 }];
    rows['subscription-charges'] = [{ id: 21, subscription_id: 7, paid_on: '2026-09-01', period_start: '2026-09-01', period_end: '2026-09-30', amount: 20, currency: 'USD', evidence: 'receipt' }];
    const body = { action: 'review', subscription_id: 7, month: '2026-09', hourly_value: 30, usage_complete: true, idempotency_key: 'repeatable-request-004' };
    expect((await POST(post({ ...body, verdict: 'worth_it' }))).status).toBe(400);
    expect((await POST(post(body))).status).toBe(200);
    expect(writes[0].body).toMatchObject({ period_start: '2026-09-01', period_end: '2026-09-30', usage_complete: true, hourly_value: 30, value_currency: 'USD', verdict: 'worth_it', time_saved_hours: 2 });
    expect(JSON.parse(String(writes[0].body.evidence))).toMatchObject({ kind: 'ai-subscription-review.v1', usage_fingerprint: '[[11,3]]' });
  });
  it('adopts an existing subscription with optimistic concurrency', async () => {
    expect((await POST(post({ action: 'adopt', subscription_id: 8, expected_version: 1 }))).status).toBe(200);
    expect(writes[0]).toMatchObject({ path: '/v1/subscriptions/8', body: { category: 'ai', expected_version: 1 } });
  });
});
