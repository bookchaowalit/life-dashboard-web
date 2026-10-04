import AccountsClient from '@/modules/accounts/client';
import { requirePageOwner } from '@/lib/page-auth';

import '@/modules/accounts/module.css';

export default async function Page() {
  await requirePageOwner();
  return (
    <div className="m-accounts">
      <AccountsClient />
    </div>
  );
}
