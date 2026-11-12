export type WallView = { zoom: number; x: number; y: number };
export const HOME_VIEW: WallView = { zoom: 1, x: 0, y: 0 };
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

/** Zoom around a point measured from the viewport centre, keeping that point on the wall stationary. */
export function zoomAt(view: WallView, zoom: number, point = { x: 0, y: 0 }): WallView {
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  const ratio = zoom / view.zoom;
  return { zoom, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio };
}

/** Wheel deltas may be pixels, lines, or pages. A trackpad pinch is delivered as a Ctrl+wheel event. */
export function wheelZoom(zoom: number, delta: number, mode: number, height: number): number {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
  return zoom * Math.exp(-Math.max(-100, Math.min(100, pixels)) * 0.002);
}
