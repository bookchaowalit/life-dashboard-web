import { requirePageOwner } from '@/lib/page-auth';
import { loadTasks } from '@/lib/cells/loaders';
import { Gate, Shell } from '@/modules/cells/ui';
import View from '@/modules/tasks/view';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requirePageOwner();
  const result = await loadTasks(process.env);
  return (
    <Shell title="วันนี้ / งาน" subtitle="งานที่ต้องทำวันนี้ เกินกำหนด กำลังทำ และเสร็จล่าสุด">
      <Gate result={result}>{(data) => <View data={data} />}</Gate>
    </Shell>
  );
}
