import { describe, expect, it } from 'vitest';

import { scrubEvent, sentryOptions } from '@/lib/sentry';

describe('sentryOptions', () => {
  it('stays disabled when no DSN is configured', () => {
    expect(sentryOptions(undefined).enabled).toBe(false);
    expect(sentryOptions('').enabled).toBe(false);
  });

  it('reports errors only: no PII, tracing, trace headers or breadcrumbs', () => {
    const options = sentryOptions('https://key@o0.ingest.sentry.io/1');
    expect(options.enabled).toBe(true);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(undefined);
    expect(options.tracePropagationTargets).toEqual([]);
    expect(options.maxBreadcrumbs).toBe(0);
    expect(options.beforeSendTransaction()).toBe(null);
  });
});

// Shaped like what Sentry.captureRequestError sends for a failing route handler.
function requestErrorEvent() {
  return {
    event_id: 'abc',
    timestamp: 1,
    level: 'error',
    platform: 'node',
    environment: 'production',
    release: 'r1',
    message: 'failed for x@example.com',
    transaction: 'GET /api/finance-transactions/v1/transactions/42',
    tags: { url: 'https://life.example/api/finance-transactions/v1/transactions/42?q=rent' },
    request: {
      url: 'https://life.example/api/finance-transactions/v1/transactions/42?q=rent',
      headers: { cookie: 'session=a', authorization: 'Bearer t' },
      data: '{"amount": 1200}',
    },
    user: { ip_address: '1.2.3.4', email: 'x@example.com' },
    breadcrumbs: [{ message: 'clicked' }],
    extra: { body: '{"amount": 1200}' },
    threads: { values: [{ id: 1 }] },
    contexts: {
      nextjs: { route_type: 'route', router_path: '/api/[service]/[...path]' },
      response: { body: '{"diary": "private"}' },
      trace: { trace_id: 't' },
      runtime: { name: 'node', version: 'v22' },
      os: { name: 'Linux' },
    },
    exception: {
      values: [
        {
          type: 'Error',
          value:
            'upstream 500 from https://cell.example/v1/diary/entries/7?token=abc for owner@example.com',
          mechanism: { type: 'auto.function.nextjs.on_request_error', handled: false },
          stacktrace: {
            frames: [
              {
                function: 'GET',
                filename: 'https://life.example/_next/static/chunks/app.js?dpl=dpl_1',
                abs_path: 'https://life.example/_next/static/chunks/app.js?dpl=dpl_1#x',
                lineno: 3,
                colno: 9,
                in_app: true,
                vars: { token: 'p' },
                context_line: 'const secret = "s";',
                pre_context: ['a'],
                post_context: ['b'],
              },
            ],
          },
        },
      ],
    },
  };
}

describe('scrubEvent', () => {
  it('keeps only an allowlist: the error, its stack, level, release and runtime', () => {
    const event = scrubEvent(requestErrorEvent()) as Record<string, unknown>;
    expect(Object.keys(event).sort()).toEqual(
      ['contexts', 'environment', 'event_id', 'exception', 'level', 'message', 'platform', 'release', 'timestamp'],
    );
    expect(event.contexts).toEqual({ runtime: { name: 'node', version: 'v22' }, os: { name: 'Linux' } });
  });

  it('redacts URLs to their origin and drops email addresses in messages', () => {
    const event = scrubEvent(requestErrorEvent());
    expect(event.message).toBe('failed for [email]');
    expect(event.exception?.values?.[0]?.value).toBe(
      'upstream 500 from https://cell.example for [email]',
    );
  });

  it('keeps frame locations without locals, source lines or query strings', () => {
    const frame = scrubEvent(requestErrorEvent()).exception?.values?.[0]?.stacktrace?.frames?.[0];
    expect(frame).toEqual({
      function: 'GET',
      filename: 'https://life.example/_next/static/chunks/app.js',
      abs_path: 'https://life.example/_next/static/chunks/app.js',
      lineno: 3,
      colno: 9,
      in_app: true,
    });
  });

  it('keeps the exception type and mechanism', () => {
    const value = scrubEvent(requestErrorEvent()).exception?.values?.[0];
    expect(value?.type).toBe('Error');
    expect(value?.mechanism).toEqual({ type: 'auto.function.nextjs.on_request_error', handled: false });
  });
});
