import sharp from 'sharp';

/** Image analysis that needs no AI: colour palette, perceptual hash and simple lighting measures. */

export type Swatch = { hex: string; pct: number; name: string };
export type Local = { dhash: string; palette: Swatch[]; colors: string; brightness: number; contrast: number; saturation: number };

export const COLOR_NAMES = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey'] as const;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function colorName(r: number, g: number, b: number): string {
  const [h, , l] = rgbToHsl(r, g, b);
  // Chroma (spread between the strongest and weakest channel) is the honest "how coloured is it" near black and white,
  // where HSL saturation swings wildly for a pixel like (255, 254, 254).
  const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  if (l < 0.12) return 'black';
  if (l > 0.86 && chroma < 0.16) return 'white';
  if (chroma < 0.1) return l > 0.82 ? 'white' : l < 0.18 ? 'black' : 'grey';
  if (h >= 15 && h < 45 && l < 0.42) return 'brown';
  if (h < 15 || h >= 345) return l > 0.7 ? 'pink' : 'red';
  if (h < 45) return 'orange';
  if (h < 68) return 'yellow';
  if (h < 165) return 'green';
  if (h < 200) return 'teal';
  if (h < 258) return 'blue';
  if (h < 292) return 'purple';
  return 'pink';
}

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** 64-bit difference hash as 16 hex characters. Near-identical images differ in only a few bits. */
async function dHash(input: Buffer | string): Promise<string> {
  const px = await sharp(input, { failOn: 'none' }).rotate().resize(9, 8, { fit: 'fill' }).greyscale().raw().toBuffer();
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] > px[y * 9 + x + 1] ? '1' : '0';
  let out = '';
  for (let i = 0; i < 64; i += 4) out += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return out;
}

const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}

/** For comparing many hashes: parse once, then count differing bits with integer maths. */
export const hashInts = (h: string): [number, number] => [parseInt(h.slice(0, 8), 16) >>> 0, parseInt(h.slice(8, 16), 16) >>> 0];
const pop32 = (v: number) => { v -= (v >>> 1) & 0x55555555; v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
export const hammingInts = (a: [number, number], b: [number, number]) => pop32((a[0] ^ b[0]) >>> 0) + pop32((a[1] ^ b[1]) >>> 0);

export async function analyseLocal(input: Buffer | string): Promise<Local> {
  const dhash = await dHash(input);
  const { data } = await sharp(input, { failOn: 'none' }).rotate().resize(48, 48, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let lumSum = 0, lumSq = 0, satSum = 0;
  const N = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    lumSum += lum; lumSq += lum * lum;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    satSum += mx === 0 ? 0 : (mx - mn) / mx;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    bins.set(key, e);
  }
  const mean = lumSum / N;
  // Pick the most common colours, skipping near-duplicates so the palette spans the picture.
  const picked: { r: number; g: number; b: number; n: number }[] = [];
  for (const e of [...bins.values()].sort((a, b) => b.n - a.n)) {
    const c = { r: Math.round(e.r / e.n), g: Math.round(e.g / e.n), b: Math.round(e.b / e.n), n: e.n };
    const near = picked.find((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < 48);
    if (near) near.n += c.n;
    else if (picked.length < 5) picked.push(c);
    else break;
  }
  const palette = picked.sort((a, b) => b.n - a.n).map((c) => ({ hex: hex(c.r, c.g, c.b), pct: Math.round((c.n / N) * 100), name: colorName(c.r, c.g, c.b) }));
  const names = [...new Set(palette.filter((p) => p.pct >= 8).map((p) => p.name))];
  return {
    dhash, palette,
    colors: ' ' + names.join(' ') + ' ',
    brightness: mean,
    contrast: Math.sqrt(Math.max(0, lumSq / N - mean * mean)),
    saturation: satSum / N,
  };
}

const rgbOf = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** 0 = same palette, 1 = opposite. Each colour is matched to the closest colour in the other palette. */
export function paletteDistance(a: Swatch[], b: Swatch[]): number {
  if (!a.length || !b.length) return 1;
  const one = (x: Swatch[], y: Swatch[]) => {
    let total = 0, w = 0;
    for (const s of x) {
      const [r, g, bl] = rgbOf(s.hex);
      let best = Infinity;
      for (const t of y) { const [r2, g2, b2] = rgbOf(t.hex); best = Math.min(best, Math.hypot(r - r2, g - g2, bl - b2)); }
      total += (best / 441.7) * s.pct; w += s.pct;
    }
    return w ? total / w : 1;
  };
  return (one(a, b) + one(b, a)) / 2;
}

export type Feat = { dhash: string | null; palette: Swatch[]; brightness: number | null; embedding?: Float32Array | null };

export function cosine(a: Float32Array, b: Float32Array): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

/** 0..1, higher = more alike. Uses AI embeddings when both photos have one, otherwise hash + palette + brightness. */
export function similarity(a: Feat, b: Feat): number {
  const local = 1 - (0.5 * (a.dhash && b.dhash ? hamming(a.dhash, b.dhash) / 64 : 0.5) + 0.4 * paletteDistance(a.palette, b.palette) + 0.1 * Math.abs((a.brightness ?? 0.5) - (b.brightness ?? 0.5)));
  if (a.embedding && b.embedding && a.embedding.length === b.embedding.length) {
    return 0.7 * Math.max(0, cosine(a.embedding, b.embedding)) + 0.3 * local;
  }
  return local;
}

/** Hue (0-360) of the strongest chromatic swatch, or null for a mostly neutral picture. */
export function dominantHue(p: Swatch[]): number | null {
  for (const s of p) {
    const [r, g, b] = rgbOf(s.hex);
    const [h, sat, l] = rgbToHsl(r, g, b);
    if (sat > 0.2 && l > 0.12 && l < 0.9) return h;
  }
  return null;
}
