import { requirePageOwner } from '@/lib/page-auth';
import { loadAiSubscriptions } from '@/lib/cells/ai-subscriptions';
import { Shell } from '@/modules/cells/ui';
import View from '@/modules/ai-subscriptions/view';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  await requirePageOwner();
  const query = await searchParams;
  const month = typeof query.month === 'string' ? query.month : undefined;
  const result = await loadAiSubscriptions(process.env, { month });
  return <Shell title="ความคุ้มค่า AI" subtitle="ติดตามค่าสมาชิก การใช้จริง ผลงาน และความคุ้มค่ารายเดือนของ AI ทุกผู้ให้บริการ">
    <View result={result} />
  </Shell>;
}
