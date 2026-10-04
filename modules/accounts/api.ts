export type Count = { value: string; count: number };
export type GroupKind = 'identity' | 'brand' | 'existing';
export type Account = {
  group_id: string; group_kind: GroupKind; platform: string; name: string; purpose: string;
  status: string; face_visible: boolean | null; evidence: string | null;
};
export type Group = {
  id: string; kind: GroupKind; label: string; description: string; privacy: string | null;
  face_visible: boolean | null; account_count: number;
};
export type Filters = { q: string; status: string; platform: string; kind: string };
export type Overview = {
  schema_version: 'solo-empire.accounts.v1'; generated_at: string;
  source: { path: string; updated: string | null; modified_at: string; status_definitions: { value: string; description: string }[] };
  summary: { accounts_total: number; accounts_matched: number; groups: number; platforms: number; active: number; needs_attention: number };
  signals: { statuses: Count[]; platforms: Count[]; kinds: Count[] };
  anonymous: { isolation_required: boolean; identities: number; platform_slots: number; by_status: Count[] };
  groups: Group[];
  accounts: Account[];
};
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function getOverview(filters: Filters, token: string, signal: AbortSignal): Promise<Overview> {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  const response = await fetch(`/api/accounts/v1/accounts?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error?.message || 'โหลดข้อมูลไม่สำเร็จ', response.status);
  return data as Overview;
}
