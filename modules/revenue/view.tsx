import type { RevenueView } from '@/lib/cells/loaders';
import { baht } from '@/modules/cells/ui';
import type { Totals } from '@/lib/cells/ledger';

function TotalsCard({ title, totals }: { title: string; totals: Totals }) {
  const entries = Object.entries(totals);
  return (
    <div className="cells-total">
      <span>{title}</span>
      {entries.length ? entries.map(([currency, value]) => <strong key={currency}>{baht(value, currency)}</strong>) : <strong>—</strong>}
    </div>
  );
}

export default function RevenueViewComponent({ data }: { data: RevenueView }) {
  return (
    <>
      <p className="cells-summary">ยอดที่รับแล้ว แยกตามสกุลเงิน ไม่รวมข้ามสกุล</p>
      <div className="cells-totals">
        <TotalsCard title={`เดือนนี้ (${data.month})`} totals={data.monthTotals} />
        <TotalsCard title={`ปีนี้ (${data.year})`} totals={data.yearTotals} />
        <TotalsCard title="ยังไม่ได้รับ" totals={data.pendingTotals} />
      </div>
      <section className="cells-section" aria-label="รายการล่าสุด">
        <h2>รายการล่าสุด <small>{data.recent.length}</small></h2>
        {data.recent.length ? (
          <table className="cells-table">
            <thead><tr><th>วันที่</th><th>แหล่งที่มา</th><th>ประเภท</th><th>จำนวน</th><th>สถานะ</th></tr></thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.id}>
                  <td>{String(r.revenue_date ?? '').slice(0, 10)}</td><td>{r.source_name || r.description || '—'}</td><td>{r.source_type}</td>
                  <td>{baht(Number(r.amount) || 0, r.currency || 'THB')}</td><td>{r.received ? 'รับแล้ว' : 'ยังไม่ได้รับ'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="cells-empty">ยังไม่มีรายการรายได้</p>}
      </section>
      <section className="cells-section" aria-label="ใบแจ้งหนี้ที่ค้าง">
        <h2>ใบแจ้งหนี้ที่ค้าง <small>{data.openInvoices.length}</small></h2>
        {data.openInvoices.length ? (
          <table className="cells-table">
            <thead><tr><th>เลขที่</th><th>กำหนดชำระ</th><th>จำนวน</th><th>สถานะ</th></tr></thead>
            <tbody>
              {data.openInvoices.map((i) => (
                <tr key={i.id}>
                  <td>{i.invoice_no}</td><td>{String(i.due_date ?? '').slice(0, 10)}</td>
                  <td>{baht(Number(i.amount) || 0, i.currency || 'THB')}</td>
                  <td className={i.status === 'overdue' ? 'cells-danger' : ''}>{i.status === 'overdue' ? 'เกินกำหนด' : 'ส่งแล้ว'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="cells-empty">ไม่มีใบแจ้งหนี้ค้าง</p>}
      </section>
    </>
  );
}
