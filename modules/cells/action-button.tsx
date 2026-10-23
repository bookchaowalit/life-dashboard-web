'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { analytics, type BrowserEvent } from '@/lib/browser-analytics';

/** What to count after the action (docs/measurement/EVENTS.md). Enumerated values only, never titles or ids. */
export interface ActionTracking {
  event: Extract<BrowserEvent, 'habit_logged' | 'task_status_changed'>;
  props: Record<string, string>;
  action: 'habit_log' | 'task_status';
}

type Deps = { fetch: typeof fetch; track: (event: BrowserEvent, props: Record<string, string>) => void };
const defaultDeps = (): Deps => ({ fetch: (...args) => fetch(...args), track: (event, props) => analytics.track(event, props) });

/** POSTs the action and counts the outcome (consent-gated inside `analytics`). */
export async function submitAction(
  endpoint: string, payload: Record<string, unknown>, tracking: ActionTracking | undefined, deps: Deps = defaultDeps(),
): Promise<{ ok: true } | { ok: false; message: string }> {
  let response: Response;
  try {
    response = await deps.fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store',
    });
  } catch {
    if (tracking) deps.track('owner_write_failed', { action: tracking.action, reason: 'network' });
    return { ok: false, message: 'ติดต่อเซิร์ฟเวอร์ไม่ได้' };
  }
  if (!response.ok) {
    if (tracking) deps.track('owner_write_failed', { action: tracking.action, reason: response.status >= 500 ? 'server_error' : 'client_error' });
    const data = await response.json().catch(() => null);
    return { ok: false, message: data?.error?.message ?? 'บันทึกไม่สำเร็จ' };
  }
  if (tracking) deps.track(tracking.event, tracking.props);
  return { ok: true };
}

/** POSTs a JSON action to an owner route handler (same-origin, so the browser sends Origin) and refreshes the page. */
export default function ActionButton({ endpoint, payload, label, busyLabel = 'กำลังบันทึก…', className, tracking }: {
  endpoint: string; payload: Record<string, unknown>; label: string; busyLabel?: string; className?: string; tracking?: ActionTracking;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true); setError('');
    try {
      const result = await submitAction(endpoint, payload, tracking);
      if (result.ok) router.refresh();
      else setError(result.message);
    } finally { setBusy(false); }
  }
  return (
    <span className="cells-action">
      <button type="button" className={className} onClick={run} disabled={busy}>{busy ? busyLabel : label}</button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
