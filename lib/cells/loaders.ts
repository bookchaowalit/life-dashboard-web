/** Page data for the owner modules. Each loader reads one cell and returns a Loaded<T>; it never throws. */
import { CellClient, type CellRecord } from './cell-client';
import { addDays, bangkokDate, load, resolveCell, weekStart, type Env, type FetchLike, type Loaded } from './core';
import { HabitsClient, type Habit, type HabitLog } from './habits';
import { LedgerClient, type LedgerRow, type Totals } from './ledger';
import { TasksClient, type Task } from './tasks';

export interface Options { fetch?: FetchLike; now?: Date }
const overrides = (options: Options) => (options.fetch ? { fetch: options.fetch } : {});

// ─── Tasks ───

export interface TasksView { today: string; overdue: Task[]; dueToday: Task[]; inProgress: Task[]; recentlyDone: Task[]; otherOpen: number }

const byPriority = (a: Task, b: Task) => (a.priority ?? 9) - (b.priority ?? 9) || (a.due_date ?? '9').localeCompare(b.due_date ?? '9') || a.number - b.number;

export function loadTasks(env: Env, options: Options = {}): Promise<Loaded<TasksView>> {
  return load('tasks', async () => {
    const now = options.now ?? new Date();
    const today = bangkokDate(now);
    const client = new TasksClient(resolveCell('tasks', env, overrides(options)));
    const [open, done] = await Promise.all([
      client.list({ status: ['todo', 'in_progress', 'blocked'] }),
      client.list({ status: ['done'], completed_from: new Date(now.getTime() - 7 * 86_400_000).toISOString() }),
    ]);
    const overdue = open.filter((t) => t.due_date !== null && t.due_date < today).sort(byPriority);
    const dueToday = open.filter((t) => t.due_date === today).sort(byPriority);
    const shown = new Set([...overdue, ...dueToday].map((t) => t.number));
    const inProgress = open.filter((t) => t.status === 'in_progress' && !shown.has(t.number)).sort(byPriority);
    const recentlyDone = done.sort((a, b) => String(b.completed_at ?? '').localeCompare(String(a.completed_at ?? ''))).slice(0, 15);
    return { today, overdue, dueToday, inProgress, recentlyDone, otherOpen: open.length - shown.size - inProgress.length };
  });
}

// ─── Goals ───

export interface GoalView { goal: CellRecord; tasks: CellRecord[]; done: number }
export interface GoalsView { goals: GoalView[]; closed: number }

export function loadGoals(env: Env, options: Options = {}): Promise<Loaded<GoalsView>> {
  return load('goals', async () => {
    const client = new CellClient(resolveCell('goals', env, overrides(options)));
    const [goals, goalTasks] = await Promise.all([client.list('goals'), client.list('goal-tasks')]);
    const open = goals.filter((g) => ['active', 'planning', 'paused'].includes(String(g.status)));
    open.sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || (a.priority ?? 9) - (b.priority ?? 9) || a.id - b.id);
    return {
      closed: goals.length - open.length,
      goals: open.map((goal) => {
        const tasks = goalTasks.filter((t) => t.goal_id === goal.id);
        return { goal, tasks, done: tasks.filter((t) => t.status === 'done').length };
      }),
    };
  });
}

// ─── Habits ───

export interface HabitRow { habit: Habit; week: Array<{ date: string; completed: boolean }>; doneToday: boolean }
export interface HabitsView { today: string; days: string[]; rows: HabitRow[] }

export function loadHabits(env: Env, options: Options = {}): Promise<Loaded<HabitsView>> {
  return load('habits', async () => {
    const today = bangkokDate(options.now);
    const start = weekStart(today);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const client = new HabitsClient(resolveCell('habits', env, overrides(options)));
    const [habits, logs] = await Promise.all([client.habits('active'), client.logs(start, days[6])]);
    const done = new Set(logs.filter((l: HabitLog) => l.completed).map((l) => `${l.habit_id}:${l.log_date}`));
    habits.sort((a, b) => a.priority - b.priority || a.id - b.id);
    return {
      today, days,
      rows: habits.map((habit) => ({
        habit, doneToday: done.has(`${habit.id}:${today}`),
        week: days.map((date) => ({ date, completed: done.has(`${habit.id}:${date}`) })),
      })),
    };
  });
}

// ─── Decisions ───

export const OPEN_DECISION_STATUSES = ['draft', 'proposed', 'approved', 'in_progress', 'deferred'];
export interface DecisionDetail { decision: CellRecord; events: CellRecord[] }

export function loadDecisions(env: Env, options: Options = {}): Promise<Loaded<CellRecord[]>> {
  return load('decisions', async () => {
    const client = new CellClient(resolveCell('decisions', env, overrides(options)));
    return client.list('decisions', { status: OPEN_DECISION_STATUSES }, 'desc');
  });
}

export function loadDecision(env: Env, id: number, options: Options = {}): Promise<Loaded<DecisionDetail | null>> {
  return load('decisions', async () => {
    const client = new CellClient(resolveCell('decisions', env, overrides(options)));
    const decision = await client.get('decisions', id);
    if (!decision) return null;
    const events = await client.items(`/v1/decisions/${Math.trunc(id)}/events`, [['order', 'asc'], ['limit', '100']]);
    return { decision, events };
  });
}

// ─── Revenue ───

export interface RevenueView {
  month: string; year: string; monthTotals: Totals; yearTotals: Totals; pendingTotals: Totals;
  recent: LedgerRow[]; openInvoices: LedgerRow[];
}

export function loadRevenue(env: Env, options: Options = {}): Promise<Loaded<RevenueView>> {
  return load('ledger', async () => {
    const today = bangkokDate(options.now);
    const monthStart = `${today.slice(0, 7)}-01`;
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const client = new LedgerClient(resolveCell('ledger', env, overrides(options)));
    const [month, year, pending, recent, sent, overdue] = await Promise.all([
      client.revenue({ since: monthStart, received: true, limit: 1 }),
      client.revenue({ since: yearStart, received: true, limit: 1 }),
      client.revenue({ received: false, limit: 1 }),
      client.revenue({ limit: 20 }),
      client.invoices('sent'),
      client.invoices('overdue'),
    ]);
    const openInvoices = [...overdue, ...sent].sort((a, b) => String(a.due_date ?? '').localeCompare(String(b.due_date ?? '')));
    return {
      month: today.slice(0, 7), year: today.slice(0, 4), monthTotals: month.totals, yearTotals: year.totals,
      pendingTotals: pending.totals, recent: recent.rows, openInvoices,
    };
  });
}
