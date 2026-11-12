import { useEffect, useRef, type RefObject } from 'react';
import { MAX_ZOOM, MIN_ZOOM, wheelZoom, zoomAt, type WallView } from './wallView';
import { WallButton } from './WallButton';

/** View-only controls: never change print positions, sizes or photo crops. */
export function WallZoom({ wallRef, view, onView, onPinchStart, onBackground }: {
  wallRef: RefObject<HTMLDivElement | null>; view: WallView; onView: (view: WallView) => void;
  onPinchStart: () => void; onBackground: () => void;
}) {
  const latest = useRef({ view, onView, onPinchStart, onBackground });
  latest.current = { view, onView, onPinchStart, onBackground };
  useEffect(() => {
    const wall = wallRef.current;
    if (!wall) return;
    const points = new Map<number, { x: number; y: number }>();
    let pan: { id: number; x: number; y: number; view: WallView } | null = null;
    let pinch: { distance: number; x: number; y: number; view: WallView } | null = null;
    let pinching = false;
    const control = (target: EventTarget | null) => target instanceof Element && !!target.closest('[data-wall-control]');
    const point = (x: number, y: number) => {
      const r = wall.getBoundingClientRect();
      return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 };
    };
    const pair = () => {
      const [a, b] = [...points.values()];
      return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    const wheel = (e: WheelEvent) => {
      if (control(e.target)) return; // Settings panels retain their own scrolling and browser zoom.
      e.preventDefault();
      latest.current.onPinchStart(); // A zoom gesture cancels an unfinished print drag.
      const v = latest.current.view;
      latest.current.onView(zoomAt(v, wheelZoom(v.zoom, e.deltaY, e.deltaMode, wall.clientHeight), point(e.clientX, e.clientY)));
    };
    const down = (e: PointerEvent) => {
      if (control(e.target) || e.button !== 0) return;
      if (e.pointerType === 'touch') {
        points.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (points.size >= 2) {
          latest.current.onPinchStart();
          pan = null; pinching = true;
          pinch = { ...pair(), view: latest.current.view };
          e.preventDefault(); e.stopPropagation();
          return;
        }
      }
      if (e.target instanceof Element && e.target.closest('[data-wall-print]')) return;
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, view: latest.current.view };
      latest.current.onBackground();
      e.preventDefault(); e.stopPropagation();
    };
    const move = (e: PointerEvent) => {
      if (points.has(e.pointerId)) points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinching) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (points.size >= 2 && pinch) {
          const p = pair();
          const v = zoomAt(pinch.view, pinch.view.zoom * p.distance / pinch.distance, point(pinch.x, pinch.y));
          latest.current.onView({ ...v, x: v.x + p.x - pinch.x, y: v.y + p.y - pinch.y });
        }
      } else if (pan?.id === e.pointerId) {
        e.preventDefault(); e.stopImmediatePropagation();
        latest.current.onView({ ...pan.view, x: pan.view.x + e.clientX - pan.x, y: pan.view.y + e.clientY - pan.y });
      }
    };
    const up = (e: PointerEvent) => {
      points.delete(e.pointerId);
      if (pan?.id === e.pointerId) pan = null;
      if (pinching) {
        e.stopImmediatePropagation();
        if (!points.size) { pinching = false; pinch = null; }
      }
    };
    const clear = () => { points.clear(); pan = null; pinch = null; pinching = false; };
    wall.addEventListener('wheel', wheel, { passive: false });
    wall.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, { capture: true, passive: false });
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', clear);
    return () => {
      wall.removeEventListener('wheel', wheel);
      wall.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', clear);
    };
  }, [wallRef]);
  return <div data-wall-control="" role="group" aria-label="Wall zoom" onPointerDown={(e) => e.stopPropagation()}
    style={{ position: 'absolute', bottom: 14, left: 14, zIndex: 6, display: 'flex', gap: 8 }}>
    <WallButton aria-label="Zoom out" title="Zoom out" disabled={view.zoom <= MIN_ZOOM} onClick={() => onView(zoomAt(view, view.zoom / 1.25))}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 6h8" /></svg>
    </WallButton>
    <WallButton aria-label="Zoom in" title="Zoom in" disabled={view.zoom >= MAX_ZOOM} onClick={() => onView(zoomAt(view, view.zoom * 1.25))}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 6h8M6 2v8" /></svg>
    </WallButton>
  </div>;
}
