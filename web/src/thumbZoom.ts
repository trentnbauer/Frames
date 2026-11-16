import { useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';

/** How big the photographs are in the library and shoot grids: a pinch on a phone (columns), ctrl + wheel or a trackpad pinch on a wide screen (size). Remembered on this device. */
const read = (key: string, def: number, min: number, max: number) => {
  try { const n = Number(localStorage.getItem(key)); if (Number.isFinite(n) && n >= min && n <= max && localStorage.getItem(key) !== null) return n; } catch { /* storage blocked: the default will do */ }
  return def;
};
const write = (key: string, n: number) => { try { localStorage.setItem(key, String(n)); } catch { /* not remembered */ } };
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());

/** A remembered number every grid on the page shares. */
function useShared(key: string, def: number, min: number, max: number): [number, (n: number) => void] {
  const [v, setV] = useState(() => read(key, def, min, max));
  useEffect(() => { const f = () => setV(read(key, def, min, max)); subs.add(f); return () => { subs.delete(f); }; }, [key, def, min, max]);
  return [v, (n) => { write(key, Math.max(min, Math.min(max, n))); tell(); }];
}

export const COLS = { min: 1, max: 6, def: 3 };
/** The columns after a pinch that changed the finger distance by `ratio` (above 1 = spread = bigger photographs = fewer columns). */
export const columnsAfterPinch = (start: number, ratio: number) => Math.max(COLS.min, Math.min(COLS.max, Math.round(start / ratio)));
/** Phone: the number of columns, and touch handlers for the grid. Spreading two fingers makes the photographs bigger (fewer columns), pinching makes them smaller. */
export function usePinchColumns() {
  const [cols, setCols] = useShared('frames-thumb-cols', COLS.def, COLS.min, COLS.max);
  const from = useRef<{ d: number; cols: number } | null>(null);
  const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  const handlers = {
    onTouchStart: (e: TouchEvent) => { from.current = e.touches.length === 2 ? { d: dist(e), cols } : null; },
    onTouchMove: (e: TouchEvent) => {
      const s = from.current;
      if (!s || e.touches.length !== 2 || s.d < 1) return;
      const ratio = dist(e) / s.d;
      const next = columnsAfterPinch(s.cols, ratio);
      if (next !== cols) setCols(next);
    },
    onTouchEnd: () => { from.current = null; },
    onTouchCancel: () => { from.current = null; },
  };
  return { cols, handlers, style: { touchAction: 'pan-y' } as const };
}

export const SIZE = { min: 110, max: 420, def: 190, step: 20 };
/** The size after one wheel event: scrolling up (negative deltaY) or spreading a trackpad pinch grows the photographs. */
export const sizeAfterWheel = (size: number, deltaY: number) => Math.max(SIZE.min, Math.min(SIZE.max, size - Math.sign(deltaY) * Math.min(SIZE.step, Math.max(4, Math.abs(deltaY)))));
/** Wide screen: the photograph size (the row height it aims for), changed by ctrl + wheel or a trackpad pinch over the grid. */
export function useWheelSize() {
  const [size, setSize] = useShared('frames-thumb-size', SIZE.def, SIZE.min, SIZE.max);
  const el = useRef<HTMLDivElement>(null);
  const now = useRef(size);
  now.current = size;
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const f = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // a plain wheel still scrolls the page
      e.preventDefault(); // and the browser does not zoom the whole page
      setSize(sizeAfterWheel(now.current, e.deltaY));
    };
    node.addEventListener('wheel', f, { passive: false });
    return () => node.removeEventListener('wheel', f);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return { size, el };
}
