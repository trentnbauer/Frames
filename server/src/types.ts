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
  film_stock: string | null;
  season: string | null;
  tagging_status: TaggingStatus;
  created_at: string;
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
}

export interface IdeaPhotoRow {
  idea_id: number;
  photo_id: number;
  position: number;
  why: string | null;
  created_at: string;
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
