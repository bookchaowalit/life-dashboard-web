'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { VISIBLE_MODULES } from '@/lib/modules';

export default function ShellNav() {
  const pathname = usePathname();
  if (pathname === '/login') {
    return (
      <nav className="shell-nav" aria-label="เมนูหลัก">
        <Link href="/" className="shell-brand">Solo Empire</Link>
      </nav>
    );
  }
  return (
    <nav className="shell-nav" aria-label="เมนูหลัก">
      <Link href="/" className="shell-brand">Solo Empire</Link>
      <ul>
        {VISIBLE_MODULES.map((module) => (
          <li key={module.id}>
            {module.migrated ? (
              <Link href={module.href} aria-current={pathname.startsWith(module.href) ? 'page' : undefined}>
                {module.label}
              </Link>
            ) : (
              <a href={module.href} target="_blank" rel="noreferrer">{module.label} ↗</a>
            )}
          </li>
        ))}
      </ul>
      <form action="/api/auth/logout" method="post"><button type="submit">ออกจากระบบ</button></form>
    </nav>
  );
}
