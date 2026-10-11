'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** POSTs a JSON action to an owner route handler (same-origin, so the browser sends Origin) and refreshes the page. */
export default function ActionButton({ endpoint, payload, label, busyLabel = 'กำลังบันทึก…', className }: {
  endpoint: string; payload: Record<string, unknown>; label: string; busyLabel?: string; className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true); setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error?.message ?? 'บันทึกไม่สำเร็จ');
      } else router.refresh();
    } catch { setError('ติดต่อเซิร์ฟเวอร์ไม่ได้'); } finally { setBusy(false); }
  }
  return (
    <span className="cells-action">
      <button type="button" className={className} onClick={run} disabled={busy}>{busy ? busyLabel : label}</button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
