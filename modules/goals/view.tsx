import type { GoalsView } from '@/lib/cells/loaders';
import { Progress } from '@/modules/cells/ui';

const STATUS: Record<string, string> = { planning: 'วางแผน', active: 'กำลังทำ', paused: 'พัก', completed: 'สำเร็จ', abandoned: 'ยกเลิก' };
const TASK_STATUS: Record<string, string> = { todo: 'ต้องทำ', in_progress: 'กำลังทำ', done: 'เสร็จ', blocked: 'ติดขัด' };

export default function GoalsViewComponent({ data }: { data: GoalsView }) {
  if (!data.goals.length) return <p className="cells-empty">ไม่มีเป้าหมายที่เปิดอยู่ (ปิดแล้ว {data.closed})</p>;
  return (
    <>
      <p className="cells-summary">เป้าหมายที่เปิดอยู่ {data.goals.length} · ปิดแล้ว {data.closed}</p>
      {data.goals.map(({ goal, tasks, done }) => (
        <article className="cells-card" key={goal.id}>
          <header>
            <h2>{goal.title}</h2>
            <span className="cells-meta">
              <span className={`cells-pill st-${goal.status}`}>{STATUS[goal.status] ?? goal.status}</span>
              {goal.category && <span>{goal.category}</span>}
              {goal.due_date && <span>กำหนด {String(goal.due_date).slice(0, 10)}</span>}
            </span>
          </header>
          <div className="cells-progress-line"><Progress percent={Number(goal.progress_percent) || 0} /><b>{Number(goal.progress_percent) || 0}%</b></div>
          <p className="cells-meta">งานของเป้าหมาย: เสร็จ {done}/{tasks.length}</p>
          {tasks.length > 0 && (
            <ul className="cells-list compact">
              {tasks.map((t) => (
                <li key={t.id}><span className={`cells-pill st-${t.status}`}>{TASK_STATUS[t.status] ?? t.status}</span> {t.title}{t.due_date ? ` · ${String(t.due_date).slice(0, 10)}` : ''}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </>
  );
}
