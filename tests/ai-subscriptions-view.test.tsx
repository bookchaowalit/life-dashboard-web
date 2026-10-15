import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AiSubscriptionsData, SubscriptionValueReport } from '../lib/subscription-value';
import { VISIBLE_MODULES, MODULES } from '../lib/modules';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));

const period = { month: '2026-09', start: '2026-09-01', end: '2026-09-30', today: '2026-10-15', closed: true };
const row: SubscriptionValueReport = {
  subscription: { id: 1, version: 2, name: 'เครื่องมือของฉัน', provider: 'Custom Studio', category: 'ai', status: 'active', amount: 900, currency: 'THB', billing_interval: 'monthly', next_billing_date: '2026-10-25' },
  period, usages: [{ id: 9, version: 3, subscription_id: 1, used_on: '2026-09-13', title: 'ตรวจเอกสาร', outcome: 'completed', baseline_minutes: 10, actual_minutes: 20, rework_minutes: 5 }],
  charges: [{ id: 7, version: 2, subscription_id: 1, paid_on: '2026-09-01', period_start: '2026-09-01', period_end: '2026-09-30', amount: 900, currency: 'THB', evidence: 'ใบเสร็จตัวอย่าง' }],
  review: { id: 3, subscription_id: 1, review_date: '2026-10-01', period_start: period.start, period_end: period.end, usage_complete: true, hourly_value: 300, value_currency: 'THB' },
  currency: 'THB', usageCount: 1, completedCount: 1, unmeasuredCount: 0, netMinutes: -15, spentMinutes: 25,
  hourlyValue: 300, estimatedMonthlyCost: 900, allocatedCost: 900, paidInPeriod: 900, costCoverage: 'complete', timeValue: -75, netValue: -975, roiPercent: -108.33,
  usageComplete: false, verdict: 'not_worth_it', action: 'review_cancel', reasons: ['ใช้เวลาเพิ่มขึ้นจากการตรวจแก้งาน'], provisional: true,
};
const data: AiSubscriptionsData = { period, rows: [row], availableSubscriptions: [] };

// Removing the real report component's evidence, signed figures or completion gating must fail these checks.
describe('AI subscription owner view', () => {
  it('renders per-provider costs, signed time, reasons and actual evidence without a combined currency total', async () => {
    const { default: View } = await import('../modules/ai-subscriptions/view');
    const usd = { ...row, subscription: { ...row.subscription, id: 2, currency: 'USD', name: 'Other' }, currency: 'USD', allocatedCost: null, netValue: null };
    const html = renderToStaticMarkup(<View result={{ ok: true, data: { ...data, rows: [row, usd] } }} />);
    for (const text of ['Custom Studio', '900 THB', '-15 นาที', '-975 THB', 'ใช้เวลาเพิ่มขึ้นจากการตรวจแก้งาน', 'ประมาณการค่าบริการ', 'ต้นทุนจ่ายจริงที่จัดสรร', 'ข้อสรุปเบื้องต้น', '2026-10-25', 'ใบเสร็จตัวอย่าง', 'เวอร์ชัน 3', 'ยังไม่มีข้อมูล']) expect(html).toContain(text);
    expect(html).not.toContain('ยอดรวมทุกสกุลเงิน');
    expect(html).toContain('900 USD');
    expect(html).toContain('<dt>ต้นทุนจ่ายจริงที่จัดสรร</dt><dd>ยังไม่มีข้อมูล');
  });
  it('does not preconfirm incomplete usage even when the old review claimed completion', async () => {
    const { default: View } = await import('../modules/ai-subscriptions/view');
    const html = renderToStaticMarkup(<View result={{ ok: true, data }} />);
    const checks = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(checks).toHaveLength(1);
    expect(checks[0]).not.toContain('checked');
    expect(html).toContain('ยืนยันว่าบันทึกการใช้ทั้งหมดของเดือน 2026-09 แล้ว รวมถึงกรณีไม่ได้ใช้เลย');
  });
  it('shows labeled dated forms and historical month selection', async () => {
    const { default: View } = await import('../modules/ai-subscriptions/view');
    const html = renderToStaticMarkup(<View result={{ ok: true, data }} />);
    for (const text of ['method="get"', 'type="month"', 'value="2026-09"', 'เวลาที่คาดว่าจะใช้โดยไม่มี AI', 'เวลาที่ใช้จริงรวมรอ AI', 'เวลาตรวจและแก้ไขเพิ่ม', 'max="2026-10-15"', 'แก้ไขบันทึกการใช้', 'แก้ไขการจ่าย', 'ผู้ให้บริการ', 'สกุลเงิน']) expect(html).toContain(text);
    expect(html).toContain('maxLength="800"');
  });
  it('prefills confirmed complete evidence and offers explicit adoption of an existing subscription', async () => {
    const { default: View } = await import('../modules/ai-subscriptions/view');
    const html = renderToStaticMarkup(<View result={{ ok: true, data: { ...data, rows: [{ ...row, usageComplete: true, provisional: false }], availableSubscriptions: [{ ...row.subscription, id: 8, category: 'software', name: 'Existing tool' }] } }} />);
    expect(html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0]).toContain('checked');
    expect(html).toContain('ข้อสรุปสิ้นเดือน');
    expect(html).toContain('Existing tool');
    expect(html).toContain('จัดรายการเดิมเป็นสมาชิก AI');
  });
  it('requires an explicit matched-currency amount when correcting a charge in another currency', async () => {
    const { default: View } = await import('../modules/ai-subscriptions/view');
    const report = { ...row, charges: [{ ...row.charges[0], amount: 27.45, currency: 'USD' }] };
    const html = renderToStaticMarkup(<View result={{ ok: true, data: { ...data, rows: [report] } }} />);
    expect(html).toContain('ยอดเดิม 27.45 USD');
    expect(html).toContain('กรอกยอดที่ถูกต้องใน THB ใหม่ ไม่มีการแปลงสกุลเงิน');
    const corrections = [...html.matchAll(/<form[^>]*aria-label="แก้ไขการจ่าย"[\s\S]*?<\/form>/g)];
    expect(corrections).toHaveLength(1);
    const amount = corrections[0][0].match(/<input[^>]*name="amount"[^>]*>/)?.[0];
    expect(amount).toContain('required');
    expect(amount).not.toContain('value="27.45"');
    expect(amount).not.toMatch(/value="[^"]+"/);
  });
  it('distinguishes an empty report from an unavailable service and keeps quota navigation hidden', async () => {
    const { default: View } = await import('../modules/ai-subscriptions/view');
    const empty = renderToStaticMarkup(<View result={{ ok: true, data: { ...data, rows: [] } }} />);
    expect(empty).toContain('ยังไม่มีสมาชิก AI');
    expect(empty).toContain('เพิ่มสมาชิก AI');
    const unavailable = renderToStaticMarkup(<View result={{ ok: false, cell: 'subscriptions', code: 'not_configured' }} />);
    expect(unavailable).toContain('ไม่พร้อมใช้งาน');
    expect(unavailable).not.toContain('เพิ่มสมาชิก AI');
    expect(VISIBLE_MODULES.find((item) => item.id === 'ai-subscriptions')?.href).toBe('/ai-subscriptions');
    expect(MODULES.find((item) => item.id === 'ai-usage')?.hidden).toBe(true);
  });
});

// A fresh key after an ambiguous failure could insert the same charge twice.
describe('mutation retry identity', () => {
  it('reuses the key after an unsuccessful unchanged charge attempt and rotates only on edits or success', async () => {
    const { MutationAttempt } = await import('../modules/ai-subscriptions/retry');
    let next = 0;
    const attempt = new MutationAttempt(() => `key-${++next}`);
    const charge = { action: 'charge', subscription_id: 1, amount: 900, currency: 'THB' };
    expect(attempt.prepare(charge)).toMatchObject({ idempotency_key: 'key-1', amount: 900 });
    expect(attempt.prepare({ ...charge })).toMatchObject({ idempotency_key: 'key-1' });
    expect(attempt.prepare({ ...charge, amount: 800 })).toMatchObject({ idempotency_key: 'key-2' });
    attempt.succeeded();
    expect(attempt.prepare({ ...charge, amount: 800 })).toMatchObject({ idempotency_key: 'key-3' });
    expect(charge).not.toHaveProperty('idempotency_key');
  });
  it('preserves unknown input times as null while accepting an explicit zero', async () => {
    const { numberOrNull } = await import('../modules/ai-subscriptions/form');
    const fields = new FormData();
    fields.set('baseline_minutes', '');
    fields.set('actual_minutes', '0');
    expect(numberOrNull(fields, 'baseline_minutes')).toBeNull();
    expect(numberOrNull(fields, 'actual_minutes')).toBe(0);
    expect(numberOrNull(fields, 'rework_minutes')).toBeNull();
  });
  it('keeps versioned corrections and adoption free of creation keys', async () => {
    const { MutationAttempt } = await import('../modules/ai-subscriptions/retry');
    const attempt = new MutationAttempt();
    expect(attempt.prepare({ action: 'usage', subscription_id: 1, record_id: 8, expected_version: 3 })).toEqual({ action: 'usage', subscription_id: 1, record_id: 8, expected_version: 3 });
    expect(attempt.prepare({ action: 'adopt', subscription_id: 1, expected_version: 2 })).toEqual({ action: 'adopt', subscription_id: 1, expected_version: 2 });
  });
});
