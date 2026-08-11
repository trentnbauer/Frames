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
  lens: string | null;
  film_stock: string | null;
  location: string | null;
  photoshoot: string | null;
  season: string | null;
  tagging_status: TaggingStatus;
  tagging_error: string | null;
  palette: string[] | null;
  created_at: string;
  deleted_at: string | null;
  tags: PhotoTag[];
}

export interface Tag {
  id: number;
  slug: string;
  name: string;
  photo_count: number;
}

export type NudgeType = 'idle_idea' | 'stalled' | 'ready_to_finish';

export interface Nudge {
  type: NudgeType;
  message: string;
}

export interface Idea {
  id: number;
  title: string;
  notes: string | null;
  light_pref: LightPref;
  status: IdeaStatus;
  created_at: string;
  updated_at: string;
  photo_count?: number;
  nudge?: Nudge | null;
  zine_state?: string | null;
}

export interface IdeaPhoto extends Photo {
  why: string | null;
  position: number;
}

export const LIGHT_PREFS: LightPref[] = ['any', 'overcast', 'raking_sun', 'golden_hour', 'dark', 'night'];

export type VisionProviderType = 'openai' | 'anthropic' | 'gemini' | 'self_hosted';

export interface VisionProviderProfile {
  id: number;
  name: string;
  type: VisionProviderType;
  base_url: string | null;
  model: string | null;
  enabled: boolean;
  hasApiKey: boolean;
  created_at: string;
}

export interface ComboSuggestion {
  type: 'tag_location' | 'camera_location' | 'tag_tag' | 'tag_season' | 'tag_film_stock';
  main: string;
  slug?: string;
  connector: string;
  secondary: string;
  secondarySlug?: string;
  count: number;
}

export interface ShootOptions {
  camera: string[];
  lens: string[];
  film_stock: string[];
  location: string[];
  photoshoot: string[];
}

