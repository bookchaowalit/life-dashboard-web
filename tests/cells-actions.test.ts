import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as habitLog } from '../app/api/owner/habits/log/route';
import { POST as taskStatus } from '../app/api/owner/tasks/status/route';

const HOST = '127.0.0.1:3600';
const SECRET = 'tok-secret-123';
let upstream: Array<{ url: string; init: RequestInit }>;
let respond: (url: string, init: RequestInit) => Response;

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://${HOST}${path}`, {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { host: HOST, origin: `http://${HOST}`, 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  upstream = [];
  respond = (url, init) => (init.method === 'GET' ? Response.json({ id: 'uuid-5', number: 5 }) : Response.json({}));
  vi.stubEnv('PORT', '');
  vi.stubEnv('SOLO_WEB_LOCAL_DEMO', 'true'); // owner session stand-in for loopback development
  vi.stubEnv('EMPIRE_TASKS_API', 'https://tasks.example');
  vi.stubEnv('EMPIRE_HABITS_API', 'https://habits.example');
  vi.stubEnv('EMPIRE_CELL_TOKEN', SECRET);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { upstream.push({ url, init }); return respond(url, init); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('owner write routes: guards', () => {
  it.each([['tasks', taskStatus, '/api/owner/tasks/status', { number: 5, status: 'done' }],
    ['habits', habitLog, '/api/owner/habits/log', { habit_id: 1, completed: true }]] as const)(
    '%s refuses cross-origin, wrong content type and unauthenticated requests without calling a cell', async (_name, handler, path, body) => {
      expect((await handler(post(path, body, { origin: 'https://evil.example' }))).status).toBe(403);
      expect((await handler(post(path, body, { 'content-type': 'text/plain' }))).status).toBe(415);
      expect((await handler(post(path, body, { host: 'rebind.example:3600' }))).status).toBe(403);
      vi.stubEnv('SOLO_WEB_LOCAL_DEMO', 'false'); // no demo, no session cookie
      expect((await handler(post(path, body))).status).toBe(401);
      expect(upstream).toHaveLength(0);
    });

  it('rejects malformed JSON and invalid fields with 400 before any cell call', async () => {
    expect((await taskStatus(post('/api/owner/tasks/status', '{nope'))).status).toBe(400);
    expect((await taskStatus(post('/api/owner/tasks/status', { number: '5', status: 'done' }))).status).toBe(400);
    expect((await taskStatus(post('/api/owner/tasks/status', { number: 5, status: 'archived' }))).status).toBe(400);
    expect((await habitLog(post('/api/owner/habits/log', { habit_id: 1, completed: 'yes' }))).status).toBe(400);
    expect((await habitLog(post('/api/owner/habits/log', [1]))).status).toBe(400);
    expect(upstream).toHaveLength(0);
  });
});

describe('owner write routes: behaviour', () => {
  it('marks a task done through the Tasks API with the shared token', async () => {
    const response = await taskStatus(post('/api/owner/tasks/status', { number: 5, status: 'done' }));
    expect(response.status).toBe(200);
    expect(upstream.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'GET https://tasks.example/v1/tasks/number/5', 'POST https://tasks.example/v1/tasks/uuid-5/complete']);
    expect((upstream[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.stringify(await response.json())).not.toContain(SECRET);
  });

  it('logs today for a habit; the server picks the date even if the client sends one', async () => {
    const response = await habitLog(post('/api/owner/habits/log', { habit_id: 3, completed: false, date: '1999-01-01' }));
    expect(response.status).toBe(200);
    const put = upstream[0];
    expect(put.init.method).toBe('PUT');
    expect(put.url).toMatch(/^https:\/\/habits\.example\/v1\/habits\/3\/logs\/\d{4}-\d{2}-\d{2}$/);
    expect(put.url).not.toContain('1999');
    expect(JSON.parse(String(put.init.body))).toEqual({ completed: false });
  });

  it('answers 503 ไม่พร้อมใช้งาน when the cell is not configured, 502 on cell errors, without leaking bodies', async () => {
    vi.stubEnv('EMPIRE_TASKS_API', '');
    const missing = await taskStatus(post('/api/owner/tasks/status', { number: 5, status: 'done' }));
    expect(missing.status).toBe(503);
    expect(JSON.stringify(await missing.json())).toContain('ไม่พร้อมใช้งาน');
    vi.stubEnv('EMPIRE_TASKS_API', 'https://tasks.example');
    respond = () => Response.json({ detail: { reason: `boom ${SECRET}` } }, { status: 500 });
    const failed = await taskStatus(post('/api/owner/tasks/status', { number: 5, status: 'done' }));
    expect(failed.status).toBe(502);
    const text = JSON.stringify(await failed.json());
    expect(text).not.toContain('boom');
    expect(text).not.toContain(SECRET);
  });
});
