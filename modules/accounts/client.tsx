'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, getOverview } from './api';
import type { Account, Count, Filters, Group, Overview } from './api';

const initial: Filters = { q: '', status: '', platform: '', kind: '' };
const kinds: Record<string, string> = { identity: 'ตัวตน', brand: 'แบรนด์ไร้หน้า', existing: 'บันทึกเดิม' };
const statuses: Record<string, string> = {
  active: 'ใช้งาน', setup: 'กำลังตั้งค่า', planned: 'วางแผน', 'needs-verification': 'รอยืนยัน', paused: 'พัก', retired: 'เลิกใช้',
};
const number = (value: number) => value.toLocaleString('th-TH');
const statusLabel = (value: string) => statuses[value] || value;

function StatusBars({ items, total }: { items: Count[]; total: number }) {
  return <div className="bars">{items.map(item => <div className="bar-row" key={item.value}>
    <span className={`pill pill-${item.value}`}>{statusLabel(item.value)}</span>
    <span className="bar-track" aria-hidden="true"><span className={`bar-fill fill-${item.value}`} style={{ width: `${total ? (item.count / total) * 100 : 0}%` }} /></span>
    <b>{number(item.count)}</b>
  </div>)}</div>;
}

function GroupCard({ group, accounts }: { group: Group; accounts: Account[] }) {
  return <article className="group-card">
    <header>
      <div><span className="kind">{kinds[group.kind] || group.kind}{group.privacy ? ` · ${group.privacy}` : ''}{group.face_visible === true ? ' · เห็นหน้า' : ''}</span><h3>{group.label}</h3></div>
      <span className="count">{accounts.length}/{group.account_count}</span>
    </header>
    {group.description && <p className="group-description">{group.description}</p>}
    <table>
      <thead><tr><th>แพลตฟอร์ม</th><th>ชื่อ</th><th>วัตถุประสงค์</th><th>สถานะ</th></tr></thead>
      <tbody>{accounts.map((account, index) => <tr key={`${account.platform}-${account.name}-${index}`}>
        <td className="platform">{account.platform}</td>
        <td><code>{account.name}</code></td>
        <td>{account.purpose}{account.evidence && <small>หลักฐาน: {account.evidence}</small>}</td>
        <td><span className={`pill pill-${account.status}`}>{statusLabel(account.status)}</span></td>
      </tr>)}</tbody>
    </table>
  </article>;
}

export default function AccountsClient() {
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
  const active = Boolean(filters.q || filters.status || filters.platform || filters.kind);
  const summary = data?.summary;

  return <main className="accounts-shell">
    <header className="masthead"><a className="identity" href="/" aria-label="Solo Empire หน้าหลัก"><span className="seal">SE</span><span>Solo Empire <strong>บัญชี</strong></span></a><span className="mode">อ่านอย่างเดียว · แก้ที่ {data?.source.path || 'accounts/ACCOUNT-MATRIX.yaml'}</span></header>

    <section className="intro"><div><h1>บัญชีทุกแพลตฟอร์ม<br /><span>ในภาพเดียว</span></h1><p>ตัวตน แบรนด์ และบันทึกเดิม แยกตามสถานะ เพื่อดูว่าอะไรใช้งานจริง อะไรยังรอยืนยัน</p></div>
      <div className="metrics" aria-label="สรุปบัญชี">
        <div><span>ทั้งหมด</span><strong>{summary ? number(summary.accounts_total) : '—'}</strong><small>{summary ? `${summary.groups} กลุ่ม · ${summary.platforms} แพลตฟอร์ม` : 'กำลังอ่าน'}</small></div>
        <div><span>ใช้งาน</span><strong>{summary ? number(summary.active) : '—'}</strong><small>สถานะ active</small></div>
        <div><span>ต้องตรวจ</span><strong>{summary ? number(summary.needs_attention) : '—'}</strong><small>setup หรือรอยืนยัน</small></div>
        <div><span>ไม่ระบุตัวตน</span><strong>{data ? number(data.anonymous.identities) : '—'}</strong><small>แสดงเป็นจำนวนเท่านั้น</small></div>
      </div>
    </section>

    <form className="toolbar" onSubmit={search}>
      <input type="search" aria-label="ค้นหาบัญชี" placeholder="ชื่อ แพลตฟอร์ม หรือวัตถุประสงค์…" value={query} maxLength={80} onChange={event => setQuery(event.target.value)} />
      <button type="submit">ค้นหา</button>
      <select aria-label="สถานะ" value={filters.status} onChange={event => filter({ status: event.target.value })}><option value="">ทุกสถานะ</option>{data?.signals.statuses.map(item => <option key={item.value} value={item.value}>{statusLabel(item.value)} ({item.count})</option>)}</select>
      <select aria-label="แพลตฟอร์ม" value={filters.platform} onChange={event => filter({ platform: event.target.value })}><option value="">ทุกแพลตฟอร์ม</option>{data?.signals.platforms.map(item => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}</select>
      <div className="tabs" role="group" aria-label="ประเภทกลุ่ม">{['', 'identity', 'brand', 'existing'].map(kind => <button key={kind || 'all'} type="button" className={filters.kind === kind ? 'tab selected' : 'tab'} aria-pressed={filters.kind === kind} onClick={() => filter({ kind })}>{kind ? kinds[kind] : 'ทั้งหมด'}</button>)}</div>
      {active && <button type="button" className="text-button" onClick={() => { setFilters(initial); setQuery(''); }}>ล้างตัวกรอง</button>}
      <button type="button" className="secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading}>รีเฟรช</button>
    </form>

    {needsAccess && <form className="access" onSubmit={event => { event.preventDefault(); setNeedsAccess(false); setToken(accessRef.current?.value.trim() || ''); if (accessRef.current) accessRef.current.value = ''; }}><label htmlFor="accounts-access">กรอก access token</label><input id="accounts-access" type="password" ref={accessRef} autoComplete="off" required /><button>เชื่อมต่อ</button><small>เก็บในหน่วยความจำของหน้านี้เท่านั้น</small></form>}
    {error && !needsAccess && <div className="error" role="alert"><strong>อ่าน Accounts API ไม่ได้</strong><p>{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>ลองอีกครั้ง</button></div>}

    <div className="workspace">
      <section className="groups" aria-labelledby="groups-title">
        <div className="section-heading"><h2 id="groups-title">{filters.kind ? kinds[filters.kind] : 'ทุกกลุ่ม'}</h2><span aria-live="polite">{loading ? 'กำลังอ่าน…' : `${number(summary?.accounts_matched || 0)} บัญชี`}</span></div>
        {loading && !data ? <p className="empty" role="status">กำลังอ่าน account matrix…</p>
          : !data ? <p className="empty">ข้อมูลจะแสดงเมื่อเชื่อมต่อ backend สำเร็จ (พอร์ต 3470)</p>
          : !data.accounts.length ? <div className="empty"><h3>ไม่พบบัญชีที่ตรงกัน</h3><p>ลองล้างตัวกรองหรือใช้คำค้นที่สั้นลง</p></div>
          : data.groups.map(group => <GroupCard key={group.id} group={group} accounts={data.accounts.filter(account => account.group_id === group.id)} />)}
      </section>

      <aside className="sidebar">
        <div className="panel"><h2>สถานะ</h2>{data && <StatusBars items={data.signals.statuses} total={data.summary.accounts_total} />}</div>
        <div className="panel"><h2>แพลตฟอร์ม</h2><div className="chips">{data?.signals.platforms.map(item => <button key={item.value} type="button" className={filters.platform === item.value ? 'chip selected' : 'chip'} aria-pressed={filters.platform === item.value} onClick={() => filter({ platform: filters.platform === item.value ? '' : item.value })}>{item.value}<b>{item.count}</b></button>)}</div></div>
        <div className="panel anonymous"><h2>ตัวตนไม่ระบุชื่อ</h2>{data && <><p><strong>{data.anonymous.identities}</strong> ตัวตน · {data.anonymous.platform_slots} ช่องแพลตฟอร์ม</p><p className="note">{data.anonymous.isolation_required ? 'ต้องแยกขาดจากตัวตนหลัก จึงไม่แสดงชื่อหรือวัตถุประสงค์ในหน้านี้' : 'ไม่ได้กำหนดให้แยกขาด'}</p><div className="chips">{data.anonymous.by_status.map(item => <span key={item.value} className={`pill pill-${item.value}`}>{statusLabel(item.value)} {item.count}</span>)}</div></>}</div>
        <div className="panel"><h2>ความหมายของสถานะ</h2><dl>{data?.source.status_definitions.map(item => <div key={item.value}><dt><span className={`pill pill-${item.value}`}>{statusLabel(item.value)}</span></dt><dd>{item.description}</dd></div>)}</dl></div>
      </aside>
    </div>

    <footer><span>SOLO EMPIRE / ACCOUNTS.V1</span><span>matrix updated: {data?.source.updated || '—'} · file modified: {data?.source.modified_at || '—'}</span>{token && <button type="button" className="text-button" onClick={() => { setToken(''); setData(null); }}>ล้าง token</button>}</footer>
  </main>;
}
