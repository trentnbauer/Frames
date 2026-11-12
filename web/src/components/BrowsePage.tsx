import type { ReactNode } from 'react';
import { Header } from './Shell';
import { usePrefs } from '../settings/hooks';

/** The library and shoots share their width preference and sticky account header. */
export function BrowsePage({ children }: { children: ReactNode }) {
  const prefs = usePrefs('user');
  const wide = prefs.get('browseFullWidth', false);
  return <div className={`page-shell browse-page${wide ? ' browse-wide' : ''}`}>
    <Header right={<button className="btn browse-width" aria-label="Full width" aria-pressed={wide} onClick={() => prefs.set('browseFullWidth', !wide)}>{wide ? 'Comfortable width' : 'Full width'}</button>} />
    {children}
  </div>;
}
