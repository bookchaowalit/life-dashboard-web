import { requirePageOwner } from '@/lib/page-auth';
import { loadDecisions } from '@/lib/cells/loaders';
import { Gate, Shell } from '@/modules/cells/ui';
import { DecisionList } from '@/modules/decisions/view';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requirePageOwner();
  const result = await loadDecisions(process.env);
  return (
    <Shell title="การตัดสินใจ" subtitle="รายการที่ยังเปิดอยู่ (อ่านอย่างเดียว)">
      <Gate result={result}>{(items) => <DecisionList items={items} />}</Gate>
    </Shell>
  );
}
