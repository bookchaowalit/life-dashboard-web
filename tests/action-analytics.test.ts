import { describe, expect, it } from 'vitest';

import { submitAction, type ActionTracking } from '@/modules/cells/action-button';

// Owner write actions are counted where they happen: in the browser, after the
// owner route answered. Success sends the catalog event; a failure sends
// owner_write_failed with an enumerated reason, never the error text.
function recorder() {
  const calls: unknown[][] = [];
  return { calls, track: (event: string, props: Record<string, string>) => { calls.push([event, props]); } };
}
const respond = (status: number, body: unknown = {}) => (async () => Response.json(body, { status })) as typeof fetch;
const habit: ActionTracking = { event: 'habit_logged', props: { change: 'done' }, action: 'habit_log' };
const task: ActionTracking = { event: 'task_status_changed', props: { status: 'done' }, action: 'task_status' };

describe('owner write tracking', () => {
  it('habit_logged after a successful habit log', async () => {
    const r = recorder();
    expect(await submitAction('/api/owner/habits/log', { habit_id: 3, completed: true }, habit, { fetch: respond(200), track: r.track })).toEqual({ ok: true });
    expect(r.calls).toEqual([['habit_logged', { change: 'done' }]]);
  });

  it('task_status_changed after a successful status change', async () => {
    const r = recorder();
    await submitAction('/api/owner/tasks/status', { number: 17, status: 'done' }, task, { fetch: respond(200), track: r.track });
    expect(r.calls).toEqual([['task_status_changed', { status: 'done' }]]);
  });

  it('owner_write_failed with server_error / client_error / network, and never the message', async () => {
    const r = recorder();
    const s = await submitAction('/x', {}, task, { fetch: respond(502, { error: { message: 'Pay rent failed' } }), track: r.track });
    expect(s).toEqual({ ok: false, message: 'Pay rent failed' });
    await submitAction('/x', {}, habit, { fetch: respond(400), track: r.track });
    await submitAction('/x', {}, habit, { fetch: (async () => { throw new TypeError('offline'); }) as typeof fetch, track: r.track });
    expect(r.calls).toEqual([
      ['owner_write_failed', { action: 'task_status', reason: 'server_error' }],
      ['owner_write_failed', { action: 'habit_log', reason: 'client_error' }],
      ['owner_write_failed', { action: 'habit_log', reason: 'network' }],
    ]);
    expect(JSON.stringify(r.calls)).not.toContain('rent');
  });

  it('no tracking prop: nothing is tracked', async () => {
    const r = recorder();
    await submitAction('/x', {}, undefined, { fetch: respond(200), track: r.track });
    await submitAction('/x', {}, undefined, { fetch: respond(500), track: r.track });
    expect(r.calls).toEqual([]);
  });

  it('sends the same request as before (same-origin JSON POST, no-store)', async () => {
    const seen: unknown[][] = [];
    const spy = (async (...args: unknown[]) => { seen.push(args); return Response.json({}); }) as typeof fetch;
    await submitAction('/api/owner/tasks/status', { number: 1, status: 'done' }, task, { fetch: spy, track: () => {} });
    expect(seen).toEqual([['/api/owner/tasks/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"number":1,"status":"done"}', cache: 'no-store',
    }]]);
  });
});
