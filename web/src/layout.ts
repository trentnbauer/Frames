/**
 * The geometry of a composition: prints of different sizes on a wall, drawn to scale. All sizes are in millimetres.
 * (Mirrors server/src/layout.ts, which checks what is stored.)
 */
export const PAPER: Record<string, [number, number]> = {
  A5: [148, 210], A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841],
  '5×7″': [127, 178], '8×10″': [203, 254], '11×14″': [279, 356], '16×20″': [406, 508], '50×70': [500, 700],
};
export const GROUPS: [string, string[]][] = [['ISO paper', ['A5', 'A4', 'A3', 'A2', 'A1']], ['Photo & poster', ['5×7″', '8×10″', '11×14″', '16×20″', '50×70']]];
export const FRAMES: Record<string, string> = { black: '#151514', white: '#e9e7e1', oak: '#b08a5e', walnut: '#5b3f2c', silver: '#a3a3a0' };
export const MATS: Record<string, string> = { white: '#f4f2ec', ivory: '#e6dfcc', black: '#1a1a19' };
export const MOULD = 20; // the width of a frame's moulding
export const GAP = 60; // between prints
export const PAD = 40; // around the whole wall

export type Frame = { size: string; mat: string; color: string };
export type Orientation = 'portrait' | 'landscape';
/** A print holds one photograph, or (stack) two: two landscape photographs one above the other make a portrait print, two portrait ones side by side make a landscape one. */
/** How a photograph is cropped in its print, to see how it would look: zoomed in by `zoom` around the point (fx, fy), each 0 to 1. Only for looking: the original is never changed. */
export type Crop = { zoom: number; fx: number; fy: number };
export type Print = { crop?: Crop; id: number; size: string; orientation: Orientation; frame: Frame | null; photoId: number | null; stack: boolean; photoId2: number | null; x: number; y: number };
export type Mode = 'row' | 'grid' | 'feature' | 'free';
export type Layout = { mode: Mode; prints: Print[]; /** The sharpness wanted, in pixels per inch (300 when absent). A photograph below it is allowed, with a warning. */ ppi?: number };
type Photo = { w: number; h: number };

/** The colour of the wall the prints hang on: light enough that a black frame stands out from it. */
export const WALL_BG = '#33322f';
export const DEFAULT_PPI = 300;
/** The sharpness choices: pixels per inch at print size. 300 is print-quality; far-viewed large prints are fine with less. */
export const PPI_CHOICES = [300, 240, 200, 150, 100, 72];
export const pxOf = (k: string, ppi = DEFAULT_PPI): [number, number] => { const [a, b] = PAPER[k]; return [Math.round((a / 25.4) * ppi), Math.round((b / 25.4) * ppi)]; };
/** A print's width and height as hung (portrait: short side across). */
export const or = (size: string, o: Orientation): [number, number] => { const [s, l] = PAPER[size]; return o === 'portrait' ? [s, l] : [l, s]; };
export const mouldOf = (p: Print) => (p.frame && p.frame.color !== 'none' ? MOULD : 0);
/** The whole of a print on the wall: the print, or its frame with the moulding. */
export const dims = (p: Print): [number, number] => {
  if (!p.frame) return or(p.size, p.orientation);
  const [w, h] = or(p.frame.size, p.orientation), m = mouldOf(p);
  return [w + 2 * m, h + 2 * m];
};
export const fits = (frame: string, print: string) => PAPER[frame][0] >= PAPER[print][0] && PAPER[frame][1] >= PAPER[print][1];
export const area = (k: string) => PAPER[k][0] * PAPER[k][1];
/** The next size up that a print of size k fits in (the next in its own family first). */
export const nextUp = (k: string) => {
  const g = GROUPS.find(([, ks]) => ks.includes(k))![1];
  const up = g.find((x) => x !== k && fits(x, k));
  return up || Object.keys(PAPER).filter((x) => x !== k && fits(x, k)).sort((a, b) => area(a) - area(b))[0] || k;
};
export const sizeName = (k: string) => (k === '50×70' ? '50×70 cm' : k);
export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Lays prints out, setting x and y: in a row, a grid, or one big print with the rest stacked beside it. */
export function arrange(prints: Print[], mode: Mode): Print[] {
  const out = prints.map((p) => ({ ...p })), d = out.map(dims);
  if (!out.length) return out;
  if (mode === 'feature' && out.length > 1) {
    const [w0, h0] = d[0], rest = d.slice(1);
    const colW = Math.max(...rest.map((x) => x[0])), colH = rest.reduce((a, x) => a + x[1], 0) + GAP * (rest.length - 1);
    const H = Math.max(h0, colH);
    out[0].x = 0; out[0].y = (H - h0) / 2;
    let y = (H - colH) / 2;
    for (let i = 1; i < out.length; i++) { out[i].x = w0 + GAP + (colW - d[i][0]) / 2; out[i].y = y; y += d[i][1] + GAP; }
  } else if (mode === 'grid' && out.length > 2) {
    const cols = Math.ceil(Math.sqrt(out.length)), cw = Math.max(...d.map((x) => x[0])), ch = Math.max(...d.map((x) => x[1]));
    out.forEach((p, i) => { const c = i % cols, r = Math.floor(i / cols); p.x = c * (cw + GAP) + (cw - d[i][0]) / 2; p.y = r * (ch + GAP) + (ch - d[i][1]) / 2; });
  } else {
    const H = Math.max(...d.map((x) => x[1])); let x = 0;
    out.forEach((p, i) => { p.x = x; p.y = (H - d[i][1]) / 2; x += d[i][0] + GAP; });
  }
  return out;
}
export function bounds(prints: Print[]) {
  if (!prints.length) return { x0: 0, y0: 0, w: 600, h: 400 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  prints.forEach((p) => { const [w, h] = dims(p); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + w); y1 = Math.max(y1, p.y + h); });
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}
export type Frame2D = ReturnType<typeof bounds> & { pad: number; W: number; H: number };
export const frameOf = (prints: Print[], pad: number): Frame2D => { const b = bounds(prints); return { ...b, pad, W: b.w + 2 * pad, H: b.h + 2 * pad }; };
const pct = (v: number) => `${v}%`;
/** Each print's box as percentages of the wall, for drawing. */
export const rectsIn = (prints: Print[], f: Frame2D) => prints.map((p) => { const [w, h] = dims(p); return { left: pct(((p.x - f.x0 + f.pad) / f.W) * 100), top: pct(((p.y - f.y0 + f.pad) / f.H) * 100), width: pct((w / f.W) * 100), height: pct((h / f.H) * 100) }; });
export const metres = (mm: number) => (mm / 1000).toFixed(2);

/** The photographs a print holds, in order (one, or two when stacked). */
export const photosOf = (p: Print): number[] => [p.photoId, p.stack ? p.photoId2 : null].filter((x): x is number => x !== null);
/** The size of the space one photograph fills, in mm: the whole print, or half of it when stacked (the top and bottom of a portrait print, the left and right of a landscape one). */
export const cellOf = (p: Print): [number, number] => { const [w, h] = or(p.size, p.orientation); return p.stack ? (p.orientation === 'portrait' ? [w, h / 2] : [w / 2, h]) : [w, h]; };

/** Why this photograph cannot go in this print, or null: it is the wrong way round. (Too few pixels is not a reason to refuse: see lowRes.) */
export function problem(photo: Photo | null | undefined, print: Print | null | undefined): string | null {
  if (!photo || !print) return null;
  const portrait = photo.h > photo.w;
  const [cw, ch] = cellOf(print), wantPortrait = ch > cw;
  if (print.stack) {
    if (wantPortrait && !portrait) return `Landscape. A ${print.orientation} stack takes two portrait photographs side by side.`;
    if (!wantPortrait && portrait) return `Portrait. A ${print.orientation} stack takes two landscape photographs, one above the other.`;
  } else {
    if (print.orientation === 'portrait' && !portrait) return 'Landscape. This print is portrait.';
    if (print.orientation === 'landscape' && portrait) return 'Portrait. This print is landscape.';
  }
  return null;
}

/** The pixels per inch this photograph would print at in this print (the space it fills: the whole print, or half when stacked), or null when its size is not known. */
export function ppiOf(photo: Photo | null | undefined, print: Print | null | undefined): number | null {
  if (!photo || !print || !photo.w || !photo.h) return null;
  const [cw, ch] = cellOf(print), portrait = photo.h > photo.w;
  const [shortMm, longMm] = [Math.min(cw, ch), Math.max(cw, ch)];
  const [wMm, hMm] = portrait ? [shortMm, longMm] : [longMm, shortMm];
  return Math.round(Math.min(photo.w / (wMm / 25.4), photo.h / (hMm / 25.4)));
}

/** A warning when this photograph has fewer pixels than `target` PPI asks for at this size, else null. It can still be used. */
export function lowRes(photo: Photo | null | undefined, print: Print | null | undefined, target = DEFAULT_PPI): string | null {
  const ppi = ppiOf(photo, print);
  if (ppi === null || !photo || !print || ppi >= target) return null;
  return `${photo.w} × ${photo.h} px is ${ppi} PPI ${print.stack ? 'in half of ' : 'in '}${sizeName(print.size)}, below the ${target} wanted. It may look soft.`;
}

export const PRESETS: { key: string; label: string; mode: Mode; prints: [string, Orientation, string | null][] }[] = [
  { key: 'single', label: 'Single', mode: 'row', prints: [['50×70', 'landscape', null]] },
  { key: 'pair', label: 'Pair', mode: 'row', prints: [['8×10″', 'portrait', '11×14″'], ['8×10″', 'portrait', '11×14″']] },
  { key: 'triptych', label: 'Triptych', mode: 'row', prints: [['A4', 'portrait', 'A3'], ['A4', 'portrait', 'A3'], ['A4', 'portrait', 'A3']] },
  { key: 'feature', label: 'Feature', mode: 'feature', prints: [['A2', 'landscape', 'A2'], ['A5', 'portrait', 'A4'], ['A5', 'portrait', 'A4']] },
  { key: 'grid', label: 'Grid', mode: 'grid', prints: [['A4', 'landscape', 'A4'], ['A4', 'landscape', 'A4'], ['A4', 'landscape', 'A4'], ['A4', 'landscape', 'A4']] },
];
let uid = 1000;
export const newPrintId = () => uid++;
export const fromPreset = (pr: (typeof PRESETS)[number]): Print[] => pr.prints.map(([size, orientation, f], i) => ({ id: i + 1, size, orientation, frame: f ? { size: f, mat: 'white', color: 'black' } : null, photoId: null, stack: false, photoId2: null, x: 0, y: 0 }));

/** What to buy for these prints: the frames (and their mount boards), and the prints to order. */
export function shoppingList(prints: Print[], ppi = DEFAULT_PPI) {
  const fr = new Map<string, number>(), pr = new Map<string, number>();
  prints.forEach((p) => {
    pr.set(p.size, (pr.get(p.size) || 0) + 1);
    if (!p.frame) return;
    const k = `${p.frame.size}|${p.frame.color}|${p.frame.size === p.size ? '' : `${p.frame.mat}|${p.size}`}`;
    fr.set(k, (fr.get(k) || 0) + 1);
  });
  const frames = [...fr].map(([k, q]) => {
    const [fs, color, mat, ps] = k.split('|'), [fw, fh] = PAPER[fs];
    const mount = mat ? `${cap(mat)} mount board, cut for ${sizeName(ps)} (opening ${PAPER[ps][0] - 5} × ${PAPER[ps][1] - 5} mm)` : 'No mount board. The print fills the frame';
    return { qty: `${q} ×`, title: `${sizeName(fs)} frame, ${color}`, detail: mount, size: `${fw + 2 * MOULD} × ${fh + 2 * MOULD} mm outside`, swatch: FRAMES[color] ?? 'transparent' };
  });
  const posters = prints.filter((p) => !p.frame).length;
  const printsList = [...pr].map(([k, q]) => ({ qty: `${q} ×`, title: `${sizeName(k)} print`, detail: `${PAPER[k].join(' × ')} mm · ${pxOf(k, ppi).join(' × ')} px at ${ppi} PPI` }));
  const text = ['Frames to buy', ...frames.map((f) => `${f.qty} ${f.title} (${f.size}). ${f.detail}`), ...(posters ? [`${posters} × poster hanging (no frame)`] : []), '', 'Prints to order', ...printsList.map((p) => `${p.qty} ${p.title}, ${p.detail}`)].join('\n');
  return { frames, posters, printsList, text };
}

/** "3 prints · A4, 2 × A3 · 1 framed". */
export function printsSummary(prints: Print[]) {
  const counts = new Map<string, number>();
  prints.forEach((p) => counts.set(p.size, (counts.get(p.size) || 0) + 1));
  const sizes = [...counts].map(([k, c]) => (c > 1 ? `${c} × ${sizeName(k)}` : sizeName(k))).join(', ');
  return `${prints.length} ${prints.length === 1 ? 'print' : 'prints'} · ${sizes} · ${prints.filter((p) => p.frame).length} framed`;
}

type Dims = (id: number) => Photo | undefined;
/** Which place in this print the next photograph takes: the only place, or for a stack the first empty one (else the second). */
const slotFor = (p: Print): 0 | 1 => (p.stack && p.photoId !== null ? 1 : 0);
const getAt = (p: Print, s: 0 | 1) => (s === 0 ? p.photoId : p.stack ? p.photoId2 : null);
const setAt = (p: Print, s: 0 | 1, v: number | null) => { if (s === 0) { if (p.photoId !== v) delete p.crop; p.photoId = v; } else p.photoId2 = v; };
const clonePrint = (p: Print): Print => ({ ...p, frame: p.frame ? { ...p.frame } : null });

/**
 * Puts photograph `pid` in print `i`. One already in another print swaps places with whatever was in the way (if that fits where it
 * goes, else that place is left empty). Returns the new prints, or null prints with the reason it does not fit.
 */
export function place(prints: Print[], i: number, pid: number, photo: Dims, ppi = DEFAULT_PPI): { prints: Print[] | null; note: string; warn: string } {
  const target = prints[i];
  if (!target) return { prints: null, note: '', warn: '' };
  const bad = problem(photo(pid), target);
  if (bad) return { prints: null, note: bad, warn: '' };
  const warn = lowRes(photo(pid), target, ppi) ?? ''; // too few pixels is allowed, with a warning
  const out = prints.map(clonePrint);
  const slot = slotFor(out[i]);
  const from = findPhoto(out, pid);
  if (from && from.index === i && from.slot === slot) return { prints: out, note: '', warn };
  const was = getAt(out[i], slot);
  setAt(out[i], slot, pid);
  if (from) {
    // The photograph moved: the one it displaced takes its old place, if it fits there.
    const back = was !== null && !problem(photo(was), out[from.index]) ? was : null;
    setAt(out[from.index], from.slot, back);
  }
  return { prints: out, note: '', warn };
}
/** Takes a photograph out of whichever print holds it. */
export const unplace = (prints: Print[], pid: number): Print[] => prints.map((p) => ({ ...clonePrint(p), photoId: p.photoId === pid ? null : p.photoId, photoId2: p.photoId2 === pid ? null : p.photoId2 }));
/** Which print (and place) holds this photograph, or null. */
export function findPhoto(prints: Print[], pid: number): { index: number; slot: 0 | 1 } | null {
  for (let j = 0; j < prints.length; j++) for (const s of [0, 1] as const) if (getAt(prints[j], s) === pid) return { index: j, slot: s };
  return null;
}
/** Every photograph the layout holds, in print order. */
export const chosenIn = (prints: Print[]): number[] => prints.flatMap(photosOf);
