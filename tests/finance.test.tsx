import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { FetchLike } from '../lib/cells/core';
import { addMoney, loadFinance } from '../lib/cells/finance';
import { MODULES } from '../lib/modules';
import FinanceView from '../modules/finance/view';

const NOW = new Date('2026-10-12T05:00:00Z'); // 12 Oct in Bangkok
const CELLS = ['finance-accounts', 'transactions', 'budgets', 'cash-flow', 'reconciliations', 'business-assets', 'investments', 'liabilities', 'subscriptions', 'tax'];
const env = Object.fromEntries([
  ...CELLS.map((c) => [`EMPIRE_${c.replace(/-/g, '_').toUpperCase()}_API`, `https://${c}.example`]),
  ['EMPIRE_CELL_TOKEN', 'tok-secret-123'],
]);

const DATA: Record<string, unknown[]> = {
  'finance-accounts.example/v1/accounts': [{ id: 1, name: 'KBank', account_type: 'bank', currency: 'THB', owner_scope: 'personal' }],
  'transactions.example/v1/transactions': [
    { id: 3, transaction_date: '2026-10-10', transaction_type: 'expense', amount: 300, currency: 'THB', category: 'food' },
    { id: 2, transaction_date: '2026-10-05', transaction_type: 'income', amount: 1000, currency: 'USD', description: 'client' },
    { id: 1, transaction_date: '2026-09-30', transaction_type: 'expense', amount: 999, currency: 'THB', category: 'food' },
  ],
  'budgets.example/v1/budget-plans': [
    { id: 1, name: 'อาหาร', category: 'food', period_start: '2026-10-01', period_end: '2026-10-31', planned_amount: 1000, currency: 'THB' },
    { id: 2, name: 'เก่า', category: 'food', period_start: '2026-09-01', period_end: '2026-09-30', planned_amount: 1000, currency: 'THB' },
  ],
  'subscriptions.example/v1/subscriptions': [
    { id: 1, name: 'Claude', provider: 'Anthropic', amount: 1200, currency: 'USD', billing_interval: 'yearly', status: 'active', next_billing_date: '2026-10-20' },
    { id: 2, name: 'Railway', provider: 'Railway', amount: 5, currency: 'USD', billing_interval: 'monthly', status: 'active' },
  ],
  'liabilities.example/v1/liabilities': [{ id: 1, name: 'บัตร', liability_type: 'credit', outstanding_amount: 2500, currency: 'THB', status: 'active' }],
  'investments.example/v1/investments': [{ id: 1, name: 'SET50', investment_type: 'etf', current_value: 5000, cost_basis: 4000, currency: 'THB' }],
};

const fetchFrom = (failing: string[] = []): FetchLike => (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  if (failing.some((cell) => url.host.startsWith(cell))) return Response.json({ detail: 'password=hunter2' }, { status: 500 });
  return Response.json({ items: DATA[`${url.host}${url.pathname}`] ?? [] });
}) as FetchLike;

describe('finance overview', () => {
  it('lists the finance module in navigation', () => {
    expect(MODULES.find((m) => m.id === 'finance')).toMatchObject({ href: '/finance', migrated: true });
  });

  it('sums per currency without converting', () => {
    expect(addMoney(addMoney({}, 'THB', 10), 'USD', '2.5')).toEqual({ THB: 10, USD: 2.5 });
    expect(addMoney({ THB: 1 }, 'THB', null)).toEqual({ THB: 1 });
  });

  it('builds this month, budgets from transactions, subscriptions per month and renewals', async () => {
    const view = await loadFinance(env, { fetch: fetchFrom(), now: NOW });
    expect(view.transactions).toMatchObject({ ok: true, data: { income: { USD: 1000 }, expense: { THB: 300 } } });
    expect(view.budgets).toMatchObject({ ok: true, data: [{ budget: { id: 1 }, spent: 300 }] });
    expect(view.subscriptions.ok && view.subscriptions.data.monthly).toEqual({ USD: 105 });
    expect(view.subscriptions.ok && view.subscriptions.data.renewing.map((s) => s.name)).toEqual(['Claude']);
    expect(view.liabilities).toMatchObject({ ok: true, data: { outstanding: { THB: 2500 } } });
    const html = renderToStaticMarkup(<FinanceView data={view} />);
    expect(html).toContain('KBank');
    expect(html).toContain('ต่ออายุเร็ว ๆ นี้');
  });

  it('a failing cell blanks only its own section and leaks nothing', async () => {
    const view = await loadFinance(env, { fetch: fetchFrom(['transactions', 'tax']), now: NOW });
    expect(view.transactions).toMatchObject({ ok: false, code: 'upstream', cell: 'transactions' });
    expect(view.tax).toMatchObject({ ok: false, cell: 'tax' });
    expect(view.accounts.ok).toBe(true);
    // The budget still shows, without the spent figure.
    expect(view.budgets).toMatchObject({ ok: true, data: [{ spent: null }] });
    const html = renderToStaticMarkup(<FinanceView data={view} />);
    expect(html).toContain('ไม่พร้อมใช้งาน');
    expect(html).toContain('KBank');
    expect(html).not.toMatch(/hunter2|tok-secret/);
  });

  it('without configuration every section reports not_configured', async () => {
    const view = await loadFinance({}, { now: NOW });
    for (const key of ['accounts', 'transactions', 'budgets', 'cashFlow', 'subscriptions', 'liabilities', 'investments', 'assets', 'tax', 'reconciliations'] as const) {
      expect(view[key]).toMatchObject({ ok: false, code: 'not_configured' });
    }
  });
});
