import { describe, expect, it } from 'vitest';

import { api, formatBytes, HubError, NEXT_REVIEW, shortId, stepState, type RouteStep } from './api';

const ID = `sha256:${'a'.repeat(64)}`;

const respond = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

describe('api client', () => {
  it('surfaces hub error messages', async () => {
    const fetcher = respond(422, { error: { code: 'workspace_error', message: 'ไม่มีไฟล์ที่อนุมัติ' } });
    await expect(api.packageProject('pod-1', fetcher)).rejects.toMatchObject({
      code: 'workspace_error', message: 'ไม่มีไฟล์ที่อนุมัติ', status: 422,
    });
  });

  it('reports network and invalid responses in Thai', async () => {
    const offline = (async () => { throw new TypeError('offline'); }) as typeof fetch;
    await expect(api.health(offline)).rejects.toBeInstanceOf(HubError);
    const html = (async () => new Response('<html>', { status: 502 })) as typeof fetch;
    await expect(api.health(html)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('builds artifact filters into the query string', async () => {
    let seen = '';
    const fetcher = (async (url: string) => {
      seen = url;
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await api.artifacts({ kind: 'chart.svg', tool: '', project: 'rep-1' }, fetcher);
    expect(seen).toBe('/api/production/v1/artifacts?kind=chart.svg&project=rep-1');
  });

  it('posts flow definitions and resumes by id', async () => {
    const calls: [string, string][] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push([url, String(init?.method ?? 'GET')]);
      return new Response(JSON.stringify({ flow_id: 'f1', project_id: 'p', status: 'completed', error: null, steps: [] }));
    }) as unknown as typeof fetch;
    await api.runFlow({ schema_version: 'hub-flow.v1' }, fetcher);
    await api.resumeFlow('f1', fetcher);
    await api.flow('f1', fetcher);
    expect(calls).toEqual([
      ['/api/production/v1/flows', 'POST'],
      ['/api/production/v1/flows/f1/resume', 'POST'],
      ['/api/production/v1/flows/f1', 'GET'],
    ]);
  });
});

describe('conversion routes', () => {
  it('builds the path query', async () => {
    let seen = '';
    const fetcher = (async (url: string) => {
      seen = url;
      return new Response(JSON.stringify({ source: '.scad', target: 'stl', routes: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await api.path({ from: '.scad', to: 'effect.printed-part', implementedOnly: true }, fetcher);
    expect(seen).toBe('/api/production/v1/path?from=.scad&to=effect.printed-part&implemented_only=1');
  });

  it('labels each step by what it needs', () => {
    const base: RouteStep = {
      from: 'a', to: 'b', converter: 'c', tool: 't', status: 'available', level: 'L1', requires: ['openscad'], approval: null,
    };
    expect(stepState({ ...base, status: 'implemented' }).label).toBe('ใช้ได้แล้ว');
    expect(stepState({ ...base, missing: ['openscad'], runnable: false }).label).toBe('ต้องติดตั้ง openscad');
    expect(stepState({ ...base, missing: [], runnable: true }).pill).toBe('needs_review');
    expect(stepState({ ...base, status: 'planned' }).label).toBe('อยู่ในแผน');
  });
});

describe('helpers', () => {
  it('formats sizes and ids', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(15 * 1024 * 1024)).toBe('15 MB');
    expect(shortId(ID)).toBe('aaaaaaaaaaaa');
  });

  it('mirrors hub review transitions', () => {
    expect(NEXT_REVIEW.delivered).toEqual([]);
    expect(NEXT_REVIEW.approved).toContain('delivered');
  });
});
