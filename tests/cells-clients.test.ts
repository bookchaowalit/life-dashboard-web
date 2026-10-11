import { describe, expect, it, vi } from 'vitest';

import { CellClient } from '../lib/cells/cell-client';
import { cellRequest, CellError, resolveCell, validateApiUrl, bangkokDate, weekStart, type FetchLike } from '../lib/cells/core';
import { HabitsClient } from '../lib/cells/habits';
import { LedgerClient } from '../lib/cells/ledger';
import { TasksClient } from '../lib/cells/tasks';

const SECRET = 'tok-secret-123';
const env = {
  EMPIRE_TASKS_API: 'https://tasks.example/', EMPIRE_GOALS_API: 'https://goals.example', EMPIRE_HABITS_API: 'https://habits.example',
  EMPIRE_DECISIONS_API: 'https://decisions.example', EMPIRE_CELL_TOKEN: SECRET,
  EMPIRE_CRM_LEDGER_API: 'https://crm.example', EMPIRE_CRM_LEDGER_TOKEN: 'ledger-secret',
};

type Call = { url: string; init: RequestInit };
function mock(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call, calls.length - 1);
  }) as unknown as FetchLike;
  return { calls, fetch: fetchMock };
}
const json = (body: unknown, status = 200) => Response.json(body, { status });
const headers = (call: Call) => call.init.headers as Record<string, string>;

describe('cell configuration', () => {
  it('resolves url and token from env and trims a trailing slash', () => {
    const config = resolveCell('tasks', env);
    expect(config.baseUrl).toBe('https://tasks.example');
    expect(config.token).toBe(SECRET);
    expect(resolveCell('ledger', env).token).toBe('ledger-secret');
  });

  it('reports not_configured for a missing url, a missing token or an unsafe url', () => {
    for (const bad of [{}, { ...env, EMPIRE_TASKS_API: '' }, { ...env, EMPIRE_CELL_TOKEN: '' }, { ...env, EMPIRE_TASKS_API: 'http://tasks.example' },
      { ...env, EMPIRE_TASKS_API: 'https://u:p@tasks.example' }]) {
      expect(() => resolveCell('tasks', bad)).toThrowError(expect.objectContaining({ code: 'not_configured' }));
    }
  });

  it('allows http only on loopback', () => {
    expect(validateApiUrl('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
    expect(validateApiUrl('http://example.com')).toBeNull();
    expect(validateApiUrl('https://x.example?a=1')).toBeNull();
  });

  it('computes the Bangkok day and the Monday week start', () => {
    expect(bangkokDate(new Date('2026-10-11T18:00:00Z'))).toBe('2026-10-12');
    expect(weekStart('2026-10-11')).toBe('2026-10-05'); // Sunday belongs to the week starting Monday 5th
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });
});

describe('cellRequest', () => {
  it('sends bearer, api channel, redirect:error and no cache', async () => {
    const { calls, fetch } = mock(() => json({ ok: 1 }));
    await cellRequest({ ...resolveCell('goals', env), fetch }, 'GET', '/v1/goals', { params: [['status', 'active']] });
    expect(calls[0].url).toBe('https://goals.example/v1/goals?status=active');
    expect(headers(calls[0]).Authorization).toBe(`Bearer ${SECRET}`);
    expect(headers(calls[0])['X-Empire-Channel']).toBe('api');
    expect(calls[0].init.redirect).toBe('error');
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([[401, 'unauthorized'], [403, 'unauthorized'], [404, 'not_found'], [409, 'conflict'], [422, 'invalid'], [500, 'upstream']])(
    'maps HTTP %s to %s without leaking the upstream body or token', async (status, code) => {
      const { fetch } = mock(() => json({ detail: { reason: `leak-${SECRET}` } }, status as number));
      const error = await cellRequest({ ...resolveCell('goals', env), fetch }, 'GET', '/v1/goals').catch((e) => e);
      expect(error).toBeInstanceOf(CellError);
      expect(error.code).toBe(code);
      expect(JSON.stringify([error.message, error.code, error.cell])).not.toContain(SECRET);
    });

  it('treats a network failure or a timeout as unreachable', async () => {
    const { fetch } = mock(() => { throw new TypeError(`connect ${SECRET}`); });
    const error = await cellRequest({ ...resolveCell('goals', env), fetch }, 'GET', '/v1/goals').catch((e) => e);
    expect(error.code).toBe('unreachable');
    expect(error.message).not.toContain(SECRET);
  });

  it('treats a non-JSON read as upstream', async () => {
    const { fetch } = mock(() => new Response('<html>', { status: 200 }));
    await expect(cellRequest({ ...resolveCell('goals', env), fetch }, 'GET', '/v1/goals')).rejects.toMatchObject({ code: 'upstream' });
  });
});

describe('TasksClient', () => {
  const task = (number: number) => ({ number, id: `uuid-${number}`, title: `t${number}`, status: 'todo', priority: 2, due_date: '2026-10-11T00:00:00Z' });

  it('lists with repeated status params and cursor paging', async () => {
    const first = Array.from({ length: 200 }, (_, i) => task(i + 1));
    const { calls, fetch } = mock((_, i) => json({ items: i === 0 ? first : [task(201)] }));
    const tasks = await new TasksClient({ ...resolveCell('tasks', env), fetch }).list({ status: ['todo', 'blocked'] });
    expect(tasks).toHaveLength(201);
    expect(tasks[0].due_date).toBe('2026-10-11');
    const url = new URL(calls[0].url);
    expect(url.searchParams.getAll('status')).toEqual(['todo', 'blocked']);
    expect(new URL(calls[1].url).searchParams.get('after')).toBe('200');
  });

  it('completes through the complete endpoint after resolving the uuid', async () => {
    const { calls, fetch } = mock((c) => (c.init.method === 'GET' ? json(task(7)) : json({})));
    await new TasksClient({ ...resolveCell('tasks', env), fetch }).setStatus(7, 'done');
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'GET https://tasks.example/v1/tasks/number/7', 'POST https://tasks.example/v1/tasks/uuid-7/complete']);
  });

  it('patches other statuses and rejects invalid input before any request', async () => {
    const { calls, fetch } = mock((c) => (c.init.method === 'GET' ? json(task(7)) : json({})));
    const client = new TasksClient({ ...resolveCell('tasks', env), fetch });
    await client.setStatus(7, 'in_progress');
    expect(calls[1].init.method).toBe('PATCH');
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ status: 'in_progress' });
    calls.length = 0;
    await expect(client.setStatus(0, 'done')).rejects.toMatchObject({ code: 'invalid' });
    await expect(client.setStatus(7, 'bogus' as never)).rejects.toMatchObject({ code: 'invalid' });
    expect(calls).toHaveLength(0);
  });
});

describe('CellClient (goals, decisions)', () => {
  it('lists all pages with limit/offset and returns null for a missing record', async () => {
    const page = Array.from({ length: 500 }, (_, id) => ({ id }));
    const { calls, fetch } = mock((c) => (c.url.includes('/v1/goals/9') ? json({}, 404) : json({ items: calls.length === 1 ? page : [{ id: 500 }] })));
    const client = new CellClient({ ...resolveCell('goals', env), fetch });
    expect(await client.list('goals', { status: ['active', 'planning'] })).toHaveLength(501);
    expect(new URL(calls[1].url).searchParams.get('offset')).toBe('500');
    expect(new URL(calls[0].url).searchParams.getAll('status')).toEqual(['active', 'planning']);
    expect(await client.get('goals', 9)).toBeNull();
  });
});

describe('HabitsClient', () => {
  it('reads habits and logs and upserts one day idempotently with PUT', async () => {
    const { calls, fetch } = mock((c) => {
      if (c.init.method === 'PUT') return json({ outcome: 'updated' });
      return json({ items: c.url.includes('habit-logs') ? [{ habit_id: 1, log_date: '2026-10-11', completed: true }] : [{ id: 1, name: 'อ่านหนังสือ', current_streak: 3, best_streak: 9, priority: 1 }] });
    });
    const client = new HabitsClient({ ...resolveCell('habits', env), fetch });
    expect((await client.habits())[0]).toMatchObject({ id: 1, current_streak: 3 });
    expect(await client.logs('2026-10-05', '2026-10-11')).toEqual([{ habit_id: 1, log_date: '2026-10-11', completed: true }]);
    await client.setLog(1, '2026-10-11', false);
    expect(calls[2].url).toBe('https://habits.example/v1/habits/1/logs/2026-10-11');
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ completed: false });
    await expect(client.setLog(1, '11-10-2026', true)).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('LedgerClient', () => {
  it('uses the ledger prefix, ledger token, and keeps totals per currency', async () => {
    const { calls, fetch } = mock(() => json({ items: [{ id: 1 }], totals: { THB: 1500, USD: '20' } }));
    const client = new LedgerClient({ ...resolveCell('ledger', env), fetch });
    const out = await client.revenue({ since: '2026-10-01', received: true, limit: 1 });
    expect(out.totals).toEqual({ THB: 1500, USD: 20 });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe('/api/v1/crm/ledger/revenue');
    expect(url.searchParams.get('received')).toBe('true');
    expect(headers(calls[0]).Authorization).toBe('Bearer ledger-secret');
    await client.invoices('overdue');
    expect(new URL(calls[1].url).pathname).toBe('/api/v1/crm/ledger/invoices');
  });
});
