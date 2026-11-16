import { createPortal } from 'react-dom';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The phone's bottom sheet: a scrim, a rounded panel with a grab bar, a serif title and optional sub line.
 * Escape and a tap on the scrim close it, and focus goes back to what opened it.
 */
export function Sheet({ title, sub, onClose, children }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const f = (e: KeyboardEvent) => {
      const all = document.querySelectorAll('[data-sheet]');
      if (e.key === 'Escape' && all[all.length - 1] === ref.current) { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', f);
    return () => { window.removeEventListener('keydown', f); before?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const node = (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--scrim)' }} />
      <div ref={ref} data-sheet role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1}
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 91, maxHeight: '80dvh', overflowY: 'auto', background: 'var(--raised2)', borderRadius: '24px 24px 0 0', boxShadow: 'var(--float)', padding: '10px 20px max(40px, env(safe-area-inset-bottom))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14, outline: 'none' }}>
        <i style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 999, background: 'var(--outline)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ font: '400 28px/1.05 var(--serif)' }}>{title}</span>
          {sub && <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text2)' }}>{sub}</span>}
        </div>
        {children}
      </div>
    </>
  );
  return typeof document !== 'undefined' && document.body ? createPortal(node, document.body) : node;
}
