/**
 * Generic client for cells built with solo-cell-kit (goals, decisions, ...): list (all pages), get and
 * stats over `/v1/<plural>`. Read only; adapted from infra/mcp-server/src/cell-store.ts.
 */
import { cellRequest, MAX_PAGES, type CellConfig, type Params } from './core';

export type CellRecord = { id: number; version?: number; [key: string]: any };
export type Filters = Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>;

const PAGE = 500;

export function filterParams(filters: Filters): Params {
  const out: Params = [];
  for (const [name, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) out.push([name, String(item)]);
  }
  return out;
}

export class CellClient {
  constructor(private readonly config: CellConfig) {}

  async list(plural: string, filters: Filters = {}, order: 'asc' | 'desc' = 'asc'): Promise<CellRecord[]> {
    const params = [...filterParams(filters), ['order', order] as [string, string]];
    const items: CellRecord[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await cellRequest(this.config, 'GET', `/v1/${plural}`,
        { params: [...params, ['limit', String(PAGE)], ['offset', String(items.length)]] });
      const batch: CellRecord[] = Array.isArray(result?.items) ? result.items : [];
      items.push(...batch);
      if (batch.length < PAGE) break;
    }
    return items;
  }

  /** One record; null when it does not exist. */
  async get(plural: string, id: number): Promise<CellRecord | null> {
    try {
      return await cellRequest(this.config, 'GET', `/v1/${plural}/${Math.trunc(id)}`);
    } catch (error) {
      if ((error as { code?: string }).code === 'not_found') return null;
      throw error;
    }
  }

  async items(path: string, params: Params = []): Promise<CellRecord[]> {
    const result = await cellRequest(this.config, 'GET', path, { params });
    return Array.isArray(result?.items) ? result.items : [];
  }
}
