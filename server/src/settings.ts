import { getSetting, setSetting, type DB } from './db.js';
import { INTERVAL_OPTIONS } from './schedule.js';

export type Settings = {
  sessions: number;
  intervals: string[];
  adaptive: boolean;
  archiveSuggest: boolean;
  ai: 'off' | 'local' | 'external';
  aiEndpoint: string;
  aiModel: string;
  aiEmbedModel: string;
  /** The user has read that external analysis sends previews to a third party. Required before it can be switched on. */
  aiExternalAck: boolean;
  /** Write approved metadata to .xmp sidecars next to the originals (needs the library mounted writable). */
  xmpWriteBack: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  sessions: 6,
  intervals: ['1 day', '1 week', '1 month', '3 months', '6 months', '1 year'],
  adaptive: true,
  archiveSuggest: false,
  ai: 'off',
  aiEndpoint: '',
  aiModel: '',
  aiEmbedModel: '',
  aiExternalAck: false,
  xmpWriteBack: false,
};

export class BadSetting extends Error { statusCode = 400; }

export const loadSettings = (db: DB): Settings => ({ ...DEFAULT_SETTINGS, ...getSetting<Partial<Settings>>(db, 'settings', {}) });

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
  if (patch.ai === 'off' || patch.ai === 'local' || patch.ai === 'external') next.ai = patch.ai;
  if (typeof patch.aiEndpoint === 'string') {
    const e = patch.aiEndpoint.trim();
    if (e) {
      let u: URL;
      try { u = new URL(e); } catch { throw new BadSetting('The AI address is not a valid URL'); }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BadSetting('The AI address must start with http:// or https://');
      next.aiEndpoint = e.slice(0, 300);
    } else next.aiEndpoint = '';
  }
  if (typeof patch.aiModel === 'string') next.aiModel = short(patch.aiModel, 100);
  if (typeof patch.aiEmbedModel === 'string') next.aiEmbedModel = short(patch.aiEmbedModel, 100);
  if (typeof patch.aiExternalAck === 'boolean') next.aiExternalAck = patch.aiExternalAck;
  if (typeof patch.xmpWriteBack === 'boolean') next.xmpWriteBack = patch.xmpWriteBack;
  if (next.ai !== 'off' && (!next.aiEndpoint || !next.aiModel)) throw new BadSetting('Choose an address and a model before turning AI on');
  if (next.ai === 'external' && !next.aiExternalAck) throw new BadSetting('Confirm that previews will be sent to a third party before using an external provider');
  setSetting(db, 'settings', next);
  return next;
}
