import { randomUUID } from 'node:crypto';
import { EncryptJWT, jwtDecrypt, importPKCS8, SignJWT } from 'jose';
import * as oidc from 'openid-client';
import { httpsOrigin, localDemo, requestOrigin, type GuardedRequest } from './request-guard';

type Env = Record<string, string | undefined>;
export const SESSION_COOKIE = '__Host-solo-session';
export const TRANSACTION_COOKIE = '__Host-solo-oidc';
export const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };
export interface OwnerSession { sub: string; tenant_id: 'owner'; exp: number }

function subjects(env: Env): string[] {
  try {
    const values: unknown = JSON.parse(env.SOLO_WEB_OWNER_SUBJECTS ?? '[]');
    return Array.isArray(values) && values.every((v) => typeof v === 'string' && v.length > 0) ? values : [];
  } catch { return []; }
}

function sessionKey(env: Env): Uint8Array | null {
  const text = env.SOLO_WEB_SESSION_KEY ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(text)) return null;
  const key = Buffer.from(text, 'base64url');
  return key.length === 32 && key.toString('base64url') === text ? key : null;
}

function issuer(env: Env): URL | null {
  try {
    const url = new URL(env.SOLO_WEB_OIDC_ISSUER ?? '');
    return httpsOrigin(url.origin) && !url.username && !url.password && !url.search && !url.hash ? url : null;
  } catch { return null; }
}

export function authReadiness(env: Env) {
  const checks = {
    SOLO_WEB_PUBLIC_ORIGIN: !!httpsOrigin(env.SOLO_WEB_PUBLIC_ORIGIN),
    SOLO_WEB_OIDC_ISSUER: !!issuer(env),
    SOLO_WEB_OIDC_CLIENT_ID: !!env.SOLO_WEB_OIDC_CLIENT_ID,
    SOLO_WEB_OIDC_CLIENT_SECRET: !!env.SOLO_WEB_OIDC_CLIENT_SECRET,
    SOLO_WEB_OWNER_SUBJECTS: subjects(env).length > 0,
    SOLO_WEB_SESSION_KEY: !!sessionKey(env),
  };
  return { ready: Object.values(checks).every(Boolean), checks: Object.entries(checks).map(([name, valid]) => ({ name, status: valid ? 'configured' : 'missing_or_invalid' })) };
}

async function seal(payload: Record<string, unknown>, audience: string, origin: string, expiration: number, env: Env) {
  const key = sessionKey(env);
  if (!key) throw new Error('auth_not_configured');
  return new EncryptJWT(payload).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuer(origin).setAudience(audience).setIssuedAt().setExpirationTime(expiration).encrypt(key);
}

async function unseal(value: string, audience: string, origin: string, env: Env) {
  const key = sessionKey(env);
  if (!key) throw new Error('auth_not_configured');
  return (await jwtDecrypt(value, key, { issuer: origin, audience, keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] })).payload;
}

/** Only the locally validated ID-token claims enter an encrypted browser session. */
export async function createOwnerSession(sub: string, idpExpiration: number, origin: string, env: Env) {
  if (!authReadiness(env).ready || !subjects(env).includes(sub)) throw new Error('owner_not_allowed');
  const now = Math.floor(Date.now() / 1000);
  const expires = Math.min(idpExpiration, now + 3600);
  if (!Number.isSafeInteger(expires) || expires <= now) throw new Error('session_expired');
  const value = await seal({ sub, tenant_id: 'owner' }, 'solo-web-session', origin, expires, env);
  return { value, maxAge: expires - now };
}

export async function readOwnerSession(value: string | undefined, origin: string, env: Env): Promise<OwnerSession | null> {
  if (!value || !authReadiness(env).ready) return null;
  try {
    const p = await unseal(value, 'solo-web-session', origin, env);
    if (typeof p.sub !== 'string' || !subjects(env).includes(p.sub) || p.tenant_id !== 'owner' || typeof p.exp !== 'number') return null;
    return { sub: p.sub, tenant_id: 'owner', exp: p.exp };
  } catch { return null; }
}

export async function authorizeOwner(request: GuardedRequest, cookie: string | undefined, env: Env): Promise<OwnerSession | null> {
  const origin = requestOrigin(request, env);
  if (!origin) return null;
  if (localDemo(request, env)) return { sub: 'local-demo', tenant_id: 'owner', exp: Math.floor(Date.now() / 1000) + 60 };
  return readOwnerSession(cookie, origin, env);
}

// Cache only configured metadata in a warm instance, never user/provider tokens.
const configurations = new Map<string, Promise<oidc.Configuration>>();
async function configuration(env: Env) {
  if (!authReadiness(env).ready) throw new Error('auth_not_configured');
  const key = JSON.stringify([env.SOLO_WEB_OIDC_ISSUER, env.SOLO_WEB_OIDC_CLIENT_ID, env.SOLO_WEB_OIDC_CLIENT_SECRET]);
  if (!configurations.has(key)) {
    const pending = oidc.discovery(issuer(env)!, env.SOLO_WEB_OIDC_CLIENT_ID!, env.SOLO_WEB_OIDC_CLIENT_SECRET!, undefined,
      { timeout: 10, execute: [oidc.enableNonRepudiationChecks] });
    configurations.set(key, pending);
    pending.catch(() => configurations.delete(key));
  }
  return configurations.get(key)!;
}

export async function startLogin(origin: string, env: Env) {
  const config = await configuration(env);
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: `${origin}/api/auth/callback`, response_type: 'code', scope: 'openid',
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', state, nonce,
  });
  if (url.protocol !== 'https:') throw new Error('issuer_not_secure');
  const transaction = await seal({ verifier, state, nonce }, 'solo-web-oidc', origin, Math.floor(Date.now() / 1000) + 600, env);
  return { url, transaction };
}

export async function finishLogin(callback: URL, transaction: string | undefined, origin: string, env: Env) {
  if (!transaction) throw new Error('transaction_missing');
  const p = await unseal(transaction, 'solo-web-oidc', origin, env);
  if (typeof p.verifier !== 'string' || typeof p.state !== 'string' || typeof p.nonce !== 'string') throw new Error('transaction_invalid');
  const config = await configuration(env);
  const tokens = await oidc.authorizationCodeGrant(config, callback, {
    pkceCodeVerifier: p.verifier, expectedState: p.state, expectedNonce: p.nonce, idTokenExpected: true,
  });
  const claims = tokens.claims(); // openid-client verifies signature, issuer, audience, nonce, time, state and PKCE.
  if (!claims || typeof claims.sub !== 'string' || typeof claims.exp !== 'number') throw new Error('id_token_invalid');
  return createOwnerSession(claims.sub, claims.exp, origin, env);
}

const SERVICES: Record<string, { audience: string; scope: string }> = {
  accounts: { audience: 'accounts-api', scope: 'accounts:read' },
  integrations: { audience: 'integrations-api', scope: 'integrations:read' },
  saas: { audience: 'saas-catalog-api', scope: 'saas:read' },
  knowledge: { audience: 'knowledge-api', scope: 'knowledge:read' },
  'ai-usage': { audience: 'ai-usage-api', scope: 'ai-usage:read' },
};

/** Share the exact signing-key requirements between readiness and request signing. */
export async function serviceSigningKey(env: Env): Promise<CryptoKey | null> {
  try {
    const key = await importPKCS8(env.SOLO_WEB_SERVICE_PRIVATE_KEY ?? '', 'RS256');
    const algorithm = key.algorithm as RsaHashedKeyAlgorithm;
    return key.type === 'private' && algorithm.name === 'RSASSA-PKCS1-v1_5' &&
      algorithm.hash.name === 'SHA-256' && algorithm.modulusLength >= 2048 ? key : null;
  } catch { return null; }
}

export async function serviceAuthorization(service: string, session: OwnerSession, env: Env): Promise<string | null> {
  const contract = SERVICES[service];
  const origin = httpsOrigin(env.SOLO_WEB_PUBLIC_ORIGIN);
  if (!contract || !origin || !env.SOLO_WEB_SERVICE_PRIVATE_KEY || session.tenant_id !== 'owner' || !subjects(env).includes(session.sub)) return null;
  const now = Math.floor(Date.now() / 1000);
  if (session.exp <= now) return null;
  const key = await serviceSigningKey(env);
  if (!key) return null;
  const token = await new SignJWT({ tenant_id: 'owner', scope: contract.scope })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(origin).setAudience(contract.audience)
    .setSubject(session.sub).setIssuedAt(now).setNotBefore(now).setExpirationTime(Math.min(session.exp, now + 120))
    .setJti(randomUUID()).sign(key);
  return `Bearer ${token}`;
}
