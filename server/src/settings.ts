import { getSetting, setSetting, type DB } from './db.js';
import { INTERVAL_OPTIONS } from './schedule.js';
import { aiType, BadSetting, getSource, isReady, whyNotReady } from './aisources.js';

export { BadSetting };

export type Settings = {
  sessions: number;
  intervals: string[];
  adaptive: boolean;
  archiveSuggest: boolean;
  /** The id of the AI source in use (Settings, AI), or '' for AI off. */
  aiActive: string;
  /** Worked out from the active source, never stored: 'off', or whether analysis stays on your network. */
  ai: 'off' | 'local' | 'external';
  /** Write approved metadata to .xmp sidecars next to the originals (needs the library mounted writable). */
  xmpWriteBack: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  // A photograph is reviewed four times in about a month: a week between each session.
  sessions: 4,
  intervals: ['1 week', '1 week', '1 week', '1 week'],
  adaptive: true,
  archiveSuggest: false,
  aiActive: '',
  ai: 'off',
  xmpWriteBack: false,
};

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
  if (typeof patch.archiveSuggest === 'boolean') next.archiveSuggest = patch.archiveSuggest;
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
  const { ai: _derived, ...stored } = next;
  setSetting(db, 'settings', stored);
  return loadSettings(db);
}
