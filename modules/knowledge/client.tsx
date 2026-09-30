'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, getDetail, getOverview, pageSize } from './api';
import type { Detail, Filters, Overview } from './api';

const initial: Filters = { q: '', root_area: '', document_type: '', status: '', tag: '', offset: 0 };
const relations = { parent: 'อยู่ภายใต้', related: 'เกี่ยวข้อง', child: 'เอกสารย่อย' };
const labels: Record<string, string> = { knowledge: 'ความรู้', learning: 'การเรียนรู้', systems: 'ระบบ', docs: 'เอกสารกลาง', projects: 'โครงการ', operations: 'การดำเนินงาน', templates: 'แม่แบบ', plans: 'แผน', ventures: 'กิจการ', dashboard: 'ภาพรวม' };
const number = (value: number) => value.toLocaleString('th-TH');

export default function KnowledgeClient() {
  const [filters, setFilters] = useState<Filters>(initial);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<Overview | null>(null);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [token, setToken] = useState('');
  const [needsAccess, setNeedsAccess] = useState(false);
  const [copied, setCopied] = useState('');
  const accessRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    getOverview(filters, token, controller.signal).then(result => {
      setData(result);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setData(null); setDetail(null); setSelected('');
      setNeedsAccess(cause instanceof ApiError && cause.status === 401);
      setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลไม่สำเร็จ');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, token, refresh]);

  useEffect(() => {
    if (needsAccess) accessRef.current?.focus();
  }, [needsAccess]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetail(null); setDetailError(''); setCopied(''); setDetailLoading(true);
    getDetail(selected, token, controller.signal).then(setDetail).catch(cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 401) {
        setDetailError('สิทธิ์ของ token หมดอายุ กรุณาเชื่อมต่อคลังอีกครั้ง');
        setNeedsAccess(true);
        return;
      }
      setDetailError(cause instanceof Error ? cause.message : 'เปิดรายละเอียดไม่สำเร็จ');
    }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selected, token, refresh]);

  function filter(patch: Partial<Filters>) { setFilters(current => ({ ...current, ...patch, offset: 0 })); }
  function search(event: FormEvent) { event.preventDefault(); filter({ q: query.trim() }); }
  function select(path: string) {
    setSelected(path);
    if (window.matchMedia('(max-width: 1100px)').matches) detailRef.current?.scrollIntoView({ block: 'start' });
  }
  async function copyPath() {
    try { await navigator.clipboard.writeText(selected); setCopied('คัดลอกแล้ว'); }
    catch { setCopied('คัดลอกไม่สำเร็จ เลือก path ด้านล่างเพื่อคัดลอกเอง'); }
  }
  const activeFilters = Boolean(filters.q || filters.root_area || filters.document_type || filters.status || filters.tag);
  const total = data?.summary.documents_matched || 0;

  return <main className="knowledge-shell">
    <header className="masthead"><a className="identity" href="/" aria-label="Knowledge หน้าหลัก"><span className="seal">SE</span><span>Solo Empire <strong>Knowledge</strong></span></a><span className="mode">อ่านและสำรวจ</span></header>
    <section className="intro"><div><h1>ความรู้ที่หาเจอ<br /><span>และเชื่อมต่อกันได้</span></h1><p>ค้นหาเอกสาร เลือกหมวด แล้วตามความสัมพันธ์ไปยังเรื่องถัดไป</p></div><div className="catalog-note"><strong>{data ? number(data.summary.documents_total) : '—'} เอกสาร</strong><span>{data ? `${data.summary.root_areas} หมวด · ${number(data.summary.graph_edges)} ความสัมพันธ์ที่ระบุไว้` : 'กำลังอ่านสารบัญ'}</span><small>ข้อมูลจากสารบัญ · เนื้อหาฉบับเต็มอยู่ในไฟล์ต้นฉบับ</small></div></section>
    <form className="search" onSubmit={search}><label htmlFor="search">ค้นหาในคลัง</label><div><input id="search" type="search" placeholder="ชื่อเรื่อง หัวข้อ หรือ path…" value={query} maxLength={120} onChange={event => setQuery(event.target.value)} /><button type="submit">ค้นหา</button><button type="button" className="secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading}>รีเฟรช</button></div></form>
    {needsAccess && <form className="access" onSubmit={event => { event.preventDefault(); setNeedsAccess(false); setToken(accessRef.current?.value.trim() || ''); if (accessRef.current) accessRef.current.value = ''; }}><label htmlFor="access">กรอก access token สำหรับคลังส่วนตัว</label><input id="access" type="password" ref={accessRef} autoComplete="off" required /><button>เชื่อมต่อ</button><small>เก็บในหน่วยความจำของหน้านี้จนกว่าจะปิดหรือรีโหลด</small></form>}
    {error && !needsAccess && <div className="error" role="alert"><strong>เปิดคลังไม่ได้</strong><p>{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>ลองอีกครั้ง</button></div>}
    <div className="workspace">
      <aside className="shelves" aria-label="หมวดเอกสาร"><h2>หมวด</h2><button className={!filters.root_area ? 'shelf selected' : 'shelf'} type="button" onClick={() => filter({ root_area: '' })} aria-pressed={!filters.root_area}><span>ทั้งหมด</span><b>{data ? number(data.summary.documents_total) : '—'}</b></button>{data?.shelves.map(shelf => <button key={shelf.key} type="button" className={`shelf ${filters.root_area === shelf.key ? 'selected' : ''}`} aria-pressed={filters.root_area === shelf.key} onClick={() => filter({ root_area: shelf.key })}><span>{labels[shelf.key] || shelf.label}<small>{labels[shelf.key] ? shelf.key : ''}</small></span><b>{number(shelf.count)}</b></button>)}</aside>
      <section className="results" aria-labelledby="results-title"><div className="results-heading"><h2 id="results-title">{filters.root_area ? labels[filters.root_area] || filters.root_area : 'เอกสารทั้งหมด'}</h2><span aria-live="polite">{loading ? 'กำลังค้นหา…' : `${number(total)} รายการ`}</span></div><div className="filters"><label>ประเภท<select value={filters.document_type} onChange={event => filter({ document_type: event.target.value })}><option value="">ทุกประเภท</option>{data?.signals.document_types.map(item => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}</select></label><label>สถานะ<select value={filters.status} onChange={event => filter({ status: event.target.value })}><option value="">ทุกสถานะ</option>{data?.signals.statuses.map(item => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}</select></label>{activeFilters && <button className="text-button" type="button" onClick={() => { setFilters(initial); setQuery(''); }}>ล้างตัวกรอง</button>}</div>
        {filters.tag && <p className="active-tag">หัวข้อ: {filters.tag} <button type="button" onClick={() => filter({ tag: '' })}>ล้างหัวข้อ</button></p>}
        {loading ? <div className="loading" role="status"><p>กำลังอ่านเอกสาร…</p><span /><span /><span /></div> : !data ? <p className="empty">ข้อมูลจะแสดงเมื่อเชื่อมต่อคลังสำเร็จ</p> : !total ? <div className="empty"><h3>ยังไม่พบเอกสารที่ตรงกัน</h3><p>ลองใช้คำสั้นลง หรือล้างหมวดและสถานะที่เลือก</p></div> : <div className="document-list">{data.documents.map(doc => <button key={doc.path} type="button" className={`document-row ${selected === doc.path ? 'selected' : ''}`} aria-pressed={selected === doc.path} onClick={() => select(doc.path)}><span className="document-title">{doc.title}</span><span className="document-description">{doc.description || 'ยังไม่มีคำอธิบายในสารบัญ'}</span><code>{doc.path}</code><span className="document-meta"><span>{doc.document_type}</span><span>{doc.status}</span><span>{doc.related_count} เรื่องที่เกี่ยวข้อง</span></span></button>)}</div>}
        {data && total > pageSize && <nav className="pagination" aria-label="หน้าผลลัพธ์"><button type="button" className="secondary" disabled={loading || filters.offset === 0} onClick={() => setFilters(current => ({ ...current, offset: Math.max(0, current.offset - pageSize) }))}>ก่อนหน้า</button><span>{filters.offset + 1}–{Math.min(filters.offset + pageSize, total)} / {number(total)}</span><button type="button" className="secondary" disabled={loading || filters.offset + pageSize >= total} onClick={() => setFilters(current => ({ ...current, offset: current.offset + pageSize }))}>ถัดไป</button></nav>}
      </section>
      <aside className="inspector" ref={detailRef} aria-label="รายละเอียดเอกสาร"><h2>ตามรอยความรู้</h2>{!selected ? <div className="inspector-empty"><div className="connection-sample" aria-hidden="true"><span /><i /><span /><i /><span /></div><h3>เลือกเรื่องที่อยากรู้</h3><p>ดูที่มา หมวด และเอกสารที่เชื่อมโยงกันได้ตรงนี้</p></div> : detailLoading ? <p role="status">กำลังเปิดรายละเอียด…</p> : detailError ? <div className="error" role="alert"><p>{detailError}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>ลองอีกครั้ง</button></div> : detail && <>
        <div className="detail-title"><span>{detail.document.document_type}</span><h3>{detail.document.title}</h3><p>{detail.document.description || 'ยังไม่มีคำอธิบาย'}</p></div><dl><div><dt>สถานะ</dt><dd>{detail.document.status}</dd></div><div><dt>วันที่แก้ไขในเอกสาร</dt><dd>{detail.document.updated || 'ไม่ได้ระบุ'}</dd></div><div><dt>ลิงก์ภายในทั้งหมด</dt><dd>{detail.document.internal_link_count}</dd></div></dl><div className="path-block"><label htmlFor="source-path">ไฟล์ต้นฉบับ</label><textarea id="source-path" readOnly value={detail.document.path} rows={3} /><button type="button" className="secondary" onClick={() => void copyPath()}>คัดลอก path</button><span role="status">{copied}</span></div>
        <div className="tags" aria-label="หัวข้อ">{detail.document.tags.map(tag => <button key={tag} type="button" onClick={() => filter({ tag })}>{tag}</button>)}</div><h3 className="relation-heading">เอกสารที่เชื่อมโยง</h3><p className="relation-note">จาก parent / related ที่ระบุในสารบัญ</p><div className="relations">{detail.neighbors.length ? detail.neighbors.map((neighbor, index) => <button className="relation" key={`${neighbor.relation}-${neighbor.document.path}-${index}`} type="button" onClick={() => select(neighbor.document.path)}><small>{relations[neighbor.relation]}</small><strong>{neighbor.document.title}</strong><code>{neighbor.document.path}</code></button>) : <p className="empty">ยังไม่มีความสัมพันธ์ที่อ้างถึงเอกสารในคลังนี้</p>}</div></>}
      </aside>
    </div><footer><span>Solo Empire Knowledge</span><span>สารบัญอัปเดต: {data?.catalog.modified_at || 'ยังไม่พร้อม'}</span>{token && <button type="button" className="text-button" onClick={() => { setToken(''); setData(null); setSelected(''); setDetail(null); }}>ออกจากคลัง</button>}</footer>
  </main>;
}
