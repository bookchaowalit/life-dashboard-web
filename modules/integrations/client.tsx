'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, getOverview } from './api';
import type { ExternalApp, Filters, Overview } from './api';

const initial: Filters = { q: '', status: '', category: '' };
const statuses: Record<string, string> = { live: 'เชื่อมแล้ว', mcp_only: 'ผ่าน MCP', paused: 'พักไว้', planned: 'วางแผน' };
const order = ['live', 'mcp_only', 'paused', 'planned'];
const number = (value: number) => value.toLocaleString('th-TH');
const statusLabel = (value: string) => statuses[value] || value;

function AppCard({ app }: { app: ExternalApp }) {
  return <article className={`app-card card-${app.status}`}>
    <header><h4>{app.name}</h4><span className={`pill pill-${app.status}`}>{statusLabel(app.status)}</span></header>
    <span className="category">{app.category}</span>
    {app.note && <p className="note">{app.note}</p>}
    <div className="links">
      <a href={app.api_docs} target="_blank" rel="noopener noreferrer">API docs ↗</a>
      {app.guide && <code title="คู่มือใน repository">{app.guide}</code>}
    </div>
  </article>;
}

export default function IntegrationsClient() {
  const [filters, setFilters] = useState<Filters>(initial);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [token, setToken] = useState('');
  const [needsAccess, setNeedsAccess] = useState(false);
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

  function filter(patch: Partial<Filters>) { setFilters(current => ({ ...current, ...patch })); }
  function search(event: FormEvent) { event.preventDefault(); filter({ q: query.trim() }); }
  const summary = data?.summary;
  const active = Boolean(filters.q || filters.status || filters.category);
  const sections = data ? [...new Set(data.apps.map(app => app.section))] : [];

  return <main className="integrations-shell">
    <header className="masthead"><a className="identity" href="/" aria-label="Solo Empire หน้าหลัก"><span className="seal">SE</span><span>Solo Empire <strong>แอปและ API</strong></span></a><span className="mode">อ่านอย่างเดียว · แก้ที่ {data?.source.path || 'infra/api/external_app_registry.ts'}</span></header>

    <section className="intro"><div><h1>แอปภายนอกที่เชื่อมแล้ว<br /><span>และที่วางแผนไว้</span></h1><p>รายการ API ทั้งหมดในทะเบียน แยกตามสถานะการเชื่อมต่อ พร้อมลิงก์เอกสาร API ทางการและคู่มือใน repository</p></div>
      <div className="metrics" aria-label="สรุปแอป">
        <div><span>ทั้งหมด</span><strong>{summary ? number(summary.apps_total) : '—'}</strong><small>{summary ? `${summary.categories} หมวด` : 'กำลังอ่าน'}</small></div>
        <div><span>เชื่อมแล้ว</span><strong>{summary ? number(summary.connected) : '—'}</strong><small>{summary ? `live ${summary.live} · MCP ${summary.mcp_only}` : '—'}</small></div>
        <div><span>วางแผน</span><strong>{summary ? number(summary.planned) : '—'}</strong><small>{summary ? `พักไว้ ${summary.paused}` : '—'}</small></div>
        <div><span>มีคู่มือ</span><strong>{summary ? number(summary.with_guide) : '—'}</strong><small>integrations/&lt;id&gt;/</small></div>
      </div>
    </section>

    {summary && <section className="coverage" aria-label="สัดส่วนสถานะ">
      <div className="stack">{order.filter(key => summary[key as keyof typeof summary]).map(key => <span key={key} className={`seg fill-${key}`} style={{ flexGrow: summary[key as keyof typeof summary] as number }} title={`${statusLabel(key)} ${summary[key as keyof typeof summary]}`} />)}</div>
      <div className="legend">{order.map(key => <button key={key} type="button" className={filters.status === key ? 'legend-item selected' : 'legend-item'} aria-pressed={filters.status === key} onClick={() => filter({ status: filters.status === key ? '' : key })}><span className={`dot fill-${key}`} />{statusLabel(key)} <b>{number(summary[key as keyof typeof summary] as number)}</b></button>)}</div>
    </section>}

    <form className="toolbar" onSubmit={search}>
      <input type="search" aria-label="ค้นหาแอป" placeholder="ชื่อแอป หมวด หรือหมายเหตุ…" value={query} maxLength={80} onChange={event => setQuery(event.target.value)} />
      <button type="submit">ค้นหา</button>
      <select aria-label="สถานะ" value={filters.status} onChange={event => filter({ status: event.target.value })}><option value="">ทุกสถานะ</option>{data?.signals.statuses.map(item => <option key={item.value} value={item.value}>{statusLabel(item.value)} ({item.count})</option>)}</select>
      <select aria-label="หมวด" value={filters.category} onChange={event => filter({ category: event.target.value })}><option value="">ทุกหมวด</option>{data?.signals.categories.map(item => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}</select>
      {active && <button type="button" className="text-button" onClick={() => { setFilters(initial); setQuery(''); }}>ล้างตัวกรอง</button>}
      <button type="button" className="secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading}>รีเฟรช</button>
    </form>

    {needsAccess && <form className="access" onSubmit={event => { event.preventDefault(); setNeedsAccess(false); setToken(accessRef.current?.value.trim() || ''); if (accessRef.current) accessRef.current.value = ''; }}><label htmlFor="integrations-access">กรอก access token</label><input id="integrations-access" type="password" ref={accessRef} autoComplete="off" required /><button>เชื่อมต่อ</button><small>เก็บในหน่วยความจำของหน้านี้เท่านั้น</small></form>}
    {error && !needsAccess && <div className="error" role="alert"><strong>อ่าน Integrations API ไม่ได้</strong><p>{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>ลองอีกครั้ง</button></div>}

    <div className="section-heading"><h2>{filters.category || (filters.status ? statusLabel(filters.status) : 'ทุกแอป')}</h2><span aria-live="polite">{loading ? 'กำลังอ่าน…' : `${number(summary?.apps_matched || 0)} แอป`}</span></div>
    {loading && !data ? <p className="empty" role="status">กำลังอ่านทะเบียนแอป…</p>
      : !data ? <p className="empty">ข้อมูลจะแสดงเมื่อเชื่อมต่อ backend สำเร็จ (พอร์ต 3480)</p>
      : !data.apps.length ? <div className="empty"><h3>ไม่พบแอปที่ตรงกัน</h3><p>ลองล้างตัวกรองหรือใช้คำค้นที่สั้นลง</p></div>
      : sections.map(section => <section className="app-section" key={section}><h3>{section}</h3><div className="app-grid">{data.apps.filter(app => app.section === section).map(app => <AppCard key={app.id} app={app} />)}</div></section>)}

    {data && <details className="definitions"><summary>ความหมายของสถานะ</summary><dl>{data.source.status_definitions.map(item => <div key={item.value}><dt><span className={`pill pill-${item.value}`}>{statusLabel(item.value)}</span></dt><dd>{item.description}</dd></div>)}</dl></details>}

    <footer><span>SOLO EMPIRE / INTEGRATIONS.V1</span><span>อยู่ในทะเบียนไม่ได้แปลว่ามี connector ที่ใช้งานได้ · file modified: {data?.source.modified_at || '—'}</span>{token && <button type="button" className="text-button" onClick={() => { setToken(''); setData(null); }}>ล้าง token</button>}</footer>
  </main>;
}
