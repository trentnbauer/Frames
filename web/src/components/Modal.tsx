import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The one modal: 16px radius, scrim, Esc and outside-click close, focus returns to what opened it.
 * On a phone it becomes a full-screen sheet with the actions pinned to the bottom (see .modal in styles.css).
 */
export function Modal({ title, sub, onClose, children, foot, width = 560, eyebrow }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; width?: number; eyebrow?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      // Enter, with nothing in the dialog being typed in or focused as a button, does its main action (the top dialog only).
      const t = e.target as HTMLElement;
      if (e.key !== 'Enter' || e.defaultPrevented || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(t.tagName)) return;
      const modals = document.querySelectorAll('.modal');
      if (modals[modals.length - 1] !== ref.current) return;
      const go = ref.current?.querySelector<HTMLButtonElement>('.mfoot .btn.primary:not([disabled])');
      if (go) { e.preventDefault(); go.click(); }
    };
    window.addEventListener('keydown', f);
    return () => { window.removeEventListener('keydown', f); before?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mscrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1} style={{ width }}>
        <div className="mbody">
          <div className="mhead">
            <div>
              {eyebrow && <span className="eyebrow pillish">{eyebrow}</span>}
              <div className="mtitle">{title}</div>
              {sub && <div className="msub">{sub}</div>}
            </div>
            <button className="xbtn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          {children}
        </div>
        {foot && <div className="mfoot">{foot}</div>}
      </div>
    </div>
  );
}

export const Spinner = ({ size = 14 }: { size?: number }) => <span className="spin" style={{ width: size, height: size }} aria-hidden />;
