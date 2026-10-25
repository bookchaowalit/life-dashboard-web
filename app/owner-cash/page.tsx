import { requirePageOwner } from '@/lib/page-auth';
import { loadOwnerCash } from '@/lib/cells/owner-cash';
import { Gate, Shell } from '@/modules/cells/ui';
import View from '@/modules/owner-cash/view';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePageOwner();
  const { month } = await searchParams;
  const result = await loadOwnerCash(process.env, { month });
  return (
    <Shell title="เงินสดเจ้าของ" subtitle="รายได้ หักค่าธรรมเนียม ค่าใช้จ่าย และภาษี เป็นเงินสดที่เจ้าของใช้ได้ เทียบเป้ารายเดือน">
      <Gate result={result}>{(data) => <View data={data} />}</Gate>
    </Shell>
  );
}
