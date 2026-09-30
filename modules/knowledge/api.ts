export type Document = {
  id: string; path: string; title: string; description: string | null;
  document_type: string; status: string; root_area: string; tags: string[];
  has_frontmatter: boolean; internal_link_count: number; created: string | null;
  updated: string | null; parent: string | null; related_count: number;
};
export type Filters = { q: string; root_area: string; document_type: string; status: string; tag: string; offset: number };
export type Count = { value: string; count: number };
export type Overview = {
  schema_version: 'solo-empire.knowledge.v1'; generated_at: string;
  catalog: { modified_at: string; excluded_records: number };
  summary: { documents_total: number; documents_matched: number; root_areas: number; linked_documents: number; graph_edges: number; with_frontmatter: number };
  shelves: { key: string; label: string; count: number; linked: number }[];
  signals: { document_types: Count[]; statuses: Count[]; top_tags: Count[] };
  documents: Document[];
};
export type Detail = {
  document: Document & { related: string[]; children: string[]; aliases: string[] };
  neighbors: { relation: 'parent' | 'related' | 'child'; document: Document }[];
};
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(path: string, token: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error?.message || 'โหลดข้อมูลไม่สำเร็จ', response.status);
  return data as T;
}
export const pageSize = 30;
export function getOverview(filters: Filters, token: string, signal: AbortSignal) {
  const params = new URLSearchParams({ ...filters, offset: String(filters.offset), limit: String(pageSize) });
  return request<Overview>(`/api/knowledge/v1/knowledge?${params}`, token, signal);
}
export function getDetail(path: string, token: string, signal: AbortSignal) {
  return request<Detail>(`/api/knowledge/v1/knowledge/document?path=${encodeURIComponent(path)}`, token, signal);
}
