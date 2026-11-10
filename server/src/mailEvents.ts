import type { Ctx } from './ctx.js';
import type { DB } from './db.js';
import { footer, sendMail, smtpHealthy, type MailType, type Params } from './email.js';
import { inQuietHours, prefsOf, type Kind } from './notifications.js';
import { getSetting, setSetting } from './db.js';
import type { Tenant } from './tenants.js';

/**
 * Email for the things people want to hear about: held until quiet hours end, only for kinds the person turned on, and only while
 * the mail server is passing its check. The outbox lives in the system database so a restart does not lose a held message.
 */
export function ensureOutbox(sys: DB) {
  sys.exec('CREATE TABLE IF NOT EXISTS email_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, due TEXT NOT NULL, recipient TEXT NOT NULL, template TEXT NOT NULL, params TEXT NOT NULL, type TEXT NOT NULL)');
}

/** When quiet hours next end for this person (now if it is not quiet). */
export function releaseTime(db: DB, now = new Date()): Date {
  const p = prefsOf(db);
  let t = new Date(now);
  for (let i = 0; i < 24 * 4 && inQuietHours(p, t); i++) t = new Date(t.getTime() + 15 * 60_000);
  return t;
}

/** Queues one email for a person (to their own address), honouring their switches and quiet hours. Returns whether it was queued. */
export function queueMail(x: Ctx, t: Tenant, kind: Kind, m: { type: MailType; params: Params; template?: 'general' | 'code'; baseUrl: string }): boolean {
  const email = t.user.email;
  if (!email || !smtpHealthy(x.sys)) return false;
  const prefs = prefsOf(t.db);
  if (prefs.email[kind] !== true) return false;
  ensureOutbox(x.sys);
  const owner = x.tenants.owner().user.name;
  const params = { ...footer(x.sys, owner, m.baseUrl), name: (t.user.name || '').split(' ')[0] || 'there', ...m.params };
  x.sys.prepare('INSERT INTO email_outbox (due, recipient, template, params, type) VALUES (?,?,?,?,?)').run(releaseTime(t.db).toISOString(), email, m.template ?? 'general', JSON.stringify(params), m.type);
  return true;
}

/** Sends what is due. Never throws. */
export async function flushOutbox(x: Ctx): Promise<number> {
  ensureOutbox(x.sys);
  const rows = x.sys.prepare('SELECT * FROM email_outbox WHERE due <= ? ORDER BY id LIMIT 50').all(new Date().toISOString()) as { id: number; recipient: string; template: 'general' | 'code'; params: string; type: MailType }[];
  let n = 0;
  for (const r of rows) {
    x.sys.prepare('DELETE FROM email_outbox WHERE id = ?').run(r.id);
    try { const out = await sendMail(x.sys, { to: r.recipient, template: r.template, params: JSON.parse(r.params), type: r.type }); if (out.ok) n++; } catch { /* logged by sendMail */ }
  }
  return n;
}

const localParts = (tz: string, d: Date) => {
  try {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hourCycle: 'h23', weekday: 'short', day: '2-digit', hour: '2-digit', year: 'numeric', month: '2-digit' }).formatToParts(d);
    const get = (t: string) => f.find((p) => p.type === t)?.value ?? '';
    return { hour: Number(get('hour')), day: Number(get('day')), weekday: get('weekday'), ym: `${get('year')}-${get('month')}`, ymd: `${get('year')}-${get('month')}-${get('day')}` };
  } catch { return { hour: d.getUTCHours(), day: d.getUTCDate(), weekday: 'Mon', ym: d.toISOString().slice(0, 7), ymd: d.toISOString().slice(0, 10) }; }
};

/**
 * Review reminders (daily, or weekly on Monday at 09:00 local, only when something is due) and the monthly summary (the 1st at 09:00 local,
 * opt-in). Runs every few minutes; what has been sent is remembered so nothing goes twice.
 */
export function remindersFor(x: Ctx, t: Tenant, baseUrl: string, now = new Date()): string[] {
  const sent: string[] = [];
  const prefs = prefsOf(t.db);
  const l = localParts(prefs.tz, now);
  if (l.hour !== 9) return sent;
  const done = getSetting<{ reminder?: string; summary?: string }>(t.db, 'mailSent', {});
  const next = { ...done };
  const due = (t.db.prepare("SELECT COUNT(*) n FROM photos WHERE missing = 0 AND archived = 0 AND next_review_at IS NOT NULL AND next_review_at <= ?").get(now.toISOString()) as { n: number }).n;
  const slot = prefs.reviewReminder === 'daily' ? l.ymd : prefs.reviewReminder === 'weekly' && l.weekday === 'Mon' ? l.ymd : '';
  if (slot && due > 0 && done.reminder !== slot) {
    if (queueMail(x, t, 'review-due', { type: 'reminder', baseUrl, params: { subject: `${due} photo${due === 1 ? ' is' : 's are'} waiting for your rating`, preheader: 'A short review session', eyebrow: 'Review', title: `${due} photo${due === 1 ? ' is' : 's are'} waiting`, body: 'Your next review session is ready. It takes a few minutes, and your ratings rank every composition they belong to.', button_label: 'Begin review', button_url: `${baseUrl}/review`, fine_print: 'You get this because review reminders are on in Settings, Notifications.', image_url: '', image_alt: '', note: '', note_from: '' } })) sent.push('reminder');
    next.reminder = slot;
  }
  if (l.day === 1 && prefs.email.summary === true && done.summary !== l.ym) {
    const since = new Date(now.getTime() - 31 * 86_400_000).toISOString();
    const n = (sql: string, ...a: unknown[]) => (t.db.prepare(sql).get(...a) as { n: number }).n;
    const added = n('SELECT COUNT(*) n FROM photos WHERE added_at > ?', since), rated = n('SELECT COUNT(DISTINCT photo_id) n FROM reviews WHERE date > ?', since);
    const comps = n("SELECT COUNT(*) n FROM collections");
    const top = t.db.prepare('SELECT p.id, p.title, AVG(r.rating) a FROM reviews r JOIN photos p ON p.id = r.photo_id WHERE r.date > ? GROUP BY p.id ORDER BY a DESC, COUNT(*) DESC LIMIT 3').all(since) as { id: number; title: string; a: number }[];
    const crs = x.sys.prepare('SELECT COUNT(*) n, AVG(rating) a FROM community_ratings WHERE owner = ? AND ts > ?').get(t.user.id, since) as { n: number; a: number | null };
    const body = [`Photos added: ${added}`, `Photos rated: ${rated}`, `Compositions: ${comps}`, top.length ? `Top photos: ${top.map((p) => p.title).join(', ')}` : '', crs.n ? `Community: ${crs.n} ratings, average ${crs.a?.toFixed(1)}` : ''].filter(Boolean).join('\n');
    if (queueMail(x, t, 'summary', { type: 'summary', baseUrl, params: { subject: 'Your month in Frames', preheader: 'Photos added and rated, and your top photos', eyebrow: 'Monthly summary', title: 'Your month in Frames', body, button_label: 'Open Frames', button_url: `${baseUrl}/`, fine_print: 'Turn this off in Settings, Notifications.', image_url: '', image_alt: '', note: '', note_from: '' } })) sent.push('summary');
    next.summary = l.ym;
  }
  if (JSON.stringify(next) !== JSON.stringify(done)) setSetting(t.db, 'mailSent', next);
  return sent;
}
