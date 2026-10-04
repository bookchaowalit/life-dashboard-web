/**
 * Backend registry for the unified Solo Web frontend.
 *
 * Every module talks to its own independently deployed backend through
 * `/api/<service>/<path>`, which the proxy forwards to `<origin>/api/<path>`.
 * Each backend has its own origin variable so it can move to another host or
 * scale behind a load balancer without touching the frontend.
 */

import { isLoopbackHostname } from './request-guard';

export type Method = 'GET' | 'POST' | 'PATCH';

export interface Backend {
  id: string;
  label: string;
  originEnv: string;
  defaultOrigin: string;
  methods: readonly Method[];
  /** Allowed paths after `/api/<service>/`; undefined allows every `v1/...` path. */
  routes?: readonly RegExp[];
  /** Legacy credentials for explicit nonproduction loopback demo mutations only. */
  serverHeaders?: (env: Record<string, string | undefined>) => Record<string, string>;
  timeoutMs: number;
}

const SHA = 'sha256:[0-9a-f]{64}';
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const FLOW = '[a-z0-9]+(?:[-_][a-z0-9]+)*';
const JOB = '[0-9]{8}T[0-9]{6}-[0-9a-f]{8}';

export const BACKENDS: Record<string, Backend> = {
  today: {
    id: 'today', label: 'Today', originEnv: 'TODAY_API_ORIGIN', defaultOrigin: 'http://127.0.0.1:3410',
    methods: ['GET', 'PATCH'], timeoutMs: 10_000,
    routes: [/^v1\/today$/, /^v1\/tasks\/\d+$/],
  },
  knowledge: {
    id: 'knowledge', label: 'Knowledge', originEnv: 'KNOWLEDGE_API_ORIGIN', defaultOrigin: 'http://127.0.0.1:3430',
    methods: ['GET'], timeoutMs: 8_000,
    routes: [/^v1\/knowledge$/, /^v1\/knowledge\/document$/],
  },
  cloud: {
    id: 'cloud', label: 'Cloud', originEnv: 'CLOUD_API_ORIGIN', defaultOrigin: 'http://127.0.0.1:3440',
    methods: ['GET'], timeoutMs: 15_000,
    routes: [/^v1\/cloud\/usage$/, /^v1\/paas\/inventory$/, /^v1\/paas\/actions$/],
  },
  'ai-usage': {
    id: 'ai-usage', label: 'AI Usage', originEnv: 'AI_USAGE_API_ORIGIN', defaultOrigin: 'http://127.0.0.1:3520',
    methods: ['GET'], timeoutMs: 8_000,
    routes: [/^v1\/ai-usage$/],
  },
  accounts: {
    id: 'accounts', label: 'Accounts', originEnv: 'ACCOUNTS_API_ORIGIN', defaultOrigin: 'http://127.0.0.1:3470',
    methods: ['GET'], timeoutMs: 8_000,
    routes: [/^v1\/accounts$/],
  },
  integrations: {
    id: 'integrations', label: 'Integrations', originEnv: 'INTEGRATIONS_API_ORIGIN', defaultOrigin: 'http://127.0.0.1:3480',
    methods: ['GET'], timeoutMs: 8_000,
    routes: [/^v1\/integrations$/],
  },
  saas: {
    id: 'saas', label: 'SaaS Catalog', originEnv: 'SAAS_CATALOG_API_ORIGIN', defaultOrigin: 'http://127.0.0.1:3490',
    methods: ['GET'], timeoutMs: 8_000,
    routes: [/^v1\/saas$/],
  },
  production: {
    id: 'production', label: 'Production', originEnv: 'PRODUCTION_HUB_API_ORIGIN', defaultOrigin: 'http://127.0.0.1:3460',
    methods: ['GET', 'POST'], timeoutMs: 30_000,
    routes: [
      /^v1\/health$/, /^v1\/registry$/, /^v1\/artifacts$/, new RegExp(`^v1/artifacts/${SHA}(?:/lineage|/content)?$`),
      /^v1\/projects$/, new RegExp(`^v1/projects/${SLUG}(?:/(?:review|assign|package))?$`), /^v1\/send$/,
      /^v1\/flows$/, new RegExp(`^v1/flows/${FLOW}(?:/resume)?$`), new RegExp(`^v1/jobs/${JOB}$`),
      /^v1\/flow-templates$/, new RegExp(`^v1/flow-templates/${SLUG}$`),
      /^v1\/formats$/, /^v1\/runtimes$/, /^v1\/path$/,
    ],
    serverHeaders: (env) => ({
      'X-Hub-Client': 'console',
      ...(env.PRODUCTION_HUB_API_TOKEN ? { Authorization: `Bearer ${env.PRODUCTION_HUB_API_TOKEN}` } : {}),
    }),
  },
};

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export type OriginResult = { ok: true; origin: string } | { ok: false; code: string; message: string };

export function resolveOrigin(backend: Backend, env: Record<string, string | undefined>): OriginResult {
  const configured = env[backend.originEnv] || (env.NODE_ENV !== 'production' ? backend.defaultOrigin : '');
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return { ok: false, code: 'origin_invalid', message: `ตั้งค่า ${backend.originEnv} ไม่ถูกต้อง` };
  }
  const loopback = url.protocol === 'http:' && LOOPBACK.has(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    (env.NODE_ENV === 'production' && loopback) || (!loopback && isLoopbackHostname(url.hostname))) {
    return { ok: false, code: 'origin_not_allowed', message: `ตั้งค่า ${backend.originEnv} เป็น origin ที่อนุญาตเท่านั้น` };
  }
  const allowRemote = env[`${backend.originEnv.replace(/_ORIGIN$/, '')}_ALLOW_REMOTE`] === 'true';
  if (!loopback && !(allowRemote && url.protocol === 'https:')) {
    return {
      ok: false, code: 'origin_not_allowed',
      message: `${backend.label} API ต้องเป็น loopback หรือ HTTPS ที่เปิดด้วย ${backend.originEnv.replace(/_ORIGIN$/, '')}_ALLOW_REMOTE=true`,
    };
  }
  return { ok: true, origin: url.origin };
}

export function isAllowed(backend: Backend, method: string, path: string): boolean {
  if (!backend.methods.includes(method as Method)) return false;
  if (!/^v1\//.test(path) || path.includes('..')) return false;
  return backend.routes ? backend.routes.some((pattern) => pattern.test(path)) : true;
}
