import type { ReactNode } from 'react';

/** The one toast slot: top centre, 24px below the header. Every screen shows its short messages here. */
export function ToastSlot({ children }: { children: ReactNode }) {
  return (
    <div role="status" style={{ position: 'fixed', top: 'calc(var(--app-header-height, 68px) + 24px)', left: '50%', transform: 'translateX(-50%)', zIndex: 95, display: 'flex', alignItems: 'center', gap: 14, padding: '9px 10px 9px 18px', borderRadius: 999, background: 'var(--raised2)', boxShadow: 'var(--float)', fontSize: 13.5, whiteSpace: 'nowrap' }}>
      {children}
    </div>
  );
}
