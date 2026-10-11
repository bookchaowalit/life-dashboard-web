#!/usr/bin/env node
/**
 * Read-only metadata staging checks. Reads only the supplied process environment;
 * never loads env files, resolves secrets, calls providers or deploys anything.
 *
 * node scripts/staging-preflight.mjs [--web | --api <service> | --all] [--json]
 * --all additionally verifies the issuer, owner allowlists and RSA key pair.
 * This checks configuration, not live login, data durability or laptop-off readiness.
 */
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Matches the four owner-scoped services in lib/auth.ts and lib/backends.ts.
const API_PREFIXES = Object.freeze({
  'accounts-api': 'ACCOUNTS_API',
  'integrations-api': 'INTEGRATIONS_API',
  'saas-catalog-api': 'SAAS_CATALOG_API',
  'knowledge-api': 'KNOWLEDGE_API',
});
const WEB_PRIVATE_FIELDS = [
  'SOLO_WEB_OIDC_CLIENT_SECRET', 'SOLO_WEB_SESSION_KEY',
  'SOLO_WEB_SERVICE_PRIVATE_KEY', 'SOLO_WEB_OWNER_SUBJECTS',
];
const CONTROL = /[\u0000-\u001f\u007f]/;
// JS trim and Python strip treat NEL/BOM differently; never normalize these subjects.
const SUBJECT_CONTROL = /[\u007f-\u009f\ufeff]/;
const placeholder = (value) => /REPLACE_WITH(?:_|$)/i.test(value);

function setting(name, value, validate, optional = false) {
  if (value === undefined || value === '') {
    return optional ? { name, status: 'ok' } : { name, status: 'missing', code: 'required' };
  }
  const code = typeof value === 'string' ? validate(value) : 'string_required';
  return code ? { name, status: 'invalid', code } : { name, status: 'ok' };
}

function report(target, checks) {
  return { scope: 'metadata_staging', target, ready: checks.every((entry) => entry.status === 'ok'), checks };
}

function privateFields(env, names) {
  return names.map((name) => {
    const publicName = `NEXT_PUBLIC_${name}`;
    return env[publicName] === undefined ? { name: publicName, status: 'ok' } :
      { name: publicName, status: 'invalid', code: 'secret_must_be_server_only' };
  });
}

function localHost(hostname) {
  const host = hostname.replace(/\.$/, '');
  return host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) ||
    host === '[::1]' || /^\[::ffff:7f[0-9a-f]{2}:/.test(host) || host === '0.0.0.0' || host === '[::]';
}

function httpsUrl(value, originOnly = false) {
  try {
    if (placeholder(value) || /[\s\\]/.test(value)) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.hostname.includes('*') || localHost(url.hostname) || url.port === '0') return null;
    // An exact canonical origin has no slash, path, query or URL normalization.
    // API AuthPolicy requires precisely this issuer shape; Web signs its normalized origin.
    if (originOnly && value !== url.origin) return null;
    return url;
  } catch { return null; }
}

const originCode = (value) => httpsUrl(value, true) ? null : 'https_origin_required';
const issuerCode = (value) => httpsUrl(value) ? null : 'https_oidc_issuer_required';

function previewsCode(value) {
  return value.split(',').every((item) => httpsUrl(item.trim(), true)) ? null : 'exact_preview_origins_required';
}

function credentialCode(value) {
  if (placeholder(value)) return 'placeholder_not_configured';
  return value.trim().length > 0 && !CONTROL.test(value) ? null : 'nonempty_credential_required';
}

function subjectValid(value) {
  return typeof value === 'string' && [...value].length > 0 && [...value].length <= 512 &&
    value.trim() === value && !value.includes(',') && !CONTROL.test(value) &&
    !SUBJECT_CONTROL.test(value) && !placeholder(value);
}

function ownerSubjects(value) {
  try {
    const subjects = JSON.parse(value);
    return Array.isArray(subjects) && subjects.length > 0 && subjects.every(subjectValid) ? subjects : null;
  } catch { return null; }
}

function csvSubjects(value) {
  if (typeof value !== 'string' || SUBJECT_CONTROL.test(value) || /^[\[{]/.test(value.trim())) return null;
  const subjects = value.split(',').map((item) => item.trim());
  return subjects.length > 0 && subjects.every(subjectValid) ? subjects : null;
}

function sessionKeyCode(value) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return 'canonical_base64url_32_bytes_required';
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === 32 && bytes.toString('base64url') === value ? null : 'canonical_base64url_32_bytes_required';
}

function rsaKey(value, privateKey = false) {
  // Web importPKCS8 uses real newlines; only API AuthPolicy normalizes literal \\n.
  const pem = privateKey ? value : value.trim().replaceAll('\\n', '\n');
  const pattern = privateKey ?
    /^-----BEGIN PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PRIVATE KEY-----\r?\n?$/ :
    /^-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY)-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END \1-----\r?\n?$/;
  if (!pattern.test(pem)) return { code: privateKey ? 'pkcs8_private_key_required' : 'pem_public_key_required' };
  try {
    const key = privateKey ? createPrivateKey(pem) : createPublicKey(pem);
    if (key.asymmetricKeyType !== 'rsa') return { code: 'rsa_key_required' };
    if (!(key.asymmetricKeyDetails?.modulusLength >= 2048)) return { code: 'rsa_modulus_too_small' };
    return { key };
  } catch { return { code: 'key_invalid' }; }
}

/** Returns only setting names, statuses and safe codes; never configuration values. */
export function evaluateWeb(env) {
  const checks = [
    setting('NODE_ENV', env.NODE_ENV, (value) => value === 'production' ? null : 'production_required'),
    setting('SOLO_WEB_PUBLIC_ORIGIN', env.SOLO_WEB_PUBLIC_ORIGIN, originCode),
    setting('SOLO_WEB_PREVIEW_ORIGINS', env.SOLO_WEB_PREVIEW_ORIGINS, previewsCode, true),
    setting('SOLO_WEB_OIDC_ISSUER', env.SOLO_WEB_OIDC_ISSUER, issuerCode),
    setting('SOLO_WEB_OIDC_CLIENT_ID', env.SOLO_WEB_OIDC_CLIENT_ID, credentialCode),
    setting('SOLO_WEB_OIDC_CLIENT_SECRET', env.SOLO_WEB_OIDC_CLIENT_SECRET, credentialCode),
    setting('SOLO_WEB_OWNER_SUBJECTS', env.SOLO_WEB_OWNER_SUBJECTS,
      (value) => ownerSubjects(value) ? null : 'json_owner_subjects_required'),
    setting('SOLO_WEB_SESSION_KEY', env.SOLO_WEB_SESSION_KEY, sessionKeyCode),
    setting('SOLO_WEB_SERVICE_PRIVATE_KEY', env.SOLO_WEB_SERVICE_PRIVATE_KEY, (value) => rsaKey(value, true).code),
    setting('SOLO_WEB_LOCAL_DEMO', env.SOLO_WEB_LOCAL_DEMO,
      (value) => value === 'false' ? null : 'local_demo_must_be_disabled', true),
  ];
  for (const prefix of Object.values(API_PREFIXES)) {
    checks.push(setting(`${prefix}_ORIGIN`, env[`${prefix}_ORIGIN`], originCode),
      setting(`${prefix}_ALLOW_REMOTE`, env[`${prefix}_ALLOW_REMOTE`],
        (value) => value === 'true' ? null : 'remote_opt_in_required'));
  }
  return report('web', [...checks, ...privateFields(env, WEB_PRIVATE_FIELDS)]);
}

export function evaluateApi(api, env) {
  const prefix = Object.hasOwn(API_PREFIXES, api) ? API_PREFIXES[api] : null;
  if (!prefix) return report('invalid', [{ name: 'CLI', status: 'invalid', code: 'unsupported_api' }]);
  return report(api, [
    setting(`${prefix}_ENV`, env[`${prefix}_ENV`],
      (value) => value.trim().toLowerCase() === 'production' ? null : 'production_required'),
    setting(`${prefix}_AUTH_ISSUER`, env[`${prefix}_AUTH_ISSUER`], originCode),
    setting(`${prefix}_AUTH_PUBLIC_KEY`, env[`${prefix}_AUTH_PUBLIC_KEY`], (value) => rsaKey(value).code),
    setting(`${prefix}_AUTH_SUBJECTS`, env[`${prefix}_AUTH_SUBJECTS`],
      (value) => csvSubjects(value) ? null : 'csv_owner_subjects_required'),
    ...privateFields(env, [`${prefix}_AUTH_SUBJECTS`]),
  ]);
}

export function evaluateAll(env) {
  const checks = [...evaluateWeb(env).checks, ...Object.keys(API_PREFIXES).flatMap((api) => evaluateApi(api, env).checks)];
  const ok = (name) => checks.find((entry) => entry.name === name)?.status === 'ok';
  const invalidate = (name, code) => {
    const entry = checks.find((item) => item.name === name);
    entry.status = 'invalid';
    entry.code = code;
  };
  const owners = ok('SOLO_WEB_OWNER_SUBJECTS') ? new Set(ownerSubjects(env.SOLO_WEB_OWNER_SUBJECTS)) : null;
  const privateKey = ok('SOLO_WEB_SERVICE_PRIVATE_KEY') ? rsaKey(env.SOLO_WEB_SERVICE_PRIVATE_KEY, true).key : null;
  const signingPublic = privateKey ? createPublicKey(privateKey).export({ format: 'der', type: 'spki' }) : null;
  for (const prefix of Object.values(API_PREFIXES)) {
    const issuer = `${prefix}_AUTH_ISSUER`;
    const subjects = `${prefix}_AUTH_SUBJECTS`;
    const publicKey = `${prefix}_AUTH_PUBLIC_KEY`;
    if (ok('SOLO_WEB_PUBLIC_ORIGIN') && ok(issuer) && env[issuer] !== env.SOLO_WEB_PUBLIC_ORIGIN) {
      invalidate(issuer, 'issuer_mismatch');
    }
    if (owners && ok(subjects)) {
      const allowed = new Set(csvSubjects(env[subjects]));
      if (allowed.size !== owners.size || [...owners].some((owner) => !allowed.has(owner))) {
        invalidate(subjects, 'owner_subjects_mismatch');
      }
    }
    if (signingPublic && ok(publicKey) && !signingPublic.equals(rsaKey(env[publicKey]).key.export({ format: 'der', type: 'spki' }))) {
      invalidate(publicKey, 'service_key_mismatch');
    }
  }
  return report('all', checks);
}

function argumentsFor(argv) {
  let target = 'web';
  let selected = false;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') { json = true; continue; }
    if (selected || !['--web', '--all', '--api'].includes(argument)) return null;
    selected = true;
    target = argument === '--all' ? 'all' : 'web';
    if (argument === '--api') {
      target = argv[++index];
      if (!Object.hasOwn(API_PREFIXES, target)) return null;
    }
  }
  return { target, json };
}

/** Injectable output keeps the same secret-free reporting contract in tests and CLI. */
export function runCli(argv, env, emit = (text) => process.stdout.write(text)) {
  const args = argumentsFor(argv);
  const result = args ? (args.target === 'web' ? evaluateWeb(env) :
    args.target === 'all' ? evaluateAll(env) : evaluateApi(args.target, env)) :
    report('invalid', [{ name: 'CLI', status: 'invalid', code: 'invalid_arguments' }]);
  if (args?.json || argv.includes('--json')) {
    emit(`${JSON.stringify(result)}\n`);
  } else {
    emit([`metadata_staging ${result.target}: ${result.ready ? 'ready' : 'not_ready'}`,
      ...result.checks.map((entry) => `${entry.name}: ${entry.status}${entry.code ? ` (${entry.code})` : ''}`)].join('\n') + '\n');
  }
  return args ? (result.ready ? 0 : 1) : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2), process.env);
}
