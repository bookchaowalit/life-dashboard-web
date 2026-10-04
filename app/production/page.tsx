import ConsoleClient from '@/modules/production/client';
import { requirePageOwner } from '@/lib/page-auth';

import '@/modules/production/module.css';

export default async function Page() {
  await requirePageOwner();
  return (
    <div className="m-production">
      <ConsoleClient />
    </div>
  );
}
