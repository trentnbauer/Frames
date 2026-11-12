import { describe, expect, it, vi } from 'vitest';
import { HOME_VIEW, MAX_ZOOM, MIN_ZOOM, wheelZoom, zoomAt } from './wallView';
import { Logic } from '../proto/ProtoEditor.logic';

describe('composition wall view', () => {
  it('keeps the point under the pointer stationary through zoom and back', () => {
    const before = { zoom: 1.5, x: -40, y: 20 }, point = { x: 180, y: -70 };
    const after = zoomAt(before, 3, point);
    expect((point.x - after.x) / after.zoom).toBeCloseTo((point.x - before.x) / before.zoom);
    expect((point.y - after.y) / after.zoom).toBeCloseTo((point.y - before.y) / before.zoom);
    expect(zoomAt(after, 1.5, point)).toEqual(before);
  });

  it('limits zoom without jumping at the limits and normalises wheel units', () => {
    expect(zoomAt(HOME_VIEW, 0).zoom).toBe(MIN_ZOOM);
    const max = zoomAt(HOME_VIEW, 100, { x: 20, y: 40 });
    expect(max.zoom).toBe(MAX_ZOOM);
    expect(zoomAt(max, 100, { x: -300, y: 900 })).toEqual(max);
    expect(wheelZoom(1, 1, 1, 500)).toBe(wheelZoom(1, 16, 0, 500));
    expect(wheelZoom(1, 0.1, 2, 500)).toBe(wheelZoom(1, 50, 0, 500));
    expect(wheelZoom(1, -100, 0, 500)).toBeGreaterThan(1);
  });

  it('zooms and pans the view without saving layout or changing crops and physical dimensions', () => {
    const logic = new Logic();
    const print = { id: 1, x: 0, y: 0, size: 'A3', or: 'P', photo: 2, framed: false, zoom: 1.4, sx: 10 };
    logic.props = { prints: [print], photoDims: () => [4000, 6000], photoUrl: () => '', onPrints: vi.fn() };
    const before = logic.wallVals();
    before.onView({ zoom: 2, x: 40, y: -20 });
    const after = logic.wallVals();
    expect(parseFloat(after.prints[0].w)).toBeCloseTo(parseFloat(before.prints[0].w) * 2, 0);
    expect(after.prints[0].cells[0].img).toBe(before.prints[0].cells[0].img);
    expect(after.compMeta).toBe(before.compMeta);
    expect(logic.pr()).toEqual([print]);
    expect(logic.props.onPrints).not.toHaveBeenCalled();
  });

  it('converts a print drag at 200% into the correct physical distance and cancels it for a pinch', () => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    try {
      const logic = new Logic();
      const print = { id: 1, x: 0, y: 0, size: 'A3', or: 'P', photo: null, framed: false };
      logic.props = { prints: [print], onPrints: vi.fn() };
      logic.setState({ view: { zoom: 2, x: 80, y: 0 } });
      logic.startDrag({ button: 0, stopPropagation: vi.fn(), clientX: 100, clientY: 100 }, print);
      (logic as unknown as { mv: (e: { clientX: number; clientY: number }) => void }).mv({ clientX: 100 + logic.scale() * 10, clientY: 100 });
      expect(logic.pr()[0].x).toBe(10);
      expect(logic.props.onPrints).not.toHaveBeenCalled();
      logic.cancelDrag();
      expect(logic.pr()).toEqual([print]);
      expect(logic.state.dragging).toBeNull();
      expect(logic.props.onPrints).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
