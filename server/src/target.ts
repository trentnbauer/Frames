export type Target = {
  count: number;
  size: 'A4' | 'A3' | 'A2' | 'custom' | 'none';
  widthMm?: number; // custom size, short side
  heightMm?: number; // custom size, long side
  orientation: 'portrait' | 'landscape' | 'any';
  ppi: number;
  minWidth?: number; // minimum pixels, either orientation
  minHeight?: number;
  aspect?: string; // "3:2", long side first
  aspectMode?: 'preferred' | 'required';
};

export const PAPER_MM: Record<string, readonly [number, number]> = { A4: [210, 297], A3: [297, 420], A2: [420, 594] };
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);

/** Untrusted input in, a clean target (or null) out. */
export function parseTarget(t: any): Target | null {
  if (t === null || t === undefined) return null;
  const size = ['A4', 'A3', 'A2', 'custom', 'none'].includes(t.size) ? t.size : 'A3';
  const out: Target = {
    count: Math.max(1, Math.min(500, Math.round(num(t.count, 1)))),
    size,
    orientation: ['portrait', 'landscape', 'any'].includes(t.orientation) ? t.orientation : 'any',
    ppi: Math.min(1200, Math.max(72, Math.round(num(t.ppi, 300)))),
  };
  if (size === 'custom') {
    const a = num(t.widthMm, 0), b = num(t.heightMm, 0);
    out.widthMm = Math.min(a, b) > 0 ? Math.min(a, b) : 210;
    out.heightMm = Math.max(a, b) > 0 ? Math.max(a, b) : 297;
  }
  if (num(t.minWidth, 0) > 0) out.minWidth = Math.min(100000, Math.round(num(t.minWidth, 0)));
  if (num(t.minHeight, 0) > 0) out.minHeight = Math.min(100000, Math.round(num(t.minHeight, 0)));
  const m = /^(\d{1,3}(?:\.\d+)?):(\d{1,3}(?:\.\d+)?)$/.exec(String(t.aspect ?? '').trim());
  if (m && Number(m[1]) > 0 && Number(m[2]) > 0) {
    out.aspect = `${Math.max(+m[1], +m[2])}:${Math.min(+m[1], +m[2])}`;
    out.aspectMode = t.aspectMode === 'required' ? 'required' : 'preferred';
  }
  return out;
}

const sizeMm = (t: Target): readonly [number, number] | null =>
  t.size === 'none' ? null : t.size === 'custom' ? [t.widthMm ?? 210, t.heightMm ?? 297] : PAPER_MM[t.size];

/** Pixels needed for the print size at the target PPI, short side first. Null when there is no print size. */
export function requiredPx(t: Target): [number, number] | null {
  const mm = sizeMm(t);
  return mm ? [Math.round((mm[0] / 25.4) * t.ppi), Math.round((mm[1] / 25.4) * t.ppi)] : null;
}

const ratioOf = (a: string) => { const [x, y] = a.split(':').map(Number); return x / y; };

/**
 * Why a photo does not meet the target, in plain language, or null if it does.
 * `note` is advice that does not fail the photo (a preferred aspect ratio that means cropping).
 */
export function checkTarget(p: { w: number; h: number }, t: Target | null): { problem: string | null; note: string | null } {
  if (!t) return { problem: null, note: null };
  if (!p.w || !p.h) return { problem: 'Pixel size unknown.', note: null };
  const portrait = p.h > p.w;
  if (t.orientation === 'portrait' && !portrait) return { problem: 'Landscape. Target is portrait.', note: null };
  if (t.orientation === 'landscape' && portrait) return { problem: 'Portrait. Target is landscape.', note: null };
  const long = Math.max(p.w, p.h), short = Math.min(p.w, p.h);
  let note: string | null = null;
  if (t.aspect) {
    const want = ratioOf(t.aspect), have = long / short;
    if (Math.abs(have - want) / want > 0.02) {
      const msg = `Aspect ${have.toFixed(2)}:1. Target is ${t.aspect}.`;
      if (t.aspectMode === 'required') return { problem: msg, note: null };
      note = `${msg} It will need cropping.`;
    }
  }
  if (t.minWidth || t.minHeight) {
    const needLong = Math.max(t.minWidth ?? 0, t.minHeight ?? 0), needShort = Math.min(t.minWidth || Infinity, t.minHeight || Infinity);
    if (long < needLong || short < (Number.isFinite(needShort) ? needShort : 0)) return { problem: `${p.w} × ${p.h} px. Needs at least ${t.minWidth ?? '–'} × ${t.minHeight ?? '–'} px.`, note: null };
  }
  const req = requiredPx(t);
  if (req) {
    const [needW, needH] = portrait ? [req[0], req[1]] : [req[1], req[0]];
    if (p.w < needW || p.h < needH) return { problem: `${p.w} × ${p.h} px. ${t.size === 'custom' ? `${t.widthMm}×${t.heightMm} mm` : t.size} at ${t.ppi} PPI needs ${needW} × ${needH}.`, note: null };
  }
  return { problem: null, note };
}

export const targetProblem = (p: { w: number; h: number }, t: Target | null) => checkTarget(p, t).problem;
