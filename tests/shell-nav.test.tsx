import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ShellNav from '@/components/shell-nav';

let pathname = '/tasks';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

describe('shell nav', () => {
  beforeEach(() => { pathname = '/tasks'; });

  it('/login: brand only, no module links, no logout', () => {
    pathname = '/login';
    const html = renderToStaticMarkup(<ShellNav />);
    expect(html).toContain('Solo Empire');
    expect(html).not.toContain('<ul');
    expect(html).not.toContain('↗');
    expect(html).not.toContain('/api/auth/logout');
  });

  it('/tasks: module links and logout are shown', () => {
    const html = renderToStaticMarkup(<ShellNav />);
    expect(html).toContain('Solo Empire');
    expect(html).toContain('<ul');
    expect(html).toContain('/api/auth/logout');
  });
});
