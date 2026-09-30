import ConsoleClient from '@/modules/production/client';

import '@/modules/production/module.css';

export default function Page() {
  return (
    <div className="m-production">
      <ConsoleClient />
    </div>
  );
}
