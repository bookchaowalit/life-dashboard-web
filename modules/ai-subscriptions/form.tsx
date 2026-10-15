'use client';

import { useRef, useState, type FormEvent, type ReactNode, type InputHTMLAttributes } from 'react';
import { useRouter } from 'next/navigation';
import { MutationAttempt, type Payload } from './retry';

export const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim();
export const numberOrNull = (data: FormData, name: string) => text(data, name) === '' ? null : Number(text(data, name));
export const optional = (data: FormData, name: string): Payload => text(data, name) ? { [name]: text(data, name) } : {};

/** One key per unchanged attempt, retained on errors so a retry cannot duplicate a record. */
export function MutationForm({ title, children, payload, reset = true }: {
  title: string; children: ReactNode; payload: (data: FormData) => Payload; reset?: boolean;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const attempt = useRef(new MutationAttempt());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const body = attempt.current.prepare(payload(new FormData(form)));
    inFlight.current = true;
    setPending(true); setMessage(''); setFailed(false);
    try {
      const response = await fetch('/api/owner/ai-subscriptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        setFailed(true);
        setMessage(typeof result.error?.message === 'string' ? result.error.message : 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง');
        return;
      }
      attempt.current.succeeded();
      if (reset) form.reset();
      setMessage('บันทึกแล้ว');
      router.refresh();
    } catch {
      setFailed(true); setMessage('เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง ข้อมูลที่กรอกยังอยู่');
    } finally {
      inFlight.current = false; setPending(false);
    }
  }

  return <form className="ai-form" method="post" action="/api/owner/ai-subscriptions" onSubmit={submit} aria-label={title}>
    <fieldset disabled={pending}><legend>{title}</legend><div className="ai-fields">{children}</div>
      <button type="submit" className="primary">{pending ? 'กำลังบันทึก…' : title}</button>
    </fieldset>
    {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'cells-danger' : ''}>{message}</p>}
  </form>;
}

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="ai-field"><span>{label}</span><input {...props} /></label>;
}

export function Evidence({ value, required = false }: { value?: string | null; required?: boolean }) {
  return <label className="ai-field ai-wide"><span>หลักฐานหรือผลลัพธ์{required ? ' (จำเป็น)' : ''}</span>
    <textarea name="evidence" maxLength={800} required={required} defaultValue={value ?? ''} rows={2} />
  </label>;
}
