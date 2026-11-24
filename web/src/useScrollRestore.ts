import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const KEY = 'frames.scroll:';

/** Where a history entry was scrolled to, kept for the browser tab. */
export function rememberScroll(key: string, y: number) {
  try { sessionStorage.setItem(KEY + key, String(Math.round(y))); } catch { /* storage blocked: the page opens at the top */ }
}
/** Takes it back, once: the first page of a visit always has the key "default", so a kept value could reach a later, fresh visit. */
export function takeScroll(key: string): number {
  try { const y = Number(sessionStorage.getItem(KEY + key)) || 0; sessionStorage.removeItem(KEY + key); return y; } catch { return 0; }
}

/**
 * Puts the page back where it was scrolled to when the person comes back to this history entry (Back from a photograph). The browser
 * cannot do it itself here: the list loads again after Back, so the page is too short to scroll when it tries. Pass `ready` once the
 * list has rendered. A fresh visit to the page is a new history entry, so it still opens at the top.
 */
export function useScrollRestore(ready: boolean) {
  const { key } = useLocation();
  const y = useRef(0);
  const restored = useRef(false);
  useEffect(() => {
    // Remembered as it happens: by the time the page unmounts, the next page has already changed how far it can scroll.
    const onScroll = () => { y.current = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      rememberScroll(key, y.current);
    };
  }, [key]);
  useLayoutEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const saved = takeScroll(key);
    if (saved > 0) { window.scrollTo(0, saved); y.current = saved; }
  }, [ready, key]);
}
