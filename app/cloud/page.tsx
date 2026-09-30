import CloudClient from '@/modules/cloud/client';

import '@/modules/cloud/module.css';

export default function Page() {
  return (
    <div className="m-cloud">
      <CloudClient />
    </div>
  );
}
