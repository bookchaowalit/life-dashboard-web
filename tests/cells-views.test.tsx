import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

import { loadDecision, loadDecisions, loadGoals, loadHabits, loadRevenue, loadTasks } from '../lib/cells/loaders';
import type { FetchLike, Loaded } from '../lib/cells/core';
import { MODULES } from '../lib/modules';
import { DecisionDetailView, DecisionList } from '../modules/decisions/view';
import GoalsView from '../modules/goals/view';
import HabitsView from '../modules/habits/view';
import RevenueView from '../modules/revenue/view';
import TasksView from '../modules/tasks/view';
import { Gate } from '../modules/cells/ui';

const NOW = new Date('2026-10-11T05:00:00Z'); // Sunday 11 Oct in Bangkok
const env = {
  EMPIRE_TASKS_API: 'https://tasks.example', EMPIRE_GOALS_API: 'https://goals.example', EMPIRE_HABITS_API: 'https://habits.example',
  EMPIRE_DECISIONS_API: 'https://decisions.example', EMPIRE_CELL_TOKEN: 'tok-secret-123',
  EMPIRE_CRM_LEDGER_API: 'https://crm.example', EMPIRE_CRM_LEDGER_TOKEN: 'ledger-secret',
};
const router = (routes: Array<[RegExp, unknown]>): FetchLike => (async (url: string | URL | Request) => {
  const hit = routes.find(([pattern]) => pattern.test(String(url)));
  return hit ? Response.json(hit[1]) : Response.json({ detail: 'no route' }, { status: 404 });
}) as FetchLike;

describe('unavailable states', () => {
  it('every loader returns a not_configured result when env is empty, and the page text says ไม่พร้อมใช้งาน', async () => {
    const results = await Promise.all([loadTasks({}), loadGoals({}), loadHabits({}), loadDecisions({}), loadDecision({}, 1), loadRevenue({})]);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, code: 'not_configured' });
      const html = renderToStaticMarkup(<Gate result={result as Loaded<unknown>}>{() => <p>data</p>}</Gate>);
      expect(html).toContain('ไม่พร้อมใช้งาน');
      expect(html).not.toContain('<p>data</p>');
    }
  });

  it('a failing cell renders the unavailable state and leaks neither the token nor the upstream body', async () => {
    const fetch = (async () => Response.json({ detail: { reason: 'db password=hunter2' } }, { status: 500 })) as unknown as FetchLike;
    const result = await loadTasks(env, { fetch, now: NOW });
    expect(result).toMatchObject({ ok: false, code: 'upstream' });
    const html = renderToStaticMarkup(<Gate result={result}>{() => null}</Gate>);
    expect(html).toContain('ไม่พร้อมใช้งาน');
    expect(html).not.toMatch(/hunter2|tok-secret/);
  });

  it('an unreachable cell is reported, not thrown', async () => {
    const fetch = (async () => { throw new TypeError('down'); }) as unknown as FetchLike;
    expect(await loadHabits(env, { fetch, now: NOW })).toMatchObject({ ok: false, code: 'unreachable' });
  });
});

describe('loaders and views', () => {
  it('groups tasks into overdue, today, in progress and recently done', async () => {
    const t = (number: number, status: string, due: string | null, completed: string | null = null) =>
      ({ number, id: `u${number}`, title: `งาน ${number}`, status, priority: 2, due_date: due, completed_at: completed });
    const fetch = (async (url: string | URL | Request) => {
      const statuses = new URL(String(url)).searchParams.getAll('status');
      return Response.json({ items: statuses.includes('done') ? [t(9, 'done', null, '2026-10-10T01:00:00Z')]
        : [t(1, 'todo', '2026-10-09'), t(2, 'todo', '2026-10-11'), t(3, 'in_progress', null), t(4, 'todo', '2026-12-01')] });
    }) as unknown as FetchLike;
    const result = await loadTasks(env, { fetch, now: NOW });
    if (!result.ok) throw new Error('expected data');
    expect(result.data.today).toBe('2026-10-11');
    expect(result.data.overdue.map((x) => x.number)).toEqual([1]);
    expect(result.data.dueToday.map((x) => x.number)).toEqual([2]);
    expect(result.data.inProgress.map((x) => x.number)).toEqual([3]);
    expect(result.data.otherOpen).toBe(1);
    const html = renderToStaticMarkup(<TasksView data={result.data} />);
    expect(html).toContain('เกินกำหนด');
    expect(html).toContain('#1 งาน 1');
    expect(html).toContain('เสร็จแล้ว');
  });

  it('shows goals with progress and goal tasks', async () => {
    const fetch = router([
      [/\/v1\/goal-tasks/, { items: [{ id: 1, goal_id: 10, title: 'ขั้นแรก', status: 'done' }, { id: 2, goal_id: 10, title: 'ขั้นสอง', status: 'todo' }] }],
      [/\/v1\/goals/, { items: [{ id: 10, title: 'เปิดตัวแอป', status: 'active', priority: 1, progress_percent: 40 }, { id: 11, title: 'เก่า', status: 'completed' }] }],
    ]);
    const result = await loadGoals(env, { fetch });
    if (!result.ok) throw new Error('expected data');
    expect(result.data.closed).toBe(1);
    const html = renderToStaticMarkup(<GoalsView data={result.data} />);
    expect(html).toContain('เปิดตัวแอป');
    expect(html).toContain('40%');
    expect(html).toContain('เสร็จ 1/2');
  });

  it('shows habit streaks, this week, and the log/unlog action', async () => {
    const fetch = router([
      [/habit-logs/, { items: [{ habit_id: 1, log_date: '2026-10-11', completed: true }, { habit_id: 1, log_date: '2026-10-06', completed: true }] }],
      [/\/v1\/habits/, { items: [{ id: 1, name: 'ออกกำลังกาย', current_streak: 4, best_streak: 12, priority: 1 }, { id: 2, name: 'อ่านหนังสือ', current_streak: 0, best_streak: 2, priority: 2 }] }],
    ]);
    const result = await loadHabits(env, { fetch, now: NOW });
    if (!result.ok) throw new Error('expected data');
    expect(result.data.days[0]).toBe('2026-10-05');
    expect(result.data.rows.map((r) => r.doneToday)).toEqual([true, false]);
    const html = renderToStaticMarkup(<HabitsView data={result.data} />);
    expect(html).toContain('สตรีคปัจจุบัน 4 วัน');
    expect(html).toContain('ยกเลิกวันนี้');
    expect(html).toContain('ทำแล้ววันนี้');
  });

  it('lists open decisions, hides sensitive text, and shows a detail with history', async () => {
    const items = [{ id: 5, title: 'ย้ายไป Azure', status: 'proposed', domain: 'infra', approval_status: 'pending' },
      { id: 6, title: 'ความลับ', status: 'proposed', domain: 'life', approval_status: 'pending', privacy_class: 'sensitive' }];
    const list = await loadDecisions(env, { fetch: router([[/\/v1\/decisions/, { items }]]) });
    if (!list.ok) throw new Error('expected data');
    const html = renderToStaticMarkup(<DecisionList items={list.data} />);
    expect(html).toContain('ย้ายไป Azure');
    expect(html).toContain('href="/decisions/5"');
    expect(html).not.toContain('ความลับ');
    const detail = await loadDecision(env, 5, { fetch: router([
      [/\/events/, { items: [{ id: 1, event_type: 'created', actor: 'owner', created_at: '2026-10-01T00:00:00Z' }] }],
      [/\/v1\/decisions\/5/, { id: 5, title: 'ย้ายไป Azure', decision: 'ใช้ Azure', rationale: 'เหตุผล', status: 'proposed', domain: 'infra', approval_status: 'pending', action_type: 'none', action_status: 'none' }],
    ]) });
    if (!detail.ok || !detail.data) throw new Error('expected data');
    const page = renderToStaticMarkup(<DecisionDetailView data={detail.data} />);
    expect(page).toContain('ใช้ Azure');
    expect(page).toContain('created');
    const missing = await loadDecision(env, 99, { fetch: router([]) });
    expect(missing).toEqual({ ok: true, data: null });
  });

  it('shows revenue totals per currency without mixing them, recent entries and open invoices', async () => {
    const fetch = (async (url: string | URL | Request) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith('/invoices')) return Response.json({ items: [{ id: 1, invoice_no: 'INV-1', due_date: '2026-10-01', amount: 5000, currency: 'THB', status: u.searchParams.get('status') }] });
      const month = u.searchParams.get('since') === '2026-10-01';
      return Response.json({ items: [{ id: 3, revenue_date: '2026-10-05', source_name: 'ลูกค้า A', source_type: 'service', amount: 3000, currency: 'THB', received: true }],
        totals: month ? { THB: 3000 } : { THB: 90000, USD: 120.5 } });
    }) as unknown as FetchLike;
    const result = await loadRevenue(env, { fetch, now: NOW });
    if (!result.ok) throw new Error('expected data');
    expect(result.data.month).toBe('2026-10');
    const html = renderToStaticMarkup(<RevenueView data={result.data} />);
    expect(html).toContain('3,000 THB');
    expect(html).toContain('120.5 USD');
    expect(html).toContain('INV-1');
    expect(html).toContain('ลูกค้า A');
  });
});

describe('navigation and server-only boundaries', () => {
  it('lists the five owner modules first and drops the retired today module', () => {
    expect(MODULES.slice(0, 5).map((m) => m.href)).toEqual(['/tasks', '/goals', '/habits', '/decisions', '/revenue']);
    expect(MODULES.some((m) => m.id === 'today')).toBe(false);
  });

  it('no client component imports a cell client, and cell code never reads NEXT_PUBLIC env', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
    for (const file of [...files('modules'), ...files('components')].filter((f) => /\.tsx?$/.test(f))) {
      const source = readFileSync(file, 'utf8');
      if (source.startsWith("'use client'")) expect(source, file).not.toMatch(/@\/lib\/cells|\.\.\/lib\/cells/);
    }
    for (const file of files(join('lib', 'cells'))) expect(readFileSync(file, 'utf8'), file).not.toContain('NEXT_PUBLIC');
  });
});
