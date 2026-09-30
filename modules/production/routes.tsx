'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  api,
  HubError,
  LEVEL_LABELS,
  stepState,
  type FormatRegistry,
  type Route,
  type RuntimeState,
} from './api';

const TEXT_LABELS: Record<string, string> = { authored: 'text ที่คนเขียน', generated: 'text ที่เครื่องสร้าง', binary: 'binary' };

const message = (cause: unknown) => (cause instanceof HubError ? cause.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิด');

function RouteCard({ route }: { route: Route }) {
  const badges: { text: string; pill: string }[] = [];
  if (route.ready) badges.push({ text: 'ทำได้ใน Solo-Empire แล้ว', pill: 'accepted' });
  else if (route.runnable_now) badges.push({ text: 'รันได้บนเครื่องนี้ (ยังไม่ได้เชื่อมเข้า Hub)', pill: 'needs_review' });
  if (route.missing.length) badges.push({ text: `ต้องติดตั้ง: ${route.missing.join(', ')}`, pill: 'rejected' });
  if (route.steps.some((step) => step.status === 'planned')) badges.push({ text: 'มีขั้นที่อยู่ในแผน', pill: '' });
  if (route.needs_approval) badges.push({ text: 'มีขั้นที่ต้องให้คนอนุมัติ', pill: 'in_review' });
  return (
    <div className="panel">
      <h3>{route.from} → {route.to} · {route.hops} ขั้น</h3>
      <div className="actions" style={{ margin: '8px 0' }}>
        {badges.map((badge) => <span key={badge.text} className={`pill ${badge.pill}`}>{badge.text}</span>)}
      </div>
      <ol className="list">
        {route.steps.map((step, index) => {
          const state = stepState(step);
          return (
            <li key={`${step.converter}-${index}`} className="row">
              <span className="name">{step.from} → {step.to}</span>
              <span className={`pill ${state.pill}`}>{state.label}</span>
              <span className="meta">
                <code>{step.converter}</code>
                <span>เครื่องมือ {step.tool}</span>
                <span>{step.level} {LEVEL_LABELS[step.level] ?? ''}</span>
                {step.approval === 'human' && <span>ต้องให้คนอนุมัติก่อน</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function ConversionRoutes() {
  const [registry, setRegistry] = useState<FormatRegistry | null>(null);
  const [runtimes, setRuntimes] = useState<Record<string, RuntimeState> | null>(null);
  const [source, setSource] = useState('.srt');
  const [target, setTarget] = useState('delivery-package');
  const [implementedOnly, setImplementedOnly] = useState(false);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.formats().then(setRegistry).catch((cause) => setError(message(cause)));
    api.runtimes().then((data) => setRuntimes(data.runtimes)).catch(() => setRuntimes(null));
  }, []);

  const options = useMemo(() => {
    if (!registry) return [];
    const extensions = Object.values(registry.formats).flatMap((entry) => entry.ext.filter((ext) => ext.startsWith('.')));
    return Array.from(new Set([...Object.keys(registry.formats), ...Object.keys(registry.effects), ...extensions])).sort();
  }, [registry]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api.path({ from: source.trim(), to: target.trim(), implementedOnly });
      setRoutes(data.routes);
    } catch (cause) {
      setRoutes(null);
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  const domainFormats = registry && domain
    ? Object.entries(registry.formats).filter(([, entry]) => entry.domain === domain)
    : [];
  const installed = runtimes ? Object.entries(runtimes).filter(([, item]) => item.status === 'installed') : [];
  const missing = runtimes ? Object.entries(runtimes).filter(([, item]) => item.status !== 'installed') : [];

  return (
    <div className="layout">
      <section>
        <form className="panel form" onSubmit={search}>
          <h2>เส้นทางแปลงไฟล์</h2>
          <p className="muted">ใส่ชื่อรูปแบบ นามสกุล (.scad) หรือผลลัพธ์ในโลกจริง (effect.printed-part) เพื่อดูว่าแปลงต่อกันอย่างไร</p>
          <datalist id="route-options">{options.map((item) => <option key={item} value={item} />)}</datalist>
          <label>จาก<input list="route-options" value={source} onChange={(event) => setSource(event.target.value)} required /></label>
          <label>ไปยัง<input list="route-options" value={target} onChange={(event) => setTarget(event.target.value)} required /></label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={implementedOnly} onChange={(event) => setImplementedOnly(event.target.checked)} />
            เฉพาะเส้นทางที่ทำได้ใน Solo-Empire แล้ว
          </label>
          <div className="actions"><button type="submit" disabled={busy}>{busy ? 'กำลังค้น…' : 'ค้นเส้นทาง'}</button></div>
          {error && <p className="notice error" role="alert">{error}</p>}
        </form>
        {routes && routes.length === 0 && (
          <div className="panel"><p className="empty">ไม่มีเส้นทาง — อาจยังไม่มีตัวแปลง หรือโดเมนปลายทางจำกัดไว้ที่การจำลอง</p></div>
        )}
        {routes?.map((route, index) => <RouteCard key={`${route.from}-${route.to}-${index}`} route={route} />)}
      </section>
      <aside>
        <div className="panel">
          <h2>ภาพรวม</h2>
          {registry ? (
            <dl className="facts">
              <dt>รูปแบบไฟล์</dt><dd>{registry.summary.formats} ใน {registry.summary.domains} โดเมน</dd>
              <dt>ตัวแปลง</dt>
              <dd>
                {registry.summary.converters} (ใช้ได้แล้ว {registry.summary.by_status.implemented ?? 0} ·
                ต้องติดตั้ง {registry.summary.by_status.available ?? 0} · ในแผน {registry.summary.by_status.planned ?? 0})
              </dd>
              <dt>ผลในโลกจริง</dt><dd>{registry.summary.effects} แบบ — ต้องให้คนอนุมัติทุกครั้ง</dd>
            </dl>
          ) : <p className="muted" role="status">กำลังโหลด…</p>}
          <label>ดูรูปแบบไฟล์ของโดเมน
            <select value={domain} onChange={(event) => setDomain(event.target.value)}>
              <option value="">— เลือกโดเมน —</option>
              {registry && Object.entries(registry.domains).map(([id, item]) => (
                <option key={id} value={id}>{item.label} (สูงสุด {item.max_level})</option>
              ))}
            </select>
          </label>
          {registry && domain && registry.domains[domain]?.note && <p className="muted">{registry.domains[domain].note}</p>}
          {domainFormats.length > 0 && (
            <ul className="list">
              {domainFormats.map(([id, entry]) => (
                <li key={id} className="row" style={{ cursor: 'default' }}>
                  <span className="name">{id}</span>
                  <span className="pill">{TEXT_LABELS[entry.text]}</span>
                  <span className="meta"><span>{entry.ext.join(' ')}</span>{entry.kinds && <span>Hub: {entry.kinds.join(', ')}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <h2>โปรแกรมบนเครื่องนี้</h2>
          {runtimes === null ? <p className="muted">ตรวจไม่ได้หรือกำลังตรวจ…</p> : (
            <>
              <p className="muted">ติดตั้งแล้ว {installed.length} · ยังไม่มี {missing.length} (ติดตั้งเพิ่มต้องให้เจ้าของอนุมัติ)</p>
              <div className="actions">
                {installed.map(([id, item]) => <span key={id} className="pill accepted" title={item.found ?? ''}>{item.label}</span>)}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
