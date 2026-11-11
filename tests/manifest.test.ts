import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import manifest from '@/app/manifest';

// Installable PWA (interface-coverage S-life-os-pwa): standalone, Thai, 192/512 PNG icons with one
// maskable. No service worker: owner data is live and personal, so nothing is cached offline.

function pngSize(path: string): string {
  const buf = readFileSync(new URL(`../public${path}`, import.meta.url));
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

describe('web app manifest', () => {
  it('makes Solo Empire installable', () => {
    const m = manifest();
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.lang).toBe('th');
    expect(m.short_name!.length).toBeLessThanOrEqual(12);
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('lists icons that exist at the size they claim, one 512 maskable', () => {
    const icons = manifest().icons ?? [];
    for (const icon of icons) expect(pngSize(icon.src)).toBe(icon.sizes);
    expect(icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  });
});
