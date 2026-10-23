import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ConsentBanner, ConsentChoicesLink, panelState } from '@/components/analytics/consent-banner';

// PDPA consent banner: shown only when analytics is configured and no choice is
// stored; declining is as easy as accepting (same size, same look); the choice
// can be reopened from "Analytics choices".
type Props = { onClick?: () => void; children?: unknown; className?: string };

function clickables(node: unknown, found: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { node.forEach((child) => clickables(child, found)); return found; }
  const element = node as ReactElement<Props>;
  if (element.props?.onClick) found.push(element);
  clickables(element.props?.children, found);
  return found;
}

describe('consent banner', () => {
  it('panel state: hidden when off or before mount, banner until a choice, then the choices control', () => {
    expect(panelState(false, 'unknown', false)).toBe('hidden');
    expect(panelState(false, 'granted', true)).toBe('hidden');
    expect(panelState(true, 'unknown', false)).toBe('banner');
    expect(panelState(true, 'granted', false)).toBe('choices');
    expect(panelState(true, 'denied', false)).toBe('choices');
    expect(panelState(true, 'denied', true)).toBe('banner');
    expect(panelState(true, 'unknown', false, false)).toBe('hidden');
  });

  it('labelled region; Decline and Allow side by side with the same size and the same visual style', () => {
    const html = renderToStaticMarkup(<ConsentBanner onAccept={() => {}} onDecline={() => {}} />);
    expect(html).toMatch(/<section[^>]*role="region"/);
    expect(html).toMatch(/aria-label="Analytics consent"/);
    expect(html).toMatch(/aria-labelledby="shell-consent-title"/);
    const buttons = [...html.matchAll(/<button([^>]*)>([^<]+)<\/button>/g)].map((m) => ({ attrs: m[1], label: m[2] }));
    expect(buttons.map((b) => b.label)).toEqual(['ไม่อนุญาต (Decline)', 'อนุญาต (Allow)']);
    expect(new Set(buttons.map((b) => b.attrs)).size).toBe(1);
    expect(buttons[0].attrs).toContain('class="shell-consent-choice"');
    expect(buttons[0].attrs).not.toMatch(/style=|autofocus|primary/i);
    expect(html).toContain('PostHog');
    expect(html).toContain('EU');
    expect(html).not.toMatch(/checked|by continuing|ใช้งานต่อถือว่า/i);
  });

  it('buttons call back with the choice', () => {
    const calls: string[] = [];
    const element = ConsentBanner({ onAccept: () => calls.push('granted'), onDecline: () => calls.push('denied') });
    clickables(element).forEach((node) => node.props.onClick!());
    expect(calls).toEqual(['denied', 'granted']);
  });

  it('the "Analytics choices" control reopens the banner', () => {
    let opened = 0;
    const element = ConsentChoicesLink({ onOpen: () => { opened += 1; } });
    clickables(element).forEach((node) => node.props.onClick!());
    expect(opened).toBe(1);
    const html = renderToStaticMarkup(element);
    expect(html).toContain('Analytics choices');
    expect(html).toMatch(/<footer[^>]*class="shell-footer"/);
  });
});

describe('consent styles', () => {
  it('tap targets are at least 44px and both choices share one rule', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    const rule = (selector: string) => css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('.shell-consent-choice')).toMatch(/min-height:\s*44px/);
    expect(rule('.shell-footer button')).toMatch(/min-height:\s*44px/);
    expect(css).not.toMatch(/\.shell-consent-choice\.|\.shell-consent-choice:first|\.shell-consent-choice:last|\.shell-consent-choice\+/);
  });
});
