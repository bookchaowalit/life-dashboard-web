import KnowledgeClient from '@/modules/knowledge/client';

import '@/modules/knowledge/module.css';

export default function Page() {
  return (
    <div className="m-knowledge">
      <KnowledgeClient />
    </div>
  );
}
