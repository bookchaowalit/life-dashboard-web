import CloudClient from '@/modules/cloud/client';
import { requirePageOwner } from '@/lib/page-auth';

import '@/modules/cloud/module.css';

export default async function Page() {
  await requirePageOwner();
  return (
    <div className="m-cloud">
      <CloudClient />
    </div>
  );
}
