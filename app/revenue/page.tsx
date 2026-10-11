import { requirePageOwner } from '@/lib/page-auth';
import { loadRevenue } from '@/lib/cells/loaders';
import { Gate, Shell } from '@/modules/cells/ui';
import View from '@/modules/revenue/view';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requirePageOwner();
  const result = await loadRevenue(process.env);
  return (
    <Shell title="รายได้" subtitle="ยอดรับแล้วต่อสกุลเงิน รายการล่าสุด และใบแจ้งหนี้ที่ค้าง">
      <Gate result={result}>{(data) => <View data={data} />}</Gate>
    </Shell>
  );
}
