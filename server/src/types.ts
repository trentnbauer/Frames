export type TagSource = 'ai_suggested' | 'user_confirmed' | 'user_added';
export type TaggingStatus = 'pending' | 'tagged' | 'failed' | 'skipped';
export type LightPref = 'any' | 'overcast' | 'raking_sun' | 'golden_hour' | 'dark' | 'night';
export type IdeaStatus = 'active' | 'done' | 'archived';

export interface PhotoRow {
  id: number;
  content_hash: string;
  original_path: string;
  thumb_path: string | null;
  display_path: string | null;
  filename: string;
  width: number | null;
  height: number | null;
  camera: string | null;
  lens: string | null;
  film_stock: string | null;
  location: string | null;
  photoshoot: string | null;
  season: string | null;
  tagging_status: TaggingStatus;
  tagging_error: string | null;
  palette: string | null;
  taken_at: string | null;
  latitude: number | null;
  longitude: number | null;
  is_favorite: number;
  phash: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface TagRow {
  id: number;
  slug: string;
  name: string;
}

export interface PhotoTagRow {
  photo_id: number;
  tag_id: number;
  source: TagSource;
  note: string | null;
  created_at: string;
}

export interface IdeaRow {
  id: number;
  title: string;
  notes: string | null;
  light_pref: LightPref;
  status: IdeaStatus;
  created_at: string;
  updated_at: string;
  zine_state: string | null;
}

export interface IdeaPhotoRow {
  idea_id: number;
  photo_id: number;
  position: number;
  why: string | null;
  created_at: string;
}

export interface ShotListItemRow {
  id: number;
  idea_id: number;
  text: string;
  done: number;
  created_at: string;
}

export type IdeaReferenceKind = 'image' | 'note';

export interface IdeaReferenceRow {
  id: number;
  idea_id: number;
  kind: IdeaReferenceKind;
  path: string | null;
  text: string | null;
  created_at: string;
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    // Trimming leading/trailing dashes with a plain `/^-+|-+$/` is the
    // textbook polynomial-ReDoS pattern (ambiguous where a trailing run can
    // start matching) — the negative lookbehind removes that ambiguity by
    // only allowing the trailing branch to start at the true beginning of
    // the run, same technique CodeQL's own docs recommend for the
    // equivalent whitespace-trim case.
    .replace(/^-+|(?<!-)-+$/g, '');
}
