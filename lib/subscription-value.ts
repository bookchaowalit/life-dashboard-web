/** Provider-neutral value calculations. Unknown evidence stays unknown; no currency conversion. */
import { createHash } from 'node:crypto';
export interface Subscription {
  id: number; version?: number; name: string; provider: string; category: string; status: string;
  amount: number; currency: string; billing_interval: string;
  started_on?: string | null; cancelled_on?: string | null; next_billing_date?: string | null;
}
export interface SubscriptionUsage {
  id: number; version?: number; subscription_id: number; used_on: string; title: string;
  outcome: 'completed' | 'partial' | 'discarded'; baseline_minutes: number | null;
  actual_minutes: number | null; rework_minutes: number | null; task_ref?: string | null;
  evidence?: string | null; source?: string; source_ref?: string | null;
}
export interface SubscriptionCharge {
  id: number; version?: number; subscription_id: number; paid_on: string;
  period_start: string; period_end: string; amount: number; currency: string; evidence: string;
  source?: string; source_ref?: string | null;
}
export interface SubscriptionReview {
  id: number; version?: number; subscription_id: number; review_date: string;
  period_start: string; period_end: string; usage_complete: boolean;
  hourly_value: number | null; value_currency: string | null; evidence?: string | null;
}
export interface ValuePeriod { month: string; start: string; end: string; today: string; closed: boolean }
export type ValueVerdict = 'worth_it' | 'conditional' | 'not_worth_it' | 'insufficient_data';
export interface SubscriptionValueReport {
  subscription: Subscription; period: ValuePeriod; usages: SubscriptionUsage[]; charges: SubscriptionCharge[];
  review: SubscriptionReview | null; currency: string; usageCount: number; completedCount: number;
  unmeasuredCount: number; netMinutes: number | null; spentMinutes: number | null;
  hourlyValue: number | null; estimatedMonthlyCost: number | null;
  allocatedCost: number | null; paidInPeriod: number | null;
  costCoverage: 'complete' | 'partial' | 'missing' | 'currency_mismatch' | 'overlap';
  timeValue: number | null; netValue: number | null; roiPercent: number | null;
  usageComplete: boolean; verdict: ValueVerdict;
  action: 'keep' | 'review_plan' | 'review_cancel' | 'collect_data';
  reasons: string[]; provisional: boolean;
}
export interface AiSubscriptionsData {
  period: ValuePeriod; rows: SubscriptionValueReport[]; availableSubscriptions: Subscription[];
}

const DAY_MS = 86_400_000;
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const stamp = (day: string) => Date.parse(`${day}T00:00:00Z`);

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = stamp(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function monthPeriod(month: string, today: string): ValuePeriod {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) || !validDate(today)) throw new Error('invalid period');
  const [year, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
  return { month, start, end, today, closed: end < today };
}

export function usageFingerprint(rows: SubscriptionUsage[]): string {
  const versions = JSON.stringify(rows.map((row) => [row.id, row.version ?? 0]).sort((a, b) => a[0] - b[0]));
  return createHash('sha256').update(versions).digest('hex');
}

function confirmed(review: SubscriptionReview | null, rows: SubscriptionUsage[], period: ValuePeriod): boolean {
  if (!review?.usage_complete) return false;
  try {
    const evidence = JSON.parse(review.evidence ?? '');
    const requiredThrough = period.closed ? new Date(stamp(period.end) + DAY_MS).toISOString().slice(0, 10) : period.today;
    return evidence.kind === 'ai-subscription-review.v1' && evidence.usage_fingerprint === usageFingerprint(rows)
      && validDate(evidence.confirmed_through) && evidence.confirmed_through >= requiredThrough && evidence.confirmed_through <= period.today;
  } catch { return false; }
}

export function calculateSubscriptionValue(
  subscription: Subscription, allUsages: SubscriptionUsage[], allCharges: SubscriptionCharge[],
  savedReview: SubscriptionReview | null, period: ValuePeriod,
): SubscriptionValueReport {
  const currency = subscription.currency;
  const start = period.start;
  const end = period.end;
  // Lifecycle dates set the required coverage, but never imply a refund of a recorded invoice.
  const coverageStart = validDate(subscription.started_on) && subscription.started_on > start && subscription.started_on <= end ? subscription.started_on : start;
  const coverageEnd = validDate(subscription.cancelled_on) && subscription.cancelled_on >= coverageStart && subscription.cancelled_on < end ? subscription.cancelled_on : end;
  const inPeriod = (day: string) => validDate(day) && day >= start && day <= end && day <= period.today;
  const usages = allUsages.filter((row) => row.subscription_id === subscription.id && inPeriod(row.used_on));
  const review = savedReview?.subscription_id === subscription.id && savedReview.period_start === period.start
    && savedReview.period_end === period.end ? savedReview : null;
  const usageComplete = confirmed(review, usages, period);
  let measuredNet = 0; let measuredSpent = 0; let unmeasuredCount = 0;
  for (const row of usages) {
    if (!nonnegative(row.actual_minutes) || !nonnegative(row.rework_minutes)
      || !['completed', 'partial', 'discarded'].includes(row.outcome)
      || (row.outcome === 'completed' && !nonnegative(row.baseline_minutes))) {
      unmeasuredCount += 1;
      continue;
    }
    const spent = row.actual_minutes + row.rework_minutes;
    measuredSpent += spent;
    measuredNet += (row.outcome === 'completed' ? row.baseline_minutes! : 0) - spent;
  }
  const unknownUsage = unmeasuredCount > 0 || (!usages.length && !usageComplete);
  const netMinutes = unknownUsage ? null : measuredNet;
  const spentMinutes = unknownUsage ? null : measuredSpent;
  const charges = allCharges.filter((row) => row.subscription_id === subscription.id
    && validDate(row.period_start) && validDate(row.period_end) && row.period_start <= row.period_end
    && row.period_start <= end && row.period_end >= start);
  const cashCharges = allCharges.filter((row) => row.subscription_id === subscription.id && validDate(row.paid_on)
    && row.paid_on >= period.start && row.paid_on <= period.end && row.paid_on <= period.today);
  const serviceChargeIds = new Set(charges.map((row) => row.id));
  const cashChargeIds = new Set(cashCharges.map((row) => row.id));
  const historyCharges = allCharges.filter((row) => row.subscription_id === subscription.id
    && (serviceChargeIds.has(row.id) || cashChargeIds.has(row.id)));
  const usable = charges.filter((row) => row.currency === currency && nonnegative(row.amount)
    && validDate(row.paid_on) && row.paid_on <= period.today && Boolean(row.evidence?.trim()));
  const invalidCharge = usable.length !== charges.length;
  const mismatch = charges.some((row) => row.currency !== currency);
  const intervals = usable.map((row) => ({ start: row.period_start > start ? row.period_start : start,
    end: row.period_end < end ? row.period_end : end })).sort((a, b) => a.start.localeCompare(b.start));
  let through = stamp(coverageStart) - DAY_MS; let previousEnd = -Infinity; let overlap = false; let gap = false;
  for (const interval of intervals) {
    const from = stamp(interval.start); const until = stamp(interval.end);
    if (from <= previousEnd) overlap = true;
    previousEnd = Math.max(previousEnd, until);
    if (until < stamp(coverageStart) || from > stamp(coverageEnd)) continue;
    if (Math.max(from, stamp(coverageStart)) > through + DAY_MS) gap = true;
    through = Math.max(through, Math.min(until, stamp(coverageEnd)));
  }
  const costCoverage: SubscriptionValueReport['costCoverage'] = mismatch ? 'currency_mismatch'
    : !usable.length ? 'missing' : overlap ? 'overlap'
      : invalidCharge || gap || through < stamp(coverageEnd) ? 'partial' : 'complete';
  const allocatedCost = usable.length && !mismatch ? cents(usable.reduce((sum, row) => {
    const covered = (stamp(row.period_end < end ? row.period_end : end) - stamp(row.period_start > start ? row.period_start : start)) / DAY_MS + 1;
    const days = (stamp(row.period_end) - stamp(row.period_start)) / DAY_MS + 1;
    return sum + row.amount * covered / days;
  }, 0)) : null;
  const paidInPeriod = mismatch || cashCharges.some((row) => row.currency !== currency || !nonnegative(row.amount))
    || !allCharges.some((row) => row.subscription_id === subscription.id) ? null
      : cents(cashCharges.reduce((sum, row) => sum + row.amount, 0));
  const multiplier: Record<string, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
  const estimatedMonthlyCost = nonnegative(subscription.amount) && multiplier[subscription.billing_interval]
    ? cents(subscription.amount * multiplier[subscription.billing_interval]) : null;
  const hourlyValue = review?.value_currency === currency && nonnegative(review.hourly_value) ? review.hourly_value : null;
  const timeValue = netMinutes !== null && hourlyValue !== null ? cents(netMinutes / 60 * hourlyValue) : null;
  const netValue = timeValue !== null && allocatedCost !== null ? cents(timeValue - allocatedCost) : null;
  const roiPercent = netValue !== null && allocatedCost !== null && allocatedCost > 0 ? cents(netValue / allocatedCost * 100) : null;
  const reasons: string[] = [];
  if (costCoverage === 'missing') reasons.push('ยังไม่มีหลักฐานยอดจ่ายจริงที่ครอบคลุมงวดนี้');
  if (costCoverage === 'partial') reasons.push('ยอดจ่ายจริงยังไม่ครอบคลุมช่วงบริการทั้งงวด');
  if (costCoverage === 'overlap') reasons.push('พบช่วงบริการของยอดจ่ายซ้อนกัน กรุณาตรวจว่าบันทึกซ้ำหรือไม่');
  if (costCoverage === 'currency_mismatch') reasons.push('สกุลเงินของยอดจ่ายไม่ตรงกับ subscription จึงยังคำนวณรวมไม่ได้');
  if (!usageComplete) reasons.push('ยังไม่ได้ยืนยันว่าบันทึกการใช้งานงวดนี้ครบ หรือมีการเปลี่ยนข้อมูลหลังยืนยัน');
  if (unmeasuredCount) reasons.push(`มี ${unmeasuredCount} งานที่ยังระบุเวลาไม่ครบ`);
  if (hourlyValue === null) reasons.push('ยังไม่มีมูลค่าเวลาโดยประมาณในสกุลเงินเดียวกับค่าสมาชิก');
  let verdict: ValueVerdict = 'insufficient_data';
  let action: SubscriptionValueReport['action'] = 'collect_data';
  if (!reasons.length && netValue !== null) {
    if (!period.closed) {
      verdict = 'conditional';
      reasons.push('งวดนี้ยังไม่สิ้นสุด ผลเป็นข้อมูลระหว่างงวด ยังไม่ควรตัดสินใจยกเลิก');
    } else if (netValue >= 0) {
      verdict = 'worth_it'; action = 'keep';
      reasons.push('มูลค่าเวลาที่ประหยัดตามค่าประเมินครอบคลุมต้นทุนที่บันทึกแล้ว');
    } else {
      verdict = 'not_worth_it'; action = timeValue !== null && timeValue > 0 ? 'review_plan' : 'review_cancel';
      reasons.push('มูลค่าเวลาตามค่าประเมินยังไม่ครอบคลุมต้นทุน ตรวจผลงานและคุณค่าด้านอื่นก่อนเปลี่ยนแพ็กเกจ');
    }
  }
  return { subscription, period, usages, charges: historyCharges, review, currency, usageCount: usages.length,
    completedCount: usages.filter((row) => row.outcome === 'completed').length, unmeasuredCount,
    netMinutes, spentMinutes, hourlyValue, estimatedMonthlyCost, allocatedCost, paidInPeriod, costCoverage,
    timeValue, netValue, roiPercent, usageComplete, verdict, action, reasons, provisional: !period.closed };
}
