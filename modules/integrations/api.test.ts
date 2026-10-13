import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, getPlatforms } from './api';

afterEach(() => vi.unstubAllGlobals());
const payload = {
  schema_version: 'solo-empire.platform-integrations.v1', generated_at: '2026-10-13T00:00:00Z',
  snapshot: { captured_at: '2026-10-12T00:00:00Z', freshness: 'fresh', revision: 'r1', lineage: {} },
  platforms: [], rows: [], summary: { rows_total: 0, rows_matched: 0, native_available: 0, manual_mcp_available: 0, installed: 0, authenticated: 0, health_verified: 0, paused: 0, unknown: 0, needs_review: 0 },
};

it('requests platform inventory only through the exact BFF with encoded filters', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
  vi.stubGlobal('fetch', fetcher);
  const signal = new AbortController().signal;
  await getPlatforms({ platform: 'claude-code', app: 'github', route: 'plugin', q: 'a & b' }, '', signal);
  expect(fetcher).toHaveBeenCalledWith('/api/integrations/v1/integrations/platforms?platform=claude-code&app=github&route=plugin&q=a+%26+b', { headers: {}, cache: 'no-store', signal });
});

it('rejects malformed successful payloads without exposing backend data', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rows: '/private/raw' }) }));
  await expect(getPlatforms({ platform: 'codex-app', app: '', route: '', q: '' }, '', new AbortController().signal)).rejects.toMatchObject({ message: 'รูปแบบข้อมูลแพลตฟอร์มไม่ถูกต้อง' });
});

it('reports network failure safely', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private host')));
  await expect(getPlatforms({ platform: 'codex-app', app: '', route: '', q: '' }, '', new AbortController().signal)).rejects.toMatchObject({ status: 0, message: 'เชื่อมต่อข้อมูลแพลตฟอร์มไม่ได้ กรุณาลองอีกครั้ง' });
});

it('keeps unavailable snapshot and raw backend errors out of the user message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: { message: '/private/snapshot failed' } }) }));
  await expect(getPlatforms({ platform: 'codex-app', app: '', route: '', q: '' }, '', new AbortController().signal)).rejects.toEqual(new ApiError('ยังไม่มีข้อมูลแพลตฟอร์มที่อ่านได้ กรุณาลองใหม่ภายหลัง', 503));
});

it('handles non-JSON errors safely and retains the status', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => { throw new Error('private response'); } }));
  await expect(getPlatforms({ platform: 'codex-app', app: '', route: '', q: '' }, '', new AbortController().signal)).rejects.toMatchObject({ status: 401, message: 'อ่านข้อมูลแพลตฟอร์มไม่สำเร็จ' });
});
