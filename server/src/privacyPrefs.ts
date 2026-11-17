import { getSetting, type DB } from './db.js';

/**
 * The few choices in a person's saved Settings preferences (`uiPrefs`) that change what the server does:
 * which photographs may go to an AI, and which may appear on the public portfolio. Defaults match Settings.
 */
const prefs = (db: DB) => getSetting<Record<string, unknown>>(db, 'uiPrefs', {});
const flag = (db: DB, key: string, fallback: boolean) => { const v = prefs(db)[key]; return typeof v === 'boolean' ? v : fallback; };

/** Settings, Tags: the person's hidden tags, lowercase. */
export const hiddenTags = (db: DB): string[] => { const v = prefs(db).hidden; return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim().toLowerCase()).slice(0, 500) : []; };
/** Settings, AI: "Skip photos with hidden tags". */
export const skipHiddenForAi = (db: DB) => flag(db, 'aiPrivate', true);
/** Settings, AI: "Keep private shoots on local AI only". */
export const privateShootsLocalOnly = (db: DB) => flag(db, 'aiLocalOnly', true);
/** Settings, Tags: "Keep flagged photos off my portfolio". */
export const flaggedOffPortfolio = (db: DB) => flag(db, 'sensPf', false);

/** A WHERE clause (on a table named `photos`) that leaves out photographs no AI may see because of a hidden tag. */
export function aiHiddenFilter(db: DB): { sql: string; args: string[] } {
  const hidden = skipHiddenForAi(db) ? hiddenTags(db) : [];
  if (!hidden.length) return { sql: '', args: [] };
  return { sql: ` AND NOT EXISTS (SELECT 1 FROM tags ht WHERE ht.photo_id = photos.id AND ht.accepted != -1 AND lower(ht.name) IN (${hidden.map(() => '?').join(',')}))`, args: hidden };
}
