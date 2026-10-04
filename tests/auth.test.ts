import { NextRequest } from 'next/server';
import { generateKeyPairSync } from 'node:crypto';
import { exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT, EncryptJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authReadiness, createOwnerSession, readOwnerSession, serviceAuthorization, startLogin, finishLogin, SESSION_COOKIE } from '../lib/auth';
import { guardRequest } from '../lib/request-guard';
import { GET as proxyGET, POST as proxyPOST } from '../app/api/[service]/[...path]/route';
import { login as loginRoute, callback as callbackRoute, logout as logoutRoute, session as sessionRoute } from '../lib/auth-routes';
import { GET as health } from '../app/api/health/route';

const ORIGIN = 'https://solo.example';
const ISSUER = 'https://issuer.example';
const owner = 'test-owner';
const now = () => Math.floor(Date.now() / 1000);
const signing = await generateKeyPair('RS256', { extractable: true });
const jwk = { ...await exportJWK(signing.publicKey), kid: 'test', alg: 'RS256', use: 'sig' };
let env: Record<string, string>;
let idTokenSub: string;
let idTokenNonce: string;
let idTokenAud: string;
let idTokenIssuer: string;
let idTokenExp: number;
let invalidSignature: boolean;
let backendCalls: RequestInit[];
let tokenBody: URLSearchParams | null;

beforeEach(async () => {
  env = {
    NODE_ENV: 'production', SOLO_WEB_PUBLIC_ORIGIN: ORIGIN, SOLO_WEB_LOCAL_DEMO: 'true',
    SOLO_WEB_OIDC_ISSUER: ISSUER, SOLO_WEB_OIDC_CLIENT_ID: 'test-client', SOLO_WEB_OIDC_CLIENT_SECRET: 'test-only',
    SOLO_WEB_OWNER_SUBJECTS: JSON.stringify([owner]), SOLO_WEB_SESSION_KEY: Buffer.alloc(32, 7).toString('base64url'),
    SOLO_WEB_SERVICE_PRIVATE_KEY: await exportPKCS8(signing.privateKey),
    ACCOUNTS_API_ORIGIN: 'https://accounts.example', ACCOUNTS_API_ALLOW_REMOTE: 'true',
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  idTokenSub = owner; idTokenNonce = ''; idTokenAud = 'test-client'; idTokenIssuer = ISSUER; idTokenExp = now() + 300;
  backendCalls = []; tokenBody = null; invalidSignature = false;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('.well-known/openid-configuration')) return Response.json({
      issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'], code_challenge_methods_supported: ['S256'],
    });
    if (url === `${ISSUER}/jwks`) return Response.json({ keys: [jwk] });
    if (url === `${ISSUER}/token`) {
      tokenBody = new URLSearchParams(String(init?.body));
      let id_token = await new SignJWT({ nonce: idTokenNonce }).setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer(idTokenIssuer).setAudience(idTokenAud).setSubject(idTokenSub).setIssuedAt(now()).setExpirationTime(idTokenExp).sign(signing.privateKey);
      if (invalidSignature) {
        const parts = id_token.split('.'); parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1); id_token = parts.join('.');
      }
      return Response.json({ token_type: 'Bearer', access_token: 'test-provider-token-never-relayed', id_token, expires_in: 300 });
    }
    backendCalls.push(init ?? {});
    return Response.json({ records: [] });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function login() {
  const started = await startLogin(ORIGIN, env);
  idTokenNonce = started.url.searchParams.get('nonce')!;
  const callback = new URL(`${ORIGIN}/api/auth/callback?code=test-code&state=${started.url.searchParams.get('state')}`);
  return { ...started, callback };
}

describe('owner OIDC and encrypted sessions', () => {
  it('requires complete configuration without exposing values', () => {
    expect(authReadiness({}).ready).toBe(false);
    expect(authReadiness(env).ready).toBe(true);
    expect(JSON.stringify(authReadiness(env))).not.toContain('test-only');
  });
  it('performs actual OIDC code exchange with S256 PKCE, state and nonce', async () => {
    const started = await login();
    expect(started.url.searchParams.get('scope')).toBe('openid');
    expect(started.url.searchParams.get('code_challenge_method')).toBe('S256');
    const result = await finishLogin(started.callback, started.transaction, ORIGIN, env);
    expect(result.maxAge).toBeLessThanOrEqual(300);
    expect(tokenBody!.get('code_verifier')).toBeTruthy();
    expect(await readOwnerSession(result.value, ORIGIN, env)).toMatchObject({ sub: owner, tenant_id: 'owner' });
    expect(result.value).not.toContain('test-provider-token');
    expect(result.value).not.toContain(owner);
  });
  it.each(['state', 'nonce', 'audience', 'issuer', 'expired', 'subject', 'signature'])('rejects invalid OIDC %s', async (invalid) => {
    const started = await login();
    if (invalid === 'state') started.callback.searchParams.set('state', 'wrong');
    if (invalid === 'nonce') idTokenNonce = 'wrong';
    if (invalid === 'audience') idTokenAud = 'other-client';
    if (invalid === 'issuer') idTokenIssuer = 'https://other-issuer.example';
    if (invalid === 'expired') idTokenExp = now() - 100;
    if (invalid === 'subject') idTokenSub = 'another-owner';
    if (invalid === 'signature') invalidSignature = true;
    await expect(finishLogin(started.callback, started.transaction, ORIGIN, env)).rejects.toThrow();
  });
  it('rejects missing, altered, expired and removed-owner sessions', async () => {
    const { value } = await createOwnerSession(owner, now() + 20, ORIGIN, env);
    expect(await readOwnerSession(undefined, ORIGIN, env)).toBeNull();
    expect(await readOwnerSession(`${value}x`, ORIGIN, env)).toBeNull();
    expect(await readOwnerSession(value, 'https://other.example', env)).toBeNull();
    expect(await readOwnerSession(value, ORIGIN, { ...env, SOLO_WEB_OWNER_SUBJECTS: '[]' })).toBeNull();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 21_000);
    expect(await readOwnerSession(value, ORIGIN, env)).toBeNull();
    vi.useRealTimers();
  });
  it('rejects an encrypted session for another tenant', async () => {
    const wrong = await new EncryptJWT({ sub: owner, tenant_id: 'another' }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setIssuer(ORIGIN).setAudience('solo-web-session').setExpirationTime(now() + 60).encrypt(Buffer.alloc(32, 7));
    expect(await readOwnerSession(wrong, ORIGIN, env)).toBeNull();
  });
  it('limits session expiry to an hour and rejects expired IdP claims', async () => {
    expect((await createOwnerSession(owner, now() + 7200, ORIGIN, env)).maxAge).toBeLessThanOrEqual(3600);
    await expect(createOwnerSession(owner, now() - 1, ORIGIN, env)).rejects.toThrow();
  });
});

describe('trusted host, service tokens and hosted BFF', () => {
  it('only trusts explicit preview origins and requires literal HTTPS Origin on writes', () => {
    const allowed = { ...env, SOLO_WEB_PREVIEW_ORIGINS: 'https://approved.vercel.app' };
    const req = (host: string, origin?: string) => new NextRequest(`https://${host}/api/accounts/v1/accounts`, { method: 'POST', headers: {
      host, 'x-forwarded-host': 'solo.example', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(origin ? { origin } : {}),
    } });
    expect(guardRequest(req('approved.vercel.app', 'https://approved.vercel.app'), allowed).ok).toBe(true);
    expect(guardRequest(req('evil.vercel.app', 'https://evil.vercel.app'), allowed).ok).toBe(false);
    expect(guardRequest(req('solo.example'), allowed).ok).toBe(false);
    expect(guardRequest(req('solo.example', 'http://solo.example'), allowed).ok).toBe(false);
    expect(guardRequest(req('solo.example', 'https://evil.example'), allowed).ok).toBe(false);
  });
  it('uses exact configured Host even when Next.js constructs an internal loopback request URL', () => {
    const internal = new NextRequest('http://localhost:3600/api/accounts/v1/accounts', { headers: { host: 'solo.example' } });
    expect(guardRequest(internal, env).ok).toBe(true);
  });
  it.each([['accounts', 'accounts-api', 'accounts:read'], ['integrations', 'integrations-api', 'integrations:read'], ['saas', 'saas-catalog-api', 'saas:read'], ['knowledge', 'knowledge-api', 'knowledge:read']])('signs scoped RS256 tokens for %s', async (service, audience, scope) => {
    const auth = await serviceAuthorization(service, { sub: owner, tenant_id: 'owner', exp: now() + 300 }, env);
    const { payload } = await jwtVerify(auth!.slice(7), signing.publicKey, { issuer: ORIGIN, audience, algorithms: ['RS256'] });
    expect(payload).toMatchObject({ sub: owner, tenant_id: 'owner', scope });
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(120);
    expect(payload.nbf).toBe(payload.iat); expect(payload.jti).toBeTruthy();
    await expect(jwtVerify(auth!.slice(7), signing.publicKey, { audience: 'wrong' })).rejects.toThrow();
  });
  it('replaces caller credentials with per-owner service authorization', async () => {
    const { value } = await createOwnerSession(owner, now() + 100, ORIGIN, env);
    const req = new NextRequest(`${ORIGIN}/api/accounts/v1/accounts`, { headers: {
      host: 'solo.example', cookie: `${SESSION_COOKIE}=${value}`, authorization: 'Bearer untrusted', 'x-owner': 'another-owner',
    } });
    const response = await proxyGET(req, { params: Promise.resolve({ service: 'accounts', path: ['v1', 'accounts'] }) });
    expect(response.status).toBe(200); expect(backendCalls).toHaveLength(1);
    const headers = new Headers(backendCalls[0].headers);
    expect(headers.get('authorization')).not.toBe('Bearer untrusted'); expect(headers.get('x-owner')).toBeNull();
    expect(backendCalls[0].redirect).toBe('error');
    expect(await response.text()).not.toContain('Bearer');
  });
  it.each(['today', 'cloud', 'production'])('fails closed for %s until service authorization is implemented', async (service) => {
    const { value } = await createOwnerSession(owner, now() + 100, ORIGIN, env);
    const names = { today: 'TODAY_API', cloud: 'CLOUD_API', production: 'PRODUCTION_HUB_API' };
    const name = names[service as keyof typeof names]; vi.stubEnv(`${name}_ORIGIN`, `https://${service}.example`); vi.stubEnv(`${name}_ALLOW_REMOTE`, 'true');
    const path = service === 'today' ? ['v1', 'today'] : service === 'cloud' ? ['v1', 'cloud', 'usage'] : ['v1', 'registry'];
    const response = await proxyGET(new NextRequest(`${ORIGIN}/api/${service}/${path.join('/')}`, { headers: { host: 'solo.example', cookie: `${SESSION_COOKIE}=${value}` } }), { params: Promise.resolve({ service, path }) });
    expect(response.status).toBe(503); expect(backendCalls).toHaveLength(0);
  });
  it('denies anonymous same-origin hosted mutations even with a broad caller token', async () => {
    const response = await proxyPOST(new NextRequest(`${ORIGIN}/api/production/v1/send`, { method: 'POST', headers: { host: 'solo.example', origin: ORIGIN, 'content-type': 'application/json', authorization: 'Bearer fake' }, body: '{}' }), { params: Promise.resolve({ service: 'production', path: ['v1', 'send'] }) });
    expect(response.status).toBe(401); expect(backendCalls).toHaveLength(0);
  });
  it('sanitizes backend failures without returning server credentials or exception details', async () => {
    const { value } = await createOwnerSession(owner, now() + 100, ORIGIN, env);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('internal_private_details'); }));
    const response = await proxyGET(new NextRequest(`${ORIGIN}/api/accounts/v1/accounts`, { headers: {
      host: 'solo.example', cookie: `${SESSION_COOKIE}=${value}`,
    } }), { params: Promise.resolve({ service: 'accounts', path: ['v1', 'accounts'] }) });
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain('internal_private_details'); expect(body).not.toContain('PRIVATE KEY'); expect(body).not.toContain('Bearer');
  });
});

describe('public auth routes and readiness', () => {
  it('never reports ready or signs service tokens with an RSA key below 2048 bits', async () => {
    for (const name of ['KNOWLEDGE_API', 'INTEGRATIONS_API', 'SAAS_CATALOG_API']) {
      vi.stubEnv(`${name}_ORIGIN`, 'https://metadata.example'); vi.stubEnv(`${name}_ALLOW_REMOTE`, 'true');
    }
    expect((await health()).status).toBe(200);
    const weak = generateKeyPairSync('rsa', { modulusLength: 1024, privateKeyEncoding: { format: 'pem', type: 'pkcs8' }, publicKeyEncoding: { format: 'pem', type: 'spki' } });
    vi.stubEnv('SOLO_WEB_SERVICE_PRIVATE_KEY', weak.privateKey);
    const result = await health();
    expect(result.status).toBe(503);
    const body = await result.json();
    expect(body.checks).toContainEqual({ name: 'SOLO_WEB_SERVICE_PRIVATE_KEY', status: 'missing_or_invalid' });
    expect(body.services.every((service: { status: string }) => service.status === 'unavailable')).toBe(true);
    await expect(serviceAuthorization('accounts', { sub: owner, tenant_id: 'owner', exp: now() + 100 }, { ...env, SOLO_WEB_SERVICE_PRIVATE_KEY: weak.privateKey })).resolves.toBeNull();
  });
  it('rejects malformed and non-RSA signing keys consistently in health and service auth', async () => {
    const ec = await generateKeyPair('ES256', { extractable: true });
    for (const pem of ['', 'invalid', await exportPKCS8(ec.privateKey)]) {
      vi.stubEnv('SOLO_WEB_SERVICE_PRIVATE_KEY', pem);
      expect((await health()).status).toBe(503);
      await expect(serviceAuthorization('accounts', { sub: owner, tenant_id: 'owner', exp: now() + 100 }, { ...env, SOLO_WEB_SERVICE_PRIVATE_KEY: pem })).resolves.toBeNull();
    }
  });
  it('sets protected transaction/session cookies, logs out, and never returns provider tokens', async () => {
    const loginResponse = await loginRoute(new NextRequest(`${ORIGIN}/api/auth/login?returnTo=https://evil.example`, { headers: { host: 'solo.example' } }));
    const location = new URL(loginResponse.headers.get('location')!);
    expect(location.origin).toBe(ISSUER);
    expect(location.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`);
    const transaction = loginResponse.cookies.get('__Host-solo-oidc')!;
    expect(transaction).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    idTokenNonce = location.searchParams.get('nonce')!;
    const callbackResponse = await callbackRoute(new NextRequest(`${ORIGIN}/api/auth/callback?code=test-code&state=${location.searchParams.get('state')}&returnTo=https://evil.example`, { headers: {
      host: 'solo.example', cookie: `__Host-solo-oidc=${transaction.value}`,
    } }));
    expect(callbackResponse.headers.get('location')).toBe(`${ORIGIN}/`);
    expect(callbackResponse.cookies.get('__Host-solo-oidc')?.maxAge).toBe(0);
    const sessionCookie = callbackResponse.cookies.get(SESSION_COOKIE)!;
    expect(sessionCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    const result = await sessionRoute(new NextRequest(`${ORIGIN}/api/auth/session`, { headers: { host: 'solo.example', cookie: `${SESSION_COOKIE}=${sessionCookie.value}` } }));
    expect(await result.json()).toEqual({ authenticated: true });
    expect(callbackResponse.headers.get('set-cookie')).not.toContain('test-provider-token');
    const loggedOut = await logoutRoute(new NextRequest(`${ORIGIN}/api/auth/logout`, { method: 'POST', headers: { host: 'solo.example', origin: ORIGIN, cookie: `${SESSION_COOKIE}=${sessionCookie.value}` } }));
    expect(loggedOut.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
    expect(loggedOut.headers.get('location')).toBe(`${ORIGIN}/login`);
  });
  it('rejects CSRF logout and prevents forged forwarded hosts and callback redirects', async () => {
    const logout = await logoutRoute(new NextRequest(`${ORIGIN}/api/auth/logout`, { method: 'POST', headers: { host: 'solo.example', origin: 'https://evil.example' } }));
    expect(logout.status).toBe(403); expect(logout.cookies.get(SESSION_COOKIE)).toBeUndefined();
    const forged = await loginRoute(new NextRequest('https://evil.vercel.app/api/auth/login', { headers: { host: 'evil.vercel.app', 'x-forwarded-host': 'solo.example' } }));
    expect(forged.status).toBe(403);
    const callback = await callbackRoute(new NextRequest(`${ORIGIN}/api/auth/callback?error_description=private&returnTo=https://evil.example`, { headers: { host: 'solo.example' } }));
    expect(callback.headers.get('location')).toBe(`${ORIGIN}/login?error=denied`);
    expect(callback.cookies.get(SESSION_COOKIE)?.maxAge).toBe(0);
    expect(await callback.text()).not.toContain('private');
  });
  it('reports safe configuration-only health and a friendly missing-config login redirect', async () => {
    const good = await health(); expect(good.status).toBe(503); // only Accounts configured; no fake live readiness.
    const body = await good.json();
    expect(JSON.stringify(body)).not.toContain('test-only'); expect(JSON.stringify(body)).not.toContain('https://');
    expect(body.pendingServices).toHaveLength(3);
    vi.stubEnv('SOLO_WEB_SESSION_KEY', '');
    const missing = await loginRoute(new NextRequest(`${ORIGIN}/api/auth/login`, { headers: { host: 'solo.example' } }));
    expect(missing.headers.get('location')).toBe(`${ORIGIN}/login?error=configuration`);
    const anonymous = await sessionRoute(new NextRequest(`${ORIGIN}/api/auth/session`, { headers: { host: 'solo.example' } }));
    expect(anonymous.status).toBe(401); expect(await anonymous.json()).toEqual({ authenticated: false });
  });
});
