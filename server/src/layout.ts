/**
 * A composition's layout: the prints on the wall, each with its own size, orientation, frame and place. Everything that comes in is
 * checked here, so what is stored (and what a share link shows) is always a layout that makes sense.
 */
export const PAPER: Record<string, [number, number]> = {
  A5: [148, 210], A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841],
  '5×7″': [127, 178], '8×10″': [203, 254], '11×14″': [279, 356], '16×20″': [406, 508], '50×70': [500, 700],
};
export const FRAME_COLOURS = ['black', 'white', 'oak', 'walnut', 'silver', 'none'] as const;
export const MAT_COLOURS = ['white', 'ivory', 'black'] as const;
export const MODES = ['row', 'grid', 'feature', 'free'] as const;
export const MAX_PRINTS = 12;

export type Frame = { size: string; mat: string; color: string };
/** A print holds one photograph, or (stack) two: two landscape photographs one above the other make a portrait print, two portrait ones side by side make a landscape one. */
/** A look-only crop: zoom 1 to 2.5, shifted by shiftX/shiftY (-50 to 50, percent). The original file is never changed. */
export type Crop = { zoom: number; shiftX: number; shiftY: number };
export type Print = { crop?: Crop; id: number; size: string; orientation: 'portrait' | 'landscape'; frame: Frame | null; photoId: number | null; stack: boolean; photoId2: number | null; x: number; y: number };
/** `ppi` is the sharpness the photographer wants (pixels per inch at print size); a photograph with fewer is still allowed, with a warning. Absent means 300. */
export type Layout = { mode: (typeof MODES)[number]; prints: Print[]; ppi?: number;
  /** The scale of the room picture behind the wall: how many mm of wall one pixel of the picture is. Absent until it is set. */ bg?: { mmPerPx: number } };
export const PPI_MIN = 72, PPI_MAX = 600;

/** Whether paper `frame` is at least as big as paper `print` (in both sides). */
export const fits = (frame: string, print: string) => !!PAPER[frame] && !!PAPER[print] && PAPER[frame][0] >= PAPER[print][0] && PAPER[frame][1] >= PAPER[print][1];
const area = (k: string) => PAPER[k][0] * PAPER[k][1];
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** A layout from untrusted input: null if it is not one. Each photograph can be in one print only, and only if it belongs to the composition. */
export function parseLayout(raw: unknown, members: Set<number>): Layout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { mode?: unknown; prints?: unknown; ppi?: unknown };
  if (!Array.isArray(r.prints) || r.prints.length === 0 || r.prints.length > MAX_PRINTS) return null;
  const used = new Set<number>();
  const prints: Print[] = [];
  let nextId = 1;
  for (const p of r.prints as Record<string, unknown>[]) {
    if (!p || typeof p !== 'object' || typeof p.size !== 'string' || !PAPER[p.size]) return null;
    const size = p.size;
    const orientation = p.orientation === 'portrait' ? 'portrait' as const : 'landscape' as const;
    let frame: Frame | null = null;
    if (p.frame && typeof p.frame === 'object') {
      const f = p.frame as Record<string, unknown>;
      frame = {
        size: typeof f.size === 'string' && fits(f.size, size) ? f.size : size, // a frame smaller than its print is made the print's own size
        color: (FRAME_COLOURS as readonly string[]).includes(String(f.color)) ? String(f.color) : 'black',
        mat: (MAT_COLOURS as readonly string[]).includes(String(f.mat)) ? String(f.mat) : 'white',
      };
    }
    const pick = (v: unknown): number | null => { if (typeof v === 'number' && members.has(v) && !used.has(v)) { used.add(v); return v; } return null; };
    const stack = p.stack === true;
    const photoId = pick(p.photoId);
    const photoId2 = stack ? pick(p.photoId2) : null;
    const c = p.crop && typeof p.crop === 'object' ? (p.crop as Record<string, unknown>) : null;
    const zoom = c ? Math.min(2.5, Math.max(1, num(c.zoom, 1))) : 1;
    // Older saves kept a focal point (fx, fy in 0..1): read it as the equivalent shift.
    const sh = (v: unknown, old: unknown) => Math.round(Math.min(50, Math.max(-50, v !== undefined ? num(v, 0) : old !== undefined ? (num(old, 0.5) - 0.5) * 100 : 0)));
    const shiftX = c ? sh(c.shiftX, c.fx) : 0, shiftY = c ? sh(c.shiftY, c.fy) : 0;
    const crop: Crop | undefined = c && (zoom > 1.005 || shiftX || shiftY) && !stack && photoId !== null ? { zoom: Math.round(zoom * 100) / 100, shiftX, shiftY } : undefined;
    prints.push({ ...(crop ? { crop } : {}), id: Math.max(1, Math.round(num(p.id, nextId))), size, orientation, frame, photoId, stack, photoId2, x: Math.max(-20000, Math.min(20000, Math.round(num(p.x)))), y: Math.max(-20000, Math.min(20000, Math.round(num(p.y)))) });
    nextId = Math.max(nextId, prints[prints.length - 1].id) + 1;
  }
  // Two prints must not share an id.
  const ids = new Set<number>();
  for (const p of prints) { while (ids.has(p.id)) p.id++; ids.add(p.id); }
  const ppi = typeof r.ppi === 'number' && Number.isFinite(r.ppi) && r.ppi >= PPI_MIN && r.ppi <= PPI_MAX && Math.round(r.ppi) !== 300 ? Math.round(r.ppi) : undefined;
  const bgScale = (r as { bg?: { mmPerPx?: unknown } }).bg?.mmPerPx;
  const bg = typeof bgScale === 'number' && Number.isFinite(bgScale) && bgScale >= 0.05 && bgScale <= 50 ? { mmPerPx: Math.round(bgScale * 1000) / 1000 } : undefined;
  return { mode: (MODES as readonly string[]).includes(String(r.mode)) ? (r.mode as Layout['mode']) : 'row', prints, ...(ppi ? { ppi } : {}), ...(bg ? { bg } : {}) };
}

/** The layout an older composition (a print size, a number of prints, chosen photographs) has, until it is edited. */
export function deriveLayout(target: { count?: number; size?: string; orientation?: string } | null, chosen: number[], portrait: (id: number) => boolean | null): Layout {
  const count = Math.max(chosen.length, Math.min(MAX_PRINTS, Math.round(target?.count ?? chosen.length ?? 1)), 1);
  const size = target?.size && PAPER[target.size] ? target.size : 'A3';
  const prints: Print[] = Array.from({ length: Math.min(count, MAX_PRINTS) }, (_, i) => {
    const photoId = chosen[i] ?? null;
    const orientation = target?.orientation === 'portrait' ? 'portrait' : target?.orientation === 'landscape' ? 'landscape' : photoId !== null && portrait(photoId) ? 'portrait' : 'landscape';
    return { id: i + 1, size, orientation, frame: null, photoId, stack: false, photoId2: null, x: 0, y: 0 } as Print;
  });
  return { mode: 'row', prints };
}

/** What the older fields (target) would say about this layout, for the parts of the app that still read them. */
export function targetOf(layout: Layout): { count: number; size: 'A4' | 'A3' | 'A2' | 'custom'; widthMm?: number; heightMm?: number; orientation: 'portrait' | 'landscape' | 'any'; ppi: number } {
  const sizes = new Map<string, number>();
  for (const p of layout.prints) sizes.set(p.size, (sizes.get(p.size) ?? 0) + 1);
  const top = [...sizes].sort((a, b) => b[1] - a[1] || area(b[0]) - area(a[0]))[0]?.[0] ?? 'A3';
  const o = new Set(layout.prints.map((p) => p.orientation));
  const std = top === 'A4' || top === 'A3' || top === 'A2';
  return { count: layout.prints.length, size: std ? (top as 'A4' | 'A3' | 'A2') : 'custom', ...(std ? {} : { widthMm: PAPER[top][0], heightMm: PAPER[top][1] }), orientation: o.size === 1 ? [...o][0] : 'any', ppi: layout.ppi ?? 300 };
}

export const chosenOf = (layout: Layout): number[] => layout.prints.flatMap((p) => [p.photoId, p.photoId2]).filter((x): x is number => x !== null);
