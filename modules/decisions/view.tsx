import Link from 'next/link';

import type { CellRecord } from '@/lib/cells/cell-client';
import type { DecisionDetail } from '@/lib/cells/loaders';

const STATUS: Record<string, string> = {
  draft: 'ร่าง', proposed: 'เสนอ', approved: 'อนุมัติ', in_progress: 'กำลังดำเนินการ', completed: 'เสร็จสิ้น',
  deferred: 'เลื่อน', rejected: 'ปฏิเสธ', superseded: 'ถูกแทนที่',
};
const HIDDEN = 'ซ่อนไว้ (ข้อมูลอ่อนไหว)';
const isSensitive = (d: CellRecord) => d.privacy_class === 'sensitive';
const day = (value: unknown) => (value ? String(value).slice(0, 10) : '—');

export function DecisionList({ items }: { items: CellRecord[] }) {
  if (!items.length) return <p className="cells-empty">ไม่มีการตัดสินใจที่ยังเปิดอยู่</p>;
  return (
    <>
      <p className="cells-summary">การตัดสินใจที่ยังเปิดอยู่ {items.length} รายการ</p>
      <ul className="cells-list">
        {items.map((d) => (
          <li className="cells-row" key={d.id}>
            <div className="cells-row-main">
              <strong><Link href={`/decisions/${d.id}`}>#{d.id} {isSensitive(d) ? HIDDEN : d.title}</Link></strong>
              <span className="cells-meta">
                <span className={`cells-pill st-${d.status}`}>{STATUS[d.status] ?? d.status}</span>
                <span>{d.domain}</span>
                <span>อนุมัติ: {d.approval_status}</span>
                {d.review_date && <span>ทบทวน {day(d.review_date)}</span>}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function DecisionDetailView({ data }: { data: DecisionDetail }) {
  const d = data.decision;
  const hidden = isSensitive(d);
  return (
    <>
      <p><Link href="/decisions">← กลับรายการ</Link></p>
      <article className="cells-card">
        <header>
          <h2>#{d.id} {hidden ? HIDDEN : d.title}</h2>
          <span className="cells-meta">
            <span className={`cells-pill st-${d.status}`}>{STATUS[d.status] ?? d.status}</span>
            <span>{d.domain}</span><span>อนุมัติ: {d.approval_status}</span><span>การกระทำ: {d.action_type}/{d.action_status}</span>
          </span>
        </header>
        <dl className="cells-dl">
          <dt>การตัดสินใจ</dt><dd>{hidden ? HIDDEN : d.decision}</dd>
          <dt>เหตุผล</dt><dd>{hidden ? HIDDEN : d.rationale || '—'}</dd>
          <dt>ผลที่คาดหวัง</dt><dd>{hidden ? HIDDEN : d.expected_outcome || '—'}</dd>
          <dt>ผลจริง</dt><dd>{hidden ? HIDDEN : d.actual_outcome || '—'}</dd>
          <dt>ขั้นต่อไป</dt><dd>{hidden ? HIDDEN : d.next_action || '—'}</dd>
          <dt>ความมั่นใจ</dt><dd>{typeof d.confidence === 'number' ? `${Math.round(d.confidence * 100)}%` : '—'}</dd>
          <dt>ทบทวน</dt><dd>{day(d.review_date)}</dd>
          <dt>สร้างเมื่อ</dt><dd>{day(d.created_at)}</dd>
        </dl>
      </article>
      <section className="cells-section" aria-label="ประวัติ">
        <h2>ประวัติ <small>{data.events.length}</small></h2>
        {data.events.length ? (
          <ul className="cells-list compact">
            {data.events.map((e) => (
              <li key={e.id}>{day(e.created_at)} · {e.event_type} · {e.actor}{e.to_status ? ` → ${STATUS[e.to_status] ?? e.to_status}` : ''}{e.reason && !hidden ? ` · ${e.reason}` : ''}</li>
            ))}
          </ul>
        ) : <p className="cells-empty">ยังไม่มีประวัติ</p>}
      </section>
    </>
  );
}
