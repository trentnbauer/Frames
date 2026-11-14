import { getSetting, setSetting, type DB } from './db.js';
import { INTERVAL_OPTIONS } from './schedule.js';
import { cleanGear, NO_GEAR, type Gear } from './gear.js';
import { PREVIEW_QUALITIES, PREVIEW_SIZES, runtime } from './policy.js';
import { aiType, BadSetting, getSource, isReady, whyNotReady } from './aisources.js';

export { BadSetting };

/** Reasons a photograph can appear in the To do list. The first four are on until switched off; the rest are opt-in so the list does not fill up. */
export const TODO_REASONS = ['camera', 'lens', 'location', 'time', 'subjects', 'tags', 'description', 'composition', 'light', 'mood'] as const;
const TODO_DEFAULT = ['location', 'subjects', 'tags', 'description'];

export type Settings = {
  sessions: number;
  intervals: string[];
  adaptive: boolean;
  archiveSuggest: boolean;
  autoRemove: boolean;
  autoRemoveBelow: number;
  autoRemoveAfter: number;
  /** Suggest taking out photographs whose average rating, after all their sessions, is below this (0 = never suggest). */
  deleteBelow: number;
  /** Which reasons put a photograph on the To do list (see TODO_REASONS). */
  todoReasons: string[];
  /** Camera details every new photograph starts with where the file has none (a photoshoot's own defaults win). */
  gear: Gear;
  /** The id of the AI source in use (Settings, AI), or '' for AI off. */
  aiActive: string;
  /** Worked out from the active source, never stored: 'off', or whether analysis stays on your network. */
  ai: 'off' | 'local' | 'external';
  /** Write approved metadata to .xmp sidecars next to the originals (needs the library mounted writable). */
  xmpWriteBack: boolean;
  /** How many photographs one review offers at once. */
  reviewSize: number;
  /** How ratings are drawn: faces from meh to love, or one to five stars. The stored rating is the same. */
  ratingStyle: 'emoji' | 'stars';
  /** Photographs from the newest shoots come first in a review. */
  newShootsFirst: boolean;
  /** Size and JPEG quality of the previews made for this person's photographs. Never above what the server allows (see previewSpec). */
  previewPx: number;
  previewQuality: number;
};

export const DEFAULT_SETTINGS: Settings = {
  // A photograph is reviewed four times in about a month: a week between each session.
  sessions: 4,
  intervals: ['1 week', '1 week', '1 week', '1 week'],
  adaptive: true,
  archiveSuggest: false,
  autoRemove: false,
  autoRemoveBelow: 2,
  autoRemoveAfter: 4,
  deleteBelow: 2,
  todoReasons: TODO_DEFAULT,
  gear: { ...NO_GEAR },
  aiActive: '',
  ai: 'off',
  xmpWriteBack: false,
  reviewSize: 12,
  ratingStyle: 'emoji',
  newShootsFirst: true,
  previewPx: 2400,
  previewQuality: 85,
};

/** The preview this person gets: their choice, held to the server's limits. */
export function previewSpec(db: DB): { px: number; quality: number } {
  const s = loadSettings(db);
  return { px: Math.min(s.previewPx, runtime.previewPx), quality: Math.min(s.previewQuality, runtime.previewQuality) };
}

export function loadSettings(db: DB): Settings {
  const s = { ...DEFAULT_SETTINGS, ...getSetting<Partial<Settings>>(db, 'settings', {}) };
  const src = s.aiActive ? getSource(db, s.aiActive) : undefined;
  s.ai = src && isReady(src) ? (aiType(src.type)!.local ? 'local' : 'external') : 'off';
  return s;
}

const short = (v: unknown, max: number) => String(v).trim().slice(0, max);

/** Validates untrusted input; unknown keys are dropped. */
export function saveSettings(db: DB, patch: Partial<Settings>): Settings {
  const cur = loadSettings(db);
  const next: Settings = { ...cur };
  if (patch.sessions !== undefined) next.sessions = Math.min(12, Math.max(1, Math.round(Number(patch.sessions)) || cur.sessions));
  if (Array.isArray(patch.intervals)) {
    const ok = patch.intervals.map(String).filter((i) => INTERVAL_OPTIONS.includes(i)).slice(0, 12);
    if (ok.length) next.intervals = ok;
  }
  if (typeof patch.adaptive === 'boolean') next.adaptive = patch.adaptive;
  if (patch.reviewSize !== undefined) next.reviewSize = Math.min(100, Math.max(3, Math.round(Number(patch.reviewSize)) || cur.reviewSize));
  if (patch.ratingStyle === 'emoji' || patch.ratingStyle === 'stars') next.ratingStyle = patch.ratingStyle;
  if (typeof patch.newShootsFirst === 'boolean') next.newShootsFirst = patch.newShootsFirst;
  if (typeof patch.archiveSuggest === 'boolean') next.archiveSuggest = patch.archiveSuggest;
  if (patch.autoRemove !== undefined) { if (typeof patch.autoRemove !== 'boolean') throw new BadSetting('Choose whether automatic removal is enabled.'); next.autoRemove = patch.autoRemove; }
  if (patch.autoRemoveBelow !== undefined) { const n = Number(patch.autoRemoveBelow); if (typeof patch.autoRemoveBelow !== 'number' || !Number.isFinite(n) || n < 1 || n > 4.5 || !Number.isInteger(n * 2)) throw new BadSetting('Automatic removal needs a threshold from 1 to 4.5 in half-point steps.'); next.autoRemoveBelow = n; }
  if (patch.autoRemoveAfter !== undefined) { const n = Number(patch.autoRemoveAfter); if (typeof patch.autoRemoveAfter !== 'number' || !Number.isInteger(n) || n < 1 || n > 12) throw new BadSetting('Automatic removal needs between 1 and 12 personal reviews.'); next.autoRemoveAfter = n; }
  if (patch.deleteBelow !== undefined) { const n = Number(patch.deleteBelow); next.deleteBelow = Number.isFinite(n) ? Math.min(4.5, Math.max(0, Math.round(n * 2) / 2)) : cur.deleteBelow; }
  if (patch.gear !== undefined) next.gear = cleanGear(patch.gear);
  if (Array.isArray(patch.todoReasons)) next.todoReasons = TODO_REASONS.filter((r) => (patch.todoReasons as unknown[]).includes(r));
  if (typeof patch.aiActive === 'string') {
    if (patch.aiActive === '') next.aiActive = '';
    else {
      const src = getSource(db, patch.aiActive);
      if (!src) throw new BadSetting('That AI is not set up');
      const why = whyNotReady(src);
      if (why) throw new BadSetting(`${why} before turning this AI on`);
      next.aiActive = src.id;
    }
  }
  if (typeof patch.xmpWriteBack === 'boolean') next.xmpWriteBack = patch.xmpWriteBack;
  if (PREVIEW_SIZES.includes(patch.previewPx as number)) next.previewPx = patch.previewPx as number;
  if (PREVIEW_QUALITIES.includes(patch.previewQuality as number)) next.previewQuality = patch.previewQuality as number;
  const { ai: _derived, ...stored } = next;
  setSetting(db, 'settings', stored);
  return loadSettings(db);
}
