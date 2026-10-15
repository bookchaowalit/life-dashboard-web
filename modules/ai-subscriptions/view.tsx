import type { Loaded } from '@/lib/cells/core';
import type { AiSubscriptionsData } from '@/lib/subscription-value';
import { Gate } from '@/modules/cells/ui';
import { SubscriptionForms } from './forms';
import ReportCard from './report-card';
import './style.css';

export default function View({ result }: { result: Loaded<AiSubscriptionsData> }) {
  return <Gate result={result}>{(data) => <>
    <form method="get" action="/ai-subscriptions" className="ai-month">
      <label htmlFor="report-month">เดือนที่ต้องการประเมิน</label>
      <input id="report-month" name="month" type="month" required defaultValue={data.period.month} max={data.period.today.slice(0, 7)} />
      <button type="submit">ดูรายงาน</button>
    </form>
    <p className="cells-summary">ช่วง {data.period.start} – {data.period.end} · แยกต้นทุนและมูลค่าตามสมาชิกและสกุลเงิน การประมาณมูลค่าเวลาไม่ใช่รายรับจริง</p>
    {data.rows.length === 0 ? <p className="cells-empty">ยังไม่มีสมาชิก AI เพิ่มสมาชิกใหม่หรือจัดหมวดสมาชิกเดิมเพื่อเริ่มประเมิน</p> : data.rows.map((report) => <ReportCard key={report.subscription.id} report={report} />)}
    <SubscriptionForms available={data.availableSubscriptions} today={data.period.today} />
  </>}</Gate>;
}
