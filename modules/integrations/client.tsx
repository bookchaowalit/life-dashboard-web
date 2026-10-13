'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, getOverview, getPlatforms } from './api';
import type { Channel, ExternalApp, Filters, Overview, PlatformFilters, PlatformOverview, PlatformRoute } from './api';

const initial: Filters = { q: '', status: '', category: '' };
const statuses: Record<string, string> = { live: 'รองรับ API โดยตรง', mcp_only: 'รองรับผ่าน MCP', paused: 'พักไว้', planned: 'วางแผน' };
const order = ['live', 'mcp_only', 'paused', 'planned'];
const number = (value: number) => value.toLocaleString('th-TH');
const statusLabel = (value: string) => statuses[value] || value;
const platformInitial: PlatformFilters = { platform: 'codex-app', app: '', route: '', q: '' };
const routes: Record<PlatformRoute, string> = { plugin: 'Plugin', connector: 'Connector', manual_mcp: 'ต่อ MCP เองได้', unknown: 'ยังไม่ตรวจ', unavailable: 'ไม่มีช่องทางที่ใช้ได้', paused: 'พักไว้', needs_review: 'ข้อมูลเก่า/ต้องตรวจใหม่' };
const channels: Channel[] = ['plugin', 'connector', 'manual_mcp'];
const availability = { available: 'มีให้ใช้', unavailable: 'ไม่มีให้ใช้', unknown: 'ยังไม่ตรวจ' };
const connectionLabels: Record<string, string> = { installed: 'ติดตั้งแล้ว', not_installed: 'ยังไม่ติดตั้ง', connected: 'ยืนยันบัญชีแล้ว', disconnected: 'ยังไม่ได้เชื่อมบัญชี', verified: 'ตรวจแล้ว', failed: 'ตรวจไม่ผ่าน', unknown: 'ยังไม่ตรวจ' };
function timestamp(value: string | null) { return value ? value.replace('T', ' ').replace(/Z$/, ' UTC') : 'ยังไม่ตรวจ'; }
function evidenceHref(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}

export function PlatformInventory({ data, platform, onPlatformChange, loading, error, filters = platformInitial, onFilterChange }: {
  data: PlatformOverview | null; platform: string; onPlatformChange: (platform: string) => void;
  loading: boolean; error: string; filters?: PlatformFilters; onFilterChange?: (patch: Partial<PlatformFilters>) => void;
}) {
  return <section className="platform-inventory" aria-label="ช่องทางตามแพลตฟอร์ม">
    <div className="section-heading"><h2>ช่องทางตามแพลตฟอร์ม</h2><span aria-live="polite">{loading ? 'กำลังอ่าน…' : data ? `${number(data.summary.rows_matched)} แอป` : 'ยังไม่มีข้อมูล'}</span></div>
    <p>ช่องทางที่มีให้ใช้แยกจากการติดตั้ง บัญชี และผลตรวจการใช้งานของคุณ การต่อ MCP เองเป็นทางเลือกที่มีหลักฐาน และอาจมีช่องทาง Plugin หรือ Connector ด้วย</p>
    <div className="toolbar">
      <label>แพลตฟอร์ม <select value={platform} onChange={event => onPlatformChange(event.target.value)} disabled={!data}>
        {!data && <option value={platform}>กำลังรอรายชื่อแพลตฟอร์ม</option>}
        {data && !data.platforms.some(item => item.id === platform) && <option value={platform}>แพลตฟอร์มที่เลือกไม่มีในข้อมูล</option>}
        {data?.platforms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      {onFilterChange && <>
        <input type="search" aria-label="ค้นหาช่องทางแพลตฟอร์ม" placeholder="ค้นหาแอปในแพลตฟอร์ม…" maxLength={80} value={filters.q} onChange={event => onFilterChange({ q: event.target.value })} />
        <input aria-label="รหัสแอป" placeholder="รหัสแอป" maxLength={80} value={filters.app} onChange={event => onFilterChange({ app: event.target.value })} />
        <select aria-label="ช่องทางแนะนำ" value={filters.route} onChange={event => onFilterChange({ route: event.target.value })}><option value="">ทุกช่องทาง</option>{Object.entries(routes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      </>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {data && <>
      <p className="inventory-meta">ข้อมูลช่องทาง: {data.snapshot.freshness === 'stale' ? routes.needs_review : 'ข้อมูลยังไม่หมดอายุ'} · เก็บเมื่อ {timestamp(data.snapshot.captured_at)}</p>
      <p className="inventory-meta">ตามข้อมูลที่เก็บ: ช่องทาง Plugin/Connector {number(data.summary.native_available)} · ต่อ MCP เองได้ {number(data.summary.manual_mcp_available)} · บันทึกติดตั้ง {number(data.summary.installed)} · บันทึกยืนยันบัญชี {number(data.summary.authenticated)} · บันทึกผลตรวจการใช้งาน {number(data.summary.health_verified)}</p>
      {!data.rows.length ? <p className="empty">ไม่พบแอปในแพลตฟอร์มที่ตรงตัวกรอง</p> : <div className="inventory-table"><table><thead><tr><th>แอป</th><th>ช่องทางแนะนำ</th><th>ช่องทางที่มี</th><th>สถานะของคุณ</th><th>หลักฐาน</th></tr></thead><tbody>{data.rows.map(row => {
        const stale = row.connection.freshness === 'stale';
        const observed = (value: string) => stale ? `${routes.needs_review} (เคยบันทึก: ${connectionLabels[value]})` : connectionLabels[value];
        return <tr key={row.id}>
          <td><strong>{row.app_name}</strong><small>{row.category} · {statusLabel(row.registry_status)}</small></td>
          <td>{data.snapshot.freshness === 'stale' && row.recommended_route !== 'paused' ? routes.needs_review : routes[row.recommended_route]}</td>
          <td>{channels.map(channel => <small key={channel}>{routes[channel]}: {data.snapshot.freshness === 'stale' && 'ข้อมูลเก่า/ต้องตรวจใหม่ · เคยบันทึก: '}{channel === 'manual_mcp' && row.channels[channel].availability === 'available' ? 'มีหลักฐานช่องทาง' : availability[row.channels[channel].availability]}</small>)}</td>
          <td><small>ติดตั้ง: {observed(row.connection.installation)}</small><small>บัญชี: {observed(row.connection.authentication)}</small><small>สุขภาพ: {observed(row.connection.health)}</small><small>ตรวจเมื่อ {timestamp(row.connection.checked_at)}</small>{row.connection.freshness === 'unknown' && <small>ความสดของผลตรวจ: ยังไม่ตรวจ</small>}{row.connection.evidence_id && <small>อ้างอิงผลตรวจ: {row.connection.evidence_id}</small>}</td>
          <td>{channels.flatMap(channel => row.channels[channel].entries.map((entry, index) => {
            const href = evidenceHref(entry.evidence_url);
            return href ? <small key={`${channel}-${index}`}><a href={href} target="_blank" rel="noopener noreferrer">หลักฐาน {routes[channel]} ↗</a><span> · เก็บเมื่อ {timestamp(entry.captured_at)}</span></small> : null;
          }))}</td>
        </tr>;
      })}</tbody></table></div>}
    </>}
  </section>;
}

function AppCard({ app }: { app: ExternalApp }) {
  return <article className={`app-card card-${app.status}`}>
    <header><h4>{app.name}</h4><span className={`pill pill-${app.status}`}>{statusLabel(app.status)}</span></header>
    <span className="category">{app.category}</span>
    {app.note && <p className="note">{app.note}</p>}
    <div className="links">
      <a href={app.api_docs} target="_blank" rel="noopener noreferrer">API docs ↗</a>
      {app.guide && <span>มีคู่มือการใช้งาน</span>}
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
  const [platformFilters, setPlatformFilters] = useState<PlatformFilters>(platformInitial);
  const [platformData, setPlatformData] = useState<PlatformOverview | null>(null);
  const [platformLoading, setPlatformLoading] = useState(true);
  const [platformError, setPlatformError] = useState('');
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

  useEffect(() => {
    const controller = new AbortController();
    setPlatformLoading(true); setPlatformError(''); setPlatformData(null);
    getPlatforms(platformFilters, token, controller.signal).then(setPlatformData).catch(cause => {
      if (controller.signal.aborted) return;
      setPlatformError(cause instanceof ApiError ? cause.message : 'อ่านข้อมูลแพลตฟอร์มไม่สำเร็จ');
    }).finally(() => { if (!controller.signal.aborted) setPlatformLoading(false); });
    return () => controller.abort();
  }, [platformFilters, token, refresh]);

  function filter(patch: Partial<Filters>) { setFilters(current => ({ ...current, ...patch })); }
  function search(event: FormEvent) { event.preventDefault(); filter({ q: query.trim() }); }
  const summary = data?.summary;
  const active = Boolean(filters.q || filters.status || filters.category);
  const sections = data ? [...new Set(data.apps.map(app => app.section))] : [];

  return <main className="integrations-shell">
    <header className="masthead"><a className="identity" href="/" aria-label="Solo Empire หน้าหลัก"><span className="seal">SE</span><span>Solo Empire <strong>แอปและ API</strong></span></a><span className="mode">ทะเบียนและช่องทาง · อ่านอย่างเดียว</span></header>

    <section className="intro"><div><h1>แอปภายนอกและช่องทางที่รองรับ<br /><span>พร้อมรายการที่วางแผนไว้</span></h1><p>ทะเบียนความสามารถของ API และ MCP พร้อมเอกสารทางการ การรองรับช่องทางไม่ได้ยืนยันว่าบัญชีของคุณเชื่อมต่อแล้ว</p></div>
      <div className="metrics" aria-label="สรุปแอป">
        <div><span>ทั้งหมด</span><strong>{summary ? number(summary.apps_total) : '—'}</strong><small>{summary ? `${summary.categories} หมวด` : 'กำลังอ่าน'}</small></div>
        <div><span>รองรับช่องทาง</span><strong>{summary ? number(summary.supported_boundaries ?? summary.connected) : '—'}</strong><small>{summary ? `API ${summary.live} · MCP ${summary.mcp_only}` : '—'}</small></div>
        <div><span>วางแผน</span><strong>{summary ? number(summary.planned) : '—'}</strong><small>{summary ? `พักไว้ ${summary.paused}` : '—'}</small></div>
        <div><span>มีคู่มือ</span><strong>{summary ? number(summary.with_guide) : '—'}</strong><small>คู่มือการใช้งาน</small></div>
      </div>
    </section>

    <PlatformInventory data={platformData} platform={platformFilters.platform} filters={platformFilters} onPlatformChange={platform => setPlatformFilters(current => ({ ...current, platform }))} onFilterChange={patch => setPlatformFilters(current => ({ ...current, ...patch }))} loading={platformLoading} error={platformError} />

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
      : !data ? <p className="empty">ข้อมูลจะแสดงเมื่ออ่านทะเบียนแอปสำเร็จ</p>
      : !data.apps.length ? <div className="empty"><h3>ไม่พบแอปที่ตรงกัน</h3><p>ลองล้างตัวกรองหรือใช้คำค้นที่สั้นลง</p></div>
      : sections.map(section => <section className="app-section" key={section}><h3>{section}</h3><div className="app-grid">{data.apps.filter(app => app.section === section).map(app => <AppCard key={app.id} app={app} />)}</div></section>)}

    {data && <details className="definitions"><summary>ความหมายของสถานะทะเบียน</summary><dl>{data.source.status_definitions.map(item => <div key={item.value}><dt><span className={`pill pill-${item.value}`}>{statusLabel(item.value)}</span></dt><dd>{item.value === 'live' ? 'มีขอบเขต API โดยตรงที่ระบบรองรับ ต้องตรวจการติดตั้ง บัญชี และการใช้งานแยกกัน' : item.value === 'mcp_only' ? 'มีขอบเขตผ่าน MCP ที่ระบบรองรับ ต้องตรวจช่องทางของแต่ละแพลตฟอร์มและบัญชีแยกกัน' : item.description}</dd></div>)}</dl></details>}

    <footer><span>SOLO EMPIRE / แอปและช่องทาง</span><span>อยู่ในทะเบียนไม่ได้ยืนยันการเชื่อมบัญชี · ทะเบียนปรับปรุงเมื่อ {timestamp(data?.source.modified_at || null)}</span>{token && <button type="button" className="text-button" onClick={() => { setToken(''); setData(null); }}>ล้าง token</button>}</footer>
  </main>;
}
