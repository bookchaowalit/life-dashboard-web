import { requirePageOwner } from '@/lib/page-auth';
import { loadFinance } from '@/lib/cells/finance';
import { Shell } from '@/modules/cells/ui';
import View from '@/modules/finance/view';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requirePageOwner();
  // Every section loads on its own: one finance cell that is down blanks only its section.
  const data = await loadFinance(process.env);
  return (
    <Shell title="การเงิน" subtitle="บัญชี รายการ งบ subscription หนี้ การลงทุน และภาษี จากสิบบริการการเงิน (อ่านอย่างเดียว)">
      <View data={data} />
    </Shell>
  );
}
