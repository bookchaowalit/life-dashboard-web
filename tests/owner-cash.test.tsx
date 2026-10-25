import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { FetchLike } from '../lib/cells/core';
import {
  computeOwnerCash, DEFAULT_SETTINGS, loadOwnerCash, monthBounds, parseMonth, previousMonth, settingsFrom, streamOf,
} from '../lib/cells/owner-cash';
import { MODULES } from '../lib/modules';
import OwnerCashView from '../modules/owner-cash/view';

const NOW = new Date('2026-11-20T05:00:00Z'); // 20 Nov in Bangkok
const notes = (value: Record<string, unknown>) => JSON.stringify(value);

const REVENUE = [
  // Stripe one-time SEO payment, fee recorded and paid out in po_1.
  { id: 1, revenue_date: '2026-11-03', source_type: 'service', source_name: 'Stripe checkout', amount: 6900, currency: 'THB', received: 1,
    notes: notes({ source: 'stripe-webhook', service_type: 'seo-focused-start', fee: '251.85', payout: 'po_1', settlement_currency: 'THB' }) },
  // Stripe subscription, fee not recorded yet.
  { id: 2, revenue_date: '2026-11-10', source_type: 'subscription', amount: 14900, currency: 'THB', received: 1,
    notes: notes({ source: 'stripe-webhook', service_type: 'seo-monthly-report', fee: null }) },
  // Bank transfer for dev work, tagged by stream.
  { id: 3, revenue_date: '2026-11-05', source_type: 'service', source_name: 'Client A', amount: 20000, currency: 'THB', received: 1,
    notes: notes({ stream: 'freelance-dev-automation' }) },
  // Legacy SEO retainer with a plain fee field.
  { id: 4, revenue_date: '2026-11-01', source_type: 'subscription', source_name: 'SEO Monthly Service', amount: 10000, currency: 'THB', received: 1,
    notes: notes({ fee: null, recovery_source: 'manual' }) },
  { id: 5, revenue_date: '2026-11-08', source_type: 'service', source_name: 'Sotu', amount: 150, currency: 'USD', received: 1, notes: '' },
  // Not received, and last month: neither counts as revenue this month.
  { id: 6, revenue_date: '2026-11-12', amount: 999, currency: 'THB', received: 0, notes: '' },
  // Paid last month, paid out this month in po_1: only the fee check uses it.
  { id: 7, revenue_date: '2026-10-30', amount: 1000, currency: 'THB', received: 1,
    notes: notes({ source: 'stripe-webhook', fee: '48.15', payout: 'po_1', settlement_currency: 'THB' }) },
];

const TRANSACTIONS = [
  { id: 1, transaction_date: '2026-11-04', transaction_type: 'transfer', amount: 7600, currency: 'THB', owner_scope: 'solo_empire', source: 'stripe', metadata: { stripe_payout: 'po_1' } },
  { id: 2, transaction_date: '2026-11-04', transaction_type: 'fee', amount: 300, currency: 'THB', owner_scope: 'solo_empire', source: 'stripe', metadata: { stripe_payout: 'po_1' } },
  { id: 3, transaction_date: '2026-11-06', transaction_type: 'expense', amount: 1500, currency: 'THB', owner_scope: 'solo_empire', category: 'software', description: 'Ahrefs' },
  { id: 4, transaction_date: '2026-11-07', transaction_type: 'fee', amount: 30, currency: 'THB', owner_scope: 'solo_empire', source: 'bank', description: 'transfer fee' },
  { id: 5, transaction_date: '2026-11-07', transaction_type: 'expense', amount: 800, currency: 'THB', owner_scope: 'personal', category: 'food' },
  { id: 6, transaction_date: '2026-10-28', transaction_type: 'expense', amount: 5000, currency: 'THB', owner_scope: 'solo_empire' },
];
const RECONCILIATIONS = [{ id: 1, source_ref: 'po_1', status: 'matched' }, { id: 2, source_ref: 'po_old', status: 'exception' }];

const view = (overrides: Partial<typeof DEFAULT_SETTINGS> = {}) =>
  computeOwnerCash({ revenue: REVENUE, transactions: TRANSACTIONS, reconciliations: RECONCILIATIONS }, '2026-11', '2026-11-20', { ...DEFAULT_SETTINGS, ...overrides });

describe('owner cash', () => {
  it('lists the page in navigation', () => {
    expect(MODULES.find((m) => m.id === 'owner-cash')).toMatchObject({ href: '/owner-cash', migrated: true });
  });

  it('walks revenue → fees → expenses → tax → owner cash, per currency', () => {
    const thb = view().byCurrency.THB;
    // 6900 + 14900 + 20000 + 10000 received in November; fees only where recorded.
    expect(thb.revenue).toBe(51800);
    expect(thb.fees).toBe(251.85);
    expect(thb.grossProfit).toBe(51548.15);
    // Business expense and the bank fee; not the personal one, not last month's, not the Stripe fee transaction.
    expect(thb.expenses).toBe(1530);
    expect(thb.operatingProfit).toBe(50018.15);
    expect(thb.taxSetAside).toBe(5001.82);
    expect(thb.ownerCash).toBe(45016.33);
    expect(view().byCurrency.USD).toMatchObject({ revenue: 150, ownerCash: 135 });
    expect(view().targetPercent).toBe(45);
    expect(view().feesPending).toBe(1);
  });

  it('applies reinvestment after tax and never sets tax aside on a loss', () => {
    expect(view({ reinvestRate: 0.2 }).byCurrency.THB).toMatchObject({ reinvestment: 9003.27, ownerCash: 36013.06 });
    const loss = computeOwnerCash({ revenue: [], transactions: TRANSACTIONS, reconciliations: [] }, '2026-11', '2026-11-20', DEFAULT_SETTINGS);
    expect(loss.byCurrency.THB).toMatchObject({ expenses: 1530, taxSetAside: 0, ownerCash: -1530 });
    expect(loss.targetPercent).toBe(-1.5);
  });

  it('assigns streams from notes, service type or source name', () => {
    expect(view().streams.map((s) => [s.stream, s.currency, s.revenue, s.rows])).toEqual([
      ['freelance-seo', 'THB', 31800, 3],
      ['freelance-dev-automation', 'THB', 20000, 1],
      ['other', 'USD', 150, 1],
    ]);
    expect(streamOf({ notes: notes({ service_type: 'dev-audit' }) })).toBe('freelance-dev-automation');
    expect(streamOf({ notes: 'not json' })).toBe('other');
  });

  it('checks Stripe fees against the fee transactions of the same payouts', () => {
    // po_1 carries rows 1 and 7 (251.85 + 48.15 = 300), and the fee transaction is 300.
    expect(view().feeChecks).toEqual([{ currency: 'THB', ledger: 300, transactions: 300, difference: 0, payouts: 1 }]);
    expect(view().exceptions).toBe(0);
    const off = computeOwnerCash(
      { revenue: REVENUE.filter((r) => r.id !== 7), transactions: TRANSACTIONS, reconciliations: [{ id: 3, source_ref: 'po_1', status: 'exception' }] },
      '2026-11', '2026-11-20', DEFAULT_SETTINGS,
    );
    expect(off.feeChecks[0].difference).toBe(48.15);
    expect(off.exceptions).toBe(1);
  });

  it('parses the month and the settings safely', () => {
    expect(parseMonth('2026-09', '2026-11-20')).toBe('2026-09');
    expect(parseMonth('2027-01', '2026-11-20')).toBe('2026-11');
    expect(parseMonth('../x', '2026-11-20')).toBe('2026-11');
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(previousMonth('2027-01')).toBe('2026-12');
    expect(settingsFrom({ OWNER_CASH_TAX_RATE: '0.15', OWNER_CASH_TARGET_THB: '120000', OWNER_CASH_REINVEST_RATE: '2' }))
      .toEqual({ targetThb: 120000, taxRate: 0.15, reinvestRate: 0 });
    expect(settingsFrom({})).toEqual(DEFAULT_SETTINGS);
  });

  it('loads from the three cells and renders without leaking the token', async () => {
    const seen: string[] = [];
    const fetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      seen.push(`${url.host}${url.pathname}?${url.search}`);
      if (url.host === 'ledger.example') return Response.json({ items: REVENUE, totals: {} });
      if (url.host === 'transactions.example') return Response.json({ items: TRANSACTIONS });
      return Response.json({ items: RECONCILIATIONS });
    }) as FetchLike;
    const env = {
      EMPIRE_CRM_LEDGER_API: 'https://ledger.example', EMPIRE_CRM_LEDGER_TOKEN: 'tok-ledger-secret',
      EMPIRE_TRANSACTIONS_API: 'https://transactions.example', EMPIRE_RECONCILIATIONS_API: 'https://reconciliations.example',
      EMPIRE_CELL_TOKEN: 'tok-cell-secret',
    };
    const result = await loadOwnerCash(env, { fetch, now: NOW });
    expect(result.ok).toBe(true);
    expect(seen.some((s) => s.includes('owner_scope=solo_empire'))).toBe(true);
    expect(seen.some((s) => s.includes('since=2026-10-01') && s.includes('until=2026-11-30'))).toBe(true);
    const html = renderToStaticMarkup(<OwnerCashView data={result.ok ? result.data : (null as never)} />);
    expect(html).toContain('เงินสดที่เจ้าของใช้ได้');
    expect(html).toContain('ตรงกัน');
    expect(html).toContain('month=2026-10');
    expect(html).not.toContain('tok-');

    const down = await loadOwnerCash(env, { fetch: (async () => Response.json({}, { status: 503 })) as FetchLike, now: NOW });
    expect(down).toMatchObject({ ok: false });
  });
});
