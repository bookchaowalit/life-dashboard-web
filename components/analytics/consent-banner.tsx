import type { Consent } from '@/lib/browser-analytics';

// PDPA consent for browser analytics (ADR-0005 D-5). Shown only when analytics
// is configured; nothing is sent until the owner allows it. Both choices have
// the same size and the same look, and the choice can be changed later from
// "Analytics choices" in the page footer. Styles: .shell-consent* in
// app/globals.css (shell chrome, not a module).
export type PanelState = 'hidden' | 'banner' | 'choices';

export function panelState(enabled: boolean, consent: Consent, reopened: boolean, mounted = true): PanelState {
  // Before mount the stored choice is unknown on the server; render nothing so
  // a returning owner never sees the banner flash.
  if (!enabled || !mounted) return 'hidden';
  return consent === 'unknown' || reopened ? 'banner' : 'choices';
}

export function ConsentBanner({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <section className="shell-consent" role="region" aria-label="Analytics consent" aria-labelledby="shell-consent-title">
      <p id="shell-consent-title" className="shell-consent-title">สถิติการใช้งาน (Analytics)</p>
      <p className="shell-consent-text">
        ให้แดชบอร์ดนับว่าใช้หน้าไหนและกดบันทึกนิสัยหรือเปลี่ยนสถานะงานกี่ครั้งได้ไหม? ข้อมูลจะส่งไป PostHog (เซิร์ฟเวอร์ EU)
        เฉพาะเมื่อคุณอนุญาต ไม่ส่งชื่องาน ชื่อนิสัย จำนวนเงิน บันทึก หรือข้อความการตัดสินใจ
      </p>
      <div className="shell-consent-actions">
        <button type="button" className="shell-consent-choice" onClick={onDecline}>ไม่อนุญาต (Decline)</button>
        <button type="button" className="shell-consent-choice" onClick={onAccept}>อนุญาต (Allow)</button>
      </div>
    </section>
  );
}

export function ConsentChoicesLink({ onOpen }: { onOpen: () => void }) {
  return (
    <footer className="shell-footer">
      <button type="button" onClick={onOpen}>ตัวเลือกสถิติการใช้งาน (Analytics choices)</button>
    </footer>
  );
}
