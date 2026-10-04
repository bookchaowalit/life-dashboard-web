export type Count = { value: string; count: number };
export type AppStatus = 'live' | 'mcp_only' | 'paused' | 'planned';
export type ExternalApp = {
  id: string; name: string; category: string; status: AppStatus; api_docs: string;
  note: string | null; section: string; guide: string | null;
};
export type Filters = { q: string; status: string; category: string };
export type Overview = {
  schema_version: 'solo-empire.integrations.v1'; generated_at: string;
  source: { path: string; modified_at: string; status_definitions: { value: string; description: string }[] };
  summary: {
    apps_total: number; apps_matched: number; categories: number; connected: number;
    live: number; mcp_only: number; paused: number; planned: number; with_guide: number;
  };
  signals: { statuses: Count[]; categories: Count[]; sections: Count[] };
  apps: ExternalApp[];
};
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function getOverview(filters: Filters, token: string, signal: AbortSignal): Promise<Overview> {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  const response = await fetch(`/api/integrations/v1/integrations?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error?.message || 'โหลดข้อมูลไม่สำเร็จ', response.status);
  return data as Overview;
}
