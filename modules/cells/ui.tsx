import type { ReactNode } from 'react';
import type { CellErrorCode, Loaded } from '@/lib/cells/core';
import { reasonText } from '@/lib/cells/messages';

import './cells.css';


export function Unavailable({ cell, code }: { cell: string; code: CellErrorCode }) {
  return (
    <div className="cells-unavailable" role="alert">
      <strong>ไม่พร้อมใช้งาน</strong>
      <p>{reasonText(code)}</p>
      <small>บริการ: {cell}</small>
    </div>
  );
}

export function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="m-cells">
      <main className="cells-main">
        <header className="cells-head"><h1>{title}</h1><p>{subtitle}</p></header>
        {children}
      </main>
    </div>
  );
}

/** Renders `view` with the loaded data, or the unavailable state; never throws on a failed load. */
export function Gate<T>({ result, children }: { result: Loaded<T>; children: (data: T) => ReactNode }) {
  return result.ok ? <>{children(result.data)}</> : <Unavailable cell={result.cell} code={result.code} />;
}

export function Progress({ percent }: { percent: number }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return <span className="cells-progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></span>;
}

export const baht = (value: number, currency: string) =>
  `${value.toLocaleString('th-TH', { maximumFractionDigits: 2 })} ${currency}`;
