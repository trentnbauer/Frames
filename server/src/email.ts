import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { getSecret, setSecret } from './ai.js';
import { getSetting, setSetting, type DB } from './db.js';
import { CODE_HTML, GENERAL_HTML } from './mailTemplates.js';

/**
 * Outgoing email: SMTP settings (the password is a write-only secret), a health check, a 30-day log of what was sent (never the
 * bodies), and the two send-ready templates from the design handover.
 *
 * The email sign-in option exists only while SMTP is configured AND its last health check passed.
 */
export type Smtp = { host: string; port: number; secure: boolean; user: string; from: string; fromName: string };
export type Health = { ok: boolean; at: string; error: string };

const DEFAULT: Smtp = { host: '', port: 587, secure: false, user: '', from: '', fromName: 'Frames' };

/** What is saved, with SMTP_* environment variables as the defaults for anything not saved in the app. */
export function getSmtp(sys: DB, env: Record<string, string | undefined> = process.env): Smtp {
  const saved = getSetting<Partial<Smtp>>(sys, 'smtp', {});
  const e: Partial<Smtp> = {
    host: env.SMTP_HOST, port: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined, secure: env.SMTP_SECURE ? /^(1|true|yes|on)$/i.test(env.SMTP_SECURE) : undefined,
    user: env.SMTP_USER, from: env.SMTP_FROM, fromName: env.SMTP_FROM_NAME,
  };
  const pick = <K extends keyof Smtp>(k: K): Smtp[K] => (saved[k] !== undefined && saved[k] !== '' ? saved[k] : e[k] !== undefined && e[k] !== '' && !Number.isNaN(e[k]) ? e[k] : DEFAULT[k]) as Smtp[K];
  return { host: pick('host'), port: pick('port'), secure: pick('secure'), user: pick('user'), from: pick('from'), fromName: pick('fromName') };
}
export const smtpPassword = (sys: DB, env: Record<string, string | undefined> = process.env) => getSecret(sys, 'smtp:pass') || env.SMTP_PASSWORD || '';
export const smtpConfigured = (sys: DB) => { const s = getSmtp(sys); return !!s.host && !!s.from; };

export function saveSmtp(sys: DB, b: Record<string, unknown>): string | null {
  const cur = getSmtp(sys);
  const next = { ...cur };
  const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  if (b.host !== undefined) next.host = str(b.host, 253);
  if (b.port !== undefined) { const p = Number(b.port); if (!Number.isInteger(p) || p < 1 || p > 65535) return 'The port must be a number from 1 to 65535.'; next.port = p; }
  if (typeof b.secure === 'boolean') next.secure = b.secure;
  if (b.user !== undefined) next.user = str(b.user, 200);
  if (b.from !== undefined) { const f = str(b.from, 200); if (f && !/^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/.test(f)) return 'Send-as must be an email address.'; next.from = f; }
  if (b.fromName !== undefined) next.fromName = str(b.fromName, 80).replace(/[\r\n"<>]/g, '') || 'Frames';
  if (typeof b.password === 'string' && b.password) setSecret(sys, 'smtp:pass', b.password.slice(0, 500));
  setSetting(sys, 'smtp', next);
  setSetting(sys, 'smtpHealth', null); // changed: it has to pass again
  return null;
}

export const healthOf = (sys: DB): Health | null => getSetting<Health | null>(sys, 'smtpHealth', null);
/** Configured and passing its last check. */
export const smtpHealthy = (sys: DB) => smtpConfigured(sys) && healthOf(sys)?.ok === true;

type Transport = { verify(): Promise<unknown>; sendMail(m: Record<string, unknown>): Promise<unknown> };
/** Replaced in tests so nothing ever reaches a real mail server. */
export const mailer: { make: (s: Smtp, pass: string) => Transport } = {
  make: (s, pass) => nodemailer.createTransport({
    host: s.host, port: s.port, secure: s.secure, requireTLS: !s.secure && s.port !== 25, auth: s.user ? { user: s.user, pass } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  }) as unknown as Transport,
};

/** Plain-language reason for a failure; never the server's own words verbatim beyond a short code. */
export const reasonOf = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e);
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|timeout/i.test(m)) return 'Could not reach the mail server. Check the host and port.';
  if (/auth|535|534|credential/i.test(m)) return 'The mail server refused the user name or password.';
  if (/self.signed|certificate|TLS|SSL/i.test(m)) return 'The mail server’s secure connection could not be set up. Check the port and the “secure” setting.';
  return m.replace(/\s+/g, ' ').slice(0, 160);
};

/** Runs the health check now and remembers the result. Never throws. */
export async function checkSmtp(sys: DB): Promise<Health> {
  let h: Health;
  if (!smtpConfigured(sys)) h = { ok: false, at: new Date().toISOString(), error: 'Email is not set up.' };
  else {
    try { await mailer.make(getSmtp(sys), smtpPassword(sys)).verify(); h = { ok: true, at: new Date().toISOString(), error: '' }; } catch (e) { h = { ok: false, at: new Date().toISOString(), error: reasonOf(e) }; }
  }
  setSetting(sys, 'smtpHealth', h);
  return h;
}

// ---------- the log ----------
export type MailType = 'code' | 'invite' | 'share' | 'guest' | 'reminder' | 'summary' | 'signin' | 'test';
export type Params = Record<string, string>;
export type LogRow = { id: number; at: string; to: string; subject: string; type: MailType; status: 'delivered' | 'failed'; error: string };

export function logRows(sys: DB, status?: 'delivered' | 'failed'): LogRow[] {
  const cut = new Date(Date.now() - 30 * 86_400_000).toISOString();
  sys.prepare('DELETE FROM email_log WHERE at < ?').run(cut);
  return (sys.prepare(`SELECT id, at, recipient AS "to", subject, type, status, error FROM email_log ${status ? 'WHERE status = ?' : ''} ORDER BY id DESC LIMIT 500`).all(...(status ? [status] : [])) as LogRow[]);
}
const csvCell = (v: string) => `"${v.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`; // a spreadsheet must not run a cell as a formula
export const logCsv = (rows: LogRow[]) => ['When,To,Subject,Type,Status,Reason', ...rows.map((r) => [r.at, r.to, r.subject, r.type, r.status, r.error].map(csvCell).join(','))].join('\n');

// ---------- templates ----------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const dropRow = (html: string, name: string) => html.replace(new RegExp(`<!--opt:${name}-->[\\s\\S]*?<!--/opt:${name}-->`), '');
const keepRow = (html: string, name: string) => html.replace(`<!--opt:${name}-->`, '').replace(`<!--/opt:${name}-->`, '');

/** Fills a template. Every value is escaped; rows marked optional are dropped when their value is empty. Only https image addresses are used. */
export function render(template: 'code' | 'general', v: Params): { html: string; text: string; subject: string } {
  const p: Params = { ...v };
  if (p.image_url && !/^https:\/\//i.test(p.image_url)) p.image_url = '';
  let html = template === 'code' ? CODE_HTML : GENERAL_HTML;
  if (template === 'general') {
    for (const [row, key] of [['image', 'image_url'], ['eyebrow', 'eyebrow'], ['note', 'note']] as const) html = p[key] ? keepRow(html, row) : dropRow(html, row);
  }
  html = html.replace(/<!--\/?opt:[a-z]+-->/g, '');
  const body = (k: string, val: string) => (k === 'body' || k === 'fine_print' ? esc(val).replace(/\n/g, '<br>') : esc(val));
  html = html.replace(/\{\{([a-z_]+)\}\}/g, (_m, k: string) => body(k, p[k] ?? ''));
  const text = template === 'code'
    ? `Hi ${p.name || 'there'},\n\nYour Frames sign-in code is ${p.code}. It works once and expires in 10 minutes.\n\nIf this was not you, you can ignore this email.\n${p.server_name ?? ''}`
    : `${p.title ?? ''}\n\nHi ${p.name || 'there'},\n\n${p.body ?? ''}\n\n${p.button_label ?? ''}: ${p.button_url ?? ''}\n\n${p.fine_print ?? ''}`;
  return { html, text, subject: p.subject || (template === 'code' ? `Your Frames sign-in code: ${p.code}` : p.title || 'Frames') };
}

/** The footer fields every email carries. */
export function footer(sys: DB, ownerName: string, baseUrl: string): Params {
  const url = baseUrl.replace(/\/+$/, '');
  let host = 'Frames'; try { host = new URL(url).host || 'Frames'; } catch { /* no public address yet */ }
  return { server_name: host, owner_name: ownerName || 'the owner', settings_url: `${url}/settings?section=notifications`, terms_url: `${url}/terms`, unsubscribe_url: `${url}/settings?section=notifications`, signin_url: `${url}/` };
}

/**
 * Sends one email and logs it. Resolves to the outcome; never throws. `params` are kept only for a failed message that can be retried
 * (never for a sign-in code), so the log can offer "Retry"; they are dropped once it is sent.
 */
export async function sendMail(sys: DB, m: { to: string; template: 'code' | 'general'; params: Params; type: MailType }): Promise<{ ok: boolean; error: string }> {
  const { html, text, subject } = render(m.template, m.params);
  const at = new Date().toISOString();
  let ok = false, error = '';
  if (!smtpConfigured(sys)) error = 'Email is not set up.';
  else {
    const s = getSmtp(sys);
    try {
      await mailer.make(s, smtpPassword(sys)).sendMail({ from: `"${s.fromName}" <${s.from}>`, to: m.to, subject, html, text });
      ok = true;
    } catch (e) { error = reasonOf(e); }
  }
  const keep = !ok && m.type !== 'code' ? JSON.stringify({ template: m.template, params: m.params }) : '';
  sys.prepare('INSERT INTO email_log (at, recipient, subject, type, status, error, retry) VALUES (?,?,?,?,?,?,?)').run(at, m.to, subject.slice(0, 200), m.type, ok ? 'delivered' : 'failed', error, keep);
  return { ok, error };
}

/** Sends every failed message again; returns how many went. */
export async function retryFailed(sys: DB): Promise<number> {
  const rows = sys.prepare("SELECT id, recipient, type, retry FROM email_log WHERE status = 'failed' AND retry != '' ORDER BY id").all() as { id: number; recipient: string; type: MailType; retry: string }[];
  let sent = 0;
  for (const r of rows) {
    let j: { template: 'code' | 'general'; params: Params };
    try { j = JSON.parse(r.retry); } catch { continue; }
    const out = await sendMail(sys, { to: r.recipient, template: j.template, params: j.params, type: r.type });
    if (out.ok) { sent++; sys.prepare('DELETE FROM email_log WHERE id = ?').run(r.id); }
  }
  return sent;
}

// ---------- sign-in codes ----------
/** No 0/O/1/I/L: nothing to mistake for something else. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_TTL_MS = 10 * 60_000;
export const MAX_TRIES = 5;
const hash = (email: string, code: string) => crypto.createHash('sha256').update(`${email.toLowerCase()}\n${code}`).digest('hex');
export const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
export const cleanCode = (v: unknown) => String(v ?? '').toUpperCase().replace(/[\s-]/g, '');

/** Starts a fresh code for this address (any earlier one stops working). Returns the code to email. */
export function issueCode(sys: DB, email: string, now = Date.now()): string {
  const e = email.toLowerCase();
  sys.prepare('DELETE FROM email_codes WHERE email = ? OR expires < ?').run(e, now - 3_600_000);
  const code = newCode();
  sys.prepare('INSERT INTO email_codes (email, hash, expires, tries) VALUES (?,?,?,0)').run(e, hash(e, code), now + CODE_TTL_MS);
  return code;
}

export type CodeResult = 'ok' | 'wrong' | 'expired' | 'voided';
/** Checks a code: single use, ten minutes, five wrong tries void it. */
export function checkCode(sys: DB, email: string, given: unknown, now = Date.now()): CodeResult {
  const e = email.toLowerCase();
  const row = sys.prepare('SELECT id, hash, expires, tries FROM email_codes WHERE email = ?').get(e) as { id: number; hash: string; expires: number; tries: number } | undefined;
  if (!row) return 'expired';
  if (row.expires < now) { sys.prepare('DELETE FROM email_codes WHERE id = ?').run(row.id); return 'expired'; }
  if (row.tries >= MAX_TRIES) return 'voided';
  const a = Buffer.from(hash(e, cleanCode(given)), 'hex'), b = Buffer.from(row.hash, 'hex');
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) { sys.prepare('DELETE FROM email_codes WHERE id = ?').run(row.id); return 'ok'; }
  const tries = row.tries + 1;
  if (tries >= MAX_TRIES) { sys.prepare('DELETE FROM email_codes WHERE id = ?').run(row.id); return 'voided'; }
  sys.prepare('UPDATE email_codes SET tries = ? WHERE id = ?').run(tries, row.id);
  return 'wrong';
}
