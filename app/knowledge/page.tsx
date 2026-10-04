import KnowledgeClient from '@/modules/knowledge/client';
import { requirePageOwner } from '@/lib/page-auth';

import '@/modules/knowledge/module.css';

export default async function Page() {
  await requirePageOwner();
  return (
    <div className="m-knowledge">
      <KnowledgeClient />
    </div>
  );
}
