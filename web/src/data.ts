// Shared types and small helpers. All real data comes from the server (see api.ts).
export { checkTarget, parseTarget, printRatio, requiredPx, targetProblem, type Target } from './target';
import type { Target } from './target';

export type Tag = { name: string; kind: 'tag' | 'subject'; source: string; accepted: boolean };
export type Review = { session: number; date: string; rating: number; note?: string };
export type Swatch = { hex: string; pct: number; name: string };
export type PhotoLite = {
  id: number; title: string; file: string; shootId: number; w: number; h: number; ar: number; hasImage: boolean;
  capturedAt: string | null; camera: string; lens: string; exposure: string; iso: number | null; aperture: number | null; shutter: string; focalMm: number | null; medium: '' | 'digital' | 'film'; film: string; fileType: string; sizeMb: number;
  archived: boolean; missing: boolean; lastReviewedAt: string; nextReviewAt: string | null; reviewCount: number; avgRating: number;
  lat: number | null; lon: number | null; place: string; parentId: number | null;
  palette: Swatch[]; brightness: number | null; contrast: number | null; saturation: number | null;
  xmpRating: number | null; aiStatus: string | null; similarity?: number;
};
export type AiSuggestion = { description: string; subjects: string[]; tags: string[]; environment: string; composition: string; lighting: string; mood: string; model?: string } | null;
export type PhotoFull = PhotoLite & {
  tags: Tag[]; reviews: Review[]; description: string; descSource: string; aiSuggestion: AiSuggestion;
  variants: number[]; conflicts: { field: string; mine: string; theirs: string }[];
};
export type Shoot = {
  id: number; name: string; source: string; place: string; description: string; dateFrom: string | null; dateTo: string | null;
  dates: string; importedAt: string; count: number; coverId: number | null; reviewPct: number; sessions: number;
  /** Subjects and tags the shoot gives to every photograph in it. */
  subjects: string[]; tags: string[];
};
export type Collection = { id: number; name: string; description: string; theme: string; target: Target | null; photoIds: number[]; chosenIds: number[]; printedAt: string | null; layout: import('./layout').Layout; layoutSaved: boolean; /** A picture of a room behind the wall (size in pixels), if one is set. */ background?: { w: number; h: number; v: number } | null };

export const RATINGS = [
  { value: 1, emoji: '😐', label: 'meh' },
  { value: 2, emoji: '🙂', label: 'fine' },
  { value: 3, emoji: '😊', label: 'good' },
  { value: 4, emoji: '😄', label: 'great' },
  { value: 5, emoji: '😍', label: 'love' },
] as const;

/** Capture times have no timezone; they are the wall-clock time as written, so format them as is. */
export const fmtDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  iso ? new Date(iso).toLocaleDateString('en-AU', opts) : '';

export const fmtCoord = (lat: number, lon: number) => `${Math.abs(lat).toFixed(4)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(4)}°${lon < 0 ? 'W' : 'E'}`;
