export type Count = { value: string; count: number };
export type CardBucket = 'no_card' | 'card_required' | 'verify';
export type Service = {
  id: string; service: string; category: string; subcategory: string | null; free_tier_summary: string | null;
  free_limits: string | null; credit_card_required: string | null; commercial_use: string | null; sleeps_pauses: string | null;
  bandwidth: string | null; storage: string | null; requests_compute: string | null; regions: string | null;
  custom_domain: string | null; api: string | null; open_standard_portability: string | null; vendor_lock_in_risk: string | null;
  overage_paid_entry: string | null; free_forever: string | null; self_host_alternative: string | null;
  best_use_case: string | null; replaces: string | null; notes: string | null; last_verified: string | null;
  official_url: string | null; card_bucket: CardBucket; commercial_bucket: 'yes' | 'verify';
};
export type Stack = { use_case: string; layer: string; primary_free_option: string | null; fallback_1: string | null; fallback_2: string | null; why: string | null };
export type Filters = { q: string; category: string; card: string; commercial: string; offset: number };
export type Overview = {
  schema_version: 'solo-empire.saas-catalog.v1'; generated_at: string;
  source: { path: string; snapshot_date: string | null; catalog_date: string | null; rows_requiring_current_limit_verification: string | null; modified_at: string };
  summary: { services_total: number; services_matched: number; categories: number; no_card: number; commercial_yes: number; needs_verification: number };
  signals: { categories: Count[]; card: Count[]; commercial: Count[]; lock_in: Count[] };
  starter_stacks: Stack[];
  services: Service[];
};
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export const pageSize = 30;
export async function getOverview(filters: Filters, token: string, signal: AbortSignal): Promise<Overview> {
  const params = new URLSearchParams(Object.entries({ ...filters, offset: String(filters.offset), limit: String(pageSize) }).filter(([, value]) => value !== ''));
  const response = await fetch(`/api/saas/v1/saas?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error?.message || 'โหลดข้อมูลไม่สำเร็จ', response.status);
  return data as Overview;
}
