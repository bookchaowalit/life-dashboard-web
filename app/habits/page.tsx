import { requirePageOwner } from '@/lib/page-auth';
import { loadHabits } from '@/lib/cells/loaders';
import { Gate, Shell } from '@/modules/cells/ui';
import View from '@/modules/habits/view';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requirePageOwner();
  const result = await loadHabits(process.env);
  return (
    <Shell title="นิสัย" subtitle="สตรีคและบันทึกของสัปดาห์นี้ บันทึกหรือยกเลิกของวันนี้">
      <Gate result={result}>{(data) => <View data={data} />}</Gate>
    </Shell>
  );
}
