import type { NextRequest } from 'next/server';
import { ownerAction } from '@/lib/cells/action-route';
import { saveAiSubscriptionEvidence } from '@/lib/cells/ai-subscription-actions';

export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return ownerAction(request, saveAiSubscriptionEvidence);
}
