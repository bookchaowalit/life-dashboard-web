import type { TasksView } from '@/lib/cells/loaders';
import type { Task } from '@/lib/cells/tasks';
import ActionButton from '@/modules/cells/action-button';

const STATUS: Record<string, string> = { todo: 'ต้องทำ', in_progress: 'กำลังทำ', blocked: 'ติดขัด', done: 'เสร็จแล้ว', cancelled: 'ยกเลิก' };
const ENDPOINT = '/api/owner/tasks/status';

function TaskRow({ task, today }: { task: Task; today: string }) {
  const overdue = task.due_date !== null && task.due_date < today && task.status !== 'done';
  return (
    <li className="cells-row">
      <div className="cells-row-main">
        <strong>#{task.number} {task.title}</strong>
        <span className="cells-meta">
          <span className={`cells-pill st-${task.status}`}>{STATUS[task.status] ?? task.status}</span>
          {task.priority !== null && <span>ความสำคัญ {task.priority}</span>}
          {task.due_date && <span className={overdue ? 'cells-danger' : ''}>กำหนด {task.due_date}</span>}
          {task.project && <span>{task.project}</span>}
        </span>
      </div>
      {task.status !== 'done' && task.status !== 'cancelled' && (
        <div className="cells-row-actions">
          {task.status !== 'in_progress' && <ActionButton endpoint={ENDPOINT} payload={{ number: task.number, status: 'in_progress' }} label="เริ่มทำ" />}
          <ActionButton endpoint={ENDPOINT} payload={{ number: task.number, status: 'done' }} label="เสร็จแล้ว" className="primary" />
        </div>
      )}
    </li>
  );
}

function Section({ title, tasks, today, empty }: { title: string; tasks: Task[]; today: string; empty: string }) {
  return (
    <section className="cells-section" aria-label={title}>
      <h2>{title} <small>{tasks.length}</small></h2>
      {tasks.length ? <ul className="cells-list">{tasks.map((t) => <TaskRow key={t.number} task={t} today={today} />)}</ul> : <p className="cells-empty">{empty}</p>}
    </section>
  );
}

export default function TasksViewComponent({ data }: { data: TasksView }) {
  return (
    <>
      <p className="cells-summary">วันที่ {data.today} · งานค้างอื่น ๆ ที่ไม่มีกำหนดวันนี้ {data.otherOpen} รายการ</p>
      <Section title="เกินกำหนด" tasks={data.overdue} today={data.today} empty="ไม่มีงานเกินกำหนด" />
      <Section title="ครบกำหนดวันนี้" tasks={data.dueToday} today={data.today} empty="ไม่มีงานครบกำหนดวันนี้" />
      <Section title="กำลังทำ" tasks={data.inProgress} today={data.today} empty="ไม่มีงานที่กำลังทำเพิ่มเติม" />
      <Section title="เสร็จล่าสุด (7 วัน)" tasks={data.recentlyDone} today={data.today} empty="ยังไม่มีงานที่เสร็จในช่วงนี้" />
    </>
  );
}
