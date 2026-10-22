// Sentry settings shared by the browser, Node.js and Edge runtimes.
// Errors only: no tracing, no trace headers on outgoing requests, no replay.
// The dashboard proxies personal finance, diary and health records, so every event is
// rebuilt from an allowlist (the error, its stack, level, release and runtime) instead of
// deleting known fields: request, user, tags, transaction, breadcrumbs, extra, threads and
// any context Sentry or Next.js adds later never leave the process.

type Frame = {
  function?: unknown;
  module?: unknown;
  filename?: unknown;
  abs_path?: unknown;
  lineno?: unknown;
  colno?: unknown;
  in_app?: unknown;
  platform?: unknown;
};

type ScrubbableEvent = {
  message?: unknown;
  contexts?: Record<string, unknown>;
  exception?: {
    values?: {
      type?: unknown;
      value?: unknown;
      mechanism?: { type?: unknown; handled?: unknown };
      stacktrace?: { frames?: Frame[] };
    }[];
  };
};

const TOP_LEVEL = ['event_id', 'timestamp', 'level', 'platform', 'environment', 'release', 'dist', 'sdk'] as const;
const CONTEXTS = ['runtime', 'os', 'browser', 'device'] as const;
const FRAME_FIELDS = ['function', 'module', 'filename', 'abs_path', 'lineno', 'colno', 'in_app', 'platform'] as const;

const URL_PATTERN = /\b(https?:\/\/[^\s/?#'"<>]+)[^\s'"<>]*/gi;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

/** Messages keep their wording; URLs shrink to their origin and email addresses go. */
export function redactText(text: string): string {
  return text.replace(URL_PATTERN, '$1').replace(EMAIL_PATTERN, '[email]').slice(0, 500);
}

function stripQuery(location: unknown): unknown {
  return typeof location === 'string' ? location.replace(/[?#].*$/, '') : location;
}

function pick<T extends object>(source: T, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const out = pick(event, TOP_LEVEL);
  if (typeof event.message === 'string') out.message = redactText(event.message);
  if (event.contexts) {
    const contexts = pick(event.contexts, CONTEXTS);
    if (Object.keys(contexts).length) out.contexts = contexts;
  }
  if (event.exception?.values) {
    out.exception = {
      values: event.exception.values.map((value) => ({
        ...(value.type !== undefined && { type: value.type }),
        ...(typeof value.value === 'string' && { value: redactText(value.value) }),
        ...(value.mechanism && { mechanism: pick(value.mechanism, ['type', 'handled']) }),
        ...(value.stacktrace?.frames && {
          stacktrace: {
            frames: value.stacktrace.frames.map((frame) => {
              const kept = pick(frame, FRAME_FIELDS);
              if ('filename' in kept) kept.filename = stripQuery(kept.filename);
              if ('abs_path' in kept) kept.abs_path = stripQuery(kept.abs_path);
              return kept;
            }),
          },
        }),
      })),
    };
  }
  return out as T;
}

export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    sendDefaultPii: false,
    tracesSampleRate: undefined,
    tracePropagationTargets: [] as string[],
    maxBreadcrumbs: 0,
    beforeSend: scrubEvent,
    beforeSendTransaction: () => null,
  };
}
