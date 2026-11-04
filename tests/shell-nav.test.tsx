import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import ShellNav from '@/components/shell-nav';
import { VISIBLE_MODULES } from '@/lib/modules';

const pathname = vi.hoisted(() => ({ value: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

// Owner pages are behind a login, so the visual gate cannot see the nav there.
describe('ShellNav', () => {
  it('renders a link for every visible module', () => {
    pathname.value = '/';
    const html = renderToStaticMarkup(<ShellNav />);
    expect(VISIBLE_MODULES.length).toBeGreaterThan(0);
    for (const module of VISIBLE_MODULES) {
      expect(html).toContain(`href="${module.href}"`);
      expect(html).toContain(module.label);
    }
  });

  it('shows the logout button except on /login', () => {
    pathname.value = '/';
    expect(renderToStaticMarkup(<ShellNav />)).toContain('ออกจากระบบ');
    pathname.value = '/login';
    expect(renderToStaticMarkup(<ShellNav />)).not.toContain('ออกจากระบบ');
  });
});
