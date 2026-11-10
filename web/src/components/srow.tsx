import { useState } from 'react';

/** The building blocks of the Server settings pages: a card of rows, each with a title, a hint and one control on the right. */
export function Notice() {
  return <div className="snotice"><i />Changes here apply to everyone on this server.</div>;
}
export const Eyebrow = ({ children }: { children: React.ReactNode }) => <div className="eyebrow seyebrow">{children}</div>;
export const SCard = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => <div className="scard" style={style}>{children}</div>;
export function SRow({ title, hint, children, sub, onClick, lead }: { title: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode; sub?: boolean; onClick?: () => void; lead?: React.ReactNode }) {
  return (
    <div className={'srow' + (sub ? ' sub' : '') + (onClick ? ' click' : '')} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className="srow-l">{lead}<div className="srow-t"><div>{title}</div>{hint && <div className="srow-h">{hint}</div>}</div></div>
      {children !== undefined && <div className="srow-c">{children}</div>}
    </div>
  );
}
export const PSwitch = ({ on, set, label, disabled }: { on: boolean; set: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={'sw' + (on ? ' on' : '')} onClick={() => set(!on)} />
);
export function PSelect<T extends string | number>({ value, set, options, label, disabled }: { value: T; set: (v: T) => void; options: [T, string][]; label: string; disabled?: boolean }) {
  return (
    <select className="psel" aria-label={label} disabled={disabled} value={String(value)} onChange={(e) => { const o = options.find(([k]) => String(k) === e.target.value); if (o) set(o[0]); }}>
      {options.map(([k, l]) => <option key={String(k)} value={String(k)}>{l}</option>)}
    </select>
  );
}
export function PSeg<T extends string | number>({ value, set, options, label }: { value: T; set: (v: T) => void; options: [T, string][]; label: string }) {
  return <div className="seg" role="group" aria-label={label} style={{ alignSelf: 'auto' }}>{options.map(([k, l]) => <button key={String(k)} aria-pressed={value === k} className={value === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>;
}
export function PStepper({ value, set, min, max, label }: { value: number; set: (n: number) => void; min: number; max: number; label: string }) {
  return <div className="stepper" role="group" aria-label={label}><button aria-label={`Fewer ${label}`} onClick={() => set(Math.max(min, value - 1))}>−</button><b>{value}</b><button aria-label={`More ${label}`} onClick={() => set(Math.min(max, value + 1))}>+</button></div>;
}
/** A pill-shaped text box that saves when it loses focus or Enter is pressed, and only if the text changed. */
export function PInput({ value, save, label, placeholder, type = 'text', width }: { value: string; save: (v: string) => void; label: string; placeholder?: string; type?: string; width?: number }) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setV(value); }
  const commit = () => { if (v !== value) save(v); };
  return <input className="pin" type={type} aria-label={label} value={v} placeholder={placeholder} autoComplete="off" style={width ? { width } : undefined} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}
export const Bar = ({ used, total, text }: { used: number; total: number; text: string }) => (
  <div className="sbar"><span className="sbar-t" aria-hidden><i style={{ width: `${total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0}%` }} /></span><span>{text}</span></div>
);
export const Badge = ({ children }: { children: React.ReactNode }) => <span className="sbadge" aria-hidden>{children}</span>;
export const Ghost = ({ children, onClick, disabled, href, download }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; href?: string; download?: boolean }) =>
  href ? <a className="ghost" href={href} download={download}>{children}</a> : <button className="ghost" onClick={onClick} disabled={disabled}>{children}</button>;
export const gb = (n: number) => (n >= 1e12 ? `${(n / 1e12).toFixed(1)} TB` : n >= 1e9 ? `${Math.round(n / 1e9)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(0, Math.round(n / 1e3))} KB`);
export const initials = (s: string) => s.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
