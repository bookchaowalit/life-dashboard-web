import TodayClient from '@/modules/today/client';
import { requirePageOwner } from '@/lib/page-auth';

import '@/modules/today/module.css';

export default async function Page() {
  await requirePageOwner();
  return (
    <div className="m-today">
      <TodayClient />
    </div>
  );
}
