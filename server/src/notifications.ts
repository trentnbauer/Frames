import { getSetting, type DB } from './db.js';

/**
 * The bell. Each person has their own list in their own library. Read ones are kept 90 days, unread until read or 180 days,
 * and at most 200 are kept (the oldest read ones go first).
 */
export const KINDS = [
  'guest-suggestion', 'guest-rating', 'guest-reply', 'community-rating', 'idea', 'cloud-sync', 'report-outcome', 'report-queue',
  'review-due', 'update', 'sign-in', 'summary',
] as const;
export type Kind = (typeof KINDS)[number];

/** Which kinds can also be emailed (the rest are bell only). */
export const EMAILABLE: Kind[] = ['guest-suggestion', 'guest-reply', 'review-due', 'summary', 'sign-in'];

export type NotifTarget = { screen: string; anchor?: string };
export type NotifPrefs = { bell: Record<string, boolean>; email: Record<string, boolean>; quiet: { on: boolean; from: string; to: string }; tz: string; reviewReminder: 'off' | 'daily' | 'weekly' };

export const DEFAULT_PREFS: NotifPrefs = {
  bell: {},
  email: { 'guest-suggestion': true, 'guest-reply': true, 'review-due': true, summary: false, 'sign-in': true },
  quiet: { on: true, from: '22:00', to: '08:00' },
  tz: 'UTC',
  reviewReminder: 'weekly',
};

export function prefsOf(db: DB): NotifPrefs {
  const p = getSetting<Partial<NotifPrefs>>(db, 'notifPrefs', {});
  return { ...DEFAULT_PREFS, ...p, bell: { ...DEFAULT_PREFS.bell, ...(p.bell ?? {}) }, email: { ...DEFAULT_PREFS.email, ...(p.email ?? {}) }, quiet: { ...DEFAULT_PREFS.quiet, ...(p.quiet ?? {}) } };
}

export const bellOn = (db: DB, kind: Kind) => prefsOf(db).bell[kind] !== false;

/** Adds a notification to the bell unless this person turned that kind off. Returns its id (or 0). */
export function notify(db: DB, kind: Kind, text: string, target: NotifTarget, ref = ''): number {
  if (!bellOn(db, kind)) return 0;
  if (ref && db.prepare('SELECT 1 FROM notifications WHERE kind = ? AND ref = ?').get(kind, ref)) return 0; // the same event is told once
  const r = db.prepare('INSERT INTO notifications (kind, text, created_at, read, screen, anchor, ref) VALUES (?,?,?,?,?,?,?)')
    .run(kind, text.slice(0, 300), new Date().toISOString(), 0, target.screen, target.anchor ?? '', ref);
  prune(db);
  return Number(r.lastInsertRowid);
}

/** Applies the retention rules above. */
export function prune(db: DB, now = Date.now()) {
  const day = 86_400_000;
  db.prepare('DELETE FROM notifications WHERE (read = 1 AND created_at < ?) OR created_at < ?').run(new Date(now - 90 * day).toISOString(), new Date(now - 180 * day).toISOString());
  const n = (db.prepare('SELECT COUNT(*) c FROM notifications').get() as { c: number }).c;
  if (n > 200) {
    db.prepare('DELETE FROM notifications WHERE id IN (SELECT id FROM notifications ORDER BY read DESC, created_at ASC LIMIT ?)').run(n - 200);
  }
}

/** Is it quiet for this person at `now`? (Only emails wait for the end of quiet hours; the bell never does.) */
export function inQuietHours(p: NotifPrefs, now = new Date()): boolean {
  if (!p.quiet.on) return false;
  let hm: string;
  try { hm = new Intl.DateTimeFormat('en-GB', { timeZone: p.tz || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now); } catch { hm = now.toISOString().slice(11, 16); }
  const { from, to } = p.quiet;
  return from <= to ? hm >= from && hm < to : hm >= from || hm < to;
}
