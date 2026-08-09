export type TagSource = 'ai_suggested' | 'user_confirmed' | 'user_added';
export type TaggingStatus = 'pending' | 'tagged' | 'failed' | 'skipped';
export type LightPref = 'any' | 'overcast' | 'raking_sun' | 'golden_hour' | 'dark' | 'night';
export type IdeaStatus = 'active' | 'done' | 'archived';

export interface PhotoTag {
  id: number;
  slug: string;
  name: string;
  source: TagSource;
  note: string | null;
}

export interface Photo {
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
  tags: PhotoTag[];
}

export interface Tag {
  id: number;
  slug: string;
  name: string;
  photo_count: number;
}

export interface Idea {
  id: number;
  title: string;
  notes: string | null;
  light_pref: LightPref;
  status: IdeaStatus;
  created_at: string;
  photo_count?: number;
}

export interface IdeaPhoto extends Photo {
  why: string | null;
  position: number;
}

export const LIGHT_PREFS: LightPref[] = ['any', 'overcast', 'raking_sun', 'golden_hour', 'dark', 'night'];
