import type { ButtonHTMLAttributes } from 'react';

/** The composition wall toolbar's pill, shared by fullscreen and zoom. */
export function WallButton({ children, disabled, style, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={['wall-button', className].filter(Boolean).join(' ')} disabled={disabled} style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '7px 14px', borderRadius: 999, background: 'var(--wall-control-bg)', color: 'var(--text)', boxShadow: 'inset 0 0 0 1px var(--hair)',
    fontSize: 12.5, opacity: disabled ? 0.4 : 1, ...style,
  }}>{children}</button>;
}
