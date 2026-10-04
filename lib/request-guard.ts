type Env = Record<string, string | undefined>;
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export type GuardResult = { ok: true } | { ok: false; status: 403 | 415; code: string; message: string };
export interface GuardedRequest { method: string; headers: Headers; url?: string }

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.includes(hostname) || /^127(?:\.\d{1,3}){3}$/.test(hostname) || hostname.endsWith('.localhost') || hostname === '0.0.0.0';
}

/** Accept an HTTPS origin, never credentials, paths, wildcards, or loopback. */
export function httpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      url.hostname.includes('*') || isLoopbackHostname(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}

export function trustedOrigins(env: Env, defaultPort = 3600): Set<string> {
  const primary = httpsOrigin(env.SOLO_WEB_PUBLIC_ORIGIN);
  if (env.SOLO_WEB_PUBLIC_ORIGIN || env.NODE_ENV === 'production') {
    if (!primary) return new Set();
    const previews = (env.SOLO_WEB_PREVIEW_ORIGINS ?? '').split(',').map((v) => httpsOrigin(v.trim())).filter((v): v is string => !!v);
    return new Set([primary, ...previews]);
  }
  const port = env.PORT && /^\d{1,5}$/.test(env.PORT) ? env.PORT : String(defaultPort);
  return new Set(LOOPBACK_HOSTS.map((host) => `http://${host}:${port}`));
}

export function allowedHosts(env: Env, defaultPort: number): Set<string> {
  return new Set([...trustedOrigins(env, defaultPort)].map((origin) => new URL(origin).host));
}

export function requestOrigin(request: GuardedRequest, env: Env, defaultPort = 3600): string | null {
  const host = request.headers.get('host') ?? '';
  const expected = [...trustedOrigins(env, defaultPort)].find((origin) => new URL(origin).host === host);
  if (!expected) return null;
  // Next.js may construct an internal loopback URL behind a TLS terminator.
  // The public scheme/origin comes only from server configuration; Host must match exactly.
  // Neither request URL nor X-Forwarded-Host can add a trusted deployment.
  return expected;
}

export function localDemo(request: GuardedRequest, env: Env): boolean {
  return env.NODE_ENV !== 'production' && env.SOLO_WEB_LOCAL_DEMO === 'true' &&
    (requestOrigin(request, env)?.startsWith('http://') ?? false);
}

export function sameOrigin(origin: string | null, fetchSite: string | null, host: string): boolean {
  if (origin !== null) return origin === `http://${host}`;
  return fetchSite === 'same-origin';
}

export function guardRequest(request: GuardedRequest, env: Env, defaultPort = 3600, requireJson = true): GuardResult {
  const origin = requestOrigin(request, env, defaultPort);
  if (!origin) return { ok: false, status: 403, code: 'host_not_allowed', message: 'โดเมนนี้ไม่ได้รับอนุญาตให้เปิด Solo Web' };
  if (SAFE_METHODS.has(request.method.toUpperCase())) return { ok: true };
  const sentOrigin = request.headers.get('origin');
  // Hosted mutations always require the literal Origin; local demo retains browser compatibility.
  const same = sentOrigin === origin || (sentOrigin === null && localDemo(request, env) && request.headers.get('sec-fetch-site') === 'same-origin');
  if (!same) return { ok: false, status: 403, code: 'cross_origin', message: 'ปฏิเสธคำขอที่ไม่ได้มาจากหน้าเว็บนี้' };
  if (requireJson && (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    return { ok: false, status: 415, code: 'unsupported_media_type', message: 'ต้องส่งข้อมูลเป็น application/json' };
  }
  return { ok: true };
}
