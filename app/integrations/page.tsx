import IntegrationsClient from '@/modules/integrations/client';
import { requirePageOwner } from '@/lib/page-auth';

import '@/modules/integrations/module.css';

export default async function Page() {
  await requirePageOwner();
  return (
    <div className="m-integrations">
      <IntegrationsClient />
    </div>
  );
}
