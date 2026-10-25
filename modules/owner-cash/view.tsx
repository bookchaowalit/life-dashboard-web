import type { OwnerCashView, Stream, Waterfall } from '@/lib/cells/owner-cash';
import { previousMonth } from '@/lib/cells/owner-cash';
import { baht, Progress } from '@/modules/cells/ui';

const STREAM_LABEL: Record<Stream, string> = {
  'freelance-seo': 'Freelance SEO',
  'freelance-dev-automation': 'Freelance dev/automation',
  other: 'อื่น ๆ',
};

const percent = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

function WaterfallTable({ currency, w, taxRate, reinvestRate }: { currency: string; w: Waterfall; taxRate: number; reinvestRate: number }) {
  const rows: Array<[string, number, boolean?]> = [
    ['รายได้ที่รับแล้ว', w.revenue],
    ['− ค่าธรรมเนียมรับชำระ', -w.fees],
    ['= กำไรขั้นต้น', w.grossProfit, true],
    ['− ค่าใช้จ่ายธุรกิจ', -w.expenses],
    ['= กำไรจากการดำเนินงาน', w.operatingProfit, true],
    [`− กันไว้จ่ายภาษี (${percent(taxRate)})`, -w.taxSetAside],
    [`− ลงทุนต่อ (${percent(reinvestRate)})`, -w.reinvestment],
    ['= เงินสดที่เจ้าของใช้ได้', w.ownerCash, true],
  ];
  return (
    <table className="cells-table" aria-label={`ลำดับการคำนวณ ${currency}`}>
      <thead><tr><th>รายการ</th><th>{currency}</th></tr></thead>
      <tbody>
        {rows.map(([label, value, total]) => (
          <tr key={label}>
            <td>{total ? <strong>{label}</strong> : label}</td>
            <td className={value < 0 && total ? 'cells-danger' : ''}>{total ? <strong>{baht(value, currency)}</strong> : baht(value, currency)}</td>
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
        เดือน {data.month}{data.monthToDate ? ` (ถึง ${data.today})` : ''} ·{' '}
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
          <Progress percent={data.targetPercent} />
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
            <p className="cells-meta">สกุล {currency} แยกไว้ ไม่แปลงค่าและไม่นับรวมกับเป้า THB</p>
            <WaterfallTable currency={currency} w={w} taxRate={settings.taxRate} reinvestRate={settings.reinvestRate} />
          </div>
        ))}
        <p className="cells-meta">
          อัตรากันภาษี {percent(settings.taxRate)} เป็นค่าชั่วคราวจนกว่านักบัญชีจะยืนยัน
          (ตั้งได้ที่ <code>OWNER_CASH_TAX_RATE</code>) · ค่าใช้จ่ายนับเฉพาะรายการ <code>owner_scope = solo_empire</code> ไม่รวมค่าใช้จ่ายส่วนตัว
        </p>
      </section>

      <section className="cells-section" aria-label="แยกตามสายรายได้">
        <h2>แยกตามสายรายได้ <small>{data.streams.length}</small></h2>
        {data.streams.length ? (
          <table className="cells-table">
            <thead><tr><th>สาย</th><th>รายการ</th><th>รายได้</th><th>ค่าธรรมเนียม</th><th>กำไรขั้นต้น</th></tr></thead>
            <tbody>
              {data.streams.map((s) => (
                <tr key={`${s.stream}:${s.currency}`}>
                  <td>{STREAM_LABEL[s.stream]}</td><td>{s.rows}</td><td>{baht(s.revenue, s.currency)}</td>
                  <td>{baht(s.fees, s.currency)}</td><td>{baht(s.grossProfit, s.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="cells-empty">เดือนนี้ยังไม่มีรายได้ที่รับแล้ว</p>}
        {data.feesPending ? <p className="cells-meta">{data.feesPending} รายการจาก Stripe ยังไม่มีค่าธรรมเนียม (รอรอบ reconcile ถัดไป) กำไรจึงอาจสูงกว่าจริงเล็กน้อย</p> : null}
      </section>

      <section className="cells-section" aria-label="ตรวจกับรายการเงิน">
        <h2>ตรวจกับรายการเงิน (transactions)</h2>
        {data.feeChecks.length ? (
          <table className="cells-table">
            <thead><tr><th>สกุล</th><th>ค่าธรรมเนียมใน ledger</th><th>ค่าธรรมเนียมใน transactions</th><th>ผลต่าง</th></tr></thead>
            <tbody>
              {data.feeChecks.map((c) => (
                <tr key={c.currency}>
                  <td>{c.currency}</td><td>{baht(c.ledger, c.currency)}</td><td>{baht(c.transactions, c.currency)}</td>
                  <td className={c.difference !== 0 ? 'cells-danger' : ''}>{c.difference === 0 ? 'ตรงกัน' : baht(c.difference, c.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="cells-empty">เดือนนี้ยังไม่มี payout จาก Stripe ให้ตรวจ</p>}
        {data.exceptions ? <p className="cells-meta cells-danger">{data.exceptions} payout ปิดยอดแบบ exception (มีรายการ Stripe ที่ไม่มีใน ledger)</p> : null}
      </section>

      <section className="cells-section" aria-label="ค่าใช้จ่ายธุรกิจ">
        <h2>ค่าใช้จ่ายธุรกิจสูงสุด <small>{data.expenses.length}</small></h2>
        {data.expenses.length ? (
          <table className="cells-table">
            <thead><tr><th>วันที่</th><th>รายการ</th><th>หมวด</th><th>จำนวน</th></tr></thead>
            <tbody>
              {data.expenses.map((t) => (
                <tr key={t.id}>
                  <td>{String(t.transaction_date ?? '').slice(0, 10)}</td><td>{t.description || t.merchant || '—'}</td>
                  <td>{t.category || '—'}</td><td>{baht(Number(t.amount) || 0, t.currency || 'THB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="cells-empty">เดือนนี้ยังไม่มีค่าใช้จ่ายธุรกิจที่บันทึกไว้</p>}
      </section>
    </>
  );
}
