'use client';

import type { Subscription, SubscriptionCharge, SubscriptionUsage, SubscriptionValueReport } from '@/lib/subscription-value';
import { Evidence, Field, MutationForm, numberOrNull, optional, text } from './form';
import type { Payload } from './retry';

type FormReport = Pick<SubscriptionValueReport, 'period' | 'currency' | 'hourlyValue' | 'usageComplete'> & { subscription: Pick<Subscription, 'id' | 'currency'>; reviewVersion: number | null; usageFingerprint: string };

const intervals = { weekly: 'รายสัปดาห์', monthly: 'รายเดือน', quarterly: 'รายไตรมาส', yearly: 'รายปี', usage: 'ตามการใช้', one_time: 'ครั้งเดียว' };

export function SubscriptionForms({ available, today }: { available: Subscription[]; today: string }) {
  return <section className="cells-card"><h2>จัดการรายการสมาชิก AI</h2>
    <MutationForm title="เพิ่มสมาชิก AI" payload={(data) => ({ action: 'subscription', name: text(data, 'name'), provider: text(data, 'provider'), amount: Number(text(data, 'amount')), currency: text(data, 'currency').toUpperCase(), billing_interval: text(data, 'billing_interval'), ...optional(data, 'started_on'), ...optional(data, 'next_billing_date') })}>
      <Field label="ชื่อสมาชิก" name="name" required maxLength={200} />
      <Field label="ผู้ให้บริการ" name="provider" required maxLength={200} />
      <Field label="ค่าบริการต่อรอบ" name="amount" type="number" min="0" step="0.01" required />
      <Field label="สกุลเงิน" name="currency" defaultValue="THB" pattern="[A-Za-z]{3}" maxLength={3} required />
      <label className="ai-field"><span>รอบค่าบริการ</span><select name="billing_interval" defaultValue="monthly">{Object.entries(intervals).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <Field label="วันที่เริ่มใช้" name="started_on" type="date" max={today} />
      <Field label="วันที่ต่ออายุถัดไป" name="next_billing_date" type="date" />
    </MutationForm>
    {available.length > 0 && <MutationForm title="จัดรายการเดิมเป็นสมาชิก AI" payload={(data) => {
      const subscription = available.find((item) => item.id === Number(text(data, 'subscription_id')))!;
      return { action: 'adopt', subscription_id: subscription.id, expected_version: subscription.version ?? 1 };
    }}>
      <label className="ai-field ai-wide"><span>สมาชิกเดิมที่ยังไม่ได้จัดเป็น AI</span><select name="subscription_id" required>{available.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.provider} · {item.amount} {item.currency}</option>)}</select></label>
      <p className="cells-summary ai-wide">เลือกแล้วบันทึกเพื่อยืนยันจัดหมวดรายการนี้เป็น AI</p>
    </MutationForm>}
  </section>;
}

export function UsageForm({ report, record }: { report: FormReport; record?: SubscriptionUsage }) {
  return <MutationForm title={record ? 'แก้ไขบันทึกการใช้' : 'บันทึกการใช้'} reset={!record} payload={(data) => ({
    action: 'usage', subscription_id: report.subscription.id,
    ...(record ? { record_id: record.id, expected_version: record.version ?? 1 } : {}),
    used_on: text(data, 'used_on'), title: text(data, 'title'), outcome: text(data, 'outcome'),
    baseline_minutes: numberOrNull(data, 'baseline_minutes'), actual_minutes: numberOrNull(data, 'actual_minutes'), rework_minutes: numberOrNull(data, 'rework_minutes') ?? 0,
    ...optional(data, 'task_ref'), ...optional(data, 'evidence'),
  })}>
    <Field label="วันที่ใช้" name="used_on" type="date" max={report.period.today} defaultValue={record?.used_on ?? (report.period.closed ? report.period.end : report.period.today)} required />
    <Field label="งานหรือผลลัพธ์" name="title" maxLength={200} defaultValue={record?.title} required />
    <label className="ai-field"><span>ผลของงาน</span><select name="outcome" defaultValue={record?.outcome ?? 'completed'}><option value="completed">เสร็จและใช้ได้</option><option value="partial">ได้บางส่วน</option><option value="discarded">ไม่ได้ใช้ผลงาน</option></select></label>
    <Field label="เวลาที่คาดว่าจะใช้โดยไม่มี AI (นาที)" name="baseline_minutes" type="number" min="0" step="any" defaultValue={record?.baseline_minutes ?? ''} />
    <Field label="เวลาที่ใช้จริงรวมรอ AI (นาที)" name="actual_minutes" type="number" min="0" step="any" defaultValue={record?.actual_minutes ?? ''} />
    <Field label="เวลาตรวจและแก้ไขเพิ่ม (นาที)" name="rework_minutes" type="number" min="0" step="any" defaultValue={record?.rework_minutes ?? 0} />
    <Field label="อ้างอิงงาน" name="task_ref" maxLength={300} defaultValue={record?.task_ref ?? ''} />
    <Evidence value={record?.evidence} />
    <p className="cells-summary ai-wide">เว้นว่างเวลาเมื่อยังไม่ทราบ เวลาที่ใช้จริงรวมเวลาใช้งานและรอ AI; เวลาตรวจสอบและแก้ไขบันทึกแยก งานได้บางส่วนหรือทิ้งผลงานจะไม่นับเวลาที่คาดไว้เป็นเวลาที่ประหยัด</p>
  </MutationForm>;
}

export function ChargeForm({ report, record }: { report: FormReport; record?: SubscriptionCharge }) {
  const currencyMismatch = record !== undefined && record.currency !== report.subscription.currency;
  return <MutationForm title={record ? 'แก้ไขการจ่าย' : 'บันทึกการจ่าย'} reset={!record} payload={(data) => ({
    action: 'charge', subscription_id: report.subscription.id,
    ...(record ? { record_id: record.id, expected_version: record.version ?? 1 } : {}),
    paid_on: text(data, 'paid_on'), period_start: text(data, 'period_start'), period_end: text(data, 'period_end'),
    amount: Number(text(data, 'amount')), currency: report.subscription.currency, evidence: text(data, 'evidence'),
  })}>
    <Field label="วันที่จ่าย" name="paid_on" type="date" max={report.period.today} defaultValue={record?.paid_on ?? report.period.today} required />
    <Field label="วันแรกที่การจ่ายครอบคลุม" name="period_start" type="date" defaultValue={record?.period_start ?? report.period.start} required />
    <Field label="วันสุดท้ายที่การจ่ายครอบคลุม (รวมวันนี้)" name="period_end" type="date" defaultValue={record?.period_end ?? report.period.end} required />
    <Field label={`ยอดจ่าย (${report.subscription.currency})`} name="amount" type="number" min="0" step="0.01" defaultValue={currencyMismatch ? '' : record?.amount} required />
    {currencyMismatch && <p className="cells-danger ai-wide">ยอดเดิม {record.amount} {record.currency} · กรอกยอดที่ถูกต้องใน {report.subscription.currency} ใหม่ ไม่มีการแปลงสกุลเงิน</p>}
    <Evidence required value={record?.evidence} />
    <p className="cells-summary ai-wide">ระบุช่วงบริการตามใบเสร็จ รวมวันแรกและวันสุดท้าย การจ่ายรายปีจะจัดสรรต้นทุนตามจำนวนวันที่ครอบคลุมแต่ละเดือน</p>
  </MutationForm>;
}

export function reviewPayload(report: FormReport, data: FormData): Payload {
  return {
    action: 'review', subscription_id: report.subscription.id, month: report.period.month,
    ...(report.reviewVersion !== null ? { expected_version: report.reviewVersion } : {}),
    hourly_value: numberOrNull(data, 'hourly_value'), usage_complete: data.get('usage_complete') === 'on',
    usage_fingerprint: report.usageFingerprint,
  };
}

export function ReviewForm({ report }: { report: FormReport }) {
  return <MutationForm title="บันทึกการประเมินเดือนนี้" reset={false} payload={(data) => reviewPayload(report, data)}>
    <Field label={`มูลค่าเวลาโดยประมาณต่อชั่วโมง (${report.currency})`} name="hourly_value" type="number" min="0" step="0.01" defaultValue={report.hourlyValue ?? ''} />
    <label className="ai-check ai-wide"><input name="usage_complete" type="checkbox" defaultChecked={report.usageComplete} /><span>ยืนยันว่าบันทึกการใช้{report.period.closed ? 'ทั้งหมดของเดือน' : 'ถึงวันนี้ของเดือน'} {report.period.month} แล้ว รวมถึงกรณีไม่ได้ใช้เลย</span></label>
    <p className="cells-summary ai-wide">มูลค่าเวลาเป็นการประมาณ ไม่ใช่รายรับจริง การเพิ่มหรือแก้ไขบันทึกการใช้ทำให้ต้องยืนยันความครบถ้วนใหม่ เดือนปัจจุบันยังเป็นข้อสรุปเบื้องต้น</p>
  </MutationForm>;
}
