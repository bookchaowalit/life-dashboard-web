'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  getActionPolicy,
  getUsage,
  type ActionPolicy,
  type CloudUsageResponse,
  type InventoryResponse,
  type ProviderInventory,
} from './api';

function number(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString('th-TH') : '—';
}

function statusLabel(status: string) {
  return {
    healthy: 'พร้อมใช้งาน',
    configured: 'ตั้งค่าแล้ว',
    not_configured: 'ยังไม่ตั้งค่า',
    error: 'อ่านไม่สำเร็จ',
  }[status] || status;
}

function ProviderCard({ provider }: { provider: ProviderInventory }) {
  const resourceCount = provider.summary?.resources;
  return (
    <article className="provider-card">
      <div className="provider-head">
        <div><span className="provider-id">{provider.id}</span><h3>{provider.name || provider.id}</h3></div>
        <span className={`status status-${provider.status}`}>{statusLabel(provider.status)}</span>
      </div>
      <div className="provider-facts">
        <span><small>resources</small><strong>{number(resourceCount)}</strong></span>
        <span><small>scope</small><strong>{provider.partial || provider.has_more ? 'partial' : 'bounded'}</strong></span>
      </div>
      {(provider.partial || provider.has_more) && <p className="partial-note">รายการ provider มี pagination หรือข้อมูลบางส่วน — อย่าใช้เป็นยอดรวมโดยไม่ตรวจ `has_more`</p>}
      {provider.next_action && <p className="provider-next">ถัดไป · {provider.next_action}</p>}
      {provider.error_class && <p className="provider-error">{provider.error_class}</p>}
    </article>
  );
}

export default function CloudClient() {
  const [usage, setUsage] = useState<CloudUsageResponse | null>(null);
  const [inventory, setInventory] = useState<InventoryResponse | null>(null);
  const [policy, setPolicy] = useState<ActionPolicy | null>(null);
  const [live, setLive] = useState(false);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const load = useCallback(async (liveMode: boolean, suppliedToken = token) => {
    setLoading(true);
    setError(null);
    try {
      const [usageResponse, policyResponse] = await Promise.all([
        getUsage(liveMode, suppliedToken),
        getActionPolicy(suppliedToken),
      ]);
      setUsage(usageResponse);
      setInventory(usageResponse.inventory);
      setPolicy(policyResponse);
      setCheckedAt(usageResponse.checked_at || new Date().toISOString());
    } catch (cause) {
      setError(cause instanceof ApiError ? `${cause.code} · ${cause.message}` : 'ไม่สามารถอ่าน Cloud API ได้');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(false, ''); }, []);

  const providers = useMemo(() => inventory?.providers || usage?.inventory?.providers || [], [inventory, usage]);
  const summary = usage?.summary;
  const usageSummary = usage?.usage;
  const policyActionCount = policy?.providers.reduce((count, provider) => count + Object.keys(provider.actions || {}).length, 0) || 0;

  return (
    <main className="cloud-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Cloud home"><span className="brand-mark">SE</span><span><strong>Cloud / PaaS</strong><small>independent extraction pilot</small></span></a>
        <div className="topbar-actions">
          <label className="token-field" htmlFor="cloud-token"><span>token (memory only)</span><input id="cloud-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="optional" autoComplete="off" /></label>
          <label className="live-toggle" htmlFor="cloud-live"><input id="cloud-live" type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} /><span>live read</span></label>
          <button className="quiet-button" type="button" onClick={() => void load(live)} disabled={loading}>{loading ? 'กำลังอ่าน…' : 'รีเฟรช'}</button>
        </div>
      </header>

      <section className="hero">
        <div><p className="eyebrow">CLOUD CONTROL SURFACE / {usage?.mode || 'OFFLINE'}</p><h1>เห็น cloud<br /><em>ก่อนตัดสินใจ</em></h1><p className="hero-copy">inventory และ usage ที่ bounded จาก provider adapters เดิม พร้อม action policy และเส้นแบ่งชัดเจนระหว่าง read-only กับคำสั่งที่ต้องผ่าน owner approval</p></div>
        <aside className="boundary-card"><span className="eyebrow">BOUNDARY</span><strong>Frontend 3400<br />↕ contract cloud.v1<br />Backend 3440</strong><p>browser ไม่อ่าน SQLite หรือ credential โดยตรง</p></aside>
      </section>

      {error && <div className="error-banner" role="alert"><strong>Cloud API เชื่อมต่อไม่สำเร็จ</strong><span>{error}</span><button type="button" onClick={() => void load(live)}>ลองอีกครั้ง</button></div>}

      <section className="metric-strip" aria-label="สรุป cloud">
        <div><span>resources</span><strong>{number(summary?.resource_count ?? usageSummary?.resource_count ?? inventory?.summary.resources)}</strong><small>รายการที่รู้จาก inventory</small></div>
        <div><span>providers</span><strong>{number(summary?.providers ?? inventory?.summary.providers)}</strong><small>{number(summary?.healthy_providers ?? inventory?.summary.healthy)} healthy</small></div>
        <div><span>accounts</span><strong>{number(summary?.account_records ?? usage?.accounts?.length)}</strong><small>metadata ที่ allow-list</small></div>
        <div><span>attention</span><strong>{number(summary?.attention_count)}</strong><small>ต้องตรวจต่อ ไม่ใช่ incident อัตโนมัติ</small></div>
        <div><span>actions</span><strong>{number(policyActionCount)}</strong><small>policy catalog · no browser mutation</small></div>
      </section>

      <section className="workspace-grid">
        <div className="inventory-column">
          <div className="section-heading"><div><p className="eyebrow">INVENTORY / {providers.length}</p><h2>provider ที่กำลังเห็น</h2></div><p>{live ? 'live read เปิดอยู่ · provider API อาจช้าหรือคืนข้อมูลบางส่วน' : 'offline/credential-only เป็นค่าเริ่มต้น · ไม่เรียก provider write'}</p></div>
          {loading && <div className="empty-state" role="status">กำลังอ่าน bounded inventory…</div>}
          {!loading && providers.length === 0 && <div className="empty-state"><strong>ยังไม่มี provider inventory</strong><span>ตรวจ backend ที่ port 3440 และ credential state ของแต่ละ provider</span></div>}
          {!loading && providers.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
        </div>

        <aside className="detail-column">
          <div className="section-heading"><div><p className="eyebrow">DECISION GUARDRAILS</p><h2>สิ่งที่ API นี้รับผิดชอบ</h2></div></div>
          <div className="detail-card">
            <div className="guardrail"><span className="guardrail-mark">01</span><div><strong>read-only โดย default</strong><p>usage, inventory และ Render preflight ไม่เขียน provider หรือ database</p></div></div>
            <div className="guardrail"><span className="guardrail-mark">02</span><div><strong>command มี owner gate</strong><p>mutation ต้องมาจาก loopback, local origin, command marker และผ่าน `paas_execute`</p></div></div>
            <div className="guardrail"><span className="guardrail-mark">03</span><div><strong>partial ไม่เท่ากับ zero</strong><p>แสดง `partial` / `has_more` แยกจากยอดที่ยืนยันแล้ว เพื่อไม่ตัดสินใจจากข้อมูลขาด</p></div></div>
            <dl className="detail-facts"><div><dt>สถานะ usage</dt><dd>{usageSummary?.status || '—'}</dd></div><div><dt>R2 objects</dt><dd>{number(usageSummary?.r2_object_count)}</dd></div><div><dt>last checked</dt><dd>{checkedAt ? new Date(checkedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—'}</dd></div></dl>
            <a className="primary-button" href={`${(process.env.NEXT_PUBLIC_DASHBOARD_ORIGIN || 'http://localhost:3000').replace(/\/$/, '')}/cloud`}>เปิด legacy decision board <span aria-hidden="true">↗</span></a>
          </div>

          <div className="policy-card"><div className="section-heading"><div><p className="eyebrow">ACTION POLICY</p><h3>{policy?.approval?.max_age_seconds ? `approval สด ${Math.round(policy.approval.max_age_seconds / 60)} นาที` : 'ยังอ่าน policy ไม่ได้'}</h3></div></div>{policy?.providers.map((provider) => <div className="policy-row" key={provider.id}><strong>{provider.name || provider.id}</strong><span>{Object.entries(provider.actions || {}).map(([action, spec]) => `${action}:${spec.support || 'unknown'}`).join(' · ') || 'ไม่มี action catalog'}</span></div>)}</div>
        </aside>
      </section>

      <footer className="footer-note"><span>SOLO EMPIRE / CLOUD.V1</span><span>{live ? 'LIVE READ · provider freshness may lag' : 'OFFLINE DEFAULT · credentials stay server-side'}</span></footer>
    </main>
  );
}
