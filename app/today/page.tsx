import TodayClient from '@/modules/today/client';

import '@/modules/today/module.css';

export default function Page() {
  return (
    <div className="m-today">
      <TodayClient />
    </div>
  );
}
