import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Browser analytics core (Big Loop W4 pilot): off unless the flag and a key are
// set, nothing before consent, allow-listed enumerated properties only. The
// adapter is a recorder; fetch / XMLHttpRequest / sendBeacon are traps, and the
// real posthog-js module is replaced by one that counts imports, so a test
// fails if anything tries to leave the process or load the SDK.
const sdk = vi.hoisted(() => ({ imports: 0 }));
vi.mock('posthog-js', () => {
  sdk.imports += 1;
  return { default: new Proxy({}, { get: () => () => undefined }) };
});

import {
  CONSENT_KEY, IDENTIFIED_KEY, analytics, createAnalytics, readConfig, sanitizePath, type AdapterLoader, type AnalyticsAdapter,
} from '@/lib/browser-analytics';

const ON = { enabled: 'true', key: 'phc_test_only', host: 'https://eu.i.posthog.com' };
let network: unknown[][];

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    data,
  };
}

function recorder() {
  const calls: unknown[][] = [];
  let loads = 0;
  const adapter: AnalyticsAdapter = {
    track: (event, props) => { calls.push(['track', event, props]); },
    identify: (id) => { calls.push(['identify', id]); },
    page: (path) => { calls.push(['page', path]); },
    optOut: () => { calls.push(['optOut']); },
    reset: () => { calls.push(['reset']); },
  };
  const load: AdapterLoader = async () => { loads += 1; return adapter; };
  return { calls, load, loads: () => loads };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
// Lets a test pass names the code does not allow, to prove they are dropped.
const anyEvent = (name: string) => name as never;

beforeEach(() => {
  network = [];
  vi.stubGlobal('fetch', async (...args: unknown[]) => { network.push(['fetch', ...args]); return new Response('{}'); });
  vi.stubGlobal('XMLHttpRequest', function XMLHttpRequest() { network.push(['xhr']); });
  vi.stubGlobal('navigator', { sendBeacon: (...args: unknown[]) => { network.push(['beacon', ...args]); return true; } });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('config', () => {
  it('is on only when the flag is exactly "true" and a key is set', () => {
    expect(readConfig({})).toBeNull();
    expect(readConfig({ enabled: 'true' })).toBeNull();
    expect(readConfig({ enabled: 'true', key: '   ' })).toBeNull();
    expect(readConfig({ key: 'phc_x' })).toBeNull();
    for (const enabled of ['false', '1', 'TRUE', 'yes', ' true']) expect(readConfig({ enabled, key: 'phc_x' })).toBeNull();
    expect(readConfig({ enabled: 'true', key: ' phc_x ' })).toEqual({ key: 'phc_x', host: 'https://eu.i.posthog.com' });
    expect(readConfig({ ...ON, host: 'https://eu.example.test/' })).toEqual({ key: 'phc_test_only', host: 'https://eu.example.test' });
  });
});

describe('kill switch', () => {
  it('no network call (fetch/XHR/sendBeacon trapped) and no adapter load when the flag is off or no key is set, even after consent', async () => {
    for (const env of [{}, { enabled: 'false', key: 'phc_x' }, { enabled: 'true' }, { enabled: 'true', key: '' }]) {
      const r = recorder();
      const storage = memoryStorage({ [CONSENT_KEY]: 'granted' });
      const a = createAnalytics({ config: readConfig(env), load: r.load, storage });
      expect(a.enabled).toBe(false);
      a.setConsent('granted');
      a.page('/tasks');
      a.track('habit_logged', { change: 'done' });
      a.identify('owner0000000000000000');
      a.forgetIdentity();
      a.reset();
      await flush();
      expect(r.loads()).toBe(0);
      expect(r.calls).toEqual([]);
      expect(storage.data.size).toBe(1);
    }
    expect(network).toEqual([]);
  });

  it('the default singleton is off in tests (no NEXT_PUBLIC_* set) and never imports posthog-js', async () => {
    expect(analytics.enabled).toBe(false);
    analytics.setConsent('granted');
    analytics.page('/tasks');
    analytics.track('task_status_changed', { status: 'done' });
    await flush();
    expect(sdk.imports).toBe(0);
    expect(network).toEqual([]);
  });
});

describe('consent', () => {
  it('nothing before consent: nothing loads, nothing is sent, nothing is queued', async () => {
    const r = recorder();
    const a = createAnalytics({ config: readConfig(ON), load: r.load, storage: memoryStorage() });
    expect(a.enabled).toBe(true);
    expect(a.consent()).toBe('unknown');
    a.page('/tasks');
    a.track('habit_logged', { change: 'done' });
    await flush();
    expect(r.loads()).toBe(0);
    a.setConsent('granted');
    await flush();
    expect(r.calls).toEqual([]);
    expect(network).toEqual([]);
  });

  it('nothing after decline, and the choice is remembered', async () => {
    const r = recorder();
    const storage = memoryStorage();
    const a = createAnalytics({ config: readConfig(ON), load: r.load, storage });
    a.setConsent('denied');
    a.page('/habits');
    a.track('habit_logged', { change: 'done' });
    await flush();
    expect(r.loads()).toBe(0);
    expect(storage.getItem(CONSENT_KEY)).toBe('denied');
    expect(createAnalytics({ config: readConfig(ON), load: r.load, storage }).consent()).toBe('denied');
    expect(network).toEqual([]);
  });

  it('granted: loads the adapter once and forwards clean calls with product = life-dashboard', async () => {
    const r = recorder();
    const storage = memoryStorage();
    const a = createAnalytics({ config: readConfig(ON), load: r.load, storage });
    a.setConsent('granted');
    a.page('/tasks');
    a.track('habit_logged', { change: 'done' });
    a.track('task_status_changed', { status: 'in_progress' });
    a.track('owner_write_failed', { action: 'task_status', reason: 'server_error' });
    await flush();
    expect(r.loads()).toBe(1);
    expect(storage.getItem(CONSENT_KEY)).toBe('granted');
    expect(r.calls).toEqual([
      ['page', '/tasks'],
      ['track', 'habit_logged', { change: 'done', product: 'life-dashboard' }],
      ['track', 'task_status_changed', { status: 'in_progress', product: 'life-dashboard' }],
      ['track', 'owner_write_failed', { action: 'task_status', reason: 'server_error', product: 'life-dashboard' }],
    ]);
  });

  it('withdrawing consent opts out and stops sending', async () => {
    const r = recorder();
    const a = createAnalytics({ config: readConfig(ON), load: r.load, storage: memoryStorage() });
    a.setConsent('granted');
    a.page('/tasks');
    await flush();
    a.setConsent('denied');
    await flush();
    a.track('habit_logged', { change: 'done' });
    await flush();
    expect(r.calls).toEqual([['page', '/tasks'], ['optOut']]);
  });

  it('storage that throws (private mode) is treated as no choice made', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem() {} };
    const a = createAnalytics({ config: readConfig(ON), load: recorder().load, storage: broken });
    expect(a.consent()).toBe('unknown');
    expect(() => a.setConsent('granted')).not.toThrow();
    expect(a.consent()).toBe('granted');
  });

  it('subscribers hear consent changes', () => {
    const a = createAnalytics({ config: readConfig(ON), load: recorder().load, storage: memoryStorage() });
    const heard: string[] = [];
    const off = a.subscribe((value) => heard.push(value));
    a.setConsent('granted');
    off();
    a.setConsent('denied');
    expect(heard).toEqual(['granted']);
  });

  it('a failed SDK download never throws into the page', async () => {
    const a = createAnalytics({ config: readConfig(ON), load: async () => { throw new Error('blocked'); }, storage: memoryStorage() });
    a.setConsent('granted');
    expect(() => a.page('/tasks')).not.toThrow();
    await flush();
  });
});

describe('no PII in event properties', () => {
  it('drops titles, habit names, money amounts, notes, decision text, ids, URLs and unknown events', async () => {
    const r = recorder();
    const a = createAnalytics({ config: readConfig(ON), load: r.load, storage: memoryStorage() });
    a.setConsent('granted');
    a.track('habit_logged', { change: 'done', habit_name: 'Meditate', habit_id: 42, note: 'felt sad', amount: 1500 });
    a.track('task_status_changed', { status: 'done', title: 'Pay rent to landlord', number: 17 });
    a.track('task_status_changed', { status: 'blocked' });
    a.track('task_status_changed', { status: 'Pay rent' });
    a.track('habit_logged', { change: 'a@example.test' });
    a.track('habit_logged', { change: 'https://x.test/?token=abc' });
    a.track('habit_logged', {});
    a.track('owner_write_failed', { action: 'task_status', reason: 'Cell said: decision text here' });
    a.track(anyEvent('decision_viewed'), { text: 'Should I quit?' });
    a.track(anyEvent('finance_viewed'), { amount: '12,000 THB' });
    await flush();
    expect(r.calls).toEqual([
      ['track', 'habit_logged', { change: 'done', product: 'life-dashboard' }],
      ['track', 'task_status_changed', { status: 'done', product: 'life-dashboard' }],
    ]);
    expect(JSON.stringify(r.calls)).not.toMatch(/@|Meditate|sad|1500|rent|17|42|https?:|token|quit|THB|decision text/);
  });
});

describe('identity', () => {
  it('identify accepts only a pseudonymous id, never an email or free text', async () => {
    const r = recorder();
    const a = createAnalytics({ config: readConfig(ON), load: r.load, storage: memoryStorage() });
    a.setConsent('granted');
    for (const id of ['a@example.test', 'Book Chaowalit', '', '  ', 'x'.repeat(200)]) a.identify(id);
    await flush();
    expect(r.calls).toEqual([]);
  });

  it('sign-out after a reload still forgets the identified user (stored marker, not memory)', async () => {
    const storage = memoryStorage();
    const before = createAnalytics({ config: readConfig(ON), load: recorder().load, storage });
    before.setConsent('granted');
    before.identify('owner0000000000000000');
    await flush();
    expect(storage.getItem(IDENTIFIED_KEY)).toBe('1');

    const second = recorder();
    const after = createAnalytics({ config: readConfig(ON), load: second.load, storage });
    after.forgetIdentity();
    await flush();
    expect(second.calls).toEqual([['reset']]);
    expect(storage.getItem(IDENTIFIED_KEY)).toBeNull();

    const third = recorder();
    createAnalytics({ config: readConfig(ON), load: third.load, storage }).forgetIdentity();
    await flush();
    expect(third.calls).toEqual([]);
  });

  it('declining after identify clears the stored marker', async () => {
    const storage = memoryStorage();
    const a = createAnalytics({ config: readConfig(ON), load: recorder().load, storage });
    a.setConsent('granted');
    a.identify('owner0000000000000000');
    await flush();
    a.setConsent('denied');
    expect(storage.getItem(IDENTIFIED_KEY)).toBeNull();
  });

  it('uses the life-dashboard storage keys', () => {
    expect(CONSENT_KEY).toBe('life-dashboard.analytics-consent.v1');
    expect(IDENTIFIED_KEY).toBe('life-dashboard.analytics-identified.v1');
  });
});

describe('path sanitising', () => {
  it('page paths lose origin, query strings, fragments and id-like segments', () => {
    const cases: Record<string, string> = {
      '/': '/',
      '/tasks?status=done&q=rent': '/tasks',
      '/knowledge?q=my+private+search': '/knowledge',
      '/finance#debts': '/finance',
      'https://solo-web-one.vercel.app/decisions/42?x=1': '/decisions/:id',
      '/decisions/550e8400-e29b-41d4-a716-446655440000': '/decisions/:id',
      '/u/a@example.test': '/u/:id',
      '/hash/deadbeefcafe1234': '/hash/:id',
      '/x/clx0abcdef0000000000000000/edit': '/x/:id/edit',
    };
    for (const [input, expected] of Object.entries(cases)) expect(sanitizePath(input), input).toBe(expected);
  });

  it('page() sends the cleaned path only', async () => {
    const r = recorder();
    const a = createAnalytics({ config: readConfig(ON), load: r.load, storage: memoryStorage() });
    a.setConsent('granted');
    a.page('/decisions/7?from=email');
    await flush();
    expect(r.calls).toEqual([['page', '/decisions/:id']]);
  });
});
