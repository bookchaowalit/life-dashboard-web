import { describe, expect, it } from 'vitest';

import { scopeCss } from '../scripts/scope-css.mjs';

describe('scope-css', () => {
  it('scopes selectors, root elements, media queries and keyframes', () => {
    const out: string = scopeCss(':root{--a:1} body{margin:0} .a,.b{c:d} @keyframes pulse{50%{opacity:.5}} .x{animation:pulse 1s} @media (max-width:9px){h1{e:f}}', 'kn');
    expect(out).toContain('.m-kn {--a:1}');
    expect(out).toContain('.m-kn {margin:0}');
    expect(out).toContain('.m-kn .a, .m-kn .b {c:d}');
    expect(out).toContain('@keyframes m-kn-pulse');
    expect(out).toContain('animation:m-kn-pulse 1s');
    expect(out).toContain('.m-kn h1 {e:f}');
  });

  it('rejects at-rules it cannot scope', () => {
    expect(() => scopeCss('@font-face{font-family:x}', 'kn')).toThrow('unsupported at-rule');
  });
});
