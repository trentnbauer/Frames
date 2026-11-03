// Shared types and the pure print-suitability maths. All real data comes from the server (see api.ts).

export type Tag = { name: string; source: 'user' | 'ai'; accepted: boolean };
export type Review = { session: number; date: string; rating: number; note?: string };
export type PhotoLite = {
  id: number; title: string; file: string; shootId: number; w: number; h: number; ar: number; hasImage: boolean;
  capturedAt: string | null; camera: string; lens: string; exposure: string; fileType: string; sizeMb: number;
  archived: boolean; missing: boolean; nextReviewAt: string | null; reviewCount: number; avgRating: number;
};
export type PhotoFull = PhotoLite & { tags: Tag[]; reviews: Review[] };
export type Shoot = {
  id: number; name: string; source: string; place: string; dates: string; importedAt: string;
  count: number; coverId: number | null; reviewPct: number; sessions: number;
};
export type Target = { count: number; size: 'A4' | 'A3' | 'A2'; orientation: 'portrait' | 'landscape' | 'any'; ppi: number };
export type Collection = { id: number; name: string; description: string; target: Target | null; photoIds: number[]; chosenIds: number[] };

export const RATINGS = [
  { value: 1, emoji: '😐', label: 'meh' },
  { value: 2, emoji: '🙂', label: 'fine' },
  { value: 3, emoji: '😊', label: 'good' },
  { value: 4, emoji: '😄', label: 'great' },
  { value: 5, emoji: '😍', label: 'love' },
] as const;

export const PAPER_MM = { A4: [210, 297], A3: [297, 420], A2: [420, 594] } as const;

/** Minimum pixels needed for a paper size at a given PPI, short side first. */
export function requiredPx(size: Target['size'], ppi: number): [number, number] {
  const [a, b] = PAPER_MM[size];
  return [Math.round((a / 25.4) * ppi), Math.round((b / 25.4) * ppi)];
}

/** Returns null if the photo meets the target, else a plain-language reason. */
export function targetProblem(p: Pick<PhotoLite, 'w' | 'h'>, t: Target | null): string | null {
  if (!t) return null;
  if (!p.w || !p.h) return 'Pixel size unknown.';
  const portrait = p.h > p.w;
  if (t.orientation === 'portrait' && !portrait) return 'Landscape. Target is portrait.';
  if (t.orientation === 'landscape' && portrait) return 'Portrait. Target is landscape.';
  const [short, long] = requiredPx(t.size, t.ppi);
  const [needW, needH] = portrait ? [short, long] : [long, short];
  if (p.w < needW || p.h < needH) return `${p.w} × ${p.h} px. ${t.size} at ${t.ppi} PPI needs ${needW} × ${needH}.`;
  return null;
}

export const fmtDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  iso ? new Date(iso).toLocaleDateString('en-AU', opts) : '';
