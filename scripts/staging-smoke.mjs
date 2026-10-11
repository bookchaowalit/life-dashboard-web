import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

const SERVICES = [
  ['accounts', 'ACCOUNTS_API_ORIGIN', 'accounts'],
  ['integrations', 'INTEGRATIONS_API_ORIGIN', 'integrations'],
  ['saas', 'SAAS_CATALOG_API_ORIGIN', 'saas'],
  ['knowledge', 'KNOWLEDGE_API_ORIGIN', 'knowledge'],
];
const MAX_READINESS_BYTES = 8192;

function origin(value) {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' ||
        url.search || url.hash || value !== url.origin || isIP(host) || host === 'localhost' ||
        host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.example') || host === 'example.com') return null;
    return url.origin;
  } catch { return null; }
}

async function readyBody(response, api) {
  if (!response.body) return false;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_READINESS_BYTES) return false;
      chunks.push(part.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return body?.status === 'ready' && (!api || (body.source === 'available' && body.auth === 'ready'));
  } catch { return false; }
  finally { try { await reader.cancel(); } catch { /* Never expose provider error text. */ } }
}

async function probe(name, base, path, expected, options = {}) {
  if (!base) return { name, status: 'failed', code: 'origin_missing_or_invalid' };
  const request = options.fetch ?? globalThis.fetch;
  try {
    const response = await request(base + path, {
      method: 'GET', redirect: 'manual', credentials: 'omit',
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000),
    });
    const status = response.status;
    let valid = expected.includes(status);
    let code = valid ? undefined : 'unexpected_status';
    if (valid && options.readiness) {
      valid = await readyBody(response, options.readiness === 'api');
      if (!valid) code = 'invalid_readiness_response';
    } else {
      // An unexpected anonymous 200 may contain private data. Discard it unread.
      try { await response.body?.cancel(); } catch { /* No raw response/error output. */ }
    }
    return { name, status: valid ? 'passed' : 'failed', http_status: status, ...(code ? { code } : {}) };
  } catch {
    return { name, status: 'failed', code: 'request_failed_or_timed_out' };
  }
}

export async function serviceChecks(name, configuredOrigin, route, options = {}) {
  const base = origin(configuredOrigin);
  return Promise.all([
    probe(`${name}.readiness`, base, '/ready', [200], { ...options, readiness: 'api' }),
    probe(`${name}.anonymous_read`, base, `/api/v1/${route}`, [401, 403], options),
  ]);
}

/** Public readiness and denied anonymous reads only; no login, tokens, writes or data download. */
export async function checkStaging(env, options = {}) {
  const web = origin(env.SOLO_WEB_PUBLIC_ORIGIN);
  const results = await Promise.all([
    probe('web.readiness', web, '/api/health', [200], { ...options, readiness: 'web' }),
    ...SERVICES.map(async ([name, setting, route]) => [
      ...await serviceChecks(name, env[setting], route, options),
      await probe(`${name}.anonymous_bff_read`, web, `/api/${name}/v1/${route}`, [401, 403], options),
    ]),
  ]);
  const checks = results.flat();
  return {
    scope: 'metadata_staging', status: checks.every((check) => check.status === 'passed') ? 'passed' : 'failed',
    checks, authenticated_journey: 'not_checked', production_readiness: 'not_checked',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--json')) {
    process.stdout.write(JSON.stringify({ scope: 'metadata_staging', status: 'failed', code: 'invalid_cli_arguments' }) + '\n');
    process.exitCode = 2;
  } else {
    const result = await checkStaging(process.env);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.status === 'passed' ? 0 : 1;
  }
}
