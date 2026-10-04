import SaasClient from '@/modules/saas/client';
import { requirePageOwner } from '@/lib/page-auth';

import '@/modules/saas/module.css';

export default async function Page() {
  await requirePageOwner();
  return (
    <div className="m-saas">
      <SaasClient />
    </div>
  );
}
