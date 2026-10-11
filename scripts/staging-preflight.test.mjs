import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { evaluateAll, evaluateApi, evaluateWeb, runCli } from './staging-preflight.mjs';

const script = fileURLToPath(new URL('./staging-preflight.mjs', import.meta.url));
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherRsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const weakRsa = generateKeyPairSync('rsa', { modulusLength: 1024 });
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const privatePem = (pair, type = 'pkcs8') => pair.privateKey.export({ format: 'pem', type });
const publicPem = (pair, type = 'spki') => pair.publicKey.export({ format: 'pem', type });
const prefixes = {
  'accounts-api': 'ACCOUNTS_API',
  'integrations-api': 'INTEGRATIONS_API',
  'saas-catalog-api': 'SAAS_CATALOG_API',
  'knowledge-api': 'KNOWLEDGE_API',
};

function webEnv() {
  return {
    NODE_ENV: 'production',
    SOLO_WEB_PUBLIC_ORIGIN: 'https://solo.test',
    SOLO_WEB_PREVIEW_ORIGINS: 'https://preview-a.test,https://preview-b.test',
    SOLO_WEB_OIDC_ISSUER: 'https://identity.test/realms/owner',
    SOLO_WEB_OIDC_CLIENT_ID: 'test-client',
    SOLO_WEB_OIDC_CLIENT_SECRET: 'test-secret-marker',
    SOLO_WEB_OWNER_SUBJECTS: '["owner-a","owner-b"]',
    SOLO_WEB_SESSION_KEY: Buffer.alloc(32, 7).toString('base64url'),
    SOLO_WEB_SERVICE_PRIVATE_KEY: privatePem(rsa),
    SOLO_WEB_LOCAL_DEMO: 'false',
    ...Object.fromEntries(Object.values(prefixes).flatMap((prefix) => [
      [`${prefix}_ORIGIN`, `https://${prefix.toLowerCase().replaceAll('_', '-')}.test`],
      [`${prefix}_ALLOW_REMOTE`, 'true'],
    ])),
  };
}

function apiEnv(api = 'accounts-api') {
  const prefix = prefixes[api];
  return {
    [`${prefix}_ENV`]: 'production',
    [`${prefix}_AUTH_ISSUER`]: 'https://solo.test',
    [`${prefix}_AUTH_PUBLIC_KEY`]: publicPem(rsa),
    [`${prefix}_AUTH_SUBJECTS`]: 'owner-b,owner-a',
  };
}

function allEnv() {
  return Object.assign(webEnv(), ...Object.keys(prefixes).map((api) => apiEnv(api)));
}

function check(report, name) {
  return report.checks.find((entry) => entry.name === name);
}

function invalid(report, name, code) {
  assert.equal(report.ready, false);
  assert.equal(check(report, name)?.status, 'invalid', name);
  if (code) assert.equal(check(report, name)?.code, code);
}

test('complete ephemeral web configuration passes without requiring optional modules', () => {
  const report = evaluateWeb(webEnv());
  assert.equal(report.ready, true);
  assert.equal(report.scope, 'metadata_staging');
  assert.equal(report.target, 'web');
  assert.ok(report.checks.every((entry) => entry.status === 'ok'));
  assert.ok(!report.checks.some((entry) => /TODAY|CLOUD|PRODUCTION_HUB/.test(entry.name)));
});

test('empty configuration fails with named missing settings and no local fallbacks', () => {
  const report = evaluateWeb({});
  assert.equal(report.ready, false);
  for (const name of ['NODE_ENV', 'SOLO_WEB_PUBLIC_ORIGIN', 'SOLO_WEB_OIDC_ISSUER',
    'SOLO_WEB_OIDC_CLIENT_ID', 'SOLO_WEB_OIDC_CLIENT_SECRET', 'SOLO_WEB_OWNER_SUBJECTS',
    'SOLO_WEB_SESSION_KEY', 'SOLO_WEB_SERVICE_PRIVATE_KEY', ...Object.values(prefixes).map((p) => `${p}_ORIGIN`)]) {
    assert.equal(check(report, name)?.status, 'missing', name);
  }
  for (const api of Object.keys(prefixes)) {
    const missing = evaluateApi(api, {});
    assert.equal(missing.ready, false);
    assert.equal(missing.checks.filter((entry) => entry.status === 'missing').length, 4);
  }
});

test('all four API modes accept public PEM and runtime-supported literal newline PEM', () => {
  for (const api of Object.keys(prefixes)) {
    assert.equal(evaluateApi(api, apiEnv(api)).ready, true, api);
    const prefix = prefixes[api];
    const env = apiEnv(api);
    env[`${prefix}_AUTH_PUBLIC_KEY`] = publicPem(rsa).replaceAll('\n', '\\n');
    assert.equal(evaluateApi(api, env).ready, true, api);
    env[`${prefix}_AUTH_PUBLIC_KEY`] = publicPem(rsa, 'pkcs1');
    assert.equal(evaluateApi(api, env).ready, true, api);
  }
});

test('web origins reject localhost, credentials, paths, wildcards and malformed allowlists', () => {
  const badOrigins = ['http://solo.test', 'https://localhost', 'https://preview.localhost',
    'https://localhost.', 'https://127.2.3.4', 'https://[::1]', 'https://[::ffff:127.0.0.1]',
    'https://user:password@solo.test', 'https://solo.test/path', 'https://solo.test/path/..',
    'https://solo.test?next=1', 'https://solo.test#fragment', 'https://*.solo.test',
    'https://solo.test/', 'https://solo.test:0'];
  for (const value of badOrigins) {
    invalid(evaluateWeb({ ...webEnv(), SOLO_WEB_PUBLIC_ORIGIN: value }), 'SOLO_WEB_PUBLIC_ORIGIN');
    invalid(evaluateWeb({ ...webEnv(), SOLO_WEB_PREVIEW_ORIGINS: value }), 'SOLO_WEB_PREVIEW_ORIGINS');
    invalid(evaluateWeb({ ...webEnv(), ACCOUNTS_API_ORIGIN: value }), 'ACCOUNTS_API_ORIGIN');
  }
  for (const value of ['https://a.test,', ',https://a.test', 'https://a.test,,https://b.test']) {
    invalid(evaluateWeb({ ...webEnv(), SOLO_WEB_PREVIEW_ORIGINS: value }), 'SOLO_WEB_PREVIEW_ORIGINS');
  }
  invalid(evaluateWeb({ ...webEnv(), SOLO_WEB_PUBLIC_ORIGIN: ' https://solo.test' }), 'SOLO_WEB_PUBLIC_ORIGIN');
  invalid(evaluateWeb({ ...webEnv(), ACCOUNTS_API_ORIGIN: ' https://accounts.test' }), 'ACCOUNTS_API_ORIGIN');
  assert.equal(evaluateWeb({ ...webEnv(), SOLO_WEB_PREVIEW_ORIGINS: ' https://preview-a.test , https://preview-b.test ' }).ready, true);
  const withoutPreviews = webEnv();
  delete withoutPreviews.SOLO_WEB_PREVIEW_ORIGINS;
  assert.equal(evaluateWeb(withoutPreviews).ready, true);
});

test('OIDC issuer permits realm paths and rejects insecure or credential-bearing URLs', () => {
  for (const value of ['http://identity.test', 'https://localhost/realm',
    'https://u:p@identity.test/realm', 'https://identity.test/realm?q=1', 'https://identity.test/#hash']) {
    invalid(evaluateWeb({ ...webEnv(), SOLO_WEB_OIDC_ISSUER: value }), 'SOLO_WEB_OIDC_ISSUER');
  }
  assert.equal(evaluateWeb({ ...webEnv(), SOLO_WEB_OIDC_ISSUER: 'https://identity.test/realms/owner' }).ready, true);
});

test('owner JSON must contain nonempty subjects representable by the backend CSV contract', () => {
  for (const value of ['owner-a,owner-b', '{}', '[]', '[null]', '[1]', '[""]', '[" "]',
    '[" owner-a"]', '["owner,a"]', '["owner\\nline"]', JSON.stringify(['x'.repeat(513)]),
    '["REPLACE_WITH_ALLOWED_OIDC_OWNER_SUBJECT"]']) {
    invalid(evaluateWeb({ ...webEnv(), SOLO_WEB_OWNER_SUBJECTS: value }), 'SOLO_WEB_OWNER_SUBJECTS');
  }
});

test('Web and API subjects reject C1 controls and BOM before CSV trimming', () => {
  for (const point of [0x7f, 0x80, 0x85, 0x9f, 0xfeff]) {
    const character = String.fromCodePoint(point);
    for (const subject of [`${character}owner-a`, `owner${character}-a`, `owner-a${character}`]) {
      invalid(evaluateWeb({ ...webEnv(), SOLO_WEB_OWNER_SUBJECTS: JSON.stringify([subject]) }),
        'SOLO_WEB_OWNER_SUBJECTS', 'json_owner_subjects_required');
      for (const [api, prefix] of Object.entries(prefixes)) {
        invalid(evaluateApi(api, { ...apiEnv(api), [`${prefix}_AUTH_SUBJECTS`]: subject }),
          `${prefix}_AUTH_SUBJECTS`, 'csv_owner_subjects_required');
      }
    }
  }
});

test('--all rejects BOM CSV and matching NEL subjects that Python normalizes differently', () => {
  for (const [owner, apiSubject] of [['owner-a', '\ufeffowner-a'], ['\u0085owner-a', '\u0085owner-a']]) {
    const env = { ...allEnv(), SOLO_WEB_OWNER_SUBJECTS: JSON.stringify([owner]),
      ...Object.fromEntries(Object.values(prefixes).map((prefix) => [`${prefix}_AUTH_SUBJECTS`, apiSubject])) };
    const output = [];
    assert.equal(runCli(['--all', '--json'], env, (line) => output.push(line)), 1);
    const result = JSON.parse(output.join(''));
    for (const prefix of Object.values(prefixes)) {
      invalid(result, `${prefix}_AUTH_SUBJECTS`, 'csv_owner_subjects_required');
    }
    if (owner.startsWith('\u0085')) {
      invalid(result, 'SOLO_WEB_OWNER_SUBJECTS', 'json_owner_subjects_required');
    }
  }
});

test('canonical 32-byte base64url session keys are required', () => {
  for (const value of [Buffer.alloc(31).toString('base64url'), Buffer.alloc(33).toString('base64url'),
    Buffer.alloc(32).toString('base64'), `${'A'.repeat(42)}B`, ' '.repeat(43)]) {
    invalid(evaluateWeb({ ...webEnv(), SOLO_WEB_SESSION_KEY: value }), 'SOLO_WEB_SESSION_KEY');
  }
});

test('RS256 signing requires a PEM PKCS8 RSA private key of at least 2048 bits', () => {
  for (const value of [publicPem(rsa), privatePem(rsa, 'pkcs1'), privatePem(weakRsa), privatePem(ec),
    privatePem(rsa).replaceAll('\n', '\\n'), 'REPLACE_WITH_PEM_PRIVATE_KEY', `${privatePem(rsa)}${privatePem(otherRsa)}`]) {
    invalid(evaluateWeb({ ...webEnv(), SOLO_WEB_SERVICE_PRIVATE_KEY: value }), 'SOLO_WEB_SERVICE_PRIVATE_KEY');
  }
});

test('staging requires production mode, explicit remote opt-in and disabled local demo', () => {
  invalid(evaluateWeb({ ...webEnv(), NODE_ENV: 'development' }), 'NODE_ENV');
  for (const prefix of Object.values(prefixes)) {
    for (const value of [undefined, 'false', 'TRUE']) {
      const report = evaluateWeb({ ...webEnv(), [`${prefix}_ALLOW_REMOTE`]: value });
      assert.equal(report.ready, false);
      assert.notEqual(check(report, `${prefix}_ALLOW_REMOTE`)?.status, 'ok');
    }
  }
  for (const value of ['true', 'TRUE', '1', 'yes']) {
    invalid(evaluateWeb({ ...webEnv(), SOLO_WEB_LOCAL_DEMO: value }), 'SOLO_WEB_LOCAL_DEMO');
  }
  const noDemo = webEnv();
  delete noDemo.SOLO_WEB_LOCAL_DEMO;
  assert.equal(evaluateWeb(noDemo).ready, true);
});

test('template placeholders and whitespace credentials never count as configured', () => {
  for (const name of ['SOLO_WEB_OIDC_CLIENT_ID', 'SOLO_WEB_OIDC_CLIENT_SECRET']) {
    for (const value of ['REPLACE_WITH_OIDC_VALUE', '   ', '\n', 'bad\u0000value']) {
      invalid(evaluateWeb({ ...webEnv(), [name]: value }), name);
    }
  }
  const env = apiEnv();
  invalid(evaluateApi('accounts-api', { ...env, ACCOUNTS_API_AUTH_SUBJECTS: 'REPLACE_WITH_ALLOWED_SUBJECT' }), 'ACCOUNTS_API_AUTH_SUBJECTS');
});

test('API rejects wrong environment, non-origin issuer, non-public or weak keys and JSON subjects', () => {
  const env = apiEnv();
  invalid(evaluateApi('accounts-api', { ...env, ACCOUNTS_API_ENV: 'development' }), 'ACCOUNTS_API_ENV');
  for (const value of ['https://solo.test/', 'https://solo.test/realm', 'http://solo.test', 'https://localhost', 'https://u:p@solo.test']) {
    invalid(evaluateApi('accounts-api', { ...env, ACCOUNTS_API_AUTH_ISSUER: value }), 'ACCOUNTS_API_AUTH_ISSUER');
  }
  for (const value of [privatePem(rsa), publicPem(weakRsa), publicPem(ec), 'not-pem']) {
    invalid(evaluateApi('accounts-api', { ...env, ACCOUNTS_API_AUTH_PUBLIC_KEY: value }), 'ACCOUNTS_API_AUTH_PUBLIC_KEY');
  }
  for (const value of ['["owner-a"]', '[]', 'owner-a,,owner-b', ',', 'owner-a,', 'owner\nline', 'x'.repeat(513)]) {
    invalid(evaluateApi('accounts-api', { ...env, ACCOUNTS_API_AUTH_SUBJECTS: value }), 'ACCOUNTS_API_AUTH_SUBJECTS');
  }
});

test('all mode checks issuer, owner subject sets and the shared signing key pair', () => {
  assert.equal(evaluateAll(allEnv()).ready, true);
  assert.equal(evaluateAll(allEnv()).target, 'all');
  for (const prefix of Object.values(prefixes)) {
    invalid(evaluateAll({ ...allEnv(), [`${prefix}_AUTH_ISSUER`]: 'https://identity.test' }),
      `${prefix}_AUTH_ISSUER`, 'issuer_mismatch');
    for (const value of ['owner-a', 'owner-a,unexpected-owner']) {
      invalid(evaluateAll({ ...allEnv(), [`${prefix}_AUTH_SUBJECTS`]: value }),
        `${prefix}_AUTH_SUBJECTS`, 'owner_subjects_mismatch');
    }
    invalid(evaluateAll({ ...allEnv(), [`${prefix}_AUTH_PUBLIC_KEY`]: publicPem(otherRsa) }),
      `${prefix}_AUTH_PUBLIC_KEY`, 'service_key_mismatch');
  }
});

test('required secrets and private allowlists cannot use NEXT_PUBLIC names', () => {
  for (const name of ['SOLO_WEB_OIDC_CLIENT_SECRET', 'SOLO_WEB_SESSION_KEY',
    'SOLO_WEB_SERVICE_PRIVATE_KEY', 'SOLO_WEB_OWNER_SUBJECTS']) {
    invalid(evaluateWeb({ ...webEnv(), [`NEXT_PUBLIC_${name}`]: 'leak-marker' }),
      `NEXT_PUBLIC_${name}`, 'secret_must_be_server_only');
  }
  invalid(evaluateApi('accounts-api', { ...apiEnv(), NEXT_PUBLIC_ACCOUNTS_API_AUTH_SUBJECTS: 'leak-marker' }),
    'NEXT_PUBLIC_ACCOUNTS_API_AUTH_SUBJECTS', 'secret_must_be_server_only');
});

test('JSON and human CLI output contain only field names, statuses and safe codes', () => {
  const marker = 'NEVER_PRINT_THIS_MARKER';
  const env = { ...allEnv(), SOLO_WEB_OIDC_CLIENT_SECRET: marker,
    SOLO_WEB_OWNER_SUBJECTS: JSON.stringify([marker]), SOLO_WEB_SERVICE_PRIVATE_KEY: marker,
    SOLO_WEB_PUBLIC_ORIGIN: `https://${marker}.test/path`,
    ACCOUNTS_API_AUTH_PUBLIC_KEY: marker, ACCOUNTS_API_AUTH_SUBJECTS: marker,
    NEXT_PUBLIC_SOLO_WEB_OIDC_CLIENT_SECRET: marker };
  for (const args of [['--all', '--json'], ['--all']]) {
    const output = [];
    assert.equal(runCli(args, env, (line) => output.push(line)), 1);
    const text = output.join('');
    assert.ok(!text.includes(marker));
    assert.ok(!text.includes(env.SOLO_WEB_SESSION_KEY));
    assert.ok(!text.includes('BEGIN PUBLIC KEY'));
    assert.ok(!text.includes('BEGIN PRIVATE KEY'));
    if (args.includes('--json')) {
      const report = JSON.parse(text);
      for (const entry of report.checks) {
        assert.ok(Object.keys(entry).every((key) => ['name', 'status', 'code'].includes(key)));
      }
    }
  }
});

test('CLI defaults to web, supports all/API modes and returns nonzero for invalid settings', () => {
  for (const [args, env, target] of [[[], webEnv(), 'web'], [['--web'], webEnv(), 'web'],
    [['--all'], allEnv(), 'all'], ...Object.keys(prefixes).map((api) => [['--api', api], apiEnv(api), api])]) {
    const output = [];
    assert.equal(runCli([...args, '--json'], env, (line) => output.push(line)), 0);
    assert.equal(JSON.parse(output.join('')).target, target);
  }
  for (const args of [['--api'], ['--api', 'unknown'], ['--web', '--all'],
    ['--api', 'accounts-api', '--web'], ['--env-file', 'private.env'], ['--api', 'NEVER_PRINT_THIS_MARKER']]) {
    const output = [];
    assert.equal(runCli([...args, '--json'], {}, (line) => output.push(line)), 2);
    const text = output.join('');
    assert.ok(!text.includes('NEVER_PRINT_THIS_MARKER'));
    assert.ok(!text.includes('private.env'));
    assert.equal(JSON.parse(text).ready, false);
  }
  assert.equal(runCli(['--json'], {}, () => {}), 1);
});

test('standalone Node entry point uses only supplied environment and safe stdout', () => {
  const missing = spawnSync(process.execPath, [script, '--api', 'accounts-api', '--json'], { env: {}, encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).ready, false);
  assert.equal(missing.stderr, '');
  const complete = spawnSync(process.execPath, [script, '--all', '--json'], { env: allEnv(), encoding: 'utf8' });
  assert.equal(complete.status, 0);
  assert.equal(JSON.parse(complete.stdout).ready, true);
  assert.equal(complete.stderr, '');
  assert.ok(!complete.stdout.includes('test-secret-marker'));
  assert.ok(!complete.stdout.includes('BEGIN PRIVATE KEY'));
  assert.ok(!complete.stdout.includes('BEGIN PUBLIC KEY'));
  assert.ok(!complete.stdout.includes('owner-a'));
  assert.ok(!complete.stdout.includes('owner-b'));
  assert.ok(!complete.stdout.includes(webEnv().SOLO_WEB_SESSION_KEY));
});
