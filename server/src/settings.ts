import { getSetting, setSetting, type DB } from './db.js';
import { INTERVAL_OPTIONS } from './schedule.js';

export type Settings = {
  sessions: number;
  intervals: string[];
  adaptive: boolean;
  archiveSuggest: boolean;
  ai: 'off' | 'local' | 'external';
  aiEndpoint: string;
};

export const DEFAULT_SETTINGS: Settings = {
  sessions: 6,
  intervals: ['1 day', '1 week', '1 month', '3 months', '6 months', '1 year'],
  adaptive: true,
  archiveSuggest: false,
  // The AI analysis pipeline is not built yet; the setting is stored so the UI and later work can use it.
  ai: 'off',
  aiEndpoint: '',
};

export const loadSettings = (db: DB): Settings => ({ ...DEFAULT_SETTINGS, ...getSetting<Partial<Settings>>(db, 'settings', {}) });

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
  if (typeof patch.archiveSuggest === 'boolean') next.archiveSuggest = patch.archiveSuggest;
  if (patch.ai === 'off' || patch.ai === 'local' || patch.ai === 'external') next.ai = patch.ai;
  if (typeof patch.aiEndpoint === 'string') next.aiEndpoint = patch.aiEndpoint.slice(0, 300);
  setSetting(db, 'settings', next);
  return next;
}
