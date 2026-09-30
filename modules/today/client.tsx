'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getToday, type TaskStatus, type TodayResponse, type TodayTask, updateTask } from './api';

const statusLabels: Record<TaskStatus, string> = {
  todo: 'ต้องทำ',
  in_progress: 'กำลังทำ',
  done: 'เสร็จแล้ว',
  blocked: 'ติดขัด',
  cancelled: 'ยกเลิก',
};

const statusOrder: TaskStatus[] = ['todo', 'in_progress', 'done'];

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function dueLabel(task: TodayTask, targetDate: string) {
  if (!task.due_date) return 'กำลังทำต่อ';
  if (task.due_date < targetDate) return 'เกินกำหนด';
  if (task.due_date === targetDate) return 'วันนี้';
  return task.due_date;
}

function nextStatus(status: TaskStatus): TaskStatus {
  const index = statusOrder.indexOf(status);
  return statusOrder[index < 0 ? 0 : (index + 1) % statusOrder.length];
}

export default function TodayClient() {
  const [selectedDate, setSelectedDate] = useState(localDate);
  const [data, setData] = useState<TodayResponse | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getToday(date);
      setData(response);
      setSelectedId((current) => current && response.tasks.some((task) => task.id === current) ? current : response.tasks[0]?.id || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ไม่สามารถโหลดข้อมูลวันนี้ได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(selectedDate); }, [load, selectedDate]);

  const selectedTask = useMemo(() => data?.tasks.find((task) => task.id === selectedId) || null, [data, selectedId]);

  async function changeStatus(task: TodayTask) {
    const status = nextStatus(task.status);
    setBusyId(task.id);
    setError(null);
    try {
      const response = await updateTask(task.id, { status, progress_percent: status === 'done' ? 100 : task.progress_percent });
      if (response.task.id) await load(selectedDate);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อัปเดตงานไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="today-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Today home"><span className="brand-mark">SE</span><span><strong>Today</strong><small>Solo Empire execution</small></span></a>
        <div className="topbar-actions"><label htmlFor="today-date">วันที่</label><input id="today-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /><button className="quiet-button" type="button" onClick={() => void load(selectedDate)} disabled={loading}>{loading ? 'กำลังโหลด…' : 'รีเฟรช'}</button></div>
      </header>

      <section className="hero">
        <div><p className="eyebrow">EXECUTION DESK / {data?.source || 'TODAY API'}</p><h1>วันนี้ทำอะไร<br /><em>ให้เดินหน้าได้จริง</em></h1><p className="hero-copy">พื้นที่เดียวสำหรับงานที่ถึงเวลา งานที่ค้าง และงานที่กำลังทำอยู่ พร้อมเส้นทางกลับไปยัง goal และ project ของแต่ละงาน</p></div>
        <aside className="date-card"><span>วันนี้</span><strong>{displayDate(selectedDate)}</strong><small>{data ? `อัปเดต ${new Date(data.generated_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : 'รอข้อมูลจาก API'}</small></aside>
      </section>

      {error && <div className="error-banner" role="alert"><strong>เชื่อมต่อ Today API ไม่สำเร็จ</strong><span>{error}</span><button type="button" onClick={() => void load(selectedDate)}>ลองอีกครั้ง</button></div>}

      <section className="metric-strip" aria-label="สรุปงานวันนี้">
        <div><span>เปิดอยู่</span><strong>{data?.summary.open ?? '—'}</strong><small>งานที่ยังต้องจัดการ</small></div>
        <div><span>กำลังทำ</span><strong>{data?.summary.in_progress ?? '—'}</strong><small>งานที่เริ่มแล้ว</small></div>
        <div><span>วันนี้</span><strong>{data?.summary.due_today ?? '—'}</strong><small>กำหนดส่งวันนี้</small></div>
        <div><span>เกินกำหนด</span><strong>{data?.summary.overdue ?? '—'}</strong><small>ควรเคลียร์ก่อน</small></div>
        <div><span>ติดขัด</span><strong>{data?.summary.blocked ?? '—'}</strong><small>ต้องตัดสินใจหรือขอความช่วยเหลือ</small></div>
      </section>

      <section className="workspace-grid">
        <div className="task-column"><div className="section-heading"><div><p className="eyebrow">QUEUE / {data?.tasks.length ?? 0}</p><h2>คิวที่ควรเห็นตอนนี้</h2></div><p>กดสถานะเพื่อวนจากต้องทำ → กำลังทำ → เสร็จแล้ว</p></div>
          {loading && <div className="empty-state" role="status">กำลังอ่าน task projection…</div>}
          {!loading && data?.tasks.length === 0 && <div className="empty-state"><strong>วันนี้ไม่มีงานที่ถึงเวลา</strong><span>เลือกวันอื่น หรือสร้างงานผ่าน task workflow ของ Solo Empire</span></div>}
          {!loading && data?.tasks.map((task, index) => <article className={`task-row ${selectedId === task.id ? 'selected' : ''}`} key={task.id} onClick={() => setSelectedId(task.id)}>
            <button className="task-index" type="button" aria-label={`เปิดงาน ${task.title}`} onClick={(event) => { event.stopPropagation(); setSelectedId(task.id); }}>{String(index + 1).padStart(2, '0')}</button>
            <div className="task-main"><div className="task-title-line"><h3>{task.title}</h3><span className={`status status-${task.status}`}>{statusLabels[task.status]}</span></div><p>{task.description || task.project || task.category || 'ยังไม่มีคำอธิบายเพิ่มเติม'}</p><div className="task-meta"><span className={task.due_date && task.due_date < selectedDate ? 'overdue' : ''}>{dueLabel(task, selectedDate)}</span><span>priority {task.priority}</span>{task.estimated_minutes ? <span>{task.estimated_minutes} นาที</span> : null}</div></div>
            <button className="status-button" type="button" disabled={busyId === task.id || task.status === 'blocked'} onClick={(event) => { event.stopPropagation(); void changeStatus(task); }}>{busyId === task.id ? '…' : task.status === 'blocked' ? 'ติดขัด' : task.status === 'done' ? 'ทำใหม่' : 'ต่อสถานะ'} <span aria-hidden="true">→</span></button>
          </article>)}
        </div>

        <aside className="detail-column" aria-live="polite"><div className="section-heading"><div><p className="eyebrow">CONTEXT / TASK DETAIL</p><h2>บริบทของงาน</h2></div></div>{selectedTask ? <div className="detail-card"><div className="detail-card-head"><span className={`status status-${selectedTask.status}`}>{statusLabels[selectedTask.status]}</span><span>#{selectedTask.id}</span></div><h3>{selectedTask.title}</h3><p className="detail-description">{selectedTask.description || 'งานนี้ยังไม่มีคำอธิบายที่บันทึกไว้'}</p><dl className="detail-facts"><div><dt>กำหนดส่ง</dt><dd>{selectedTask.due_date || 'ยังไม่กำหนด'}</dd></div><div><dt>ความคืบหน้า</dt><dd>{selectedTask.progress_percent}%</dd></div><div><dt>ใช้เวลา</dt><dd>{selectedTask.actual_minutes || 0}{selectedTask.estimated_minutes ? ` / ${selectedTask.estimated_minutes}` : ''} นาที</dd></div></dl><div className="progress-track"><span style={{ width: `${Math.min(100, Math.max(0, selectedTask.progress_percent))}%` }} /></div><div className="link-groups"><div><span className="eyebrow">GOALS</span>{selectedTask.links.goals.length ? selectedTask.links.goals.map((goal) => <div className="context-link" key={goal.id}><strong>{goal.title}</strong><small>{goal.link_type === 'primary' ? 'เป้าหมายหลัก' : 'เป้าหมายสนับสนุน'} · {goal.progress_percent ?? 0}%</small></div>) : <p className="muted">ยังไม่ได้เชื่อม goal</p>}</div><div><span className="eyebrow">PROJECTS</span>{selectedTask.links.projects.length ? selectedTask.links.projects.map((project) => <div className="context-link" key={project.id}><strong>{project.name}</strong><small>{project.relation_type === 'delivery' ? 'งานส่งมอบ' : 'งานสนับสนุน'} · {project.progress_percent ?? 0}%</small></div>) : <p className="muted">ยังไม่ได้เชื่อม project{selectedTask.legacy_project ? ` · ${selectedTask.legacy_project}` : ''}</p>}</div></div><button className="primary-button" type="button" onClick={() => void changeStatus(selectedTask)} disabled={busyId === selectedTask.id || selectedTask.status === 'blocked'}>{busyId === selectedTask.id ? 'กำลังบันทึก…' : selectedTask.status === 'done' ? 'เริ่มงานนี้ใหม่' : 'เปลี่ยนเป็นกำลังทำ'} <span aria-hidden="true">↗</span></button></div> : <div className="empty-state detail-empty"><strong>เลือกงานเพื่อดูบริบท</strong><span>goal, project และข้อมูลที่ช่วยตัดสินใจจะอยู่ตรงนี้</span></div>}</aside>
      </section>

      <footer className="footer-note"><span>SOLO EMPIRE / TODAY V1</span><span>Operational state จาก Today API · docs และ evidence อยู่ใน workspace เดิม</span></footer>
    </main>
  );
}
