import type { ReactNode } from 'react';

/** Browse toolbars sit below the shared app header. */
export function BrowsePage({ children }: { children: ReactNode }) {
  return <div className="page-shell browse-page">{children}</div>;
}
