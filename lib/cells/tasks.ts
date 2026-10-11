/** Tasks API client (empire-platform), adapted from infra/mcp-server/src/task-store.ts. Tasks are addressed by number. */
import { cellRequest, CellError, dateOnly, MAX_PAGES, type CellConfig, type Params } from './core';

export interface Task {
  number: number; title: string; status: string; priority: number | null; due_date: string | null;
  project: string | null; category: string | null; completed_at: string | null; progress_percent: number;
}
export interface TaskFilters { status?: string[]; completed_from?: string; due_before?: string; include_archived?: boolean }

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const PAGE = 200;

function toTask(raw: Record<string, any>): Task {
  return {
    number: Number(raw.number), title: String(raw.title ?? ''), status: String(raw.status ?? 'todo'),
    priority: typeof raw.priority === 'number' ? raw.priority : null, due_date: dateOnly(raw.due_date),
    project: raw.project ?? null, category: raw.category ?? null, completed_at: raw.completed_at ?? null,
    progress_percent: Number(raw.progress_percent) || 0,
  };
}

export class TasksClient {
  constructor(private readonly config: CellConfig) {}

  /** Every matching task (cursor paging by task number). */
  async list(filters: TaskFilters = {}): Promise<Task[]> {
    const params: Params = [];
    for (const status of filters.status ?? []) params.push(['status', status]);
    if (filters.completed_from) params.push(['completed_from', filters.completed_from]);
    if (filters.due_before) params.push(['due_before', filters.due_before]);
    if (filters.include_archived) params.push(['include_archived', 'true']);
    const items: Task[] = [];
    let after: number | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query: Params = [...params, ['limit', String(PAGE)]];
      if (after) query.push(['after', String(after)]);
      const result = await cellRequest(this.config, 'GET', '/v1/tasks', { params: query });
      const batch: Record<string, any>[] = Array.isArray(result?.items) ? result.items : [];
      items.push(...batch.map(toTask));
      if (batch.length < PAGE) break;
      after = Number(batch[batch.length - 1]?.number) || null;
      if (!after) break;
    }
    return items;
  }

  private async uuid(number: number): Promise<string> {
    const raw = await cellRequest(this.config, 'GET', `/v1/tasks/number/${Math.trunc(number)}`);
    if (!raw?.id) throw new CellError('upstream', this.config.cell.id);
    return String(raw.id);
  }

  /** `done` goes through the complete endpoint (the service stamps completed_at); other statuses are a PATCH. */
  async setStatus(number: number, status: TaskStatus): Promise<void> {
    if (!Number.isInteger(number) || number <= 0 || !TASK_STATUSES.includes(status)) throw new CellError('invalid', this.config.cell.id);
    const id = await this.uuid(number);
    if (status === 'done') await cellRequest(this.config, 'POST', `/v1/tasks/${id}/complete`);
    else await cellRequest(this.config, 'PATCH', `/v1/tasks/${id}`, { body: { status } });
  }
}
