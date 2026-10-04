import { spawnSync } from 'node:child_process';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import { serviceAuthorization } from '../lib/auth';

// This cross-language check requires a Python environment with the installed
// packages/service-auth distribution. Native JS tests remain independently runnable.
const python = process.env.SERVICE_AUTH_PYTHON;
const parity = python ? describe : describe.skip;
const verify = `
import json, sys
from service_auth import AuthError, AuthPolicy
request = json.load(sys.stdin)
results = []
for changes in request['cases']:
    p = {**request['base'], **changes}
    policy = AuthPolicy(p['issuer'], p['audience'], p['public_key'], frozenset([p['subject']]), p['scope'])
    try:
        identity = policy.authenticate({'authorization': p['authorization']})
        results.append({'status': 200, 'scope': identity.scope, 'tenant_id': identity.tenant_id})
    except AuthError as error:
        results.append({'status': error.status, 'code': error.code})
print(json.dumps(results))
`;

parity('Solo Web signer and installed Python service verifier', () => {
  const services = [
    ['accounts', 'accounts-api', 'accounts:read'],
    ['integrations', 'integrations-api', 'integrations:read'],
    ['saas', 'saas-catalog-api', 'saas:read'],
    ['knowledge', 'knowledge-api', 'knowledge:read'],
  ];
  it.each(services)('%s token is accepted only by its declared backend', async (service, audience, scope) => {
    const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
    const env = {
      SOLO_WEB_PUBLIC_ORIGIN: 'https://solo.example.test/',
      SOLO_WEB_OWNER_SUBJECTS: JSON.stringify(['test-owner']),
      SOLO_WEB_SERVICE_PRIVATE_KEY: await exportPKCS8(privateKey),
    };
    const authorization = await serviceAuthorization(service, { sub: 'test-owner', tenant_id: 'owner', exp: Math.floor(Date.now() / 1000) + 600 }, env);
    const payload = { issuer: 'https://solo.example.test', audience, public_key: await exportSPKI(publicKey), subject: 'test-owner', scope, authorization };
    // Batch cases in one interpreter to avoid repeated interpreter startup costs.
    const child = spawnSync(python!, ['-c', verify], {
      input: JSON.stringify({ base: payload, cases: [{}, { audience: 'other-service' }, { scope: 'other:read' }, { subject: 'other-owner' }] }),
      encoding: 'utf8', timeout: 10_000,
    });
    // Do not include stderr or request material in failed assertions.
    expect(child.status, 'installed Python verifier must execute successfully').toBe(0);
    const results = JSON.parse(child.stdout);
    expect(results[0]).toEqual({ status: 200, scope, tenant_id: 'owner' });
    expect(results[1].status).toBe(401);
    expect(results[2].status).toBe(403);
    expect(results[3].status).toBe(403);
  }, 15_000);
});
