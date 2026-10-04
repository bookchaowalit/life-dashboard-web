import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, PATCH, POST } from '../app/api/[service]/[...path]/route';

const HOST = '127.0.0.1:3600';

type Upstream = { url: string; init: RequestInit };
let upstream: Upstream[] = [];

const context = (service: string, route: string) => ({ params: Promise.resolve({ service, path: route.split('/') }) });

function request(method: string, url: string, headers: Record<string, string>, body?: string) {
  return new NextRequest(url, { method, headers, body });
}

beforeEach(() => {
  upstream = [];
  vi.stubEnv('PORT', '');
  vi.stubEnv('SOLO_WEB_LOCAL_DEMO', 'true');
  vi.stubEnv('PRODUCTION_HUB_API_ORIGIN', 'http://127.0.0.1:3460');
  vi.stubEnv('PRODUCTION_HUB_API_TOKEN', 'test-token');
  vi.stubEnv('TODAY_API_ORIGIN', 'http://127.0.0.1:3410');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    upstream.push({ url, init });
    return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const SEND = `http://${HOST}/api/production/v1/send`;

describe('solo-web proxy guard for state-changing requests', () => {
  it('refuses a cross-site POST without contacting the hub', async () => {
    const response = await POST(request('POST', SEND, {
      host: HOST, origin: 'https://evil.example', 'content-type': 'application/json',
    }, '{}'), context('production', 'v1/send'));
    expect(response.status).toBe(403);
    expect(upstream).toHaveLength(0);
  });

  it('refuses a cross-site text/plain POST', async () => {
    const response = await POST(request('POST', SEND, {
      host: HOST, 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain',
    }, '{}'), context('production', 'v1/send'));
    expect(response.status).toBe(403);
    expect(upstream).toHaveLength(0);
  });

  it('refuses a same-origin POST that is not JSON', async () => {
    const response = await POST(request('POST', SEND, {
      host: HOST, origin: `http://${HOST}`, 'content-type': 'text/plain',
    }, '{}'), context('production', 'v1/send'));
    expect(response.status).toBe(415);
    expect(upstream).toHaveLength(0);
  });

  it('refuses a DNS-rebinding Host', async () => {
    const response = await POST(request('POST', 'http://rebind.example:3600/api/production/v1/send', {
      host: 'rebind.example:3600', origin: 'http://rebind.example:3600', 'content-type': 'application/json',
    }, '{}'), context('production', 'v1/send'));
    expect(response.status).toBe(403);
    expect(upstream).toHaveLength(0);
  });

  it('refuses a cross-site PATCH to Today', async () => {
    const response = await PATCH(request('PATCH', `http://${HOST}/api/today/v1/tasks/3`, {
      host: HOST, origin: 'https://evil.example', 'content-type': 'application/json',
    }, '{"status":"done"}'), context('today', 'v1/tasks/3'));
    expect(response.status).toBe(403);
    expect(upstream).toHaveLength(0);
  });

  it('proxies a same-origin JSON POST with the server-side hub token', async () => {
    const response = await POST(request('POST', SEND, {
      host: HOST, origin: `http://${HOST}`, 'content-type': 'application/json; charset=utf-8',
    }, '{"project":"p"}'), context('production', 'v1/send'));
    expect(response.status).toBe(200);
    expect(upstream).toHaveLength(1);
    expect(upstream[0].url).toBe('http://127.0.0.1:3460/api/v1/send');
    expect(new Headers(upstream[0].init.headers).get('authorization')).toBe('Bearer test-token');
  });
});

describe('solo-web proxy guard for reads', () => {
  it('denies an anonymous local read unless demo is explicitly enabled', async () => {
    vi.stubEnv('SOLO_WEB_LOCAL_DEMO', 'false');
    const response = await GET(request('GET', `http://${HOST}/api/today/v1/today`, { host: HOST }), context('today', 'v1/today'));
    expect(response.status).toBe(401);
    expect(upstream).toHaveLength(0);
  });

  it('denies anonymous HTTPS reads and ignores a forged forwarded host', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SOLO_WEB_PUBLIC_ORIGIN', 'https://solo.example');
    const response = await GET(request('GET', 'https://solo.example/api/accounts/v1/accounts', {
      host: 'solo.example', 'x-forwarded-host': 'localhost:3600', authorization: 'Bearer fake-owner',
    }), context('accounts', 'v1/accounts'));
    expect(response.status).toBe(401);
    expect(upstream).toHaveLength(0);
  });
  it('refuses a rebinding Host', async () => {
    const response = await GET(request('GET', 'http://rebind.example:3600/api/today/v1/today', {
      host: 'rebind.example:3600',
    }), context('today', 'v1/today'));
    expect(response.status).toBe(403);
    expect(upstream).toHaveLength(0);
  });

  it('proxies a loopback read', async () => {
    const response = await GET(request('GET', `http://localhost:3600/api/today/v1/today`, {
      host: 'localhost:3600',
    }), context('today', 'v1/today'));
    expect(response.status).toBe(200);
    expect(upstream[0].url).toBe('http://127.0.0.1:3410/api/v1/today');
  });
});
