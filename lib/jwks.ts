import { createHash, createPublicKey } from 'node:crypto';

type Env = Record<string, string | undefined>;
export type PublicJwk = { kty: 'RSA'; n: string; e: string; alg: 'RS256'; use: 'sig'; kid: string };

const PEM_BLOCK = /-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/g;

function toJwk(key: ReturnType<typeof createPublicKey>): PublicJwk | null {
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) return null;
  const { n, e } = key.export({ format: 'jwk' }) as { n?: string; e?: string };
  if (!n || !e) return null;
  // Tokens are signed without a kid, so the kid is informational only: a stable thumbprint prefix.
  const kid = createHash('sha256').update(`{"e":"${e}","kty":"RSA","n":"${n}"}`).digest('base64url').slice(0, 16);
  return { kty: 'RSA', n, e, alg: 'RS256', use: 'sig', kid };
}

/**
 * Public keys that sign tokens with this site's issuer: the service signing key's public half, plus
 * SOLO_WEB_JWKS_EXTRA_PUBLIC_KEYS (PEM blocks) for the other holders the backends already trust for
 * this issuer (owner CLI, store mirror). Public material only; invalid or short keys are dropped.
 */
export function issuerJwks(env: Env): { keys: PublicJwk[] } {
  const keys: PublicJwk[] = [];
  const add = (pem: string) => {
    try {
      const jwk = toJwk(createPublicKey(pem));
      if (jwk && !keys.some((k) => k.n === jwk.n)) keys.push(jwk);
    } catch { /* not a usable key */ }
  };
  if (env.SOLO_WEB_SERVICE_PRIVATE_KEY) add(env.SOLO_WEB_SERVICE_PRIVATE_KEY);
  for (const pem of (env.SOLO_WEB_JWKS_EXTRA_PUBLIC_KEYS ?? '').match(PEM_BLOCK) ?? []) add(pem);
  return { keys };
}
