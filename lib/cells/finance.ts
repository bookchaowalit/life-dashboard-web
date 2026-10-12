/**
 * The finance overview: one read per finance cell, in parallel. Each section is its own Loaded<T>, so a cell that is
 * down or not configured only blanks its own section. Totals are kept per currency (no conversion).
 */
import { CellClient, type CellRecord } from './cell-client';
import { addDays, bangkokDate, load, resolveCell, type CellId, type Env, type FetchLike, type Loaded } from './core';

export interface FinanceOptions { fetch?: FetchLike; now?: Date }
export type Money = Record<string, number>;

export interface BudgetLine { budget: CellRecord; spent: number | null }
export interface FinanceView {
  today: string;
  month: string;
  accounts: Loaded<CellRecord[]>;
  transactions: Loaded<{ income: Money; expense: Money; recent: CellRecord[] }>;
  budgets: Loaded<BudgetLine[]>;
  cashFlow: Loaded<CellRecord[]>;
  subscriptions: Loaded<{ active: CellRecord[]; monthly: Money; renewing: CellRecord[] }>;
  liabilities: Loaded<{ open: CellRecord[]; outstanding: Money }>;
  investments: Loaded<{ active: CellRecord[]; value: Money; cost: Money }>;
  assets: Loaded<{ active: CellRecord[]; monthly: Money }>;
  tax: Loaded<CellRecord[]>;
  reconciliations: Loaded<CellRecord[]>;
}

const OUTFLOW = new Set(['expense', 'fee']);
const PER_MONTH: Record<string, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

export function addMoney(into: Money, currency: unknown, amount: unknown): Money {
  const value = Number(amount);
  if (!Number.isFinite(value)) return into;
  const key = String(currency || 'THB');
  into[key] = (into[key] ?? 0) + value;
  return into;
}

const day = (value: unknown) => (value === null || value === undefined ? '' : String(value).slice(0, 10));
const covers = (row: CellRecord, today: string) => day(row.period_start) <= today && today <= day(row.period_end);

export async function loadFinance(env: Env, options: FinanceOptions = {}): Promise<FinanceView> {
  const today = bangkokDate(options.now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const client = (id: CellId) => new CellClient(resolveCell(id, env, options.fetch ? { fetch: options.fetch } : {}));

  const transactionsRows = load('transactions', () => client('transactions').list('transactions', {}, 'desc'));

  const [accounts, transactions, budgets, cashFlow, subscriptions, liabilities, investments, assets, tax, reconciliations] =
    await Promise.all([
      load('finance-accounts', async () =>
        (await client('finance-accounts').list('accounts', { status: 'active' })).sort((a, b) => String(a.name).localeCompare(String(b.name)))),
      transactionsRows.then((loaded) => (loaded.ok ? {
        ok: true as const,
        data: (() => {
          const month = loaded.data.filter((t) => day(t.transaction_date) >= monthStart && day(t.transaction_date) <= today);
          const income: Money = {}; const expense: Money = {};
          for (const t of month) {
            if (t.transaction_type === 'income') addMoney(income, t.currency, t.amount);
            else if (OUTFLOW.has(String(t.transaction_type))) addMoney(expense, t.currency, t.amount);
          }
          return { income, expense, recent: loaded.data.slice(0, 10) };
        })(),
      } : loaded)),
      load('budgets', async () => {
        const plans = (await client('budgets').list('budget-plans', { status: 'active' })).filter((b) => covers(b, today));
        // Spent comes from the transactions cell; when it is down the budget still shows, without the spent figure.
        const rows = await transactionsRows;
        return plans.map((budget) => ({
          budget,
          spent: rows.ok
            ? rows.data.filter((t) => OUTFLOW.has(String(t.transaction_type)) && (!budget.category || t.category === budget.category)
                && String(t.currency || 'THB') === String(budget.currency || 'THB')
                && day(t.transaction_date) >= day(budget.period_start) && day(t.transaction_date) <= day(budget.period_end))
              .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
            : null,
        }));
      }),
      load('cash-flow', async () => (await client('cash-flow').list('cashflow-plans', { status: 'active' })).filter((c) => covers(c, today))),
      load('subscriptions', async () => {
        const rows = await client('subscriptions').list('subscriptions', { status: ['active', 'trial'] });
        const monthly: Money = {};
        for (const s of rows) if (PER_MONTH[String(s.billing_interval)]) addMoney(monthly, s.currency, Number(s.amount) * PER_MONTH[String(s.billing_interval)]);
        const horizon = addDays(today, 14);
        const renewing = rows.filter((s) => s.next_billing_date && day(s.next_billing_date) >= today && day(s.next_billing_date) <= horizon)
          .sort((a, b) => day(a.next_billing_date).localeCompare(day(b.next_billing_date)));
        return { active: rows.sort((a, b) => Number(b.amount) - Number(a.amount)), monthly, renewing };
      }),
      load('liabilities', async () => {
        const open = (await client('liabilities').list('liabilities', { status: ['active', 'overdue'] }))
          .sort((a, b) => (day(a.due_date) || '9').localeCompare(day(b.due_date) || '9'));
        const outstanding: Money = {};
        for (const l of open) addMoney(outstanding, l.currency, l.outstanding_amount);
        return { open, outstanding };
      }),
      load('investments', async () => {
        const active = await client('investments').list('investments', { status: 'active' });
        const value: Money = {}; const cost: Money = {};
        for (const i of active) { addMoney(value, i.currency, i.current_value); addMoney(cost, i.currency, i.cost_basis); }
        return { active, value, cost };
      }),
      load('business-assets', async () => {
        const active = await client('business-assets').list('assets', { status: 'active' });
        const monthly: Money = {};
        for (const a of active) addMoney(monthly, a.currency, a.monthly_value);
        return { active, monthly };
      }),
      load('tax', async () => (await client('tax').list('tax-items', { status: ['estimated', 'open', 'overdue'] }))
        .sort((a, b) => (day(a.due_date) || '9').localeCompare(day(b.due_date) || '9'))),
      load('reconciliations', async () => client('reconciliations').list('reconciliations', { status: ['open', 'exception'] })),
    ]);

  return { today, month: today.slice(0, 7), accounts, transactions, budgets, cashFlow, subscriptions, liabilities, investments, assets, tax, reconciliations };
}
