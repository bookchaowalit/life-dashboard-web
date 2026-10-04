export type ProviderId = 'claude' | 'codex';
export type ProviderStatus = 'ready' | 'stale' | 'not_connected' | 'error';
export type UsageWindow = {
  id: string; label: string; used_percent: number | null; remaining_percent: number | null;
  resets_at: string | null; window_minutes: number | null; status: 'active' | 'expired';
};
export type UsageAlert = {
  id: string; kind: 'use_before_reset' | 'quota_low' | 'quota_reached';
  window_id: string; message: string; resets_at: string; remaining_percent: number | null;
};
export type UsageProvider = {
  id: ProviderId; name: string; status: ProviderStatus;
  source: 'claude_statusline' | 'codex_app_server' | 'not_connected'; collected_at: string | null;
  plan: string | null; monthly_fee_usd: number | null; windows: UsageWindow[];
  session: { estimated_cost_usd: number | null; input_tokens: number | null; output_tokens: number | null };
  api_billed_cost_usd: null; alerts: UsageAlert[]; next_action: string;
};
export type UsageOverview = {
  schema_version: 'solo-empire.ai-usage.v1'; generated_at: string; providers: UsageProvider[];
  summary: { connected: number; monthly_fee_usd: number | null; fees_complete: boolean };
};
export type ActiveAlert = { provider: UsageProvider; alert: UsageAlert };

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1000;
const date = (value: unknown): value is string => text(value) && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const nullableNumber = (value: unknown) => value === null || nonnegative(value);
const percent = (value: unknown) => value === null || (nonnegative(value) && value <= 100);
const tokens = (value: unknown) => value === null || (nonnegative(value) && Number.isSafeInteger(value));
const nullableText = (value: unknown) => value === null || text(value);
const uniqueIds = (items: { id: string }[]) => new Set(items.map(item => item.id)).size === items.length;

function validWindow(value: unknown): value is UsageWindow {
  return record(value) && text(value.id) && text(value.label) && percent(value.used_percent) && percent(value.remaining_percent) &&
    (value.resets_at === null || date(value.resets_at)) && nullableNumber(value.window_minutes) &&
    typeof value.status === 'string' && ['active', 'expired'].includes(value.status);
}

function validAlert(value: unknown): value is UsageAlert {
  return record(value) && text(value.id) && text(value.window_id) && text(value.message) && date(value.resets_at) &&
    percent(value.remaining_percent) && typeof value.kind === 'string' && ['use_before_reset', 'quota_low', 'quota_reached'].includes(value.kind);
}

function validProvider(value: unknown): value is UsageProvider {
  if (!record(value) || typeof value.id !== 'string' || !['claude', 'codex'].includes(value.id) || !text(value.name) ||
    typeof value.status !== 'string' || !['ready', 'stale', 'not_connected', 'error'].includes(value.status) ||
    typeof value.source !== 'string' || !['claude_statusline', 'codex_app_server', 'not_connected'].includes(value.source) ||
    !(value.collected_at === null || date(value.collected_at)) || !nullableText(value.plan) || !nullableNumber(value.monthly_fee_usd) ||
    !Array.isArray(value.windows) || value.windows.length > 20 || !value.windows.every(validWindow) || !uniqueIds(value.windows) ||
    !record(value.session) || !nullableNumber(value.session.estimated_cost_usd) || !tokens(value.session.input_tokens) ||
    !tokens(value.session.output_tokens) || value.api_billed_cost_usd !== null || !Array.isArray(value.alerts) ||
    value.alerts.length > 60 || !value.alerts.every(validAlert) || !uniqueIds(value.alerts) || !text(value.next_action)) return false;
  // A quota alert must belong to a reported window and to its exact reset cycle.
  const windows = value.windows;
  return value.alerts.every(alert => windows.some((window: UsageWindow) =>
    window.id === alert.window_id && window.resets_at !== null && Date.parse(window.resets_at) === Date.parse(alert.resets_at)));
}

/** Reject malformed quota data rather than turning missing values into available capacity. */
export function parseOverview(value: unknown): UsageOverview {
  if (!record(value) || value.schema_version !== 'solo-empire.ai-usage.v1' || !date(value.generated_at) ||
    !Array.isArray(value.providers) || value.providers.length !== 2 || !value.providers.every(validProvider) ||
    !uniqueIds(value.providers) || !record(value.summary) || !Number.isInteger(value.summary.connected) ||
    !nonnegative(value.summary.connected) || value.summary.connected > 2 || !nullableNumber(value.summary.monthly_fee_usd) ||
    typeof value.summary.fees_complete !== 'boolean') throw new ApiError('ข้อมูลโควตาไม่สมบูรณ์ กรุณารีเฟรชอีกครั้ง', 502);
  return value as UsageOverview;
}

export async function getOverview(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<UsageOverview> {
  let response: Response;
  try {
    response = await fetcher('/api/ai-usage/v1/ai-usage', { cache: 'no-store', signal });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new ApiError('เชื่อมต่อข้อมูลไม่ได้ กรุณาลองอีกครั้ง', 0);
  }
  if (!response.ok) {
    throw new ApiError(response.status === 401 ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' :
      response.status === 403 ? 'บัญชีนี้ไม่มีสิทธิ์อ่านข้อมูลการใช้ AI' : 'อ่านข้อมูลการใช้ AI ไม่ได้ กรุณาลองอีกครั้ง', response.status);
  }
  try { return parseOverview(await response.json()); }
  catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw new ApiError('ข้อมูลที่ได้รับอ่านไม่ได้ กรุณาลองอีกครั้ง', 502);
  }
}

const FRESH_FOR_MS = 15 * 60_000;
function freshTimestamp(value: string | null, now: number): boolean {
  if (!value) return false;
  const age = now - Date.parse(value);
  return Number.isFinite(age) && age >= -60_000 && age <= FRESH_FOR_MS;
}
export function isProviderFresh(provider: UsageProvider, overview: UsageOverview, now: number): boolean {
  return provider.status === 'ready' && freshTimestamp(provider.collected_at, now) && freshTimestamp(overview.generated_at, now);
}
export function isWindowActive(window: UsageWindow, now: number): boolean {
  return window.status === 'active' && window.resets_at !== null && Date.parse(window.resets_at) > now;
}
export function quotaState(window: UsageWindow, now: number): 'normal' | 'low' | 'exhausted' | 'unknown' | 'expired' {
  if (window.status === 'expired') return 'expired';
  if (window.resets_at === null) return 'unknown';
  if (!isWindowActive(window, now)) return 'expired';
  if (window.remaining_percent === null) return 'unknown';
  if (window.remaining_percent === 0) return 'exhausted';
  return window.remaining_percent <= 15 ? 'low' : 'normal';
}
export function activeAlerts(overview: UsageOverview, now: number): ActiveAlert[] {
  return overview.providers.flatMap(provider => {
    if (!isProviderFresh(provider, overview, now)) return [];
    const exhausted = provider.windows.some(window => isWindowActive(window, now) &&
      ((window.used_percent !== null && window.used_percent >= 100) || window.remaining_percent === 0));
    return provider.alerts.filter(alert => !(exhausted && alert.kind === 'use_before_reset') &&
      provider.windows.some(window => window.id === alert.window_id && isWindowActive(window, now)) &&
      Date.parse(alert.resets_at) > now).map(alert => ({ provider, alert }));
  });
}
export function resetCountdown(value: string | null, now: number): string {
  if (value === null) return 'ไม่ทราบเวลารีเซ็ต';
  const remaining = Date.parse(value) - now;
  if (!Number.isFinite(remaining)) return 'ไม่ทราบเวลารีเซ็ต';
  if (remaining <= 0) return 'ผ่านเวลารีเซ็ตแล้ว';
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `อีก ${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `อีก ${hours} ชม.${minutes % 60 ? ` ${minutes % 60} นาที` : ''}`;
  return `อีก ${Math.floor(hours / 24)} วัน${hours % 24 ? ` ${hours % 24} ชม.` : ''}`;
}

export const NOTIFICATION_LEDGER_KEY = 'solo-ai-usage.notifications.v1';
type NotificationLedger = Record<string, number>;
export function notificationId(item: ActiveAlert): string {
  return JSON.stringify([item.provider.id, item.alert.kind, item.alert.window_id, Date.parse(item.alert.resets_at)]);
}
export function readNotificationLedger(value: string | null, now: number): NotificationLedger {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    if (!record(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, expires]) =>
      key.length <= 2200 && nonnegative(expires) && expires > now).slice(-200)) as NotificationLedger;
  } catch { return {}; }
}
/** Store only deterministic cycle IDs and expirations, never messages or usage payloads. */
export function notifyFreshAlerts(
  overview: UsageOverview, now: number, ledger: NotificationLedger, send: (item: ActiveAlert, id: string) => void,
): { ledger: NotificationLedger; sent: number } {
  const next = readNotificationLedger(JSON.stringify(ledger), now);
  let sent = 0;
  for (const item of activeAlerts(overview, now)) {
    const id = notificationId(item);
    if (next[id]) continue;
    send(item, id);
    next[id] = Date.parse(item.alert.resets_at);
    sent += 1;
  }
  return { ledger: next, sent };
}
