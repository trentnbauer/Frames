// Mock data. No backend exists yet; everything here is illustrative and should be replaced by API calls.

export type Tag = { name: string; source: 'user' | 'ai'; accepted: boolean };
export type Review = { session: number; date: string; rating: number; note?: string };
export type Photo = {
  id: number;
  title: string;
  file: string;
  shootId: string;
  ar: number; // width / height
  w: number;
  h: number;
  hue: number;
  capturedAt: string;
  camera: string;
  lens: string;
  exposure: string;
  fileType: string;
  sizeMb: number;
  tags: Tag[];
  reviews: Review[];
};
export type Shoot = {
  id: string;
  name: string;
  source: string;
  place: string;
  dates: string;
  reviewPct: number;
};
export type Target = {
  count: number;
  size: 'A4' | 'A3' | 'A2';
  orientation: 'portrait' | 'landscape' | 'any';
  ppi: number;
};
export type Collection = {
  id: string;
  name: string;
  description: string;
  target: Target | null;
  photoIds: number[];
  chosenIds: number[];
};

export const RATINGS = [
  { value: 1, emoji: '😐', label: 'meh' },
  { value: 2, emoji: '🙂', label: 'fine' },
  { value: 3, emoji: '😊', label: 'good' },
  { value: 4, emoji: '😄', label: 'great' },
  { value: 5, emoji: '😍', label: 'love' },
] as const;

export const SHOOTS: Shoot[] = [
  { id: 's1', name: 'Fog studies', source: 'X-T5 · SD card import', place: 'Point Reyes', dates: '12–14 Oct 2026', reviewPct: 50 },
  { id: 's2', name: 'Harbour nights', source: 'Roll 14 · Portra 400 · Nikon FM2', place: 'Fremantle', dates: '2 Sep 2026', reviewPct: 33 },
  { id: 's3', name: 'Salt flats', source: 'X-T5 · SD card import', place: 'Lake Eyre', dates: '18 Jun 2026', reviewPct: 100 },
  { id: 's4', name: 'Market, early', source: 'Roll 12 · HP5 · Leica M6', place: 'Hobart', dates: '4 Apr 2026', reviewPct: 100 },
  { id: 's5', name: 'Winter orchard', source: 'X-T5 · cloud sync', place: 'Huon Valley', dates: '9 Jul 2025', reviewPct: 83 },
  { id: 's6', name: 'Coastal road', source: 'X-T5 · SD card import', place: 'Great Ocean Road', dates: '21 Feb 2025', reviewPct: 100 },
];

const ARS = [1.5, 0.667, 1.5, 1.333, 0.8, 1.5, 1.778, 0.667, 1.5, 1.0, 1.5, 0.75];
const TITLES = [
  'Heron in fog, low tide', 'Jetty, first light', 'Wet road at dusk', 'Pylon and mist', 'Boat shed door',
  'Tide line', 'Gulls leaving', 'Dune grass', 'Lamp and rain', 'Quiet cove', 'Fence in fog', 'Reeds at dawn',
];
const TAGS = ['fog', 'water', 'birds', 'dusk', 'architecture', 'coast', 'long exposure', 'minimal'];

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

export const PHOTOS: Photo[] = (() => {
  const r = rng(7);
  return Array.from({ length: 64 }, (_, i) => {
    const ar = ARS[i % ARS.length];
    const long = r() > 0.35 ? 6240 : 4272;
    const w = ar >= 1 ? long : Math.round(long * ar);
    const h = ar >= 1 ? Math.round(long / ar) : long;
    const nReviews = i % 6 === 0 ? 1 : i % 5 === 0 ? 3 : 6;
    const base = 2 + Math.floor(r() * 3);
    const reviews: Review[] = Array.from({ length: nReviews }, (_, k) => ({
      session: k + 1,
      date: ['3 Oct', '10 Oct', '10 Nov', '10 Feb', '10 Aug', '2 Nov'][k] ?? '2 Nov',
      rating: Math.max(1, Math.min(5, base + (k > 2 && i % 3 === 0 ? 1 : 0) + (r() > 0.7 ? 1 : 0) - (r() > 0.8 ? 1 : 0))),
      note: k === nReviews - 1 && i % 4 === 0 ? 'Still the quietest frame of the day.' : undefined,
    }));
    const t = [TAGS[i % TAGS.length], TAGS[(i + 3) % TAGS.length], TAGS[(i + 5) % TAGS.length]];
    return {
      id: i + 1,
      title: TITLES[i % TITLES.length],
      file: `DSCF${String(2400 + i * 7).padStart(4, '0')}.${i % 7 === 0 ? 'TIF' : 'RAF'}`,
      shootId: SHOOTS[i % SHOOTS.length].id,
      ar, w, h,
      hue: Math.floor(r() * 60) + 180,
      capturedAt: `${12 + (i % 3)} Oct 2026, 0${5 + (i % 3)}:${10 + i}`,
      camera: 'Fujifilm X-T5',
      lens: 'XF 56mm f/1.2',
      exposure: `1/${[250, 125, 500, 60][i % 4]}s · f/${[2.8, 4, 5.6, 8][i % 4]} · ISO ${[160, 200, 400, 800][i % 4]}`,
      fileType: i % 7 === 0 ? 'TIFF' : 'RAF',
      sizeMb: 24 + (i % 9) * 6,
      tags: [
        { name: t[0], source: 'user', accepted: true },
        { name: t[1], source: 'ai', accepted: i % 2 === 0 },
        { name: t[2], source: 'ai', accepted: false },
      ],
      reviews,
    };
  });
})();

export const COLLECTIONS: Collection[] = [
  {
    id: 'c1',
    name: 'Coastline print run',
    description: 'Fog, water and quiet light along the coast. Three to hang as a set.',
    target: { count: 3, size: 'A3', orientation: 'portrait', ppi: 300 },
    photoIds: [2, 8, 5, 14, 20, 11, 3, 17, 26, 32, 38, 44],
    chosenIds: [2, 8],
  },
  {
    id: 'c2',
    name: 'Fog over beaches',
    description: 'Open-ended. No print target.',
    target: null,
    photoIds: [1, 4, 7, 10, 13, 16],
    chosenIds: [],
  },
];

export const PAPER_MM = { A4: [210, 297], A3: [297, 420], A2: [420, 594] } as const;

/** Minimum pixels needed for a paper size at a given PPI, in portrait (short side first). */
export function requiredPx(size: Target['size'], ppi: number): [number, number] {
  const [a, b] = PAPER_MM[size];
  return [Math.round((a / 25.4) * ppi), Math.round((b / 25.4) * ppi)];
}

/** Returns null if the photo meets the target, else a plain-language reason. */
export function targetProblem(p: Pick<Photo, 'w' | 'h'>, t: Target | null): string | null {
  if (!t) return null;
  const portrait = p.h > p.w;
  if (t.orientation === 'portrait' && !portrait) return 'Landscape. Target is portrait.';
  if (t.orientation === 'landscape' && portrait) return 'Portrait. Target is landscape.';
  const [short, long] = requiredPx(t.size, t.ppi);
  const needW = portrait || t.orientation === 'portrait' ? short : long;
  const needH = portrait || t.orientation === 'portrait' ? long : short;
  const pw = portrait ? needW : Math.max(needW, needH);
  const ph = portrait ? needH : Math.min(needW, needH);
  if (p.w < pw || p.h < ph) {
    return `${p.w} × ${p.h} px. ${t.size} at ${t.ppi} PPI needs ${pw} × ${ph}.`;
  }
  return null;
}

export const avg = (rs: Review[]) => (rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : 0);

export const photoById = (id: number) => PHOTOS.find((p) => p.id === id)!;
export const shootById = (id: string) => SHOOTS.find((s) => s.id === id)!;
