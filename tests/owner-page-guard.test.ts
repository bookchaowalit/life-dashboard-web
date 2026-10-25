import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const APP_DIR = join(__dirname, '..', 'app');
const PUBLIC_PAGES = new Set(['login/page.tsx']);

function findPages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return findPages(full);
    return name === 'page.tsx' ? [full] : [];
  });
}

// A page that only redirects to a fixed path renders no data, so it needs no guard (e.g. /today).
const STATIC_REDIRECT =
  /^import \{ redirect \} from 'next\/navigation';\s*export default function \w+\(\)\s*\{\s*redirect\('\/[\w/-]*'\);\s*\}$/;

// Returns a problem description, or null when the guard is awaited before any other await.
function guardProblem(source: string): string | null {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').trim();
  if (STATIC_REDIRECT.test(code)) return null;
  if (!/import\s*\{[^}]*\brequirePageOwner\b[^}]*\}\s*from\s*['"]@\/lib\/page-auth['"]/.test(source)) {
    return 'does not import requirePageOwner from @/lib/page-auth';
  }
  const call = /await\s+requirePageOwner\(\s*\)/.exec(source);
  if (!call) return 'does not await requirePageOwner()';
  const before = source.slice(0, call.index);
  const fn = before.lastIndexOf('export default');
  if (fn === -1) return 'calls requirePageOwner() outside the default export';
  if (/\bawait\b/.test(before.slice(fn))) return 'awaits something before requirePageOwner()';
  return null;
}

const pages = findPages(APP_DIR)
  .map((f) => relative(APP_DIR, f).split(sep).join('/'))
  .filter((p) => !PUBLIC_PAGES.has(p))
  .sort();

describe('owner pages call requirePageOwner()', () => {
  it('finds the owner pages', () => {
    expect(pages.length).toBeGreaterThan(10);
    expect(pages).toContain('decisions/[id]/page.tsx');
  });

  it.each(pages)('app/%s is guarded', (page) => {
    const problem = guardProblem(readFileSync(join(APP_DIR, page), 'utf8'));
    expect(problem, `app/${page} ${problem}`).toBeNull();
  });

  it('keeps /login public', () => {
    const src = readFileSync(join(APP_DIR, 'login/page.tsx'), 'utf8');
    expect(src).not.toMatch(/requirePageOwner/);
  });

  it('rejects a page without the guard', () => {
    const bad = 'export default async function Page() { const d = await load(); return null; }';
    expect(guardProblem(bad)).not.toBeNull();
  });

  it('does not exempt a redirect that also loads data', () => {
    const bad = [
      "import { redirect } from 'next/navigation';",
      "export default async function P() { await load(); redirect('/x'); }",
    ].join('\n');
    expect(guardProblem(bad)).not.toBeNull();
  });

  it('rejects a page that loads data before the guard', () => {
    const bad = [
      "import { requirePageOwner } from '@/lib/page-auth';",
      'export default async function Page() { const d = await load(); await requirePageOwner(); return null; }',
    ].join('\n');
    expect(guardProblem(bad)).toMatch(/before/);
  });
});
