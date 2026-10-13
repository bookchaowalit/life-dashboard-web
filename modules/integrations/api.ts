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
    apps_total: number; apps_matched: number; categories: number; connected: number; supported_boundaries?: number;
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

export type Availability = 'available' | 'unavailable' | 'unknown';
export type Channel = 'plugin' | 'connector' | 'manual_mcp';
export type PlatformFilters = { platform: string; app: string; route: string; q: string };
export type PlatformRoute = Channel | 'unknown' | 'unavailable' | 'paused' | 'needs_review';
export type Capability = {
  platform_id: string; app_id: string; channel: Channel; availability: Availability;
  entry_id: string | null; endpoint_url: string | null; evidence_url: string; captured_at: string;
};
export type PlatformRow = {
  id: string; platform_id: string; app_id: string; app_name: string; category: string; registry_status: AppStatus;
  channels: Record<Channel, { availability: Availability; entries: Capability[] }>;
  recommended_route: PlatformRoute;
  connection: {
    installation: 'installed' | 'not_installed' | 'unknown';
    authentication: 'connected' | 'disconnected' | 'unknown'; health: 'verified' | 'failed' | 'unknown';
    checked_at: string | null; evidence_id: string | null; freshness: 'unknown' | 'fresh' | 'stale';
  };
};
export type PlatformOverview = {
  schema_version: 'solo-empire.platform-integrations.v1'; generated_at: string;
  snapshot: { captured_at: string; freshness: 'fresh' | 'stale'; revision: string; lineage: Record<string, unknown> };
  platforms: { id: string; name: string; mcp_transports: string[]; docs_url: string }[];
  summary: { rows_total: number; rows_matched: number; native_available: number; manual_mcp_available: number; installed: number; authenticated: number; health_verified: number; paused: number; unknown: number; needs_review: number };
  rows: PlatformRow[];
};

// Guard the fields the view consumes so malformed responses cannot replace the registry.
function parsePlatforms(value: unknown): PlatformOverview {
  const data = value as PlatformOverview;
  const strings = (...items: unknown[]) => items.every(item => typeof item === 'string');
  const nullableString = (item: unknown) => item === null || typeof item === 'string';
  const oneOf = (item: unknown, options: string[]) => typeof item === 'string' && options.includes(item);
  const channelNames: Channel[] = ['plugin', 'connector', 'manual_mcp'];
  const available = ['available', 'unavailable', 'unknown'];
  const counts = ['rows_total', 'rows_matched', 'native_available', 'manual_mcp_available', 'installed', 'authenticated', 'health_verified', 'paused', 'unknown', 'needs_review'] as const;
  if (!data || data.schema_version !== 'solo-empire.platform-integrations.v1' || !strings(data.generated_at) ||
      !data.snapshot || !strings(data.snapshot.captured_at, data.snapshot.revision) || !oneOf(data.snapshot.freshness, ['fresh', 'stale']) ||
      !data.summary || !counts.every(key => Number.isSafeInteger(data.summary[key]) && data.summary[key] >= 0) ||
      !Array.isArray(data.platforms) || !data.platforms.every(platform => platform && strings(platform.id, platform.name, platform.docs_url) && Array.isArray(platform.mcp_transports)) ||
      !Array.isArray(data.rows) || !data.rows.every(row => row && strings(row.id, row.platform_id, row.app_id, row.app_name, row.category, row.registry_status) &&
        oneOf(row.recommended_route, [...channelNames, 'unknown', 'unavailable', 'paused', 'needs_review']) &&
        row.channels && channelNames.every(channel => row.channels[channel] && oneOf(row.channels[channel].availability, available) && Array.isArray(row.channels[channel].entries) &&
          row.channels[channel].entries.every(entry => entry && strings(entry.evidence_url, entry.captured_at))) &&
        row.connection && oneOf(row.connection.installation, ['installed', 'not_installed', 'unknown']) &&
        oneOf(row.connection.authentication, ['connected', 'disconnected', 'unknown']) && oneOf(row.connection.health, ['verified', 'failed', 'unknown']) &&
        oneOf(row.connection.freshness, ['fresh', 'stale', 'unknown']) && nullableString(row.connection.checked_at) && nullableString(row.connection.evidence_id))) {
    throw new ApiError('รูปแบบข้อมูลแพลตฟอร์มไม่ถูกต้อง', 200);
  }
  return data;
}

export async function getPlatforms(filters: PlatformFilters, token: string, signal: AbortSignal): Promise<PlatformOverview> {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  let response: Response;
  try {
    response = await fetch(`/api/integrations/v1/integrations/platforms?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store', signal });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new ApiError('เชื่อมต่อข้อมูลแพลตฟอร์มไม่ได้ กรุณาลองอีกครั้ง', 0);
  }
  if (!response.ok) throw new ApiError(response.status === 503 ? 'ยังไม่มีข้อมูลแพลตฟอร์มที่อ่านได้ กรุณาลองใหม่ภายหลัง' : 'อ่านข้อมูลแพลตฟอร์มไม่สำเร็จ', response.status);
  try { return parsePlatforms(await response.json()); }
  catch { throw new ApiError('รูปแบบข้อมูลแพลตฟอร์มไม่ถูกต้อง', response.status); }
}
