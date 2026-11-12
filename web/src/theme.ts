import { useSyncExternalStore } from 'react';
export type Theme = 'dark' | 'light';
const KEY = 'frames-theme';

export const getTheme = (): Theme => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

/** Swaps the CSS variables only (never re-renders the page). Uses a clip-path View Transition wipe unless motion is reduced. */
export function setTheme(t: Theme, from?: { x: number; y: number }) {
  const apply = () => {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch { /* not remembered */ }
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
  const x = from?.x ?? window.innerWidth, y = from?.y ?? 0;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  doc.startViewTransition(apply).ready.then(() => {
    document.documentElement.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 750, easing: 'cubic-bezier(.7,0,.25,1)', pseudoElement: '::view-transition-new(root)' });
  }).catch(() => undefined);
}

/** Header labels also follow theme changes made in Settings or another browser tab. */
export function useTheme(): Theme {
  return useSyncExternalStore((notify) => {
    const observer = new MutationObserver(notify);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const storage = (event: StorageEvent) => {
      if (event.key === KEY && (event.newValue === 'dark' || event.newValue === 'light')) document.documentElement.setAttribute('data-theme', event.newValue);
    };
    window.addEventListener('storage', storage);
    return () => { observer.disconnect(); window.removeEventListener('storage', storage); };
  }, getTheme, () => 'dark');
}
