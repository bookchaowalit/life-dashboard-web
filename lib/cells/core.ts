/**
 * Shared server-side plumbing for the cell clients (tasks, goals, habits, decisions, CRM ledger).
 * Server only: configuration comes from env, tokens are never returned, and upstream error bodies are
 * reduced to a small closed set of codes so nothing from a cell reaches the page.
 */
import { randomUUID } from 'node:crypto';

export type Env = Record<string, string | undefined>;
export type FetchLike = typeof fetch;

export type CellErrorCode = 'not_configured' | 'unreachable' | 'unauthorized' | 'not_found' | 'conflict' | 'invalid' | 'upstream';

export class CellError extends Error {
  constructor(readonly code: CellErrorCode, readonly cell: string, readonly status: number | null = null) {
    super(`${cell}: ${code}`);
    this.name = 'CellError';
  }
}

export interface CellSpec { id: string; label: string; urlEnv: string; tokenEnv: string }

export const CELLS = {
  tasks: { id: 'tasks', label: 'Tasks', urlEnv: 'EMPIRE_TASKS_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  goals: { id: 'goals', label: 'Goals', urlEnv: 'EMPIRE_GOALS_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  habits: { id: 'habits', label: 'Habits', urlEnv: 'EMPIRE_HABITS_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  decisions: { id: 'decisions', label: 'Decisions', urlEnv: 'EMPIRE_DECISIONS_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  ledger: { id: 'ledger', label: 'CRM ledger', urlEnv: 'EMPIRE_CRM_LEDGER_API', tokenEnv: 'EMPIRE_CRM_LEDGER_TOKEN' },
  // Finance: ten cells, read only (2026-10-12).
  'finance-accounts': { id: 'finance-accounts', label: 'Finance accounts', urlEnv: 'EMPIRE_FINANCE_ACCOUNTS_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  'transactions': { id: 'transactions', label: 'Transactions', urlEnv: 'EMPIRE_TRANSACTIONS_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  'budgets': { id: 'budgets', label: 'Budgets', urlEnv: 'EMPIRE_BUDGETS_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  'cash-flow': { id: 'cash-flow', label: 'Cash flow', urlEnv: 'EMPIRE_CASH_FLOW_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  'reconciliations': { id: 'reconciliations', label: 'Reconciliations', urlEnv: 'EMPIRE_RECONCILIATIONS_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  'business-assets': { id: 'business-assets', label: 'Business assets', urlEnv: 'EMPIRE_BUSINESS_ASSETS_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  'investments': { id: 'investments', label: 'Investments', urlEnv: 'EMPIRE_INVESTMENTS_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  'liabilities': { id: 'liabilities', label: 'Liabilities', urlEnv: 'EMPIRE_LIABILITIES_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  'subscriptions': { id: 'subscriptions', label: 'Subscriptions', urlEnv: 'EMPIRE_SUBSCRIPTIONS_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
  'tax': { id: 'tax', label: 'Tax', urlEnv: 'EMPIRE_TAX_API', tokenEnv: 'EMPIRE_CELL_TOKEN' },
} as const satisfies Record<string, CellSpec>;
export type CellId = keyof typeof CELLS;

/** Every env name the cell clients read, for documentation and tests. */
export const CELL_ENV_NAMES = [...new Set(Object.values(CELLS).flatMap((cell) => [cell.urlEnv, cell.tokenEnv]))];

/** https, or http to a loopback host only; credentials, query and fragment are refused. */
export function validateApiUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return null;
    const host = url.hostname.toLowerCase();
    const loopback = ['127.0.0.1', '[::1]', '::1', 'localhost'].includes(host);
    if (!(url.protocol === 'https:' && host) && !(url.protocol === 'http:' && loopback)) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch { return null; }
}

export interface CellConfig { cell: CellSpec; baseUrl: string; token: string; fetch?: FetchLike; timeoutMs?: number }

export function resolveCell(id: CellId, env: Env, overrides: { fetch?: FetchLike; timeoutMs?: number } = {}): CellConfig {
  const cell = CELLS[id];
  const raw = (env[cell.urlEnv] ?? '').trim();
  const token = (env[cell.tokenEnv] ?? '').trim();
  const baseUrl = raw ? validateApiUrl(raw) : null;
  if (!baseUrl || !token) throw new CellError('not_configured', id);
  return { cell, baseUrl, token, ...overrides };
}

export type Params = Array<[string, string]>;

function classify(status: number): CellErrorCode {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 409 || status === 412) return 'conflict';
  if (status === 400 || status === 422) return 'invalid';
  return 'upstream';
}

export const DEFAULT_TIMEOUT_MS = 10_000;

/** One JSON request. Never follows redirects (the bearer token must not leave the cell). */
export async function cellRequest(
  config: CellConfig, method: string, path: string,
  options: { params?: Params; body?: unknown; headers?: Record<string, string>; pathPrefix?: string } = {},
): Promise<any> {
  const query = options.params?.length ? `?${new URLSearchParams(options.params)}` : '';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${config.token}`,
    'X-Empire-Channel': 'api',
    'X-Correlation-Id': `solo-web-${randomUUID()}`,
    ...options.headers,
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const doFetch = config.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await doFetch(`${config.baseUrl}${options.pathPrefix ?? ''}${path}${query}`, {
      method, headers, cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch { throw new CellError('unreachable', config.cell.id); }
  if (!response.ok) throw new CellError(classify(response.status), config.cell.id, response.status);
  if (response.status === 204) return null;
  try { return await response.json(); } catch {
    // A write may answer with an empty body; a read that is not JSON is a proxy page or a cut body.
    if (method === 'GET') throw new CellError('upstream', config.cell.id, response.status);
    return null;
  }
}

export const MAX_PAGES = 20;

export function dateOnly(value: unknown): string | null {
  return value === null || value === undefined || value === '' ? null : String(value).slice(0, 10);
}

/** Calendar date (YYYY-MM-DD) in Asia/Bangkok, the owner's day. */
export function bangkokDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

// ─── Result wrapper used by every page loader ───

export type Loaded<T> = { ok: true; data: T } | { ok: false; code: CellErrorCode; cell: string };

export async function load<T>(cell: CellId, read: () => Promise<T>): Promise<Loaded<T>> {
  try { return { ok: true, data: await read() }; } catch (error) {
    return { ok: false, code: error instanceof CellError ? error.code : 'upstream', cell: error instanceof CellError ? error.cell : cell };
  }
}
