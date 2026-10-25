import type { OwnerCashView, Stream, Waterfall } from '@/lib/cells/owner-cash';
import { previousMonth } from '@/lib/cells/owner-cash';
import { baht, Progress } from '@/modules/cells/ui';

const STREAM_LABEL: Record<Stream, string> = {
  'freelance-seo': 'Freelance SEO',
  'freelance-dev-automation': 'Freelance dev/automation',
  other: 'อื่น ๆ',
};

const percent = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

/** Amounts and dates never wrap inside a cell, so "21,800 THB" stays on one line on a phone. */
const Nowrap = ({ children }: { children: string }) => <span style={{ whiteSpace: 'nowrap' }}>{children}</span>;
// `|| 0` turns -0 into 0, so an empty line reads "0 THB" rather than "-0 THB".
const money = (value: number, currency: string) => <Nowrap>{baht(value || 0, currency)}</Nowrap>;
/** Narrow multi-column tables let the currency wrap under the number instead of widening the page. */
const amount = (value: number, currency: string) => baht(value || 0, currency);
const Sub = ({ children }: { children: string }) => <span className="cells-meta" style={{ display: 'block' }}>{children}</span>;

function WaterfallTable({ currency, w, taxRate, reinvestRate }: { currency: string; w: Waterfall; taxRate: number; reinvestRate: number }) {
  const rows: Array<[string, number, boolean?]> = [
    ['รายได้ที่รับแล้ว', w.revenue],
    ['− ค่าธรรมเนียมรับชำระ', -w.fees],
    ['= กำไรขั้นต้น', w.grossProfit, true],
    ['− ค่าใช้จ่ายธุรกิจ', -w.expenses],
    ['= กำไรจากการดำเนินงาน', w.operatingProfit, true],
    [`− กันไว้จ่ายภาษี ${percent(taxRate)}`, -w.taxSetAside],
    [`− ลงทุนต่อ ${percent(reinvestRate)}`, -w.reinvestment],
    ['= เงินสดที่เจ้าของใช้ได้', w.ownerCash, true],
  ];
  return (
    <table className="cells-table" aria-label={`ลำดับการคำนวณ ${currency}`}>
      <thead><tr><th>รายการ</th><th>{currency}</th></tr></thead>
      <tbody>
        {rows.map(([label, value, total]) => (
          <tr key={label}>
            <td>{total ? <strong>{label}</strong> : label}</td>
            <td className={value < 0 && total ? 'cells-danger' : ''}>{total ? <strong>{money(value, currency)}</strong> : money(value, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function OwnerCashViewComponent({ data }: { data: OwnerCashView }) {
  const thb = data.byCurrency.THB;
  const others = Object.entries(data.byCurrency).filter(([currency]) => currency !== 'THB');
  const { settings } = data;
  return (
    <>
      <p className="cells-summary">
        เดือน {data.month}{data.monthToDate ? ` ถึงวันที่ ${data.today}` : ''} ·{' '}
        <a href={`/owner-cash?month=${previousMonth(data.month)}`}>เดือนก่อน</a>
        {!data.monthToDate ? <> · <a href="/owner-cash">เดือนนี้</a></> : null}
      </p>
      <div className="cells-totals">
        <div className="cells-total">
          <span>เงินสดที่เจ้าของใช้ได้</span>
          <strong>{baht(thb?.ownerCash ?? 0, 'THB')}</strong>
        </div>
        <div className="cells-total">
          <span>เป้า {baht(settings.targetThb, 'THB')}</span>
          <strong>{data.targetPercent}%</strong>
          <Progress percent={data.targetPercent} label="ความคืบหน้าเทียบเป้าเงินสดเจ้าของ" />
        </div>
        <div className="cells-total">
          <span>ขาดอีก</span>
          <strong>{baht(Math.max(0, settings.targetThb - (thb?.ownerCash ?? 0)), 'THB')}</strong>
        </div>
      </div>

      <section className="cells-section" aria-label="ลำดับการคำนวณ">
        <h2>ลำดับการคำนวณ</h2>
        {thb ? <WaterfallTable currency="THB" w={thb} taxRate={settings.taxRate} reinvestRate={settings.reinvestRate} />
          : <p className="cells-empty">เดือนนี้ยังไม่มีรายได้หรือค่าใช้จ่ายธุรกิจเป็น THB</p>}
        {others.map(([currency, w]) => (
          <div key={currency}>
            <p className="cells-meta">ยอด {currency} แยกไว้ ไม่แปลงค่าและไม่นับรวมกับเป้า THB</p>
            <WaterfallTable currency={currency} w={w} taxRate={settings.taxRate} reinvestRate={settings.reinvestRate} />
          </div>
        ))}
        <p className="cells-meta">
          อัตรากันภาษี {percent(settings.taxRate)} เป็นค่าชั่วคราวจนกว่านักบัญชีจะยืนยัน ·
          ค่าใช้จ่ายนับเฉพาะของธุรกิจ ไม่รวมค่าใช้จ่ายส่วนตัว
        </p>
      </section>

      <section className="cells-section" aria-label="แยกตามสายรายได้">
        <h2>แยกตามสายรายได้</h2>
        {data.streams.length ? (
          <table className="cells-table">
            <thead><tr><th>สาย</th><th>รายได้</th><th>กำไรขั้นต้น</th></tr></thead>
            <tbody>
              {data.streams.map((s) => (
                <tr key={`${s.stream}:${s.currency}`}>
                  <td>{STREAM_LABEL[s.stream]}<Sub>{`${s.rows} รายการ`}</Sub></td>
                  <td>{amount(s.revenue, s.currency)}</td><td>{amount(s.grossProfit, s.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="cells-empty">เดือนนี้ยังไม่มีรายได้ที่รับแล้ว</p>}
        {data.feesPending ? <p className="cells-meta">{data.feesPending} รายการจาก Stripe ยังรอค่าธรรมเนียมจากรอบ reconcile ถัดไป กำไรจึงอาจสูงกว่าจริงเล็กน้อย</p> : null}
      </section>

      <section className="cells-section" aria-label="ตรวจกับรายการเงิน">
        <h2>ตรวจค่าธรรมเนียมกับรายการเงิน</h2>
        {data.feeChecks.length ? (
          <table className="cells-table">
            <thead><tr><th>ใน ledger</th><th>ใน transactions</th><th>ผลต่าง</th></tr></thead>
            <tbody>
              {data.feeChecks.map((c) => (
                <tr key={c.currency}>
                  <td>{amount(c.ledger, c.currency)}</td><td>{amount(c.transactions, c.currency)}</td>
                  <td className={c.difference !== 0 ? 'cells-danger' : ''}>{c.difference === 0 ? 'ตรงกัน' : amount(c.difference, c.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="cells-empty">เดือนนี้ยังไม่มี payout จาก Stripe ให้ตรวจ</p>}
        {data.exceptions ? <p className="cells-meta cells-danger">{data.exceptions} payout ปิดยอดแบบ exception: มีรายการ Stripe ที่ไม่มีใน ledger</p> : null}
      </section>

      <section className="cells-section" aria-label="ค่าใช้จ่ายธุรกิจ">
        <h2>ค่าใช้จ่ายธุรกิจสูงสุด</h2>
        {data.expenses.length ? (
          <table className="cells-table">
            <thead><tr><th>วันที่</th><th>รายการ</th><th>จำนวน</th></tr></thead>
            <tbody>
              {data.expenses.map((t) => (
                <tr key={t.id}>
                  <td><Nowrap>{String(t.transaction_date ?? '').slice(5, 10)}</Nowrap></td>
                  <td>{t.description || t.merchant || '—'}{t.category ? <Sub>{String(t.category)}</Sub> : null}</td>
                  <td>{amount(Number(t.amount) || 0, t.currency || 'THB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="cells-empty">เดือนนี้ยังไม่มีค่าใช้จ่ายธุรกิจที่บันทึกไว้</p>}
      </section>
    </>
  );
}
