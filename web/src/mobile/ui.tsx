import type { CSSProperties, ReactNode } from 'react';
import { SegSlider } from '../components/SegSlider';
import { useNavigate } from 'react-router-dom';

/** Small pieces every phone page uses, so the pages stay close to the design without repeating its styles. */
export const mono11: CSSProperties = { font: '500 11px var(--mono)', letterSpacing: '.08em', color: 'var(--faint)' };

export const Eyebrow = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <span style={{ ...mono11, ...style }}>{children}</span>;

/** "← Home": the pill at the top of a page above the tab bar. It goes back, or to `to` when there is nothing to go back to. */
export function BackPill({ label = 'Back', to = '/' }: { label?: string; to?: string }) {
  const nav = useNavigate();
  return <button onClick={() => (window.history.length > 1 ? nav(-1) : nav(to))} style={{ height: 36, padding: '0 14px', borderRadius: 999, background: 'var(--surface)', fontSize: 13, color: 'var(--text2)' }}>← {label}</button>;
}

/** A list row: label, optional sub line, optional count chip and a chevron. */
export function Row({ label, sub, count, onClick, thumb, meta, chevron = '›', fg }: { label: ReactNode; sub?: ReactNode; count?: ReactNode; onClick?: () => void; thumb?: string; meta?: ReactNode; chevron?: string; fg?: string }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: sub || thumb ? 58 : 56, borderTop: '1px solid var(--hair)', textAlign: 'left', width: '100%', color: fg }}>
      {thumb !== undefined && <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 4, background: thumb ? `url(${thumb}) center/cover var(--surface)` : 'var(--surface)' }} />}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{label}</span>{sub && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sub}</span>}</span>
      {meta !== undefined && <span style={{ font: '400 11.5px var(--mono)', color: 'var(--faint)' }}>{meta}</span>}
      {count !== undefined && <span style={{ font: '500 12px var(--mono)', padding: '3px 8px', borderRadius: 999, background: 'var(--chip)', color: 'var(--text2)' }}>{count}</span>}
      {chevron && <span style={{ color: 'var(--faint)' }}>{chevron}</span>}
    </button>
  );
}

/** A segmented control in a pill track; the chosen one is filled. */
export function Seg<T extends string>({ options, value, onPick, label }: { options: [T, string][]; value: T; onPick: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', padding: 3, borderRadius: 999, background: 'var(--surface)' }}><SegSlider />
      {options.map(([k, l]) => <button key={k} aria-pressed={value === k} onClick={() => onPick(k)} style={{ flex: 1, height: 38, borderRadius: 999, background: value === k ? 'var(--btn-bg)' : 'transparent', color: value === k ? 'var(--btn-fg)' : 'var(--text2)', fontSize: 14, fontWeight: 500, textAlign: 'center' }}>{l}</button>)}
    </div>
  );
}

export const Toggle = ({ on, onClick, label, sub }: { on: boolean; onClick: () => void; label: string; sub?: string }) => (
  <button role="switch" aria-checked={on} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, borderTop: '1px solid var(--hair)', textAlign: 'left', width: '100%' }}>
    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15 }}>{label}</span>{sub && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sub}</span>}</span>
    <span style={{ position: 'relative', flexShrink: 0, width: 48, height: 28, borderRadius: 999, background: on ? 'var(--btn-bg)' : 'var(--chip)' }}><i style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: on ? 'var(--btn-fg)' : 'var(--text2)' }} /></span>
  </button>
);

export const pillBtn: CSSProperties = { height: 44, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14 };
export const primaryBtn: CSSProperties = { height: 50, borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 15, textAlign: 'center' };
