import type { ButtonHTMLAttributes } from 'react';

/** The composition wall toolbar's pill, shared by fullscreen and zoom. */
export function WallButton({ children, disabled, style, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} disabled={disabled} style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '7px 14px', borderRadius: 999, background: 'rgba(13,13,13,.6)',
    fontSize: 12.5, opacity: disabled ? 0.4 : 1, ...style,
  }}>{children}</button>;
}
