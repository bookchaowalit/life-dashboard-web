/** CRM ledger client (income instance), adapted from infra/mcp-server/src/crm-ledger.ts. Read only. */
import { cellRequest, type CellConfig } from './core';

export type LedgerRow = Record<string, any>;
export type Totals = Record<string, number>;

const PREFIX = '/api/v1/crm/ledger';
const clean = (params: Record<string, string | number | boolean | undefined>): Array<[string, string]> =>
  Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]);

export class LedgerClient {
  constructor(private readonly config: CellConfig) {}

  /** Newest rows and the totals per currency for the same filters. */
  async revenue(filters: { since?: string; until?: string; received?: boolean; limit?: number } = {}): Promise<{ rows: LedgerRow[]; totals: Totals }> {
    const out = await cellRequest(this.config, 'GET', '/revenue', {
      pathPrefix: PREFIX,
      params: clean({ since: filters.since, until: filters.until, received: filters.received, limit: Math.min(filters.limit ?? 20, 500) }),
    });
    const totals: Totals = {};
    for (const [currency, value] of Object.entries(out?.totals ?? {})) totals[currency] = Number(value) || 0;
    return { rows: Array.isArray(out?.items) ? out.items : [], totals };
  }

  async invoices(status: string, limit = 100): Promise<LedgerRow[]> {
    const out = await cellRequest(this.config, 'GET', '/invoices', { pathPrefix: PREFIX, params: clean({ status, limit }) });
    return Array.isArray(out?.items) ? out.items : [];
  }
}
