import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { issuerJwks } from '../lib/jwks';
import { GET } from '../app/.well-known/jwks.json/route';

const pair = (bits = 2048) => generateKeyPairSync('rsa', { modulusLength: bits });
const service = pair();
const extraA = pair();
const extraB = pair();
const servicePem = service.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const pub = (k: ReturnType<typeof pair>) => k.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const n = (k: ReturnType<typeof pair>) => (k.publicKey.export({ format: 'jwk' }) as { n: string }).n;

afterEach(() => vi.unstubAllEnvs());

describe('issuer JWKS', () => {
  it('publishes the service key public half and each extra key once', () => {
    const { keys } = issuerJwks({
      SOLO_WEB_SERVICE_PRIVATE_KEY: servicePem,
      SOLO_WEB_JWKS_EXTRA_PUBLIC_KEYS: `${pub(extraA)}\n${pub(extraB)}\n${pub(service)}`,
    });
    expect(keys.map((k) => k.n)).toEqual([n(service), n(extraA), n(extraB)]);
    for (const key of keys) {
      expect(key).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig', e: 'AQAB' });
      expect(Object.keys(key).sort()).toEqual(['alg', 'e', 'kid', 'kty', 'n', 'use']);
    }
  });

  it('never exposes private key material', () => {
    const body = JSON.stringify(issuerJwks({ SOLO_WEB_SERVICE_PRIVATE_KEY: servicePem }));
    for (const field of ['"d"', '"p"', '"q"', '"dp"', '"dq"', '"qi"', 'PRIVATE']) expect(body).not.toContain(field);
  });

  it('drops short, malformed and missing keys', () => {
    expect(issuerJwks({}).keys).toEqual([]);
    expect(issuerJwks({ SOLO_WEB_SERVICE_PRIVATE_KEY: 'not a key', SOLO_WEB_JWKS_EXTRA_PUBLIC_KEYS: pub(pair(1024)) }).keys).toEqual([]);
  });

  it('serves the key set from /.well-known/jwks.json', async () => {
    vi.stubEnv('SOLO_WEB_SERVICE_PRIVATE_KEY', servicePem);
    vi.stubEnv('SOLO_WEB_JWKS_EXTRA_PUBLIC_KEYS', pub(extraA));
    const response = GET();
    expect(response.status).toBe(200);
    expect((await response.json()).keys.map((k: { n: string }) => k.n)).toEqual([n(service), n(extraA)]);
  });
});
