import Link from 'next/link';

import { MODULES } from '@/lib/modules';

export default function Home() {
  return (
    <main className="shell-home">
      <h1>Solo Empire</h1>
      <p>ทุกส่วนงานในหน้าเดียว แต่ละส่วนเรียก backend ของตัวเองแยกกัน</p>
      <div className="shell-cards">
        {MODULES.map((module) =>
          module.migrated ? (
            <Link key={module.id} className="shell-card" href={module.href}>
              <strong>{module.label}</strong><span>{module.description}</span>
            </Link>
          ) : (
            <a key={module.id} className="shell-card" href={module.href} target="_blank" rel="noreferrer">
              <strong>{module.label} ↗</strong><span>{module.description}</span>
            </a>
          ),
        )}
      </div>
    </main>
  );
}
