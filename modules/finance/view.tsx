import type { ReactNode } from 'react';
import type { CellRecord } from '@/lib/cells/cell-client';
import type { Loaded } from '@/lib/cells/core';
import type { FinanceView, Money } from '@/lib/cells/finance';
import { baht, Gate, Progress } from '@/modules/cells/ui';

const ACCOUNT_TYPE: Record<string, string> = {
  bank: 'ธนาคาร', cash: 'เงินสด', wallet: 'วอลเล็ต', payment: 'ช่องทางรับเงิน', credit: 'บัตรเครดิต',
  investment: 'บัญชีลงทุน', receivable: 'ลูกหนี้', other: 'อื่น ๆ',
};
const TX_TYPE: Record<string, string> = { income: 'รับ', expense: 'จ่าย', transfer: 'โอน', refund: 'คืนเงิน', fee: 'ค่าธรรมเนียม', adjustment: 'ปรับยอด' };
const INTERVAL: Record<string, string> = { weekly: 'รายสัปดาห์', monthly: 'รายเดือน', quarterly: 'รายไตรมาส', yearly: 'รายปี', one_time: 'ครั้งเดียว', usage: 'ตามการใช้' };
const TAX_STATUS: Record<string, string> = { estimated: 'ประมาณการ', open: 'ต้องยื่น/จ่าย', overdue: 'เกินกำหนด' };

const day = (value: unknown) => (value ? String(value).slice(0, 10) : '');
const money = (totals: Money) => {
  const entries = Object.entries(totals).filter(([, value]) => value !== 0);
  return entries.length ? entries.map(([currency, value]) => baht(value, currency)).join(' · ') : '0';
};

function Section<T>({ title, hint, result, children }: { title: string; hint?: string; result: Loaded<T>; children: (data: T) => ReactNode }) {
  return (
    <section className="cells-section">
      <h2>{title}{hint && <small>{hint}</small>}</h2>
      <Gate result={result}>{children}</Gate>
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="cells-empty">{children}</p>;

function Rows({ rows, render }: { rows: CellRecord[]; render: (row: CellRecord) => ReactNode }) {
  return <ul className="cells-list">{rows.map((row) => <li className="cells-row" key={row.id}>{render(row)}</li>)}</ul>;
}

function Total({ label, result, value }: { label: string; result: Loaded<unknown>; value: () => string }) {
  return <div className="cells-total"><span>{label}</span><strong>{result.ok ? value() : '—'}</strong></div>;
}

export default function FinanceViewComponent({ data }: { data: FinanceView }) {
  const { transactions: tx, subscriptions: subs, liabilities: debt, investments: inv } = data;
  return (
    <>
      <div className="cells-totals">
        <Total label={`รายรับเดือน ${data.month}`} result={tx} value={() => (tx.ok ? money(tx.data.income) : '')} />
        <Total label={`รายจ่ายเดือน ${data.month}`} result={tx} value={() => (tx.ok ? money(tx.data.expense) : '')} />
        <Total label="ค่า subscription ต่อเดือน" result={subs} value={() => (subs.ok ? money(subs.data.monthly) : '')} />
        <Total label="หนี้คงค้าง" result={debt} value={() => (debt.ok ? money(debt.data.outstanding) : '')} />
        <Total label="มูลค่าการลงทุน" result={inv} value={() => (inv.ok ? money(inv.data.value) : '')} />
      </div>

      <Section title="บัญชี" result={data.accounts}>
        {(accounts) => (accounts.length ? (
          <Rows rows={accounts} render={(a) => (
            <div className="cells-row-main"><b>{a.name}</b>
              <span className="cells-meta"><span>{ACCOUNT_TYPE[a.account_type] ?? a.account_type}</span>{a.institution && <span>{a.institution}</span>}<span>{a.currency}</span><span>{a.owner_scope}</span></span>
            </div>
          )} />
        ) : <Empty>ยังไม่มีบัญชี</Empty>)}
      </Section>

      <Section title="รายการล่าสุด" hint="10 รายการ" result={tx}>
        {({ recent }) => (recent.length ? (
          <Rows rows={recent} render={(t) => (
            <>
              <div className="cells-row-main"><b>{t.description || t.merchant || t.category || 'รายการ'}</b>
                <span className="cells-meta"><span>{day(t.transaction_date)}</span><span>{TX_TYPE[t.transaction_type] ?? t.transaction_type}</span>{t.category && <span>{t.category}</span>}</span>
              </div>
              <b className={t.transaction_type === 'income' ? '' : 'cells-danger'}>{baht(Number(t.amount) || 0, t.currency || 'THB')}</b>
            </>
          )} />
        ) : <Empty>ยังไม่มีรายการ</Empty>)}
      </Section>

      <Section title="งบประมาณที่ใช้อยู่" result={data.budgets}>
        {(lines) => (lines.length ? (
          <Rows rows={lines.map((l) => ({ ...l.budget, _spent: l.spent }))} render={(b) => {
            const planned = Number(b.planned_amount) || 0;
            const spent = b._spent as number | null;
            return (
              <div className="cells-row-main"><b>{b.name}{b.category ? ` · ${b.category}` : ''}</b>
                {spent === null
                  ? <span className="cells-meta">งบ {baht(planned, b.currency || 'THB')} (ยอดใช้จริงไม่พร้อม: transactions ไม่ตอบ)</span>
                  : <span className="cells-progress-line"><Progress percent={planned ? (spent / planned) * 100 : 0} /><span className={spent > planned ? 'cells-danger' : ''}>{baht(spent, b.currency || 'THB')} / {baht(planned, b.currency || 'THB')}</span></span>}
                <span className="cells-meta"><span>{day(b.period_start)} – {day(b.period_end)}</span></span>
              </div>
            );
          }} />
        ) : <Empty>ไม่มีงบที่ครอบคลุมวันนี้</Empty>)}
      </Section>

      <p className="cells-summary"><a href="/ai-subscriptions">ติดตามการใช้และความคุ้มค่าของสมาชิก AI →</a></p>

      <Section title="Subscription" hint="ต่ออายุใน 14 วันขึ้นก่อน" result={subs}>
        {({ active, renewing }) => (active.length ? (
          <>
            {renewing.length > 0 && <p className="cells-summary">ต่ออายุเร็ว ๆ นี้: {renewing.map((s) => `${s.name} (${day(s.next_billing_date)})`).join(', ')}</p>}
            <Rows rows={active} render={(s) => (
              <>
                <div className="cells-row-main"><b>{s.name}</b>
                  <span className="cells-meta"><span>{s.provider}</span><span>{INTERVAL[s.billing_interval] ?? s.billing_interval}</span>{s.status === 'trial' && <span className="cells-pill">ทดลองใช้</span>}{s.next_billing_date && <span>รอบถัดไป {day(s.next_billing_date)}</span>}</span>
                </div>
                <b>{baht(Number(s.amount) || 0, s.currency || 'THB')}</b>
              </>
            )} />
          </>
        ) : <Empty>ยังไม่มี subscription</Empty>)}
      </Section>

      <Section title="หนี้สิน" result={debt}>
        {({ open }) => (open.length ? (
          <Rows rows={open} render={(l) => (
            <>
              <div className="cells-row-main"><b>{l.name}</b>
                <span className="cells-meta"><span>{l.liability_type}</span>{l.due_date && <span>ครบกำหนด {day(l.due_date)}</span>}{l.status === 'overdue' && <span className="cells-danger">เกินกำหนด</span>}</span>
              </div>
              <b>{baht(Number(l.outstanding_amount) || 0, l.currency || 'THB')}</b>
            </>
          )} />
        ) : <Empty>ไม่มีหนี้คงค้าง</Empty>)}
      </Section>

      <Section title="การลงทุน" result={inv}>
        {({ active, cost }) => (active.length ? (
          <>
            <p className="cells-summary">ต้นทุนรวม {money(cost)}</p>
            <Rows rows={active} render={(i) => (
              <>
                <div className="cells-row-main"><b>{i.name}</b><span className="cells-meta"><span>{i.investment_type}</span>{i.instrument_key && <span>{i.instrument_key}</span>}</span></div>
                <b>{i.current_value === null || i.current_value === undefined ? 'ยังไม่ประเมิน' : baht(Number(i.current_value), i.currency || 'THB')}</b>
              </>
            )} />
          </>
        ) : <Empty>ยังไม่มีการลงทุน</Empty>)}
      </Section>

      <Section title="สินทรัพย์ธุรกิจ" result={data.assets}>
        {({ active, monthly }) => (active.length
          ? <p className="cells-summary">ใช้งานอยู่ {active.length} ชิ้น · มูลค่าประเมินต่อเดือน {money(monthly)}</p>
          : <Empty>ยังไม่มีสินทรัพย์ที่ใช้งานอยู่</Empty>)}
      </Section>

      <Section title="แผนกระแสเงินสด" result={data.cashFlow}>
        {(plans) => (plans.length ? (
          <Rows rows={plans} render={(c) => (
            <div className="cells-row-main"><b>{c.name}</b>
              <span className="cells-meta"><span>{day(c.period_start)} – {day(c.period_end)}</span><span>เข้า {baht(Number(c.expected_inflow) || 0, c.currency || 'THB')}</span><span>ออก {baht(Number(c.expected_outflow) || 0, c.currency || 'THB')}</span>{c.reserve_target !== null && c.reserve_target !== undefined && <span>สำรอง {baht(Number(c.reserve_target), c.currency || 'THB')}</span>}</span>
            </div>
          )} />
        ) : <Empty>ไม่มีแผนที่ครอบคลุมวันนี้</Empty>)}
      </Section>

      <Section title="ภาษีที่ยังไม่ปิด" result={data.tax}>
        {(items) => (items.length ? (
          <Rows rows={items} render={(t) => (
            <>
              <div className="cells-row-main"><b>{t.tax_type} · ปี {t.tax_year}</b>
                <span className="cells-meta"><span className={t.status === 'overdue' ? 'cells-danger' : ''}>{TAX_STATUS[t.status] ?? t.status}</span>{t.due_date && <span>กำหนด {day(t.due_date)}</span>}</span>
              </div>
              <b>{t.amount_due === null || t.amount_due === undefined ? '—' : baht(Number(t.amount_due) - (Number(t.amount_paid) || 0), t.currency || 'THB')}</b>
            </>
          )} />
        ) : <Empty>ไม่มีรายการภาษีค้าง</Empty>)}
      </Section>

      <Section title="กระทบยอดที่ยังเปิดอยู่" result={data.reconciliations}>
        {(items) => (items.length
          ? <p className="cells-summary">ค้าง {items.length} รอบ ({items.filter((r) => r.status === 'exception').length} รอบมีส่วนต่าง)</p>
          : <Empty>ไม่มีรอบที่ค้าง</Empty>)}
      </Section>
    </>
  );
}
