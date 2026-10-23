import { describe, expect, it } from 'vitest';

import { loadPostHog, posthogOptions, scrubCapture } from '@/lib/posthog-adapter';

// PostHog adapter: privacy-first init options, URL scrubbing before send, and a
// thin mapping from the provider-neutral calls. posthog-js is replaced by a
// recorder; the real SDK is never loaded here.
function fakePostHog() {
  const calls: unknown[][] = [];
  const posthog = new Proxy({}, { get: (_, name) => (...args: unknown[]) => { calls.push([name, ...args]); } });
  return { calls, importer: async () => ({ default: posthog as never }) };
}

describe('posthog adapter', () => {
  it('init options: no autocapture, recordings, surveys, flags or remote scripts; masked text; manual pageviews', () => {
    const options = posthogOptions('https://eu.i.posthog.com') as Record<string, unknown>;
    expect(options.api_host).toBe('https://eu.i.posthog.com');
    for (const key of ['autocapture', 'capture_pageview', 'capture_pageleave', 'capture_heatmaps', 'capture_dead_clicks', 'capture_exceptions', 'rageclick']) {
      expect(options[key], key).toBe(false);
    }
    for (const key of ['disable_session_recording', 'disable_surveys', 'disable_web_experiments', 'disable_external_dependency_loading',
      'advanced_disable_flags', 'mask_all_text', 'mask_all_element_attributes']) {
      expect(options[key], key).toBe(true);
    }
    expect((options.session_recording as { maskAllInputs: boolean }).maskAllInputs).toBe(true);
    expect(options.save_campaign_params, 'UTM values come from the query string, which is never kept').toBe(false);
    expect(options.persistence).toBe('localStorage');
    expect(options.person_profiles).toBe('identified_only');
    expect(typeof options.before_send).toBe('function');
  });

  it('before_send strips query strings, fragments, ids, referrer paths and the IP', () => {
    const scrubbed = scrubCapture({
      uuid: 'u', event: '$pageview',
      properties: {
        $current_url: 'https://solo-web-one.vercel.app/decisions/123?token=abc#x',
        $pathname: '/decisions/123',
        $referrer: 'https://mail.example.test/inbox/a@example.test?id=9',
        $referring_domain: 'mail.example.test',
        $initial_current_url: 'https://solo-web-one.vercel.app/knowledge?q=private',
        $ip: '203.0.113.9',
        product: 'life-dashboard',
      },
      $set: { $current_url: 'https://solo-web-one.vercel.app/?q=private' },
      $set_once: { $initial_referrer: 'https://mail.example.test/inbox?id=9' },
    } as never)!;
    expect(scrubbed.properties).toEqual({
      $current_url: 'https://solo-web-one.vercel.app/decisions/:id',
      $pathname: '/decisions/:id',
      $referrer: 'https://mail.example.test',
      $referring_domain: 'mail.example.test',
      $initial_current_url: 'https://solo-web-one.vercel.app/knowledge',
      $geoip_disable: true,
      product: 'life-dashboard',
    });
    expect(scrubbed.$set?.$current_url).toBe('https://solo-web-one.vercel.app/');
    expect(scrubbed.$set_once?.$initial_referrer).toBe('https://mail.example.test');
    expect(JSON.stringify(scrubbed)).not.toMatch(/token|private|@|203\.0/);
    expect(scrubCapture(null)).toBeNull();
  });

  it('loadPostHog maps the neutral calls and registers product = life-dashboard', async () => {
    const { calls, importer } = fakePostHog();
    const a = await loadPostHog({ key: 'phc_test_only', host: 'https://eu.i.posthog.com' }, importer);
    a.track('habit_logged', { change: 'done', product: 'life-dashboard' });
    a.identify('owner0000000000000000');
    a.page('/tasks');
    a.optOut();
    a.reset();
    expect(calls.map(([name]) => name)).toEqual(['init', 'register', 'capture', 'identify', 'capture', 'opt_out_capturing', 'reset', 'reset']);
    expect(calls[0][1]).toBe('phc_test_only');
    expect(calls[1][1]).toEqual({ product: 'life-dashboard' });
    expect(calls[2].slice(1)).toEqual(['habit_logged', { change: 'done', product: 'life-dashboard' }]);
    expect(calls[4][1]).toBe('$pageview');
    expect((calls[4][2] as { $pathname: string }).$pathname).toBe('/tasks');
  });
});
