import { describe, expect, it } from 'vitest';

import { api, formatBytes, HubError, NEXT_REVIEW, shortId, stepState, translateFlowError, type RouteStep } from './api';

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
      return new Response(JSON.stringify({ job_id: '20260101T000000-abcd1234', flow_id: 'f1', status: 'queued' }));
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

  it('sends artifacts and polls job status', async () => {
    const calls: [string, string][] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push([url, String(init?.method ?? 'GET')]);
      return new Response(JSON.stringify({ job_id: '20260101T000000-abcd1234', kind: 'send', status: 'queued' }));
    }) as unknown as typeof fetch;
    const start = await api.send({ artifact_id: 'sha256:b'.slice(0, 71), to: 'graphics-v1a', params: { title: 't' } }, fetcher);
    expect('job_id' in start && start.status === 'queued').toBe(true);
    expect(calls[0]).toEqual(['/api/production/v1/send', 'POST']);
    await api.job('20260101T000000-abcd1234', fetcher);
    expect(calls[1]).toEqual(['/api/production/v1/jobs/20260101T000000-abcd1234', 'GET']);
  });

  it('lists flow templates and starts one without JSON', async () => {
    const calls: [string, string][] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push([url, String(init?.method ?? 'GET')]);
      return new Response(JSON.stringify({
        items: [], job_id: '20260101T000000-abcd1234', flow_id: 'promote-product-x', status: 'queued',
      }));
    }) as unknown as typeof fetch;
    await api.flowTemplates(fetcher);
    const start = await api.startFlowTemplate('promote-product', {
      project_id: 'promo', inputs: { captions: 'sha256:c'.slice(0, 71) }, params: { headline: 'h' },
    }, fetcher);
    expect(start.flow_id).toBe('promote-product-x');
    expect(calls).toEqual([
      ['/api/production/v1/flow-templates', 'GET'],
      ['/api/production/v1/flow-templates/promote-product', 'POST'],
    ]);
  });

  it('translates validate_flow problems into Thai', () => {
    expect(translateFlowError('steps[0].send.params is missing headline, title')).toContain('params ขาด: headline, title');
    expect(translateFlowError('role must be one of music, collect_sfx')).toContain('ต้องเป็นหนึ่งใน: music, collect_sfx');
    expect(translateFlowError('flow launch-1 already exists with a different definition; use a new flow_id'))
      .toContain('ตั้ง flow id ใหม่');
    expect(translateFlowError('steps must be a list of 1-30 steps')).toContain('1-30 ขั้น');
  });

  it('keeps the dry-run send synchronous', async () => {
    const fetcher = respond(200, { send_id: 's1', handoff_id: 'E4-chart-to-graphics', dry_run: true, outputs: [] });
    const start = await api.send({ artifact_id: 'sha256:b'.slice(0, 71), to: 'graphics-v1a', params: {}, dry_run: true }, fetcher);
    expect('dry_run' in start && start.dry_run).toBe(true);
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
