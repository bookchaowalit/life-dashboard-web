'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, getOverview, pageSize } from './api';
import type { Filters, Overview, Service } from './api';

const initial: Filters = { q: '', category: '', card: '', commercial: '', offset: 0 };
const cardLabels: Record<string, string> = { no_card: 'ไม่ต้องใช้บัตร', card_required: 'ต้องใช้บัตร', verify: 'ต้องตรวจเอง' };
const commercialLabels: Record<string, string> = { yes: 'ใช้เชิงพาณิชย์ได้', verify: 'ต้องตรวจเงื่อนไข' };
const detailFields: [keyof Service, string][] = [
  ['free_limits', 'โควตาฟรี'], ['sleeps_pauses', 'หลับ/หยุดเมื่อว่าง'], ['bandwidth', 'Bandwidth'], ['storage', 'Storage'],
  ['requests_compute', 'Requests/Compute'], ['regions', 'Regions'], ['custom_domain', 'Custom domain'], ['api', 'API'],
  ['open_standard_portability', 'ย้ายออกง่าย'], ['vendor_lock_in_risk', 'ความเสี่ยงผูกขาด'], ['overage_paid_entry', 'เกินโควตา/แพ็กเริ่มต้น'],
  ['free_forever', 'ฟรีตลอด'], ['self_host_alternative', 'ทางเลือก self-host'], ['replaces', 'ใช้แทน'], ['notes', 'หมายเหตุ'],
  ['credit_card_required', 'บัตรเครดิต (ต้นฉบับ)'], ['commercial_use', 'เชิงพาณิชย์ (ต้นฉบับ)'], ['last_verified', 'ตรวจล่าสุด'],
];
const number = (value: number) => value.toLocaleString('th-TH');

function ServiceRow({ service }: { service: Service }) {
  const details = detailFields.filter(([key]) => service[key]);
  return <details className="service-row">
    <summary>
      <span className="service-name"><strong>{service.service}</strong><small>{service.category}{service.subcategory ? ` · ${service.subcategory}` : ''}</small></span>
      <span className="service-summary">{service.free_tier_summary || service.best_use_case || '—'}</span>
      <span className="badges"><span className={`pill card-${service.card_bucket}`}>{cardLabels[service.card_bucket]}</span><span className={`pill commercial-${service.commercial_bucket}`}>{commercialLabels[service.commercial_bucket]}</span></span>
    </summary>
    <div className="service-detail">
      {service.best_use_case && <p><b>เหมาะกับ:</b> {service.best_use_case}</p>}
      <dl>{details.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{service[key]}</dd></div>)}</dl>
      {service.official_url && <a href={service.official_url} target="_blank" rel="noopener noreferrer">เว็บไซต์ทางการ ↗</a>}
    </div>
  </details>;
}

export default function SaasClient() {
  const [filters, setFilters] = useState<Filters>(initial);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [token, setToken] = useState('');
  const [needsAccess, setNeedsAccess] = useState(false);
  const [useCase, setUseCase] = useState('');
  const accessRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    getOverview(filters, token, controller.signal).then(setData).catch(cause => {
      if (controller.signal.aborted) return;
      setData(null);
      setNeedsAccess(cause instanceof ApiError && cause.status === 401);
      setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลไม่สำเร็จ');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, token, refresh]);

  useEffect(() => { if (needsAccess) accessRef.current?.focus(); }, [needsAccess]);

  const useCases = useMemo(() => [...new Set(data?.starter_stacks.map(stack => stack.use_case) || [])], [data]);
  const activeUseCase = useCase || useCases[0] || '';
  function filter(patch: Partial<Filters>) { setFilters(current => ({ ...current, ...patch, offset: 0 })); }
  function search(event: FormEvent) { event.preventDefault(); filter({ q: query.trim() }); }
  const summary = data?.summary;
  const total = summary?.services_matched || 0;
  const active = Boolean(filters.q || filters.category || filters.card || filters.commercial);
  const topCategories = data?.signals.categories.slice(0, 14) || [];
  const maxCategory = topCategories[0]?.count || 1;

  return <main className="saas-shell">
    <header className="masthead"><a className="identity" href="/" aria-label="Solo Empire หน้าหลัก"><span className="seal">SE</span><span>Solo Empire <strong>SaaS ฟรี</strong></span></a><span className="mode">snapshot {data?.source.snapshot_date || '—'} · แก้ที่ {data?.source.path || 'systems/cloud-platform/'}</span></header>

    <section className="intro"><div><h1>บริการฟรีที่เลือกใช้ได้<br /><span>ก่อนจ่ายเงินจริง</span></h1><p>แคตตาล็อก free tier แยกตามหมวด เงื่อนไขบัตรเครดิต และการใช้เชิงพาณิชย์ ตัวเลขเป็น snapshot ควรตรวจโควตาปัจจุบันก่อนเปิดใช้</p></div>
      <div className="metrics" aria-label="สรุปแคตตาล็อก">
        <div><span>บริการ</span><strong>{summary ? number(summary.services_total) : '—'}</strong><small>{summary ? `${summary.categories} หมวด` : 'กำลังอ่าน'}</small></div>
        <div><span>ไม่ต้องใช้บัตร</span><strong>{summary ? number(summary.no_card) : '—'}</strong><small>ระบุชัดว่า No</small></div>
        <div><span>เชิงพาณิชย์ได้</span><strong>{summary ? number(summary.commercial_yes) : '—'}</strong><small>ระบุชัดว่า Yes</small></div>
        <div><span>ต้องตรวจเอง</span><strong>{summary ? number(summary.needs_verification) : '—'}</strong><small>เงื่อนไขบัตรยังไม่ชัด</small></div>
      </div>
    </section>

    {data && <section className="overview-grid">
      <div className="panel"><h2>หมวดที่มีบริการมากที่สุด</h2><div className="bars">{topCategories.map(item => <button key={item.value} type="button" className={filters.category === item.value ? 'bar-row selected' : 'bar-row'} aria-pressed={filters.category === item.value} onClick={() => filter({ category: filters.category === item.value ? '' : item.value })}><span className="bar-label">{item.value}</span><span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${(item.count / maxCategory) * 100}%` }} /></span><b>{item.count}</b></button>)}</div></div>
      <div className="panel"><h2>Starter stacks</h2><div className="tabs" role="group" aria-label="รูปแบบโปรเจกต์">{useCases.map(name => <button key={name} type="button" className={activeUseCase === name ? 'tab selected' : 'tab'} aria-pressed={activeUseCase === name} onClick={() => setUseCase(name)}>{name}</button>)}</div>
        <table className="stack-table"><thead><tr><th>Layer</th><th>ตัวเลือกหลัก</th><th>สำรอง</th></tr></thead><tbody>{data.starter_stacks.filter(stack => stack.use_case === activeUseCase).map((stack, index) => <tr key={`${stack.layer}-${index}`}><td><strong>{stack.layer}</strong>{stack.why && <small>{stack.why}</small>}</td><td>{stack.primary_free_option || '—'}</td><td>{[stack.fallback_1, stack.fallback_2].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody></table>
      </div>
    </section>}

    <form className="toolbar" onSubmit={search}>
      <input type="search" aria-label="ค้นหาบริการ" placeholder="ชื่อบริการ หมวดย่อย หรือสิ่งที่ใช้แทน…" value={query} maxLength={80} onChange={event => setQuery(event.target.value)} />
      <button type="submit">ค้นหา</button>
      <select aria-label="หมวด" value={filters.category} onChange={event => filter({ category: event.target.value })}><option value="">ทุกหมวด</option>{data?.signals.categories.map(item => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}</select>
      <select aria-label="บัตรเครดิต" value={filters.card} onChange={event => filter({ card: event.target.value })}><option value="">บัตรเครดิต: ทั้งหมด</option>{data?.signals.card.map(item => <option key={item.value} value={item.value}>{cardLabels[item.value]} ({item.count})</option>)}</select>
      <select aria-label="เชิงพาณิชย์" value={filters.commercial} onChange={event => filter({ commercial: event.target.value })}><option value="">เชิงพาณิชย์: ทั้งหมด</option>{data?.signals.commercial.map(item => <option key={item.value} value={item.value}>{commercialLabels[item.value]} ({item.count})</option>)}</select>
      {active && <button type="button" className="text-button" onClick={() => { setFilters(initial); setQuery(''); }}>ล้างตัวกรอง</button>}
      <button type="button" className="secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading}>รีเฟรช</button>
    </form>

    {needsAccess && <form className="access" onSubmit={event => { event.preventDefault(); setNeedsAccess(false); setToken(accessRef.current?.value.trim() || ''); if (accessRef.current) accessRef.current.value = ''; }}><label htmlFor="saas-access">กรอก access token</label><input id="saas-access" type="password" ref={accessRef} autoComplete="off" required /><button>เชื่อมต่อ</button><small>เก็บในหน่วยความจำของหน้านี้เท่านั้น</small></form>}
    {error && !needsAccess && <div className="error" role="alert"><strong>อ่าน SaaS Catalog API ไม่ได้</strong><p>{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>ลองอีกครั้ง</button></div>}

    <div className="section-heading"><h2>{filters.category || 'ทุกบริการ'}</h2><span aria-live="polite">{loading ? 'กำลังอ่าน…' : `${number(total)} บริการ · กดแถวเพื่อดูรายละเอียด`}</span></div>
    {loading && !data ? <p className="empty" role="status">กำลังอ่านแคตตาล็อก…</p>
      : !data ? <p className="empty">ข้อมูลจะแสดงเมื่อเชื่อมต่อ backend สำเร็จ (พอร์ต 3490)</p>
      : !data.services.length ? <div className="empty"><h3>ไม่พบบริการที่ตรงกัน</h3><p>ลองล้างตัวกรองหรือใช้คำค้นที่สั้นลง</p></div>
      : <div className="service-list">{data.services.map(service => <ServiceRow key={service.id} service={service} />)}</div>}
    {data && total > pageSize && <nav className="pagination" aria-label="หน้าผลลัพธ์"><button type="button" className="secondary" disabled={loading || filters.offset === 0} onClick={() => setFilters(current => ({ ...current, offset: Math.max(0, current.offset - pageSize) }))}>ก่อนหน้า</button><span>{filters.offset + 1}–{Math.min(filters.offset + pageSize, total)} / {number(total)}</span><button type="button" className="secondary" disabled={loading || filters.offset + pageSize >= total} onClick={() => setFilters(current => ({ ...current, offset: current.offset + pageSize }))}>ถัดไป</button></nav>}

    <footer><span>SOLO EMPIRE / SAAS-CATALOG.V1</span><span>catalog date: {data?.source.catalog_date || '—'} · ต้องตรวจโควตาปัจจุบัน {data?.source.rows_requiring_current_limit_verification || '—'} แถว</span>{token && <button type="button" className="text-button" onClick={() => { setToken(''); setData(null); }}>ล้าง token</button>}</footer>
  </main>;
}
