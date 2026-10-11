import { requirePageOwner } from '@/lib/page-auth';
import { loadGoals } from '@/lib/cells/loaders';
import { Gate, Shell } from '@/modules/cells/ui';
import View from '@/modules/goals/view';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requirePageOwner();
  const result = await loadGoals(process.env);
  return (
    <Shell title="เป้าหมาย" subtitle="เป้าหมายที่เปิดอยู่ ความคืบหน้า และงานของแต่ละเป้าหมาย">
      <Gate result={result}>{(data) => <View data={data} />}</Gate>
    </Shell>
  );
}
