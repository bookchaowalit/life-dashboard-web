import { describe, expect, it } from 'vitest';
import { BACKENDS, isAllowed, resolveOrigin } from '../../lib/backends';
import {
  activeAlerts, ApiError, getOverview, notificationId, notifyFreshAlerts, parseOverview, quotaState,
  readNotificationLedger, resetCountdown, type UsageOverview,
} from './api';

const NOW = Date.parse('2026-10-04T17:00:00Z');
const RESET = '2026-10-04T18:00:00Z';
function fixture(): UsageOverview {
  return {
    schema_version: 'solo-empire.ai-usage.v1', generated_at: new Date(NOW).toISOString(),
    summary: { connected: 1, monthly_fee_usd: 70, fees_complete: true },
    providers: [{
      id: 'claude', name: 'Claude', status: 'ready', source: 'claude_statusline',
      collected_at: new Date(NOW).toISOString(), plan: 'Test plan', monthly_fee_usd: 45,
      windows: [{ id: 'weekly', label: 'รายสัปดาห์', used_percent: 35, remaining_percent: 65, resets_at: RESET, window_minutes: 10080, status: 'active' }],
      session: { estimated_cost_usd: 1.25, input_tokens: 120, output_tokens: 80 }, api_billed_cost_usd: null,
      alerts: [{ id: 'alert-1', kind: 'use_before_reset', window_id: 'weekly', message: 'ยังเหลือโควตา ใช้ช่วยงานที่ค้างก่อนรีเซ็ต', resets_at: RESET, remaining_percent: 65 }],
      next_action: 'monitor',
    }, {
      id: 'codex', name: 'Codex', status: 'not_connected', source: 'not_connected', collected_at: null,
      plan: null, monthly_fee_usd: 25, windows: [], session: { estimated_cost_usd: null, input_tokens: null, output_tokens: null },
      api_billed_cost_usd: null, alerts: [], next_action: 'connect_provider',
    }],
  };
}
const respond = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

describe('AI Usage contract and proxy', () => {
  it('preserves unknown quota, fee and session values without replacing them with zero', () => {
    const value = fixture();
    value.providers[0].windows[0].used_percent = null;
    value.providers[0].windows[0].remaining_percent = null;
    value.providers[0].windows[0].resets_at = null;
    value.providers[0].alerts = [];
    value.providers[0].monthly_fee_usd = null;
    value.summary.monthly_fee_usd = 25; value.summary.fees_complete = false;
    const parsed = parseOverview(value);
    expect(parsed.providers[0].windows[0].remaining_percent).toBeNull();
    expect(parsed.providers[0].monthly_fee_usd).toBeNull();
    expect(parsed.providers[1].session.estimated_cost_usd).toBeNull();
    expect(parsed.providers[0].api_billed_cost_usd).toBeNull();
  });
  it.each([
    { schema_version: 'other.v1' }, { generated_at: 'yesterday' }, { providers: [] },
    { providers: [fixture().providers[0], fixture().providers[0]] },
    { summary: { connected: 3, monthly_fee_usd: 70, fees_complete: true } },
  ])('rejects missing, duplicate or malformed overview metadata: %j', patch => {
    expect(() => parseOverview({ ...fixture(), ...patch })).toThrow(ApiError);
  });
  it.each([-1, 101, Number.NaN, '35', undefined])('rejects impossible usage percentage %s', value => {
    const overview = fixture();
    const provider = overview.providers[0];
    expect(() => parseOverview({ ...overview, providers: [{ ...provider, windows: [{ ...provider.windows[0], used_percent: value }] }, overview.providers[1]] })).toThrow(ApiError);
  });
  it('rejects an alert with no matching reset cycle and estimates presented as billed API cost', () => {
    const value = fixture();
    value.providers[0].alerts[0].resets_at = '2026-10-04T19:00:00Z';
    expect(() => parseOverview(value)).toThrow(ApiError);
    const valid = fixture();
    expect(() => parseOverview({ ...valid, providers: [{ ...valid.providers[0], api_billed_cost_usd: 1.25 }, valid.providers[1]] })).toThrow(ApiError);
  });
  it('rejects arrays masquerading as string enums', () => {
    const value = fixture();
    expect(() => parseOverview({ ...value, providers: [{ ...value.providers[0], id: ['claude'] }, value.providers[1]] })).toThrow(ApiError);
  });
  it('permits only the owner AI Usage read route and applies the existing origin guard', () => {
    const backend = BACKENDS['ai-usage'];
    expect(isAllowed(backend, 'GET', 'v1/ai-usage')).toBe(true);
    for (const [method, path] of [['POST', 'v1/ai-usage'], ['PATCH', 'v1/ai-usage'], ['GET', 'v1/ai-usage/private'], ['GET', 'v1/ai-usage/../secrets']]) {
      expect(isAllowed(backend, method, path)).toBe(false);
    }
    expect(backend.timeoutMs).toBe(8_000);
    expect(resolveOrigin(backend, {})).toEqual({ ok: true, origin: 'http://127.0.0.1:3520' });
    expect(resolveOrigin(backend, { NODE_ENV: 'production' }).ok).toBe(false);
    expect(resolveOrigin(backend, { AI_USAGE_API_ORIGIN: 'https://api.example.test', AI_USAGE_API_ALLOW_REMOTE: 'true' })).toEqual({ ok: true, origin: 'https://api.example.test' });
  });
  it('uses the guarded proxy without sending caller credentials or caching quota responses', async () => {
    const controller = new AbortController();
    let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    const fetcher: typeof fetch = async (input, init) => { request = { input, init }; return respond(fixture())(input, init); };
    await expect(getOverview(controller.signal, fetcher)).resolves.toEqual(fixture());
    expect(request?.input).toBe('/api/ai-usage/v1/ai-usage');
    expect(request?.init).toEqual({ cache: 'no-store', signal: controller.signal });
  });
  it('reports offline, malformed JSON and expired login safely in Thai', async () => {
    const signal = new AbortController().signal;
    const offline = (async () => { throw new TypeError('internal-private-host'); }) as typeof fetch;
    await expect(getOverview(signal, offline)).rejects.toMatchObject({ message: 'เชื่อมต่อข้อมูลไม่ได้ กรุณาลองอีกครั้ง', status: 0 });
    const html = (async () => new Response('<html>upstream</html>')) as typeof fetch;
    await expect(getOverview(signal, html)).rejects.toMatchObject({ status: 502 });
    await expect(getOverview(signal, respond({}, 401))).rejects.toMatchObject({ message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง', status: 401 });
    await expect(getOverview(signal, respond({ ...fixture(), providers: [] }))).rejects.toBeInstanceOf(ApiError);
  });
});

describe('quota freshness and reset cycles', () => {
  it('distinguishes available, low, exhausted, unknown and expired quota', () => {
    const window = fixture().providers[0].windows[0];
    expect(quotaState(window, NOW)).toBe('normal');
    expect(quotaState({ ...window, remaining_percent: 15 }, NOW)).toBe('low');
    expect(quotaState({ ...window, remaining_percent: 0 }, NOW)).toBe('exhausted');
    expect(quotaState({ ...window, remaining_percent: null }, NOW)).toBe('unknown');
    expect(quotaState({ ...window, resets_at: null }, NOW)).toBe('unknown');
    expect(quotaState(window, Date.parse(RESET))).toBe('expired');
    expect(quotaState({ ...window, status: 'expired' }, NOW)).toBe('expired');
  });
  it('suppresses alerts after a reset even when the API still says active', () => {
    expect(activeAlerts(fixture(), Date.parse(RESET))).toEqual([]);
  });
  it('suppresses a use-before-reset alert when another active limit of the same provider is exhausted', () => {
    const value = fixture();
    value.providers[0].windows.push({ id: 'session', label: 'รอบสั้น', used_percent: 100, remaining_percent: 0, resets_at: RESET, window_minutes: 300, status: 'active' });
    value.providers[0].alerts.push({ id: 'quota-full', kind: 'quota_reached', window_id: 'session', message: 'โควตารอบสั้นหมดแล้ว', resets_at: RESET, remaining_percent: 0 });
    expect(activeAlerts(value, NOW).map(item => item.alert.kind)).toEqual(['quota_reached']);
    const delivered: string[] = [];
    notifyFreshAlerts(value, NOW, {}, item => delivered.push(item.alert.kind));
    expect(delivered).toEqual(['quota_reached']);
    // An exhausted limit from an old cycle must not block this cycle's recommendation.
    value.providers[0].windows[1].status = 'expired';
    expect(activeAlerts(value, NOW).map(item => item.alert.kind)).toEqual(['use_before_reset']);
  });
  it.each(['stale', 'error', 'not_connected'] as const)('never notifies from provider status %s', status => {
    const value = fixture(); value.providers[0].status = status;
    expect(activeAlerts(value, NOW)).toEqual([]);
  });
  it('suppresses old, missing and implausibly future collected snapshots', () => {
    for (const collected_at of [null, new Date(NOW - 16 * 60_000).toISOString(), new Date(NOW + 2 * 60_000).toISOString()]) {
      const value = fixture(); value.providers[0].collected_at = collected_at;
      expect(activeAlerts(value, NOW)).toEqual([]);
    }
    const value = fixture(); value.generated_at = new Date(NOW - 16 * 60_000).toISOString();
    expect(activeAlerts(value, NOW)).toEqual([]);
  });
  it('formats imminent and past reset times without a negative countdown', () => {
    expect(resetCountdown(new Date(NOW + 1000).toISOString(), NOW)).toBe('อีก 1 นาที');
    expect(resetCountdown(RESET, NOW)).toBe('อีก 1 ชม.');
    expect(resetCountdown(RESET, Date.parse(RESET))).toBe('ผ่านเวลารีเซ็ตแล้ว');
    expect(resetCountdown('invalid', NOW)).toBe('ไม่ทราบเวลารีเซ็ต');
  });
});

describe('browser notification deduplication', () => {
  it('persists only cycle IDs and expires them after reset', () => {
    const value = fixture();
    const sent: string[] = [];
    const first = notifyFreshAlerts(value, NOW, {}, (_, id) => sent.push(id));
    expect(first.sent).toBe(1);
    const saved = JSON.stringify(first.ledger);
    expect(saved).not.toContain(value.providers[0].alerts[0].message);
    const restored = readNotificationLedger(saved, NOW);
    // Upstream regenerated alert IDs must not cause repeat notifications for this cycle.
    value.providers[0].alerts[0].id = 'regenerated-alert';
    const second = notifyFreshAlerts(value, NOW + 60_000, restored, (_, id) => sent.push(id));
    expect(second.sent).toBe(0); expect(sent).toHaveLength(1);
    expect(readNotificationLedger(saved, Date.parse(RESET))).toEqual({});
  });
  it('allows the same kind in a new reset cycle and a separate low-quota warning', () => {
    const value = fixture(); const first = notifyFreshAlerts(value, NOW, {}, () => {});
    const firstId = notificationId(activeAlerts(value, NOW)[0]);
    value.providers[0].alerts[0].kind = 'quota_low';
    expect(notificationId(activeAlerts(value, NOW)[0])).not.toBe(firstId);
    expect(notifyFreshAlerts(value, NOW, first.ledger, () => {}).sent).toBe(1);
    value.providers[0].alerts[0].kind = 'use_before_reset';
    value.providers[0].alerts[0].resets_at = '2026-10-05T18:00:00Z';
    value.providers[0].windows[0].resets_at = '2026-10-05T18:00:00Z';
    expect(notifyFreshAlerts(value, NOW, first.ledger, () => {}).sent).toBe(1);
  });
  it('recovers from malformed stored data and never marks failed delivery as sent', () => {
    expect(readNotificationLedger('{bad', NOW)).toEqual({});
    expect(readNotificationLedger('[]', NOW)).toEqual({});
    const ledger = {};
    expect(() => notifyFreshAlerts(fixture(), NOW, ledger, () => { throw new Error('notification_denied'); })).toThrow();
    expect(ledger).toEqual({});
  });
});
