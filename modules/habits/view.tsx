import type { HabitsView } from '@/lib/cells/loaders';
import ActionButton from '@/modules/cells/action-button';

const ENDPOINT = '/api/owner/habits/log';
const DAY = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

export default function HabitsViewComponent({ data }: { data: HabitsView }) {
  if (!data.rows.length) return <p className="cells-empty">ยังไม่มีนิสัยที่ใช้งานอยู่</p>;
  return (
    <>
      <p className="cells-summary">วันที่ {data.today} · สัปดาห์นี้</p>
      <ul className="cells-list">
        {data.rows.map(({ habit, week, doneToday }) => (
          <li className="cells-row" key={habit.id}>
            <div className="cells-row-main">
              <strong>{habit.name}</strong>
              <span className="cells-meta">
                <span>สตรีคปัจจุบัน {habit.current_streak} วัน</span>
                <span>สูงสุด {habit.best_streak}</span>
                {habit.category && <span>{habit.category}</span>}
              </span>
              <span className="cells-week" aria-label="บันทึกสัปดาห์นี้">
                {week.map((d, i) => (
                  <span key={d.date} className={`${d.completed ? 'on' : ''} ${d.date === data.today ? 'today' : ''}`} title={d.date}>{DAY[i]}</span>
                ))}
              </span>
            </div>
            <div className="cells-row-actions">
              <ActionButton
                endpoint={ENDPOINT} payload={{ habit_id: habit.id, completed: !doneToday }}
                label={doneToday ? 'ยกเลิกวันนี้' : 'ทำแล้ววันนี้'} className={doneToday ? '' : 'primary'}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
