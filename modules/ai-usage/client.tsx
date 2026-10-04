'use client';

import { useEffect, useState } from 'react';
import {
  ApiError, activeAlerts, getOverview, isProviderFresh, isWindowActive, NOTIFICATION_LEDGER_KEY,
  notifyFreshAlerts, quotaState, readNotificationLedger, resetCountdown,
  type UsageOverview, type UsageProvider, type UsageWindow,
} from './api';

const ENABLED_KEY = 'solo-ai-usage.notifications.enabled';
const money = (value: number | null | undefined) => value == null ? 'ยังไม่ระบุ' :
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const percent = (value: number | null) => value === null ? 'ไม่ทราบ' : `${Number(value.toFixed(1))}%`;
const bangkokTime = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
}).format(new Date(value)) : 'ยังไม่มีข้อมูล';
const stateLabels = { normal: 'ยังใช้ได้', low: 'ใกล้หมดโควตา', exhausted: 'โควตาหมด', unknown: 'ยังไม่ทราบโควตา', expired: 'รอบเดิม' };
const nextActions: Record<string, string> = {
  connect_provider: 'รอข้อมูลการใช้รอบแรก', refresh_usage: 'รอข้อมูลการใช้รอบใหม่', monitor: '',
  quota_reached: 'รอรีเซ็ตโควตารอบใหม่ หรือใช้บริการอื่นที่ยังมีโควตา',
  quota_low: 'ตรวจโควตาที่เหลือก่อนเริ่มงานใหญ่', use_before_reset: 'ใช้ช่วยงานที่ค้างได้ก่อนรีเซ็ต',
  check_source: 'ข้อมูลยังไม่พร้อม กรุณาลองอัปเดตอีกครั้ง',
};

function QuotaWindow({ window, now, fresh }: { window: UsageWindow; now: number; fresh: boolean }) {
  const state = quotaState(window, now);
  const current = isWindowActive(window, now);
  return <div className={`quota-window quota-${state}${fresh ? '' : ' historical'}`}>
    <div className="window-heading"><h3>{window.label}</h3><span className={`pill ${fresh && current ? state : 'muted'}`}>
      {state === 'expired' ? stateLabels.expired : !fresh ? 'ข้อมูลครั้งล่าสุด' : stateLabels[state]}</span></div>
    <div className="quota-numbers"><span>ใช้ไป <strong>{percent(window.used_percent)}</strong></span>
      <span>{fresh && current ? 'เหลือ' : 'เหลือ ณ ครั้งล่าสุด'} <strong>{percent(window.remaining_percent)}</strong></span></div>
    {window.used_percent === null ? <div className="unknown-track">ยังไม่มีตัวเลขการใช้</div> :
      <progress max={100} value={window.used_percent} aria-label={`${window.label} ${fresh && current ? 'ใช้ไป' : 'ใช้ไป ณ ครั้งล่าสุด'} ${percent(window.used_percent)}`} />}
    <div className="reset"><span>{window.resets_at === null ? 'ยังไม่ทราบเวลารีเซ็ต' : `${state === 'expired' ? 'ผ่านเวลารีเซ็ตแล้ว' : 'รีเซ็ต'} · ${bangkokTime(window.resets_at)}`}</span>
      {current && <strong>{resetCountdown(window.resets_at, now)}</strong>}</div>
    {!current && <p className="window-note">รอข้อมูลรอบใหม่ ก่อนแสดงโควตาที่ใช้ได้ตอนนี้</p>}
  </div>;
}

function ProviderCard({ provider, overview, now, fetchStale }: {
  provider: UsageProvider; overview: UsageOverview; now: number; fetchStale: boolean;
}) {
  const fresh = !fetchStale && isProviderFresh(provider, overview, now);
  const status = provider.status === 'not_connected' ? 'ยังไม่เชื่อมต่อ' : provider.status === 'error' ? 'อ่านข้อมูลไม่ได้' :
    !fresh ? 'ข้อมูลเก่า' : 'ข้อมูลล่าสุด';
  const action = !fresh && provider.status === 'ready' ? 'รอข้อมูลการใช้รอบใหม่' : nextActions[provider.next_action] ?? 'รอข้อมูลการใช้';
  const session = provider.session;
  return <article className={`provider-card provider-${provider.id}`} aria-labelledby={`${provider.id}-title`}>
    <header className="provider-heading"><div className="provider-identity"><span className="provider-icon" aria-hidden="true">{provider.id === 'claude' ? '✳' : '⌘'}</span>
      <div><h2 id={`${provider.id}-title`}>{provider.name}</h2><p>{provider.plan || 'ยังไม่ระบุแพ็ก'} · {money(provider.monthly_fee_usd)} / เดือน</p></div></div>
      <span className={`pill ${fresh ? 'normal' : provider.status === 'error' ? 'exhausted' : 'muted'}`}>{status}</span></header>
    <p className="collected">ข้อมูลการใช้ล่าสุด · {bangkokTime(provider.collected_at)} (กรุงเทพฯ)</p>
    {!fresh && provider.windows.length > 0 && <p className="stale-note">ตัวเลขด้านล่างเป็นข้อมูลครั้งล่าสุด ยังยืนยันโควตาที่เหลือตอนนี้ไม่ได้</p>}
    <div className="quota-list">{provider.windows.length ? provider.windows.map(window =>
      <QuotaWindow key={window.id} window={window} now={now} fresh={fresh} />) :
      <div className="provider-empty"><span aria-hidden="true">—</span><h3>ยังไม่ทราบโควตา</h3>
        <p>{provider.status === 'error' ? 'อ่านโควตาไม่สำเร็จ ลองรีเฟรชอีกครั้ง' : action || 'รอข้อมูลการใช้รอบแรก'}</p></div>}</div>
    <div className="provider-costs"><div><span>ค่าประเมินในเซสชัน{!fresh ? 'ครั้งล่าสุด' : 'นี้'}</span><strong>{session.estimated_cost_usd === null ? 'ยังไม่ทราบ' : money(session.estimated_cost_usd)}</strong></div>
      <div><span>ค่า API ที่เรียกเก็บจริง</span><strong>ยังไม่เชื่อมต่อ</strong></div></div>
    <p className="session-note">{session.input_tokens !== null || session.output_tokens !== null ?
      `เซสชันนี้: เข้า ${session.input_tokens?.toLocaleString('th-TH') ?? 'ไม่ทราบ'} / ออก ${session.output_tokens?.toLocaleString('th-TH') ?? 'ไม่ทราบ'} tokens · ` : ''}
      ค่าประเมินเฉพาะเซสชัน ไม่ใช่ยอดเรียกเก็บ API และไม่ใช่มูลค่าการใช้ทั้งเดือน</p>
    {action && provider.windows.length > 0 && <p className="next-action">{action}</p>}
  </article>;
}

export default function AiUsageClient() {
  const [data, setData] = useState<UsageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationSupport, setNotificationSupport] = useState<boolean | null>(null);
  const [notificationNote, setNotificationNote] = useState('');

  useEffect(() => {
    let disposed = false;
    let pending: AbortController | null = null;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if (pending || disposed) return;
      const controller = new AbortController();
      pending = controller;
      let timedOut = false;
      setLoading(true);
      deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
      try {
        const result = await getOverview(controller.signal);
        if (disposed) return;
        setData(result); setNow(Date.now()); setError(''); setNeedsLogin(false);
      } catch (cause) {
        if (disposed || (controller.signal.aborted && !timedOut)) return;
        setNeedsLogin(cause instanceof ApiError && cause.status === 401);
        setError(timedOut ? 'อ่านข้อมูลนานเกินไป กรุณาลองอีกครั้ง' : cause instanceof ApiError ? cause.message : 'อ่านข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง');
      } finally {
        clearTimeout(deadline);
        pending = null;
        if (!disposed) setLoading(false);
      }
    }
    setNow(Date.now());
    void load();
    const poll = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
    const clock = setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()); }, 15_000);
    const visible = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); void load(); } };
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true; clearInterval(poll); clearInterval(clock); clearTimeout(deadline);
      pending?.abort(); document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);

  useEffect(() => {
    const supported = 'Notification' in window && window.isSecureContext;
    setNotificationSupport(supported);
    if (!supported) return;
    try {
      setNotificationEnabled(localStorage.getItem(ENABLED_KEY) === 'true' && Notification.permission === 'granted');
    } catch { setNotificationNote('เบราว์เซอร์ไม่อนุญาตให้บันทึกการแจ้งเตือน'); }
  }, []);

  useEffect(() => {
    if (!notificationEnabled || !data || error || now === null || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') {
      setNotificationEnabled(false); setNotificationNote('การแจ้งเตือนถูกปิดในตั้งค่าเบราว์เซอร์'); return;
    }
    try {
      // Re-read the ledger for every batch so page reloads and other tabs share cycle IDs.
      const ledger = readNotificationLedger(localStorage.getItem(NOTIFICATION_LEDGER_KEY), now);
      const result = notifyFreshAlerts(data, now, ledger, (item, id) => {
        const notification = new Notification(`${item.provider.name} · ${item.alert.kind === 'use_before_reset' ? 'โควตาใกล้รีเซ็ต' : 'ตรวจโควตาที่เหลือ'}`, {
          body: item.alert.message, tag: id,
        });
        notification.onclick = () => { window.focus(); notification.close(); };
      });
      localStorage.setItem(NOTIFICATION_LEDGER_KEY, JSON.stringify(result.ledger));
    } catch {
      setNotificationEnabled(false); setNotificationNote('เปิดการแจ้งเตือนไม่สำเร็จ กรุณาตรวจสิทธิ์และพื้นที่จัดเก็บของเบราว์เซอร์');
    }
  }, [data, error, now, notificationEnabled]);

  async function toggleNotifications() {
    if (!notificationSupport) return;
    if (notificationEnabled) {
      setNotificationEnabled(false);
      try { localStorage.removeItem(ENABLED_KEY); } catch { /* The active page is already disabled. */ }
      setNotificationNote('ปิดการแจ้งเตือนของหน้านี้แล้ว'); return;
    }
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotificationNote(permission === 'denied' ? 'เบราว์เซอร์ปฏิเสธการแจ้งเตือน เปิดสิทธิ์ได้ในตั้งค่าเว็บไซต์' : 'ยังไม่ได้เปิดสิทธิ์การแจ้งเตือน'); return;
      }
      localStorage.setItem(ENABLED_KEY, 'true');
      setNotificationEnabled(true); setNotificationNote('เปิดแล้ว · เตือนขณะที่หน้านี้ยังเปิดอยู่');
    } catch { setNotificationNote('เปิดการแจ้งเตือนไม่สำเร็จ กรุณาตรวจสิทธิ์เบราว์เซอร์'); }
  }

  const currentNow = now ?? 0;
  const alerts = data && !error && now !== null ? activeAlerts(data, currentNow) : [];
  const useBeforeReset = alerts.filter(item => item.alert.kind === 'use_before_reset')
    .sort((a, b) => Date.parse(a.alert.resets_at) - Date.parse(b.alert.resets_at));
  const connected = data && now !== null && !error ? data.providers.filter(provider => isProviderFresh(provider, data, currentNow)).length : 0;
  const summary = data?.summary;
  const partial = summary && !summary.fees_complete;
  const stale = Boolean(data && (error || (now !== null && data.providers.some(provider => provider.status !== 'not_connected' && !isProviderFresh(provider, data, currentNow)))));

  return <main className="usage-shell">
    <header className="usage-heading"><div><p className="eyebrow">SOLO EMPIRE / AI</p><h1>AI Usage<span className="title-dot" aria-hidden="true">.</span></h1>
      <p className="lead">รู้ว่าเหลือเท่าไร รีเซ็ตเมื่อไร แล้วเลือกใช้ให้เหมาะกับงาน</p></div>
      <div className="refresh-area"><button type="button" className="refresh-button" onClick={() => setRefresh(value => value + 1)} disabled={loading}>
        <span aria-hidden="true">↻</span> {loading ? 'กำลังอัปเดต…' : 'รีเฟรช'}</button>
        <span>อัปเดตทุก 60 วินาทีเมื่อดูหน้านี้</span><span>อ่านล่าสุด · {bangkokTime(data?.generated_at)} (กรุงเทพฯ)</span></div></header>

    <section className="overview-grid" aria-label="สรุปการใช้ AI"><div className="overview-card total-cost"><span className="metric-label">ค่าสมาชิกรวม / เดือน</span>
      <strong className="metric-value">{money(summary?.monthly_fee_usd)}{partial && summary?.monthly_fee_usd !== null && <small> +</small>}</strong>
      <p>{summary ? partial ? 'ยอดเฉพาะแพ็กที่ระบุราคา · ยังไม่ครบทุกแพ็ก' : 'Claude + Codex · ไม่รวมค่า API' : 'รอข้อมูลค่าสมาชิก'}</p></div>
      <div className="overview-card"><span className="metric-label">ข้อมูลโควตาที่พร้อมใช้</span><strong className="metric-value">{data ? connected : '—'}<small> / 2</small></strong>
        <p>{data ? connected === 2 ? 'อ่านโควตาล่าสุดได้ทั้งสองบริการ' : 'บริการที่ยังไม่พร้อมจะแสดงสถานะด้านล่าง' : 'กำลังเชื่อมต่อข้อมูล'}</p></div>
      <div className="overview-card"><span className="metric-label">ควรใช้ก่อนรีเซ็ต</span><strong className="metric-value">{data ? useBeforeReset.length : '—'}<small> รอบ</small></strong>
        <p>{useBeforeReset.length ? 'ดูงานแนะนำและเวลาที่เหลือด้านล่าง' : data ? 'ยังไม่มีคำแนะนำจากข้อมูลล่าสุด' : 'รอข้อมูลโควตา'}</p></div></section>

    {error && <div className="error-banner" role="alert"><div><strong>อัปเดตข้อมูลไม่ได้</strong><p>{error}{data ? ' · แสดงข้อมูลครั้งล่าสุดไว้ให้ตรวจเท่านั้น' : ''}</p></div>
      {needsLogin ? <a href="/login">เข้าสู่ระบบ</a> : <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading}>ลองอีกครั้ง</button>}</div>}
    {stale && !error && <div className="stale-banner" role="status">บางบริการมีข้อมูลเก่า · ระบบจะงดการเตือนจากข้อมูลนั้นจนได้รับโควตารอบใหม่</div>}

    <section className="recommendation" aria-labelledby="recommendation-title"><span className="recommendation-icon" aria-hidden="true">↗</span><div>
      <h2 id="recommendation-title">{useBeforeReset.length ? `ใช้ ${useBeforeReset[0].provider.name} ก่อนรีเซ็ต` : 'เลือกใช้ตามงานที่ต้องทำ'}</h2>
      <p>{useBeforeReset.length ? useBeforeReset[0].alert.message : loading && !data ? 'กำลังอ่านโควตาเพื่อดูว่าบริการไหนควรใช้ก่อน' :
        !connected ? 'รอข้อมูลโควตาล่าสุด ก่อนแนะนำว่าควรใช้บริการไหน' : 'ยังไม่มีรอบที่ต้องรีบใช้ ใช้ AI ช่วยงานที่ค้างโดยไม่ต้องใช้โควตาให้หมดทุกครั้ง'}</p>
      {useBeforeReset.length > 0 && <small>{resetCountdown(useBeforeReset[0].alert.resets_at, currentNow)} · {bangkokTime(useBeforeReset[0].alert.resets_at)} (กรุงเทพฯ)</small>}</div></section>

    <section aria-labelledby="providers-title"><div className="section-heading"><h2 id="providers-title">แพ็กและโควตา</h2><span>โควตาแยกตามรอบของแต่ละบริการ</span></div>
      {data ? <div className="provider-grid">{data.providers.map(provider => <ProviderCard key={provider.id} provider={provider} overview={data} now={currentNow} fetchStale={Boolean(error)} />)}</div> :
        <div className="empty-state" role="status"><h3>{loading ? 'กำลังอ่านข้อมูล Claude และ Codex…' : 'ยังไม่มีข้อมูลการใช้'}</h3>
          <p>{loading ? 'ค่าสมาชิกและโควตาจะแสดงเมื่ออ่านข้อมูลสำเร็จ' : 'ลองรีเฟรชอีกครั้งเมื่อข้อมูลพร้อม'}</p></div>}</section>

    <section className="alerts-panel" aria-labelledby="alerts-title"><div className="section-heading"><div><h2 id="alerts-title">เตือนให้ใช้ทันและคุมโควตา</h2>
      <p>การแจ้งเตือนทำงานในเบราว์เซอร์ขณะที่หน้านี้ยังเปิดอยู่</p></div><button type="button" className="notification-button" onClick={() => void toggleNotifications()}
        disabled={!notificationSupport} aria-pressed={notificationEnabled}>{notificationEnabled ? 'ปิดการแจ้งเตือน' : 'เปิดการแจ้งเตือน'}</button></div>
      <p className="notification-note" role="status">{notificationNote || (notificationSupport === false ? 'เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือนบนหน้านี้' :
        notificationEnabled ? 'เปิดการแจ้งเตือนแล้ว · เตือนหนึ่งครั้งต่อเหตุการณ์ในแต่ละรอบรีเซ็ต' : 'กดเปิดเพื่ออนุญาตการแจ้งเตือน · ไม่มีการส่งข้อความไปช่องทางอื่น')}</p>
      {alerts.length ? <ul className="alert-list">{alerts.map(item => <li key={`${item.provider.id}-${item.alert.id}`} className={`alert-${item.alert.kind}`}>
        <span className={`pill ${item.alert.kind === 'quota_reached' ? 'exhausted' : item.alert.kind === 'quota_low' ? 'low' : 'normal'}`}>
          {item.alert.kind === 'use_before_reset' ? 'ใช้ก่อนรีเซ็ต' : item.alert.kind === 'quota_low' ? 'โควตาใกล้หมด' : 'โควตาหมด'}</span>
        <div><strong>{item.provider.name}</strong><p>{item.alert.message}</p><small>{resetCountdown(item.alert.resets_at, currentNow)} · {bangkokTime(item.alert.resets_at)} (กรุงเทพฯ)</small></div></li>)}</ul> :
        <p className="no-alerts">{error || stale ? 'ยังไม่มีการเตือนที่ยืนยันจากข้อมูลล่าสุด' : 'ยังไม่มีการเตือนจากโควตาล่าสุด'}</p>}</section>

    <footer className="usage-footer"><p>โควตาและเวลารีเซ็ตไม่บอกว่าค่าสมาชิกคุ้มแล้วหรือยัง · ประเมินร่วมกับงานที่เสร็จและเวลาที่ประหยัดได้</p>
      <span>ค่า API ที่เรียกเก็บจริงยังไม่เชื่อมต่อ · ไม่รวมค่าประเมินเซสชันเข้ากับค่าสมาชิก</span></footer>
  </main>;
}
