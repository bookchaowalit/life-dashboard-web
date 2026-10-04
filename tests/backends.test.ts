import { describe, expect, it } from 'vitest';

import { BACKENDS, isAllowed, resolveOrigin } from '../lib/backends';

const SHA = `sha256:${'a'.repeat(64)}`;

describe('backend registry', () => {
  it('gives every module its own origin variable', () => {
    const envs = Object.values(BACKENDS).map((backend) => backend.originEnv);
    expect(new Set(envs).size).toBe(envs.length);
  });

  it('allows only registered methods and routes', () => {
    expect(isAllowed(BACKENDS.today, 'GET', 'v1/today')).toBe(true);
    expect(isAllowed(BACKENDS.today, 'PATCH', 'v1/tasks/12')).toBe(true);
    expect(isAllowed(BACKENDS.today, 'POST', 'v1/tasks/12')).toBe(false);
    expect(isAllowed(BACKENDS.knowledge, 'GET', 'v1/knowledge/document')).toBe(true);
    expect(isAllowed(BACKENDS.knowledge, 'POST', 'v1/knowledge')).toBe(false);
    expect(isAllowed(BACKENDS.production, 'GET', `v1/artifacts/${SHA}/content`)).toBe(true);
    expect(isAllowed(BACKENDS.production, 'POST', 'v1/projects/pod-1/package')).toBe(true);
    expect(isAllowed(BACKENDS.production, 'GET', 'v1/artifacts/../../etc')).toBe(false);
    expect(isAllowed(BACKENDS.production, 'GET', 'v1/flows')).toBe(true);
    expect(isAllowed(BACKENDS.production, 'POST', 'v1/flows/pod_launch-2/resume')).toBe(true);
    expect(isAllowed(BACKENDS.production, 'POST', 'v1/flows/pod/cancel')).toBe(false);
    expect(isAllowed(BACKENDS.production, 'GET', 'v1/jobs/20260101T000000-abcd1234')).toBe(true);
    // the proxy filters paths, not methods; the hub itself 404s a POST to a read-only job route
    expect(isAllowed(BACKENDS.production, 'GET', 'v1/jobs/other-id')).toBe(false);
    expect(isAllowed(BACKENDS.production, 'GET', 'v1/flow-templates')).toBe(true);
    expect(isAllowed(BACKENDS.production, 'POST', 'v1/flow-templates/promote-product')).toBe(true);
    expect(isAllowed(BACKENDS.production, 'POST', 'v1/flow-templates/Bad_Id')).toBe(false);
    expect(isAllowed(BACKENDS.production, 'GET', 'v1/path')).toBe(true);
    expect(isAllowed(BACKENDS.production, 'GET', 'v1/formats')).toBe(true);
    expect(isAllowed(BACKENDS.production, 'GET', 'v1/path/../../etc')).toBe(false);
    expect(isAllowed(BACKENDS.cloud, 'GET', 'v1/paas/execute')).toBe(false);
    expect(isAllowed(BACKENDS.accounts, 'GET', 'v1/accounts')).toBe(true);
    expect(isAllowed(BACKENDS.accounts, 'POST', 'v1/accounts')).toBe(false);
    expect(isAllowed(BACKENDS.accounts, 'GET', 'v1/accounts/anonymous')).toBe(false);
  });

  it('defaults to loopback and refuses remote origins unless explicitly allowed over HTTPS', () => {
    expect(resolveOrigin(BACKENDS.today, {})).toEqual({ ok: true, origin: 'http://127.0.0.1:3410' });
    expect(resolveOrigin(BACKENDS.today, { TODAY_API_ORIGIN: 'http://10.0.0.5:3410' }).ok).toBe(false);
    expect(resolveOrigin(BACKENDS.today, { TODAY_API_ORIGIN: 'https://today.internal', TODAY_API_ALLOW_REMOTE: 'true' }))
      .toEqual({ ok: true, origin: 'https://today.internal' });
    expect(resolveOrigin(BACKENDS.today, { TODAY_API_ORIGIN: 'http://today.internal', TODAY_API_ALLOW_REMOTE: 'true' }).ok)
      .toBe(false);
    expect(resolveOrigin(BACKENDS.cloud, { CLOUD_API_ORIGIN: 'not a url' }).ok).toBe(false);
  });

  it('adds server-side headers only for production mutations', () => {
    expect(BACKENDS.production.serverHeaders?.({ PRODUCTION_HUB_API_TOKEN: 't' })).toEqual({
      'X-Hub-Client': 'console', Authorization: 'Bearer t',
    });
    expect(BACKENDS.today.serverHeaders).toBeUndefined();
  });
});
