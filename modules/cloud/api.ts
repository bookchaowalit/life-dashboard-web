export type ProviderStatus = 'healthy' | 'configured' | 'not_configured' | 'error' | string;

export type ProviderInventory = {
  id: string;
  name?: string;
  status: ProviderStatus;
  partial?: boolean;
  has_more?: boolean;
  total_known?: number | null;
  summary?: { resources?: number; [key: string]: unknown };
  resources?: Array<Record<string, unknown>>;
  next_action?: string;
  error_class?: string;
};

export type InventoryResponse = {
  schema_version: string;
  mode: 'live' | 'offline' | string;
  checked_at?: string;
  read_only?: boolean;
  execution_enabled?: boolean;
  write_attempted?: boolean;
  providers: ProviderInventory[];
  summary: {
    providers: number;
    healthy: number;
    configured: number;
    not_configured: number;
    errors: number;
    resources: number;
  };
};

export type CloudUsageResponse = {
  schema_version: string;
  mode: 'live' | 'offline' | string;
  checked_at?: string;
  read_only?: boolean;
  execution_enabled?: boolean;
  write_attempted?: boolean;
  accounts?: Array<{ provider?: string; status?: string; plan_type?: string | null; metadata_ref?: string }>;
  inventory: InventoryResponse;
  usage?: {
    status?: string;
    resource_count?: number;
    healthy_provider_count?: number;
    r2_object_count?: number;
    r2_payload_gib?: number;
    vercel_charge_count?: number;
  };
  summary?: {
    account_records?: number;
    providers?: number;
    healthy_providers?: number;
    resource_count?: number;
    attention_count?: number;
    r2_status?: string;
    vercel_billing_status?: string;
  };
  errors?: Array<{ source?: string; error_class?: string }>;
};

export type ActionPolicy = {
  schema_version: string;
  approval?: { max_age_seconds?: number; required?: boolean; expiry_rule?: string };
  providers: Array<{
    id: string;
    name?: string;
    actions?: Record<string, { support?: string; adapter?: string; surface?: string }>;
  }>;
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, token = ''): Promise<T> {
  const response = await fetch(path, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(response.status, error?.code || 'cloud_api_error', error?.message || `Cloud API ${response.status}`);
  }
  return payload as T;
}

export function getUsage(live: boolean, token?: string): Promise<CloudUsageResponse> {
  return request<CloudUsageResponse>(`/api/cloud/v1/cloud/usage?live=${live ? 'true' : 'false'}`, token);
}

export function getInventory(live: boolean, token?: string): Promise<InventoryResponse> {
  return request<InventoryResponse>(`/api/cloud/v1/paas/inventory?live=${live ? 'true' : 'false'}`, token);
}

export function getActionPolicy(token?: string): Promise<ActionPolicy> {
  return request<ActionPolicy>('/api/cloud/v1/paas/actions', token);
}
