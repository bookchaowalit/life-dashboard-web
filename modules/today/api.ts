export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled';

export type GoalLink = {
  id: number;
  title: string;
  status?: string | null;
  progress_percent?: number | null;
  due_date?: string | null;
  link_type?: string;
};

export type ProjectLink = {
  id: number;
  name: string;
  slug: string;
  status?: string | null;
  progress_percent?: number | null;
  relation_type?: string;
};

export type TodayTask = {
  id: number;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: number;
  project?: string | null;
  category?: string | null;
  due_date?: string | null;
  estimated_minutes?: number | null;
  actual_minutes?: number | null;
  completed_at?: string | null;
  progress_percent: number;
  legacy_project?: string | null;
  links: { goals: GoalLink[]; projects: ProjectLink[] };
};

export type TodayResponse = {
  schema_version: 'solo-empire.today.v1';
  generated_at: string;
  mode: 'live';
  source: string;
  date: string;
  summary: { open: number; in_progress: number; blocked: number; overdue: number; due_today: number };
  tasks: TodayTask[];
};

const apiBase = '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || `Today API ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export function getToday(date: string): Promise<TodayResponse> {
  return request<TodayResponse>(`/api/today/v1/today?date=${encodeURIComponent(date)}&limit=50`);
}

export function updateTask(id: number, patch: Partial<Pick<TodayTask, 'status' | 'priority' | 'progress_percent' | 'due_date' | 'estimated_minutes' | 'actual_minutes'>>): Promise<{ task: TodayTask }> {
  return request<{ task: TodayTask }>(`/api/today/v1/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}
