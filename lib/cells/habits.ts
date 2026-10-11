/** Habits cell client, adapted from infra/mcp-server/src/habits-store.ts. The service owns streaks. */
import { cellRequest, CellError, dateOnly, MAX_PAGES, type CellConfig, type Params } from './core';

export interface Habit {
  id: number; name: string; category: string | null; frequency: string | null; status: string; priority: number;
  current_streak: number; best_streak: number; last_completed_at: string | null; target_duration_minutes: number | null;
}
export interface HabitLog { habit_id: number; log_date: string; completed: boolean }

const PAGE = 500;

async function pages(config: CellConfig, path: string, params: Params): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await cellRequest(config, 'GET', path, { params: [...params, ['limit', String(PAGE)], ['offset', String(items.length)]] });
    const batch = Array.isArray(result?.items) ? result.items : [];
    items.push(...batch);
    if (batch.length < PAGE) break;
  }
  return items;
}

export class HabitsClient {
  constructor(private readonly config: CellConfig) {}

  async habits(status = 'active'): Promise<Habit[]> {
    const raw = await pages(this.config, '/v1/habits', [['status', status]]);
    return raw.map((item) => ({
      id: Number(item.id), name: String(item.name ?? ''), category: item.category ?? null, frequency: item.frequency ?? null,
      status: String(item.status ?? status), priority: Number(item.priority) || 0,
      current_streak: Number(item.current_streak) || 0, best_streak: Number(item.best_streak) || 0,
      last_completed_at: dateOnly(item.last_completed_at), target_duration_minutes: item.target_duration_minutes ?? null,
    }));
  }

  async logs(from: string, to: string): Promise<HabitLog[]> {
    const raw = await pages(this.config, '/v1/habit-logs', [['from', from], ['to', to], ['order', 'asc']]);
    return raw.map((item) => ({ habit_id: Number(item.habit_id), log_date: String(dateOnly(item.log_date)), completed: Boolean(item.completed) }));
  }

  /** Upserts one day's log (idempotent: the same call twice leaves the same state). */
  async setLog(id: number, date: string, completed: boolean): Promise<void> {
    if (!Number.isInteger(id) || id <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new CellError('invalid', this.config.cell.id);
    await cellRequest(this.config, 'PUT', `/v1/habits/${id}/logs/${date}`, { body: { completed } });
  }
}
