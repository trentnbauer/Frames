import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const KEY = 'frames.scroll:';
/** The person scrolling or typing: from then on the page is theirs. */
const INPUT = ['wheel', 'touchstart', 'keydown'] as const;

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
 * cannot do it itself here: the list loads again after Back, so the page is too short to scroll when it tries. Pass `ready` once
 * everything that sits above or in the list has loaded (later parts are waited for, briefly). Pass `box` when the page scrolls inside
 * its own panel rather than the window. A fresh visit to the page is a new history entry, so it still opens at the top.
 */
export function useScrollRestore(ready: boolean, box?: RefObject<HTMLElement | null>) {
  const { key } = useLocation();
  const how = useNavigationType();
  const y = useRef(0);
  // The position to go back to, taken once per history entry; `done` once it is reached or given up on.
  const target = useRef<{ key: string; y: number; done: boolean } | null>(null);
  // A layout effect, so it stops listening the moment the page goes: an ordinary effect lets go after the next page is drawn, and
  // would record that page's scrolling as this one's.
  useLayoutEffect(() => {
    const el = box?.current ?? null, on: HTMLElement | Window = el ?? window;
    // Remembered as it happens: by the time the page unmounts, the next page has already changed how far it can scroll.
    // Only once the page is settled: while it loads, the browser's own attempt clamps the position to the short page, and that
    // would be saved over the real one.
    const onScroll = () => { if (target.current?.key === key && target.current.done) y.current = el ? el.scrollTop : window.scrollY; };
    on.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      on.removeEventListener('scroll', onScroll);
      // Only a position down the page is worth keeping (and React's development double run would otherwise store a 0 over the real one).
      if (y.current > 0) rememberScroll(key, y.current);
    };
  }, [key, box, ready]); // `ready` too: a page's scrolling panel may only appear once it has loaded
  useLayoutEffect(() => {
    if (!ready) return;
    if (target.current?.key !== key) target.current = { key, y: takeScroll(key), done: false };
    const t = target.current, el = box?.current ?? null;
    if (t.y <= 0) {
      t.done = true;
      // A fresh visit (a link, not Back or a reload) starts at the top: the app keeps the window where the last page left it otherwise.
      if (how === 'PUSH') { if (el) el.scrollTop = 0; else window.scrollTo(0, 0); }
    }
    if (t.done) return;
    // Parts of a page can arrive after it says it is ready (a list that loads on its own, pictures without a set size): keep trying
    // each frame until it is tall enough, for two seconds at most, and never once the person scrolls themselves.
    const until = performance.now() + 2000;
    let frame = 0;
    const go = () => {
      if (el) el.scrollTop = t.y; else window.scrollTo(0, t.y);
      y.current = el ? el.scrollTop : window.scrollY;
      if (y.current >= t.y - 1 || performance.now() > until) finish(); else frame = requestAnimationFrame(go);
    };
    const finish = () => { t.done = true; stop(); };
    const stop = () => { cancelAnimationFrame(frame); for (const e of INPUT) window.removeEventListener(e, finish); };
    for (const e of INPUT) window.addEventListener(e, finish, { passive: true });
    go();
    return stop;
  }, [ready, key, box, how]);
}
