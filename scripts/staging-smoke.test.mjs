import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStaging, serviceChecks } from './staging-smoke.mjs';

const environment = {
  SOLO_WEB_PUBLIC_ORIGIN: 'https://web.staging.test',
  ACCOUNTS_API_ORIGIN: 'https://accounts.staging.test',
  INTEGRATIONS_API_ORIGIN: 'https://integrations.staging.test',
  SAAS_CATALOG_API_ORIGIN: 'https://saas.staging.test',
  KNOWLEDGE_API_ORIGIN: 'https://knowledge.staging.test',
};

function healthyFetch(url, options) {
  assert.equal(options.method, 'GET');
  assert.equal(options.redirect, 'manual');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.headers.Cookie, undefined);
  const readiness = url.endsWith('/ready') || url.endsWith('/api/health');
  return Promise.resolve(new Response(JSON.stringify(readiness ? { status: 'ready', source: 'available', auth: 'ready' } : {}), {
    status: readiness ? 200 : 401,
  }));
}

test('checks all four APIs and unauthenticated BFF reads without sending credentials', async () => {
  const result = await checkStaging(environment, { fetch: healthyFetch });
  assert.equal(result.status, 'passed');
  assert.equal(result.checks.length, 13);
  assert.equal(result.authenticated_journey, 'not_checked');
  assert.equal(result.production_readiness, 'not_checked');
});

test('never calls the network for missing or unsafe origins', async () => {
  for (const origin of ['', 'http://localhost:3600', 'https://localhost.', 'https://app.localhost.',
    'https://app.local.', 'https://user:password@example.com', 'https://example.com/path', 'https://127.0.0.1']) {
    let calls = 0;
    const result = await checkStaging(Object.fromEntries(Object.keys(environment).map((key) => [key, origin])), {
      fetch: async () => { calls++; throw new Error('must not be called'); },
    });
    assert.equal(calls, 0);
    assert.equal(result.status, 'failed');
    assert.ok(result.checks.every((check) => check.code === 'origin_missing_or_invalid'));
  }
});

test('a ready API that allows anonymous reads fails the smoke gate', async () => {
  const result = await checkStaging(environment, {
    fetch: async (url, options) => url.endsWith('/api/v1/accounts')
      ? new Response('private-response-must-not-appear', { status: 200 })
      : healthyFetch(url, options),
  });
  assert.equal(result.status, 'failed');
  assert.ok(result.checks.some((check) => check.name === 'accounts.anonymous_read' && check.code === 'unexpected_status'));
  assert.ok(!JSON.stringify(result).includes('private-response-must-not-appear'));
});

test('configuration-required and redirects are failures, not readiness', async () => {
  for (const [status, body] of [[503, { status: 'not_ready' }], [200, { status: 'not_ready' }], [302, { status: 'ready' }]]) {
    const result = await serviceChecks('accounts', environment.ACCOUNTS_API_ORIGIN, 'accounts', {
      fetch: async () => new Response(JSON.stringify(body), { status, headers: { Location: 'https://unapproved.test' } }),
    });
    assert.equal(result[0].status, 'failed');
  }
});

test('network errors and oversized readiness payloads do not leak response or exception text', async () => {
  const marker = 'secret-marker-never-return';
  const result = await checkStaging(environment, { fetch: async () => { throw new Error(marker); } });
  assert.equal(result.status, 'failed');
  assert.ok(!JSON.stringify(result).includes(marker));
  const large = await serviceChecks('accounts', environment.ACCOUNTS_API_ORIGIN, 'accounts', {
    fetch: async () => new Response(JSON.stringify({ status: 'ready', detail: marker.repeat(1000) }), { status: 200 }),
  });
  assert.equal(large[0].code, 'invalid_readiness_response');
  assert.ok(!JSON.stringify(large).includes(marker));
});
