/** Server-side reads from the existing Subscriptions cell. Truncated evidence never becomes a verdict. */
import { calculateSubscriptionValue, monthPeriod, type AiSubscriptionsData, type Subscription, type SubscriptionCharge, type SubscriptionReview, type SubscriptionUsage } from '@/lib/subscription-value';
import { bangkokDate, CellError, cellRequest, load, MAX_PAGES, resolveCell, type CellConfig, type Env, type FetchLike, type Loaded, type Params } from './core';

export type SubscriptionResource = 'subscriptions' | 'subscription-usages' | 'subscription-charges' | 'subscription-reviews';

export async function subscriptionRecords<T>(config: CellConfig, plural: SubscriptionResource, params: Params = []): Promise<T[]> {
  const records: T[] = [];
  const seen = new Set<number>();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await cellRequest(config, 'GET', `/v1/${plural}`, { params: [...params, ['limit', '500'], ['offset', String(records.length)]] });
    if (!Array.isArray(result?.items) || result.items.length > 500
      || result.items.some((row: unknown) => !row || typeof row !== 'object' || !Number.isSafeInteger((row as { id: unknown }).id))) {
      throw new CellError('upstream', 'subscriptions');
    }
    for (const row of result.items) {
      if (seen.has(row.id)) throw new CellError('upstream', 'subscriptions');
      seen.add(row.id);
    }
    records.push(...result.items);
    if (result.items.length < 500) return records;
  }
  throw new CellError('upstream', 'subscriptions');
}

export async function loadAiSubscriptions(env: Env, options: { month?: string; now?: Date; fetch?: FetchLike } = {}): Promise<Loaded<AiSubscriptionsData>> {
  return load('subscriptions', async () => {
    const today = bangkokDate(options.now);
    let period;
    try { period = monthPeriod(options.month ?? today.slice(0, 7), today); }
    catch { throw new CellError('invalid', 'subscriptions'); }
    const config = resolveCell('subscriptions', env, options.fetch ? { fetch: options.fetch } : {});
    const [subscriptions, usages, charges, reviews] = await Promise.all([
      subscriptionRecords<Subscription>(config, 'subscriptions'),
      subscriptionRecords<SubscriptionUsage>(config, 'subscription-usages'),
      subscriptionRecords<SubscriptionCharge>(config, 'subscription-charges'),
      subscriptionRecords<SubscriptionReview>(config, 'subscription-reviews'),
    ]);
    const rows = subscriptions.filter((row) => row.category === 'ai')
      .filter((row) => (!row.started_on || row.started_on <= period.end) && (!row.cancelled_on || row.cancelled_on >= period.start))
      .map((subscription) => {
        const review = reviews.filter((row) => row.subscription_id === subscription.id && row.period_start === period.start && row.period_end === period.end)
          .sort((a, b) => b.id - a.id)[0] ?? null;
        return calculateSubscriptionValue(subscription, usages, charges, review, period);
      }).sort((a, b) => (a.subscription.next_billing_date ?? '9999').localeCompare(b.subscription.next_billing_date ?? '9999')
        || a.subscription.name.localeCompare(b.subscription.name));
    return { period, rows, availableSubscriptions: subscriptions.filter((row) => row.category !== 'ai') };
  });
}
