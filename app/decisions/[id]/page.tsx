import { notFound } from 'next/navigation';

import { requirePageOwner } from '@/lib/page-auth';
import { loadDecision } from '@/lib/cells/loaders';
import { Gate, Shell } from '@/modules/cells/ui';
import { DecisionDetailView } from '@/modules/decisions/view';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePageOwner();
  const { id } = await params;
  if (!/^[1-9][0-9]{0,15}$/.test(id)) notFound();
  const result = await loadDecision(process.env, Number(id));
  if (result.ok && result.data === null) notFound();
  return (
    <Shell title={`การตัดสินใจ #${id}`} subtitle="รายละเอียดและประวัติ (อ่านอย่างเดียว)">
      <Gate result={result}>{(data) => (data ? <DecisionDetailView data={data} /> : null)}</Gate>
    </Shell>
  );
}
