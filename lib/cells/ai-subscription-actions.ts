/** Owner-only commands for manual evidence; credentials and caller-selected endpoints never cross this boundary. */
import { calculateSubscriptionValue, monthPeriod, usageFingerprint, validDate, type Subscription, type SubscriptionCharge, type SubscriptionReview, type SubscriptionUsage } from '@/lib/subscription-value';
import { bangkokDate, CellError, cellRequest, resolveCell, type Env } from './core';
import { subscriptionRecords, type SubscriptionResource } from './ai-subscriptions';

const invalid = (): never => { throw new CellError('invalid', 'subscriptions'); };
const positiveId = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : invalid();
const amount = (value: unknown, nullable = false): number | null => {
  if (nullable && (value === null || value === undefined)) return null;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000 ? value : invalid();
};
const text = (value: unknown, maximum: number, required = false): string | null => {
  if ((value === null || value === undefined || value === '') && !required) return null;
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : invalid();
};
const date = (value: unknown, today?: string): string => validDate(value) && (!today || value <= today) ? value : invalid();
const currency = (value: unknown): string => typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : invalid();
const key = (value: unknown): string => typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value) ? value : invalid();
function fields(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some((field) => !['action', ...allowed].includes(field))) invalid();
}

export async function saveAiSubscriptionEvidence(body: Record<string, unknown>, env: Env) {
  const today = bangkokDate();
  const action = body.action;
  const config = () => resolveCell('subscriptions', env);
  const create = async (plural: SubscriptionResource, data: Record<string, unknown>, requestKey: string) =>
    cellRequest(config(), 'POST', `/v1/${plural}`, { body: data, headers: { 'Idempotency-Key': requestKey } });
  const getSubscription = async (id: number, requireAi = true): Promise<Subscription> => {
    const row = await cellRequest(config(), 'GET', `/v1/subscriptions/${id}`) as Subscription;
    if (requireAi && row.category !== 'ai') invalid();
    return row;
  };

  if (action === 'subscription') {
    fields(body, ['idempotency_key', 'name', 'provider', 'amount', 'currency', 'billing_interval', 'started_on', 'next_billing_date']);
    const requestKey = key(body.idempotency_key);
    const interval = body.billing_interval;
    if (typeof interval !== 'string' || !['weekly', 'monthly', 'quarterly', 'yearly', 'one_time', 'usage'].includes(interval)) invalid();
    const data = { name: text(body.name, 200, true), provider: text(body.provider, 200, true), amount: amount(body.amount),
      currency: currency(body.currency), billing_interval: interval, category: 'ai', status: 'active',
      ...(body.started_on ? { started_on: date(body.started_on) } : {}),
      ...(body.next_billing_date ? { next_billing_date: date(body.next_billing_date) } : {}) };
    const row = await create('subscriptions', data, requestKey);
    return { id: row.id, action };
  }
  if (action === 'adopt') {
    fields(body, ['subscription_id', 'expected_version']);
    const id = positiveId(body.subscription_id); const version = positiveId(body.expected_version);
    await getSubscription(id, false);
    await cellRequest(config(), 'PATCH', `/v1/subscriptions/${id}`, { body: { category: 'ai', expected_version: version } });
    return { id, action };
  }
  if (action === 'usage' || action === 'charge') {
    const common = ['idempotency_key', 'subscription_id', 'record_id', 'expected_version'];
    fields(body, [...common, ...(action === 'usage'
      ? ['used_on', 'title', 'outcome', 'baseline_minutes', 'actual_minutes', 'rework_minutes', 'task_ref', 'evidence']
      : ['paid_on', 'period_start', 'period_end', 'amount', 'currency', 'evidence'])]);
    const subscriptionId = positiveId(body.subscription_id);
    const recordId = body.record_id === undefined ? null : positiveId(body.record_id);
    const version = recordId === null ? null : positiveId(body.expected_version);
    const requestKey = recordId === null ? key(body.idempotency_key) : null;
    let data: Record<string, unknown>;
    if (action === 'usage') {
      if (!['completed', 'partial', 'discarded'].includes(String(body.outcome))) invalid();
      data = { used_on: date(body.used_on, today), title: text(body.title, 200, true), outcome: body.outcome,
        baseline_minutes: amount(body.baseline_minutes, true), actual_minutes: amount(body.actual_minutes, true),
        rework_minutes: body.rework_minutes === undefined ? 0 : amount(body.rework_minutes),
        task_ref: text(body.task_ref, 300), evidence: text(body.evidence, 800) };
    } else {
      const start = date(body.period_start); const end = date(body.period_end);
      if (end < start) invalid();
      data = { paid_on: date(body.paid_on, today), period_start: start, period_end: end,
        amount: amount(body.amount), currency: currency(body.currency), evidence: text(body.evidence, 800, true) };
    }
    const subscription = await getSubscription(subscriptionId);
    if (action === 'charge' && data.currency !== subscription.currency) invalid();
    const plural = action === 'usage' ? 'subscription-usages' : 'subscription-charges';
    if (recordId !== null) {
      const existing = await cellRequest(config(), 'GET', `/v1/${plural}/${recordId}`);
      if (existing.subscription_id !== subscriptionId) invalid();
      await cellRequest(config(), 'PATCH', `/v1/${plural}/${recordId}`, { body: { ...data, expected_version: version } });
      return { id: recordId, action };
    }
    const row = await create(plural, { ...data, subscription_id: subscriptionId, source: 'manual' }, requestKey!);
    return { id: row.id, action };
  }
  if (action === 'review') {
    fields(body, ['idempotency_key', 'subscription_id', 'month', 'hourly_value', 'usage_complete', 'expected_version', 'usage_fingerprint']);
    const subscriptionId = positiveId(body.subscription_id); const requestKey = key(body.idempotency_key);
    const hourlyValue = amount(body.hourly_value, true);
    if (typeof body.usage_complete !== 'boolean' || typeof body.month !== 'string') invalid();
    if (body.usage_complete && (typeof body.usage_fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.usage_fingerprint))) invalid();
    let period;
    try { period = monthPeriod(body.month as string, today); } catch { invalid(); }
    const subscription = await getSubscription(subscriptionId);
    const filter: Array<[string, string]> = [['subscription_id', String(subscriptionId)]];
    const [usages, charges, reviews] = await Promise.all([
      subscriptionRecords<SubscriptionUsage>(config(), 'subscription-usages', filter),
      subscriptionRecords<SubscriptionCharge>(config(), 'subscription-charges', filter),
      subscriptionRecords<SubscriptionReview>(config(), 'subscription-reviews', filter),
    ]);
    const existing = reviews.filter((row) => row.subscription_id === subscriptionId && row.period_start === period!.start && row.period_end === period!.end).sort((a, b) => b.id - a.id)[0];
    if (existing) {
      let originalKey: unknown;
      try { originalKey = JSON.parse(existing.evidence ?? '').request_key; } catch { /* Legacy review has no retry marker. */ }
      if (originalKey === requestKey) return { id: existing.id, action };
      if (body.expected_version === undefined || positiveId(body.expected_version) !== existing.version) throw new CellError('conflict', 'subscriptions');
    } else if (body.expected_version !== undefined) throw new CellError('conflict', 'subscriptions');
    const draft: SubscriptionReview = { id: existing?.id ?? 0, subscription_id: subscriptionId, review_date: period!.end,
      period_start: period!.start, period_end: period!.end, usage_complete: body.usage_complete as boolean,
      hourly_value: hourlyValue, value_currency: subscription.currency };
    const selected = calculateSubscriptionValue(subscription, usages, charges, null, period!);
    if (body.usage_complete && body.usage_fingerprint !== usageFingerprint(selected.usages)) throw new CellError('conflict', 'subscriptions');
    draft.evidence = JSON.stringify({ kind: 'ai-subscription-review.v1', usage_fingerprint: usageFingerprint(selected.usages), confirmed_through: today });
    const report = calculateSubscriptionValue(subscription, usages, charges, draft, period!);
    const evidence = JSON.stringify({ kind: 'ai-subscription-review.v1', usage_fingerprint: usageFingerprint(report.usages), request_key: requestKey,
      confirmed_through: today,
      net_minutes: report.netMinutes, allocated_cost: report.allocatedCost, cost_coverage: report.costCoverage,
      time_value_is_estimate: true });
    const data = { subscription_id: subscriptionId, review_date: period!.end, period_start: period!.start, period_end: period!.end,
      usage_complete: draft.usage_complete, hourly_value: hourlyValue, value_currency: subscription.currency,
      usage_events: report.usageCount, usage_hours: report.spentMinutes === null ? null : report.spentMinutes / 60,
      time_saved_hours: report.netMinutes === null ? null : Math.max(0, report.netMinutes / 60), verdict: report.verdict, evidence };
    const row = existing
      ? await cellRequest(config(), 'PATCH', `/v1/subscription-reviews/${existing.id}`, { body: { ...data, expected_version: existing.version } })
      : await create('subscription-reviews', data, requestKey);
    return { id: row.id, action, verdict: report.verdict };
  }
  return invalid();
}
