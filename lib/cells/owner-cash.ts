/**
 * Owner cash for one month (EOS gap G3, Record-to-Report): the business money the owner can take out.
 *
 * revenue (ledger, received) − payment fees (ledger row notes, from the Stripe reconciler) = gross profit
 * − operating expenses (transactions, owner_scope solo_empire) = operating profit
 * − tax set-aside − reinvestment = owner cash.
 *
 * Every figure stays per currency (no conversion); the target is in THB. Personal transactions are left out.
 * Stripe fee transactions are not counted again as expenses: the same fees are already on the ledger rows, and the
 * check compares the two sources so a gap shows instead of being hidden.
 */
import { CellClient, type CellRecord } from './cell-client';
import { bangkokDate, load, resolveCell, type Env, type FetchLike, type Loaded } from './core';
import { addMoney, type Money } from './finance';
import { LedgerClient, type LedgerRow } from './ledger';

export const BUSINESS_SCOPE = 'solo_empire';
export const STREAMS = ['freelance-seo', 'freelance-dev-automation', 'other'] as const;
export type Stream = (typeof STREAMS)[number];

export interface Settings { targetThb: number; taxRate: number; reinvestRate: number }
export const DEFAULT_SETTINGS: Settings = { targetThb: 100_000, taxRate: 0.1, reinvestRate: 0 };

export interface Waterfall {
  revenue: number; fees: number; grossProfit: number; expenses: number; operatingProfit: number;
  taxSetAside: number; reinvestment: number; ownerCash: number;
}
export interface StreamLine { stream: Stream; currency: string; revenue: number; fees: number; grossProfit: number; rows: number }
export interface FeeCheck { currency: string; ledger: number; transactions: number; difference: number; payouts: number }
export interface OwnerCashView {
  month: string; today: string; monthToDate: boolean; settings: Settings;
  byCurrency: Record<string, Waterfall>; streams: StreamLine[];
  targetPercent: number; feesPending: number; feeChecks: FeeCheck[];
  expenses: CellRecord[]; exceptions: number;
}

const round = (value: number) => Math.round(value * 100) / 100;
const day = (value: unknown) => (value === null || value === undefined ? '' : String(value).slice(0, 10));

export function notesOf(row: LedgerRow): Record<string, any> {
  if (typeof row.notes !== 'string' || !row.notes.startsWith('{')) return {};
  try { return JSON.parse(row.notes); } catch { return {}; }
}

/** An explicit `notes.stream`, else the offer's service_type, else the source name; anything unknown is "other". */
export function streamOf(row: LedgerRow): Stream {
  const notes = notesOf(row);
  if ((STREAMS as readonly string[]).includes(notes.stream)) return notes.stream;
  const service = String(notes.service_type ?? '');
  if (service.startsWith('seo-')) return 'freelance-seo';
  if (service.startsWith('dev-') || service.startsWith('automation-')) return 'freelance-dev-automation';
  if (/\bseo\b/i.test(String(row.source_name ?? ''))) return 'freelance-seo';
  return 'other';
}

const feeOf = (row: LedgerRow): number | null => {
  const fee = notesOf(row).fee;
  if (fee === null || fee === undefined || fee === '') return null;
  const value = Number(fee);
  return Number.isFinite(value) ? value : null;
};

const isStripeFee = (t: CellRecord) => t.transaction_type === 'fee' && t.source === 'stripe';

export function monthBounds(month: string): { start: string; end: string } {
  const [year, mon] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

export function parseMonth(value: unknown, today: string): string {
  const month = typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : today.slice(0, 7);
  return month > today.slice(0, 7) ? today.slice(0, 7) : month;
}

export function settingsFrom(env: Env): Settings {
  const rate = (name: string, fallback: number) => {
    const value = Number(env[name]);
    return env[name] !== undefined && env[name] !== '' && Number.isFinite(value) && value >= 0 && value < 1 ? value : fallback;
  };
  const target = Number(env.OWNER_CASH_TARGET_THB);
  return {
    targetThb: Number.isFinite(target) && target > 0 ? target : DEFAULT_SETTINGS.targetThb,
    taxRate: rate('OWNER_CASH_TAX_RATE', DEFAULT_SETTINGS.taxRate),
    reinvestRate: rate('OWNER_CASH_REINVEST_RATE', DEFAULT_SETTINGS.reinvestRate),
  };
}

/** Pure: the month's waterfall, per-stream lines and the fee check from already-loaded rows. */
export function computeOwnerCash(
  input: { revenue: LedgerRow[]; transactions: CellRecord[]; reconciliations: CellRecord[] },
  month: string, today: string, settings: Settings,
): OwnerCashView {
  const { start, end } = monthBounds(month);
  const inMonth = (value: unknown) => day(value) >= start && day(value) <= end;
  const revenue = input.revenue.filter((r) => r.received && inMonth(r.revenue_date));
  const business = input.transactions.filter((t) => t.owner_scope === BUSINESS_SCOPE && inMonth(t.transaction_date));

  const lines = new Map<string, StreamLine>();
  const revenueBy: Money = {}; const feesBy: Money = {}; const expensesBy: Money = {};
  let feesPending = 0;
  for (const row of revenue) {
    const currency = String(row.currency || 'THB');
    const stream = streamOf(row);
    const fee = feeOf(row);
    if (fee === null && notesOf(row).source === 'stripe-webhook') feesPending += 1;
    const key = `${stream}:${currency}`;
    const line = lines.get(key) ?? { stream, currency, revenue: 0, fees: 0, grossProfit: 0, rows: 0 };
    line.revenue += Number(row.amount) || 0; line.fees += fee ?? 0; line.rows += 1;
    lines.set(key, line);
    addMoney(revenueBy, currency, row.amount); addMoney(feesBy, currency, fee ?? 0);
  }
  const expenses = business.filter((t) => t.transaction_type === 'expense' || (t.transaction_type === 'fee' && !isStripeFee(t)));
  for (const t of expenses) addMoney(expensesBy, t.currency, t.amount);

  const byCurrency: Record<string, Waterfall> = {};
  for (const currency of new Set([...Object.keys(revenueBy), ...Object.keys(expensesBy)])) {
    // Each step is rounded before the next one uses it, so the lines on the page add up exactly.
    const gross = round((revenueBy[currency] ?? 0) - (feesBy[currency] ?? 0));
    const operating = round(gross - (expensesBy[currency] ?? 0));
    const tax = round(Math.max(0, operating) * settings.taxRate);
    const reinvest = round(Math.max(0, operating - tax) * settings.reinvestRate);
    byCurrency[currency] = {
      revenue: round(revenueBy[currency] ?? 0), fees: round(feesBy[currency] ?? 0), grossProfit: gross,
      expenses: round(expensesBy[currency] ?? 0), operatingProfit: operating,
      taxSetAside: tax, reinvestment: reinvest, ownerCash: round(operating - tax - reinvest),
    };
  }

  // Fee check: Stripe fee transactions this month vs the fees on the ledger rows paid out in the same payouts.
  const stripeFees = business.filter(isStripeFee);
  const payouts = new Set(stripeFees.map((t) => String(t.metadata?.stripe_payout ?? '')).filter(Boolean));
  const ledgerFees: Money = {}; const txnFees: Money = {};
  for (const t of stripeFees) addMoney(txnFees, t.currency, t.amount);
  for (const row of input.revenue) {
    const notes = notesOf(row);
    if (payouts.has(String(notes.payout ?? ''))) addMoney(ledgerFees, notes.settlement_currency || row.currency, feeOf(row) ?? 0);
  }
  const feeChecks = [...new Set([...Object.keys(ledgerFees), ...Object.keys(txnFees)])].map((currency) => ({
    currency, ledger: round(ledgerFees[currency] ?? 0), transactions: round(txnFees[currency] ?? 0),
    difference: round((txnFees[currency] ?? 0) - (ledgerFees[currency] ?? 0)), payouts: payouts.size,
  }));
  const exceptions = input.reconciliations.filter((r) => r.status === 'exception' && payouts.has(String(r.source_ref))).length;

  const thb = byCurrency.THB?.ownerCash ?? 0;
  return {
    month, today, monthToDate: month === today.slice(0, 7), settings, byCurrency,
    streams: [...lines.values()].map((l) => ({ ...l, revenue: round(l.revenue), fees: round(l.fees), grossProfit: round(l.revenue - l.fees) }))
      .sort((a, b) => STREAMS.indexOf(a.stream) - STREAMS.indexOf(b.stream) || a.currency.localeCompare(b.currency)),
    targetPercent: settings.targetThb > 0 ? Math.round((thb / settings.targetThb) * 1000) / 10 : 0,
    feesPending, feeChecks, exceptions,
    expenses: expenses.sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 10),
  };
}

export interface OwnerCashOptions { fetch?: FetchLike; now?: Date; month?: string }

/** Reads the ledger, the business transactions and the Stripe reconciliations; one failing cell fails the page. */
export function loadOwnerCash(env: Env, options: OwnerCashOptions = {}): Promise<Loaded<OwnerCashView>> {
  const overrides = options.fetch ? { fetch: options.fetch } : {};
  const today = bangkokDate(options.now);
  const month = parseMonth(options.month, today);
  const { end } = monthBounds(month);
  return load('ledger', async () => {
    const ledger = new LedgerClient(resolveCell('ledger', env, overrides));
    // A failing cell throws a CellError naming that cell, which `load` turns into its unavailable state.
    const [revenue, transactions, reconciliations] = await Promise.all([
      // From the start of last month: rows paid out this month can be dated last month, and the fee check needs them.
      ledger.revenue({ since: monthBounds(previousMonth(month)).start, until: end, limit: 500 }),
      new CellClient(resolveCell('transactions', env, overrides)).list('transactions', { owner_scope: BUSINESS_SCOPE }, 'desc'),
      new CellClient(resolveCell('reconciliations', env, overrides)).list('reconciliations', { source_type: 'wallet_export' }, 'desc'),
    ]);
    return computeOwnerCash({ revenue: revenue.rows, transactions, reconciliations }, month, today, settingsFrom(env));
  });
}

export function previousMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
}
