import AccountsClient from '@/modules/accounts/client';

import '@/modules/accounts/module.css';

export default function Page() {
  return (
    <div className="m-accounts">
      <AccountsClient />
    </div>
  );
}
