import AiUsageClient from '@/modules/ai-usage/client';
import { requirePageOwner } from '@/lib/page-auth';

import '@/modules/ai-usage/module.css';

export default async function Page() {
  await requirePageOwner();
  return <div className="m-ai-usage"><AiUsageClient /></div>;
}
