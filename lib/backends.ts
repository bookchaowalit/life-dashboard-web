/**
 * Backend registry for the unified Solo Web frontend.
 *
 * Every module talks to its own independently deployed backend through
 * `/api/<service>/<path>`, which the proxy forwards to `<origin>/api/<path>`.
 * Each backend has its own origin variable so it can move to another host or
 * scale behind a load balancer without touching the frontend.
 */

export type Method = 'GET' | 'POST' | 'PATCH';

export interface Backend {
  id: string;
  label: string;
  originEnv: string;
  defaultOrigin: string;
  methods: readonly Method[];
  /** Allowed paths after `/api/<service>/`; undefined allows every `v1/...` path. */
  routes?: readonly RegExp[];
  /** Forward the browser's Authorization header (user-entered access tokens). */
  forwardAuthorization: boolean;
  /** Server-side headers added to mutating requests (never exposed to the browser). */
  serverHeaders?: (env: Record<string, string | undefined>) => Record<string, string>;
  timeoutMs: number;
}

const SHA = 'sha256:[0-9a-f]{64}';
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const FLOW = '[a-z0-9]+(?:[-_][a-z0-9]+)*';

export const BACKENDS: Record<string, Backend> = {
  today: {
    id: 'today', label: 'Today', originEnv: 'TODAY_API_ORIGIN', defaultOrigin: 'http://127.0.0.1:3410',
    methods: ['GET', 'PATCH'], forwardAuthorization: false, timeoutMs: 10_000,
    routes: [/^v1\/today$/, /^v1\/tasks\/\d+$/],
  },
  knowledge: {
    id: 'knowledge', label: 'Knowledge', originEnv: 'KNOWLEDGE_API_ORIGIN', defaultOrigin: 'http://127.0.0.1:3430',
    methods: ['GET'], forwardAuthorization: true, timeoutMs: 8_000,
    routes: [/^v1\/knowledge$/, /^v1\/knowledge\/document$/],
  },
  cloud: {
    id: 'cloud', label: 'Cloud', originEnv: 'CLOUD_API_ORIGIN', defaultOrigin: 'http://127.0.0.1:3440',
    methods: ['GET'], forwardAuthorization: true, timeoutMs: 30_000,
    routes: [/^v1\/cloud\/usage$/, /^v1\/paas\/inventory$/, /^v1\/paas\/actions$/],
  },
  production: {
    id: 'production', label: 'Production', originEnv: 'PRODUCTION_HUB_API_ORIGIN', defaultOrigin: 'http://127.0.0.1:3460',
    methods: ['GET', 'POST'], forwardAuthorization: false, timeoutMs: 30 * 60_000,
    routes: [
      /^v1\/health$/, /^v1\/registry$/, /^v1\/artifacts$/, new RegExp(`^v1/artifacts/${SHA}(?:/lineage|/content)?$`),
      /^v1\/projects$/, new RegExp(`^v1/projects/${SLUG}(?:/(?:review|assign|package))?$`), /^v1\/send$/,
      /^v1\/flows$/, new RegExp(`^v1/flows/${FLOW}(?:/resume)?$`),
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
  const configured = env[backend.originEnv] || backend.defaultOrigin;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return { ok: false, code: 'origin_invalid', message: `ตั้งค่า ${backend.originEnv} ไม่ถูกต้อง` };
  }
  const loopback = url.protocol === 'http:' && LOOPBACK.has(url.hostname);
  const allowRemote = env[`${backend.originEnv.replace(/_ORIGIN$/, '')}_ALLOW_REMOTE`] === 'true';
  if (!loopback && !(allowRemote && url.protocol === 'https:')) {
    return {
      ok: false, code: 'origin_not_allowed',
      message: `${backend.label} API ต้องเป็น loopback หรือ HTTPS ที่เปิดด้วย ${backend.originEnv.replace(/_ORIGIN$/, '')}_ALLOW_REMOTE=true`,
    };
  }
  return { ok: true, origin: url.toString().replace(/\/$/, '') };
}

export function isAllowed(backend: Backend, method: string, path: string): boolean {
  if (!backend.methods.includes(method as Method)) return false;
  if (!/^v1\//.test(path) || path.includes('..')) return false;
  return backend.routes ? backend.routes.some((pattern) => pattern.test(path)) : true;
}
