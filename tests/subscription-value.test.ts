import { describe, expect, it } from 'vitest';
import { calculateSubscriptionValue, monthPeriod, usageFingerprint, type Subscription, type SubscriptionUsage, type SubscriptionCharge, type SubscriptionReview } from '../lib/subscription-value';

const subscription: Subscription = { id: 7, version: 1, name: 'My custom AI', provider: 'Any provider', category: 'ai', status: 'active', amount: 20, currency: 'USD', billing_interval: 'monthly' };
const period = () => monthPeriod('2026-09', '2026-10-15');
const usage = (patch: Partial<SubscriptionUsage> = {}): SubscriptionUsage => ({ id: 11, version: 1, subscription_id: 7, used_on: '2026-09-15', title: 'Deliver client report', outcome: 'completed', baseline_minutes: 180, actual_minutes: 30, rework_minutes: 30, ...patch });
const charge = (patch: Partial<SubscriptionCharge> = {}): SubscriptionCharge => ({ id: 21, subscription_id: 7, paid_on: '2026-09-01', period_start: '2026-09-01', period_end: '2026-09-30', amount: 20, currency: 'USD', evidence: 'receipt-21', ...patch });
const review = (rows: SubscriptionUsage[], patch: Partial<SubscriptionReview> = {}): SubscriptionReview => ({ id: 31, version: 1, subscription_id: 7, review_date: '2026-09-30', period_start: '2026-09-01', period_end: '2026-09-30', usage_complete: true, hourly_value: 30, value_currency: 'USD', evidence: JSON.stringify({ kind: 'ai-subscription-review.v1', usage_fingerprint: usageFingerprint(rows), confirmed_through: '2026-10-15' }), ...patch });

describe('AI subscription value from recorded evidence', () => {
  it('subtracts work, verification and fixes before valuing the saved time', () => {
    const rows = [usage()];
    const result = calculateSubscriptionValue(subscription, rows, [charge()], review(rows), period());
    expect(result).toMatchObject({ netMinutes: 120, spentMinutes: 60, timeValue: 60, allocatedCost: 20, netValue: 40, roiPercent: 200, usageCount: 1, completedCount: 1, costCoverage: 'complete', verdict: 'worth_it', action: 'keep' });
  });
  it('apportions an annual payment to the service days, not to the payment month', () => {
    const rows = [usage()];
    const result = calculateSubscriptionValue(subscription, rows, [charge({ paid_on: '2026-01-01', period_start: '2026-01-01', period_end: '2026-12-31', amount: 365 })], review(rows), period());
    expect(result.allocatedCost).toBe(30);
    expect(result.paidInPeriod).toBe(0);
    expect(result.costCoverage).toBe('complete');
  });
  it('keeps a prepayment visible and editable in the month it was paid, without treating it as that month\'s service cost', () => {
    const result = calculateSubscriptionValue(subscription, [], [charge({ paid_on: '2026-09-15', period_start: '2026-10-01', period_end: '2026-10-31' })], null, period());
    expect(result).toMatchObject({ paidInPeriod: 20, allocatedCost: null, costCoverage: 'missing', charges: [{ id: 21 }] });
  });
  it('does not treat discarded or partial work as a saved baseline', () => {
    const rows = [usage({ outcome: 'discarded', actual_minutes: 20, rework_minutes: 10 })];
    const result = calculateSubscriptionValue(subscription, rows, [charge()], review(rows), period());
    expect(result).toMatchObject({ netMinutes: -30, timeValue: -15, netValue: -35, completedCount: 0, verdict: 'not_worth_it', action: 'review_cancel' });
  });
  it('suggests reviewing the plan when work saves time but the recorded price exceeds that value', () => {
    const rows = [usage({ baseline_minutes: 100 })];
    const result = calculateSubscriptionValue(subscription, rows, [charge({ amount: 30 })], review(rows), period());
    expect(result).toMatchObject({ timeValue: 20, netValue: -10, verdict: 'not_worth_it', action: 'review_plan' });
  });
  it('keeps unknown measurements unknown and cannot recommend cancellation from missing evidence', () => {
    const rows = [usage({ baseline_minutes: null })];
    const result = calculateSubscriptionValue(subscription, rows, [charge()], review(rows), period());
    expect(result).toMatchObject({ netMinutes: null, timeValue: null, netValue: null, unmeasuredCount: 1, verdict: 'insufficient_data', action: 'collect_data' });
  });
  it('requires an explicit complete log, including for zero use', () => {
    expect(calculateSubscriptionValue(subscription, [], [charge()], null, period())).toMatchObject({ verdict: 'insufficient_data', action: 'collect_data', netMinutes: null, timeValue: null });
    expect(calculateSubscriptionValue(subscription, [], [charge()], review([]), period())).toMatchObject({ verdict: 'not_worth_it', netMinutes: 0 });
  });
  it('invalidates completeness when a usage record is added or edited after review', () => {
    const original = [usage()];
    const updated = [usage({ version: 2 })];
    expect(calculateSubscriptionValue(subscription, updated, [charge()], review(original), period())).toMatchObject({ usageComplete: false, verdict: 'insufficient_data' });
  });
  it('does not combine currencies or convert a foreign hourly value', () => {
    const rows = [usage()];
    expect(calculateSubscriptionValue(subscription, rows, [charge({ currency: 'THB' })], review(rows), period())).toMatchObject({ allocatedCost: null, costCoverage: 'currency_mismatch', verdict: 'insufficient_data' });
    expect(calculateSubscriptionValue(subscription, rows, [charge()], review(rows, { value_currency: 'THB' }), period())).toMatchObject({ timeValue: null, verdict: 'insufficient_data' });
  });
  it('keeps configured subscription prices as estimates until actual payments cover the period', () => {
    const rows = [usage()];
    const result = calculateSubscriptionValue(subscription, rows, [], review(rows), period());
    expect(result).toMatchObject({ estimatedMonthlyCost: 20, allocatedCost: null, paidInPeriod: null, costCoverage: 'missing', verdict: 'insufficient_data' });
  });
  it('detects gaps and overlapping billed service periods', () => {
    const rows = [usage()];
    expect(calculateSubscriptionValue(subscription, rows, [charge({ period_end: '2026-09-10' })], review(rows), period())).toMatchObject({ costCoverage: 'partial', verdict: 'insufficient_data' });
    expect(calculateSubscriptionValue(subscription, rows, [charge(), charge({ id: 22 })], review(rows), period())).toMatchObject({ costCoverage: 'overlap', verdict: 'insufficient_data' });
  });
  it('keeps an open month provisional even after the owner confirms the logs', () => {
    const p = monthPeriod('2026-09', '2026-09-20');
    const rows = [usage({ baseline_minutes: 0 })];
    const result = calculateSubscriptionValue(subscription, rows, [charge()], review(rows, { evidence: JSON.stringify({ kind: 'ai-subscription-review.v1', usage_fingerprint: usageFingerprint(rows), confirmed_through: '2026-09-20' }) }), p);
    expect(result).toMatchObject({ provisional: true, verdict: 'conditional', action: 'collect_data' });
  });
  it('requires a fresh confirmation after month end rather than promoting a midmonth statement automatically', () => {
    const midway = review([], { evidence: JSON.stringify({ kind: 'ai-subscription-review.v1', usage_fingerprint: usageFingerprint([]), confirmed_through: '2026-09-15' }) });
    expect(calculateSubscriptionValue(subscription, [], [charge()], midway, monthPeriod('2026-09', '2026-09-15'))).toMatchObject({ usageComplete: true, provisional: true });
    expect(calculateSubscriptionValue(subscription, [], [charge()], midway, period())).toMatchObject({ usageComplete: false, verdict: 'insufficient_data', action: 'collect_data' });
  });
  it('does not promote confirmation on the final calendar day into a final review the next day', () => {
    const lastDay = review([], { evidence: JSON.stringify({ kind: 'ai-subscription-review.v1', usage_fingerprint: usageFingerprint([]), confirmed_through: '2026-09-30' }) });
    expect(calculateSubscriptionValue(subscription, [], [charge()], lastDay, monthPeriod('2026-09', '2026-09-30'))).toMatchObject({ usageComplete: true, provisional: true });
    expect(calculateSubscriptionValue(subscription, [], [charge()], lastDay, monthPeriod('2026-09', '2026-10-01'))).toMatchObject({ usageComplete: false, verdict: 'insufficient_data' });
  });
  it('does not infer a refund or remove prepaid costs when the subscription is cancelled', () => {
    const rows = [usage({ used_on: '2026-09-20', baseline_minutes: 100 })];
    const result = calculateSubscriptionValue({ ...subscription, cancelled_on: '2026-09-15', status: 'cancelled' }, rows, [charge({ amount: 30 })], review(rows), period());
    expect(result).toMatchObject({ allocatedCost: 30, timeValue: 20, usageCount: 1, verdict: 'not_worth_it' });
  });
  it('ignores other subscriptions, other periods and future usage', () => {
    const rows = [usage(), usage({ id: 12, subscription_id: 99 }), usage({ id: 13, used_on: '2026-08-31' }), usage({ id: 14, used_on: '2026-10-16' })];
    const result = calculateSubscriptionValue(subscription, rows, [charge()], review([usage()]), period());
    expect(result).toMatchObject({ usageCount: 1, netMinutes: 120, usageComplete: true });
  });
  it('never divides by zero for a verified free period', () => {
    const rows = [usage()];
    expect(calculateSubscriptionValue(subscription, rows, [charge({ amount: 0 })], review(rows), period())).toMatchObject({ roiPercent: null, verdict: 'worth_it', allocatedCost: 0 });
  });
  it('honors subscription start dates when checking payment coverage', () => {
    const rows = [usage({ used_on: '2026-09-20' })];
    const result = calculateSubscriptionValue({ ...subscription, started_on: '2026-09-15' }, rows, [charge({ period_start: '2026-09-15' })], review(rows), period());
    expect(result.costCoverage).toBe('complete');
  });
  it('rejects impossible months rather than silently switching the reporting period', () => {
    expect(monthPeriod('2024-02', '2026-10-15').end).toBe('2024-02-29');
    expect(() => monthPeriod('2026-13', '2026-10-15')).toThrow();
  });
});
