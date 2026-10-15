import { usageFingerprint, type SubscriptionValueReport } from '@/lib/subscription-value';
import { ChargeForm, ReviewForm, UsageForm } from './forms';

const unknown = 'ยังไม่มีข้อมูล';
const number = (value: number | null, unit: string) => value === null ? unknown : `${value.toLocaleString('th-TH', { maximumFractionDigits: 2 })} ${unit}`;
const verdicts = { worth_it: 'คุ้มค่าตามข้อมูล', conditional: 'รอทบทวนเมื่อสิ้นงวด', not_worth_it: 'ยังไม่คุ้มค่า', insufficient_data: 'ข้อมูลยังไม่พอสรุป' };
const actions = { keep: 'ใช้แผนเดิมต่อได้ตามข้อมูล', review_plan: 'ทบทวนแผนและวิธีใช้', review_cancel: 'พิจารณาความจำเป็นก่อนรอบต่อไป', collect_data: 'เก็บข้อมูลเพิ่มก่อนตัดสินใจ' };
const coverage = { complete: 'ครอบคลุมช่วงที่ต้องประเมิน', partial: 'ครอบคลุมเพียงบางวัน', missing: 'ยังไม่มีหลักฐานต้นทุน', currency_mismatch: 'หลักฐานมีสกุลเงินไม่ตรงกัน', overlap: 'ช่วงการจ่ายซ้อนกัน ต้องตรวจสอบ' };
const outcomes = { completed: 'เสร็จและใช้ได้', partial: 'ได้บางส่วน', discarded: 'ไม่ได้ใช้ผลงาน' };

export default function ReportCard({ report }: { report: SubscriptionValueReport }) {
  const s = report.subscription;
  const formReport = { subscription: { id: s.id, currency: s.currency }, period: report.period, currency: report.currency, hourlyValue: report.hourlyValue, usageComplete: report.usageComplete, reviewVersion: report.review ? report.review.version ?? 1 : null, usageFingerprint: usageFingerprint(report.usages) };
  return <article className="cells-card ai-report" aria-labelledby={`subscription-${s.id}`}>
    <header><h2 id={`subscription-${s.id}`}>{s.name}</h2><p className="cells-meta">{s.provider} · {s.currency} · ต่ออายุถัดไป {s.next_billing_date ?? unknown}</p></header>
    <p><strong className="cells-pill">{report.provisional ? 'ข้อสรุปเบื้องต้น' : 'ข้อสรุปสิ้นเดือน'} · {verdicts[report.verdict]}</strong></p>
    <p>{actions[report.action]}</p>
    <dl className="cells-dl">
      <dt>จำนวนครั้ง / งานเสร็จ</dt><dd>{report.usageCount} ครั้ง / {report.completedCount} งาน</dd>
      <dt>เวลาใช้และตรวจแก้</dt><dd>{number(report.spentMinutes, 'นาที')}</dd>
      <dt>เวลาที่ประหยัดสุทธิ (ประมาณ)</dt><dd className={report.netMinutes !== null && report.netMinutes < 0 ? 'cells-danger' : ''}>{number(report.netMinutes, 'นาที')}{report.netMinutes !== null && report.netMinutes < 0 && ' (ใช้เวลาเพิ่มขึ้น)'}</dd>
      <dt>รายการยังวัดเวลาไม่ได้</dt><dd>{report.unmeasuredCount} รายการ</dd>
      <dt>ความครบถ้วนการใช้</dt><dd>{report.usageComplete ? 'ยืนยันครบแล้ว' : 'ยังไม่ยืนยันครบ'}</dd>
      <dt>ประมาณการค่าบริการ</dt><dd>{number(report.estimatedMonthlyCost, report.currency)} / เดือน จากราคาที่ตั้งไว้</dd>
      <dt>ต้นทุนจ่ายจริงที่จัดสรร</dt><dd>{number(report.allocatedCost, report.currency)} · {coverage[report.costCoverage]}</dd>
      <dt>ยอดจ่ายที่บันทึกในเดือน</dt><dd>{number(report.paidInPeriod, report.currency)} (ตามรายการที่บันทึก ไม่ยืนยันว่าไม่มีรายจ่ายอื่น)</dd>
      <dt>มูลค่าเวลาโดยประมาณ</dt><dd>{number(report.hourlyValue, `${report.currency} / ชั่วโมง`)}</dd>
      <dt>มูลค่าเวลาสุทธิที่ประมาณ</dt><dd>{number(report.timeValue, report.currency)}</dd>
      <dt>มูลค่าสุทธิหลังต้นทุน</dt><dd>{number(report.netValue, report.currency)}</dd>
      <dt>ผลตอบแทนจากต้นทุน</dt><dd>{number(report.roiPercent, '%')}</dd>
    </dl>
    {report.reasons.length > 0 && <div className="ai-reasons"><h3>เหตุผลประกอบ</h3><ul>{report.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
    <ReviewForm key={`${report.review?.id}:${report.review?.version}:${report.hourlyValue}:${report.usageComplete}`} report={formReport} />
    <details className="ai-details"><summary>บันทึกการใช้และผลงานใหม่</summary><UsageForm report={formReport} /></details>
    <details className="ai-details"><summary>บันทึกการจ่ายใหม่</summary><ChargeForm report={formReport} /></details>
    <details className="ai-details"><summary>ประวัติการใช้และผลลัพธ์ ({report.usages.length})</summary>
      {report.usages.length === 0 ? <p className="cells-empty">ยังไม่มีบันทึกการใช้ในเดือนนี้</p> : <ul className="ai-history">{report.usages.map((usage) => <li key={`${usage.id}:${usage.version}`}>
        <h3>{usage.title}</h3><p className="cells-meta">{usage.used_on} · {outcomes[usage.outcome]} · เวอร์ชัน {usage.version ?? 1}</p>
        <p>หากไม่มี AI {number(usage.baseline_minutes, 'นาที')} · ใช้จริง {number(usage.actual_minutes, 'นาที')} · ตรวจแก้ {number(usage.rework_minutes, 'นาที')}</p>
        {usage.task_ref && <p>อ้างอิงงาน: {usage.task_ref}</p>}{usage.evidence && <p>หลักฐาน: {usage.evidence}</p>}
        <details><summary>แก้ไขบันทึกการใช้</summary><UsageForm report={formReport} record={usage} /></details>
      </li>)}</ul>}
    </details>
    <details className="ai-details"><summary>ประวัติการจ่ายที่เกี่ยวข้อง ({report.charges.length})</summary>
      {report.charges.length === 0 ? <p className="cells-empty">ยังไม่มีหลักฐานการจ่าย</p> : <ul className="ai-history">{report.charges.map((charge) => <li key={`${charge.id}:${charge.version}`}>
        <h3>{number(charge.amount, charge.currency)}</h3><p>จ่าย {charge.paid_on} · ครอบคลุม {charge.period_start} – {charge.period_end} (รวมวันสุดท้าย)</p>
        <p className="cells-meta">เวอร์ชัน {charge.version ?? 1}</p><p>หลักฐาน: {charge.evidence}</p>
        <details><summary>แก้ไขการจ่าย</summary><ChargeForm report={formReport} record={charge} /></details>
      </li>)}</ul>}
    </details>
  </article>;
}
