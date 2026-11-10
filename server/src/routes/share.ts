import { ensureDeriv } from '../cache.js';
import { policyOf } from '../policy.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { derivPath } from '../ingest.js';
import type { Ctx, Row } from '../ctx.js';
import { remoteOriginal } from '../cloud.js';
import { loadAuth } from '../auth.js';
import { displayNameOf } from './profile.js';
import { getSetting, setSetting } from '../db.js';
import { footer, sendMail, smtpHealthy } from '../email.js';
import { notify } from '../notifications.js';
import { queueMail } from '../mailEvents.js';
import { serveDerivative } from '../imageServe.js';
import { humanCookie, verifyToken } from '../turnstile.js';
import { FRAME_COLOURS, parseLayout } from '../layout.js';

/**
 * Share links: a public address (/s/<token>) for one collection or one photoshoot, so someone without a login
 * can look through it, download the originals, or rate the photographs, as the link's owner allows.
 *
 * This is the one part of Frames reachable without the login, so it is deliberately narrow:
 *  - the token is 128 random bits, so it cannot be guessed, and guessing is rate-limited;
 *  - a link opens exactly one collection or photoshoot, nothing else;
 *  - guests only ever get a photo's id, title and shape. No location, camera, notes, file paths or other photos;
 *  - downloads and reviews are separate switches; links can expire and can be revoked at any time.
 */

const TOKEN = '[A-Za-z0-9_-]{16,64}';

/** The one 4-number PIN in Frames: an optional lock on a share link. Never four of a kind or a straight run (1234, 9876). */
export const isWeakPin = (p: string) => /^(\d)\1{3}$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p);
export const randomPin = () => { let p: string; do { p = String(crypto.randomInt(10000)).padStart(4, '0'); } while (isWeakPin(p)); return p; };
const PIN_TRIES = 5, PIN_LOCK_MS = 15 * 60_000;
const PIN_ERR = 'A PIN is four numbers, not all the same and not a straight run like 1234.';

/** The only addresses served without the login: the share page shell, its assets, and the share API. */
export function isPublicPath(url: string): boolean {
  const path = url.split('?')[0];
  return new RegExp(`^/s/${TOKEN}/?$`).test(path) || new RegExp(`^/api/s/${TOKEN}(/|$)`).test(path) || /^\/assets\/[\w.-]+$/.test(path) || path === '/icon.svg' || path === '/theme.js' || path === '/privacy' || /^\/(signin|signup|signed-out|terms)\/?$/.test(path) || /^\/api\/public\/auth(\/[a-z-]+)*\/?$/.test(path);
}
export const isSharePath = (url: string) => /^\/(api\/)?s\//.test(url);

type Bucket = { n: number; reset: number };

export function registerShare(app: FastifyInstance, x: Ctx) {
  const { db, num, one, all, notFound } = x;

  const pinFails = new Map<string, { n: number; until: number }>();

  // ---------- rate limiting for the public routes ----------
  const buckets = new Map<string, Bucket>();
  const LIMITS: Record<string, [number, number]> = { lookup: [20, 60_000], read: [300, 60_000], image: [2000, 60_000], review: [60, 60_000], download: [600, 60_000] };
  const hit = (ip: string, kind: keyof typeof LIMITS): number => {
    const now = Date.now();
    const key = `${ip}|${kind}`;
    const [max, win] = LIMITS[kind];
    let b = buckets.get(key);
    if (!b || b.reset < now) { b = { n: 0, reset: now + win }; buckets.set(key, b); if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k); }
    b.n++;
    return b.n > max ? Math.ceil((b.reset - now) / 1000) : 0;
  };
  const limited = (req: any, rep: any, kind: keyof typeof LIMITS) => {
    const wait = hit(req.ip, kind);
    if (!wait) return false;
    rep.header('Retry-After', String(wait)).code(429).send({ error: 'Too many requests. Try again in a moment.' });
    return true;
  };

  // ---------- owner side (behind the login) ----------
  const statusOf = (s: Row) => (s.revoked ? 'revoked' : s.expires_at && new Date(s.expires_at).getTime() < Date.now() ? 'expired' : 'active');
  const shareDto = (s: Row) => ({
    id: s.id, token: s.token, kind: s.kind, targetId: s.target_id, label: s.label, allowDownload: !!s.allow_download, allowReview: !!s.allow_review,
    expiresAt: s.expires_at, createdAt: s.created_at, status: statusOf(s), views: s.views, downloads: s.downloads,
    allowSuggest: s.allow_suggest === null || s.allow_suggest === undefined ? !!s.allow_review : !!s.allow_suggest, seeEachOther: !!s.see_each_other, showGuests: !!s.show_guests, onlyWall: !!s.only_wall, askName: !!s.ask_name, pin: s.pin || '',
    reviews: (one('SELECT COUNT(*) n FROM share_reviews WHERE share_id = ?', s.id) as Row).n,
  });

  app.post('/api/shares', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const kind = b.kind === 'shoot' ? 'shoot' : b.kind === 'collection' ? 'collection' : null;
    if (!kind) return rep.code(400).send({ error: 'kind must be collection or shoot' });
    if (!one(`SELECT 1 x FROM ${kind === 'shoot' ? 'shoots' : 'collections'} WHERE id = ?`, num(b.id))) return notFound(rep);
    const pol = policyOf(x.sys);
    let expires: string | null = b.expiresAt === undefined && pol.shareExpireDays ? new Date(Date.now() + pol.shareExpireDays * 86_400_000).toISOString() : null;
    if (b.expiresAt) {
      const t = new Date(String(b.expiresAt));
      if (Number.isNaN(+t) || +t < Date.now()) return rep.code(400).send({ error: 'The expiry date must be in the future' });
      expires = t.toISOString();
    }
    // The first part names the owner, so a visitor with no sign-in is sent to the right library.
    const token = `${x.tenant().user.id.toString(36)}_${crypto.randomBytes(16).toString('base64url')}`;
    let pin = '';
    if (b.pin === true) pin = randomPin();
    else if (typeof b.pin === 'string' && b.pin) { if (!/^\d{4}$/.test(b.pin) || isWeakPin(b.pin)) return rep.code(400).send({ error: PIN_ERR }); pin = b.pin; }
    const id = Number(db.prepare('INSERT INTO shares(token, kind, target_id, label, allow_download, allow_review, expires_at, created_at, pin, allow_suggest, see_each_other, show_guests, ask_name) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(token, kind, num(b.id), String(b.label ?? '').slice(0, 80), (b.allowDownload === undefined ? pol.shareDownload : b.allowDownload) ? 1 : 0, b.allowReview ? 1 : 0, expires, new Date().toISOString(), pin, b.allowSuggest === undefined ? null : b.allowSuggest ? 1 : 0, b.seeEachOther ? 1 : 0, b.showGuests ? 1 : 0, (b.askName === undefined ? pol.shareAskName : b.askName !== false) ? 1 : 0).lastInsertRowid);
    if (b.onlyWall === true) db.prepare('UPDATE shares SET only_wall = 1 WHERE id = ?').run(id);
    return shareDto(one('SELECT * FROM shares WHERE id = ?', id)!);
  });
  // Change a link: permissions, expiry, ask-for-name, show-guests, the PIN, or turn it on and off. `pin: true` makes a new random one; `pin: ''` removes it.
  app.patch('/api/shares/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    const cur = one('SELECT * FROM shares WHERE id = ?', id);
    if (!cur) return notFound(rep);
    const b = (req.body ?? {}) as Row;
    const sets: string[] = [], args: unknown[] = [];
    const flag = (k: string, col: string) => { if (typeof b[k] === 'boolean') { sets.push(`${col} = ?`); args.push(b[k] ? 1 : 0); } };
    flag('allowDownload', 'allow_download'); flag('allowReview', 'allow_review'); flag('allowSuggest', 'allow_suggest'); flag('seeEachOther', 'see_each_other'); flag('showGuests', 'show_guests'); flag('onlyWall', 'only_wall'); flag('askName', 'ask_name');
    if (typeof b.on === 'boolean') { sets.push('revoked = ?'); args.push(b.on ? 0 : 1); }
    if (b.expiresAt !== undefined) {
      if (b.expiresAt === null || b.expiresAt === '') { sets.push('expires_at = NULL'); }
      else { const t = new Date(String(b.expiresAt)); if (Number.isNaN(+t) || +t < Date.now()) return rep.code(400).send({ error: 'The expiry date must be in the future' }); sets.push('expires_at = ?'); args.push(t.toISOString()); }
    }
    if (b.pin !== undefined) {
      let pin = '';
      if (b.pin === true) pin = randomPin();
      else if (b.pin === '' || b.pin === false) pin = '';
      else if (typeof b.pin === 'string' && /^\d{4}$/.test(b.pin) && !isWeakPin(b.pin)) pin = b.pin;
      else return rep.code(400).send({ error: PIN_ERR });
      sets.push('pin = ?'); args.push(pin);
      for (const k of [...pinFails.keys()]) if (k.startsWith(`${id}|`)) pinFails.delete(k); // a new PIN gives everyone a fresh start
    }
    if (typeof b.label === 'string') { sets.push('label = ?'); args.push(b.label.slice(0, 80)); }
    if (sets.length) db.prepare(`UPDATE shares SET ${sets.join(', ')} WHERE id = ?`).run(...args, id);
    return shareDto(one('SELECT * FROM shares WHERE id = ?', id)!);
  });
  app.get('/api/shares', async (req) => {
    const q = req.query as Row;
    const rows = q.kind ? all('SELECT * FROM shares WHERE kind = ? AND target_id = ? ORDER BY id DESC', q.kind === 'shoot' ? 'shoot' : 'collection', num(q.id)) : all('SELECT * FROM shares ORDER BY id DESC');
    return rows.map(shareDto);
  });
  // Revoking keeps the record (and anything guests said); the address simply stops working.
  app.delete('/api/shares/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shares WHERE id = ?', id)) return notFound(rep);
    db.prepare('UPDATE shares SET revoked = 1 WHERE id = ?').run(id);
    return shareDto(one('SELECT * FROM shares WHERE id = ?', id)!);
  });
  // The photographer's side: what guests wrote on one link, on a composition (all its links) or on one photograph (every link it is in).
  const commentRows = (where: string, ...args: unknown[]) => all(`SELECT c.id, c.reviewer, c.photo_id, c.body, c.ts, p.title FROM share_comments c LEFT JOIN photos p ON p.id = c.photo_id WHERE ${where} ORDER BY c.ts DESC LIMIT 500`, ...args)
    .map((r) => ({ id: r.id as number, by: r.reviewer as string, photoId: r.photo_id as number | null, photoTitle: (r.title as string | null) ?? null, body: r.body as string, at: r.ts as string }));
  app.get('/api/shares/:id/comments', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shares WHERE id = ?', id)) return notFound(rep);
    return { comments: commentRows('c.share_id = ?', id) };
  });
  app.get('/api/collections/:id/comments', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM collections WHERE id = ?', id)) return notFound(rep);
    return { comments: commentRows("c.share_id IN (SELECT id FROM shares WHERE kind = 'collection' AND target_id = ?)", id) };
  });
  app.get('/api/photos/:id/comments', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM photos WHERE id = ?', id)) return notFound(rep);
    return { comments: commentRows('c.photo_id = ?', id) };
  });
  app.delete('/api/comments/:id', async (req) => ({ removed: db.prepare('DELETE FROM share_comments WHERE id = ?').run(num((req.params as Row).id)).changes }));

  // The layouts guests suggested for a composition, newest first. Applying one is the photographer's PATCH of the layout; this only lists and clears.
  app.get('/api/collections/:id/layout-suggestions', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM collections WHERE id = ?', id)) return notFound(rep);
    const rows = all("SELECT l.id, l.reviewer, l.layout, l.note, l.ts FROM share_layouts l JOIN shares s ON s.id = l.share_id WHERE s.kind = 'collection' AND s.target_id = ? ORDER BY l.ts DESC", id);
    return { suggestions: rows.map((r) => ({ id: r.id, by: r.reviewer, note: r.note, at: r.ts, layout: JSON.parse(r.layout) })) };
  });
  // Frame colours guests suggested, grouped by print and colour; only those that still differ from the print's frame today.
  app.get('/api/collections/:id/frame-suggestions', async (req, rep) => {
    const id = num((req.params as Row).id);
    const col = one('SELECT * FROM collections WHERE id = ?', id);
    if (!col) return notFound(rep);
    const prints = (col ? x.collectionDto(col).layout?.prints : null) as { id: number; frame: { color: string } | null }[] ?? [];
    const rows = all("SELECT f.print_id, f.color, f.reviewer FROM share_frames f JOIN shares s ON s.id = f.share_id WHERE s.kind = 'collection' AND s.target_id = ? ORDER BY f.ts", id);
    const g = new Map<string, { printId: number; color: string; by: string[] }>();
    for (const r of rows) {
      const p = prints.find((q) => q.id === r.print_id);
      if (!p?.frame || p.frame.color === r.color) continue;
      (g.get(`${r.print_id}/${r.color}`) ?? g.set(`${r.print_id}/${r.color}`, { printId: r.print_id, color: r.color, by: [] }).get(`${r.print_id}/${r.color}`)!).by.push(r.reviewer);
    }
    return { suggestions: [...g.values()].sort((a, b) => b.by.length - a.by.length) };
  });
  app.delete('/api/collections/:id/frame-suggestions', async (req) => {
    const q = req.query as Row, id = num((req.params as Row).id);
    return { removed: db.prepare("DELETE FROM share_frames WHERE print_id = ? AND color = ? AND share_id IN (SELECT id FROM shares WHERE kind = 'collection' AND target_id = ?)").run(num(q.printId), String(q.color ?? ''), id).changes };
  });
  app.delete('/api/collections/:id/layout-suggestions/:sid', async (req) => {
    const q = req.params as Row;
    return { removed: db.prepare("DELETE FROM share_layouts WHERE id = ? AND share_id IN (SELECT id FROM shares WHERE kind = 'collection' AND target_id = ?)").run(num(q.sid), num(q.id)).changes };
  });

  // Who has looked at a link and what each person did: how many photographs they rated, how many suggestions they made, and when.
  app.get('/api/shares/:id/guests', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shares WHERE id = ?', id)) return notFound(rep);
    const by = new Map<string, { name: string; rated: number; avg: number | null; suggested: number; last: string }>();
    const get = (name: string) => by.get(name) ?? by.set(name, { name, rated: 0, avg: null, suggested: 0, last: '' }).get(name)!;
    for (const r of all('SELECT reviewer, COUNT(*) n, AVG(rating) a, MAX(ts) t FROM share_reviews WHERE share_id = ? GROUP BY reviewer', id)) { const g = get(r.reviewer); g.rated = r.n; g.avg = r.a; if (r.t > g.last) g.last = r.t; }
    for (const r of all('SELECT reviewer, COUNT(*) n, MAX(ts) t FROM share_suggestions WHERE share_id = ? GROUP BY reviewer', id)) { const g = get(r.reviewer); g.suggested = r.n; if (r.t > g.last) g.last = r.t; }
    return { guests: [...by.values()].sort((a, b) => (a.last < b.last ? 1 : -1)) };
  });
  // What guests thought, per photograph. Kept apart from your own reviews: it never changes your ratings or schedule.
  app.get('/api/shares/:id/reviews', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shares WHERE id = ?', id)) return notFound(rep);
    const rows = all('SELECT r.photo_id, r.reviewer, r.rating, r.note, r.ts, p.title FROM share_reviews r JOIN photos p ON p.id = r.photo_id WHERE r.share_id = ? ORDER BY r.ts', id);
    const by = new Map<number, { photoId: number; title: string; entries: { reviewer: string; rating: number; note: string | null; ts: string }[] }>();
    for (const r of rows) (by.get(r.photo_id) ?? by.set(r.photo_id, { photoId: r.photo_id, title: r.title, entries: [] }).get(r.photo_id)!).entries.push({ reviewer: r.reviewer, rating: r.rating, note: r.note, ts: r.ts });
    return [...by.values()].map((p) => ({ ...p, n: p.entries.length, avg: p.entries.reduce((a, e) => a + e.rating, 0) / p.entries.length }));
  });

  /** Tells the owner a guest did something: the bell, and an email if they turned that on. */
  const tell = (share: Row, who: string, kind: 'guest-rating' | 'guest-suggestion', what: string) => {
    try {
      const day = new Date().toISOString().slice(0, 10);
      const target = share.kind === 'collection' ? `/collections/${share.target_id}?guests=${kind === 'guest-suggestion' ? 'suggestions' : 'ratings'}` : `/shoots/${share.target_id}`;
      const text = `${who} ${what}`;
      if (!notify(db, kind, text, { screen: target }, `${kind}:${share.id}:${who}:${day}`)) return;
      queueMail(x, x.tenant(), kind === 'guest-rating' ? 'guest-reply' : 'guest-suggestion', { type: 'guest', baseUrl: (loadAuth(x.sys).publicUrl || '').replace(/\/+$/, ''), params: { subject: text, preheader: text, eyebrow: 'Guest reply', title: text, body: 'Open it to see what they said and to approve or decline suggestions.', button_label: 'See it', button_url: `${(loadAuth(x.sys).publicUrl || '').replace(/\/+$/, '')}${target}`, fine_print: 'Turn these emails off in Settings, Notifications.', image_url: '', image_alt: '', note: '', note_from: '' } });
    } catch { /* telling the owner must never break a guest's request */ }
  };

  // ---------- the PIN gate ----------
  // A device is a cookie we hand out; five wrong PINs lock the link on that device for 15 minutes. The cookie that says "PIN passed" is signed,
  // names the link and the PIN it was for, so changing the PIN signs everyone out.
  const shareKey = (): string => { let k = getSetting<string>(x.sys, 'shareKey', ''); if (!k) { k = crypto.randomBytes(32).toString('hex'); setSetting(x.sys, 'shareKey', k); } return k; };
  const pinSig = (share: Row) => crypto.createHmac('sha256', shareKey()).update(`${share.id}|${share.pin}`).digest('base64url');
  const cookieOf = (req: any, name: string) => new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(String(req.headers.cookie ?? ''))?.[1];
  const deviceOf = (req: any, cookies: string[]) => {
    let d = cookieOf(req, 'frames_dev');
    if (!d || !/^[A-Za-z0-9_-]{16,40}$/.test(d)) {
      d = crypto.randomBytes(16).toString('base64url');
      cookies.push(`frames_dev=${d}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${365 * 86400}`);
    }
    return d;
  };
  const pinPassed = (share: Row, req: any) => {
    if (!share.pin) return true;
    const c = cookieOf(req, `frames_pin_${share.id}`) ?? '';
    const want = pinSig(share);
    return c.length === want.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(want));
  };
  const canSuggest = (share: Row) => (share.allow_suggest === null || share.allow_suggest === undefined ? !!share.allow_review : !!share.allow_suggest);
  const lockOf = (share: Row, dev: string) => { const f = pinFails.get(`${share.id}|${dev}`); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; };

  app.post('/api/shares/:id/regenerate', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shares WHERE id = ?', id)) return notFound(rep);
    const token = `${x.tenant().user.id.toString(36)}_${crypto.randomBytes(16).toString('base64url')}`;
    db.prepare('UPDATE shares SET token = ? WHERE id = ?').run(token, id);
    return shareDto(one('SELECT * FROM shares WHERE id = ?', id)!);
  });
  app.delete('/api/shares/:id/invites', async (req) => ({ removed: db.prepare('DELETE FROM share_invites WHERE share_id = ? AND email = ?').run(num((req.params as Row).id), String(((req.query ?? {}) as Row).email ?? '').toLowerCase()).changes }));

  // Email invites: the link goes to each address, and the log keeps who it was sent to and whether it arrived. The PIN is never in the email.
  app.get('/api/shares/:id/invites', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shares WHERE id = ?', id)) return notFound(rep);
    return { invites: all('SELECT email, status, error, at FROM share_invites WHERE share_id = ? ORDER BY id DESC LIMIT 100', id), canEmail: smtpHealthy(x.sys) };
  });
  app.post('/api/shares/:id/invites', async (req, rep) => {
    const id = num((req.params as Row).id);
    const s = one('SELECT * FROM shares WHERE id = ?', id);
    if (!s) return notFound(rep);
    if (!smtpHealthy(x.sys)) return rep.code(400).send({ error: 'Email is not set up on this server. Copy the link instead.' });
    if (statusOf(s) !== 'active') return rep.code(400).send({ error: 'Turn the link on first.' });
    const b = (req.body ?? {}) as Row;
    const emails = [...new Set((Array.isArray(b.emails) ? b.emails : []).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e)))].slice(0, 20);
    if (!emails.length) return rep.code(400).send({ error: 'Enter at least one email address.' });
    const base = (loadAuth(x.sys).publicUrl || x.baseUrl(req)).replace(/\/+$/, '');
    const name = (one(`SELECT name FROM ${s.kind === 'shoot' ? 'shoots' : 'collections'} WHERE id = ?`, s.target_id) ?? { name: 'a set of photographs' }).name as string;
    const owner = x.tenant().user;
    const first = one('SELECT photo_id FROM collection_photos WHERE collection_id = ? ORDER BY pos LIMIT 1', s.target_id);
    const hero = !s.pin && s.kind === 'collection' && first ? `${base}/api/s/${s.token}/photos/${first.photo_id}/thumb` : '';
    const out: { email: string; ok: boolean; error: string }[] = [];
    for (const to of emails) {
      const r = await sendMail(x.sys, { to, template: 'general', type: 'share', params: { ...footer(x.sys, owner.name, base), subject: `${owner.name} shared “${name}” with you`, preheader: 'Take a look and tell them what you think', eyebrow: 'Shared with you', title: name, name: to.split('@')[0], body: `${owner.name} wants your opinion. ${s.allow_review ? 'You can rate the photographs and suggest changes.' : 'Have a look.'}${s.pin ? ' They will give you the PIN separately.' : ''}`, button_label: 'Open', button_url: `${base}/s/${s.token}`, fine_print: s.expires_at ? `This link works until ${new Date(s.expires_at).toDateString()}.` : 'You can ignore this if you were not expecting it.', image_url: hero, image_alt: name, note: typeof b.note === 'string' ? b.note.slice(0, 400) : '', note_from: typeof b.note === 'string' && b.note ? owner.name : '' } });
      db.prepare('INSERT INTO share_invites(share_id, email, status, error, at) VALUES(?,?,?,?,?)').run(id, to, r.ok ? 'sent' : 'failed', r.error, new Date().toISOString());
      out.push({ email: to, ok: r.ok, error: r.error });
    }
    return { results: out };
  });

  // ---------- public side (no login) ----------
  type Resolved = { share: Row; name: string; description: string; photoIds: number[]; chosenIds?: number[]; target?: unknown; layout?: unknown };
  const resolve = (token: string, req: any, rep: any): Resolved | null => {
    if (!new RegExp(`^${TOKEN}$`).test(token)) { if (!limited(req, rep, 'lookup')) rep.code(404).send({ error: 'This link does not exist' }); return null; }
    const share = one('SELECT * FROM shares WHERE token = ?', token);
    if (!share) { if (!limited(req, rep, 'lookup')) rep.code(404).send({ error: 'This link does not exist' }); return null; }
    if (statusOf(share) !== 'active') { rep.code(410).send({ error: share.revoked ? 'This link has been turned off' : 'This link has expired' }); return null; }
    if (!pinPassed(share, req)) { rep.code(401).send({ error: 'This link is locked with a PIN.', pinRequired: true, lockedFor: lockOf(share, cookieOf(req, 'frames_dev') ?? '') }); return null; }
    if (share.kind === 'collection') {
      const c = one('SELECT name, description FROM collections WHERE id = ?', share.target_id);
      if (!c) { rep.code(410).send({ error: 'This link is no longer available' }); return null; }
      const rows = all('SELECT photo_id, chosen FROM collection_photos WHERE collection_id = ? ORDER BY pos', share.target_id);
      const t = one('SELECT target FROM collections WHERE id = ?', share.target_id);
      const wallOnly = !!share.only_wall && rows.some((r) => r.chosen);
      return { share, name: c.name, description: c.description, photoIds: rows.filter((r) => !wallOnly || r.chosen).map((r) => r.photo_id), chosenIds: rows.filter((r) => r.chosen).map((r) => r.photo_id), target: t?.target ? JSON.parse(t.target) : null, layout: x.collectionDto(one('SELECT * FROM collections WHERE id = ?', share.target_id)!).layout };
    }
    const s = one('SELECT name, description FROM shoots WHERE id = ?', share.target_id);
    if (!s) { rep.code(410).send({ error: 'This link is no longer available' }); return null; }
    return { share, name: s.name, description: s.description, photoIds: all('SELECT id FROM photos WHERE shoot_id = ? ORDER BY COALESCE(captured_at, added_at), id', share.target_id).map((r) => r.id) };
  };
  const noindex = (rep: any) => rep.header('X-Robots-Tag', 'noindex, nofollow').header('Cache-Control', 'private, no-store');

  app.get('/api/s/:token', async (req, rep) => {
    noindex(rep);
    if (limited(req, rep, 'read')) return;
    const r = resolve((req.params as Row).token, req, rep);
    if (!r) return;
    db.prepare('UPDATE shares SET views = views + 1 WHERE id = ?').run(r.share.id);
    const photos = r.photoIds.map((id, i) => { const p = one('SELECT id, title, w, h FROM photos WHERE id = ?', id); return p ? { id: p.id, title: p.title, ar: p.w && p.h ? p.w / p.h : 1.5, n: i + 1 } : null; }).filter(Boolean);
    return { kind: r.share.kind, name: r.name, description: r.description, chosenIds: r.chosenIds ?? [], target: r.target ?? null, layout: r.layout ?? null, allowDownload: !!r.share.allow_download, allowReview: !!r.share.allow_review, allowSuggest: canSuggest(r.share), askName: !!r.share.ask_name, owner: displayNameOf(db) || x.tenant().user.name.split(' ')[0] || '', expiresAt: r.share.expires_at, photos,
      // Who is looking, if they are signed in, and how a visitor could make an account (a guest one) instead of only giving a name.
      viewer: ((req as any).shareViewer as { name: string; role: string } | null) ? { name: (req as any).shareViewer.name, role: (req as any).shareViewer.role } : null,
      signIn: (() => { const a = loadAuth(x.sys); return a.enabled ? a.providers.filter((p) => p.type !== 'cloudflare').map((p) => ({ id: p.id, name: p.name })) : []; })() };
  });

  const image = (kind: 'thumb' | 'preview') => async (req: any, rep: any) => {
    if (limited(req, rep, 'image')) return;
    const r = resolve(req.params.token, req, rep);
    if (!r) return;
    const id = num(req.params.id);
    if (!r.photoIds.includes(id)) return notFound(rep); // only this link's own photographs
    const f = derivPath(x.cfg, id, kind);
    const row = one('SELECT hash FROM photos WHERE id = ?', id);
    if (!row || !(await ensureDeriv(x.db, x.cfg, id, kind))) return notFound(rep, 'No preview available');
    noindex(rep);
    return serveDerivative(req, rep, f, String(row.hash), kind);
  };
  app.get('/api/s/:token/photos/:id/thumb', image('thumb'));
  app.get('/api/s/:token/photos/:id/preview', image('preview'));

  app.get('/api/s/:token/photos/:id/original', async (req, rep) => {
    noindex(rep);
    if (limited(req, rep, 'download')) return;
    const r = resolve((req.params as Row).token, req, rep);
    if (!r) return;
    if (!r.share.allow_download) return rep.code(403).send({ error: 'Downloads are not allowed on this link' });
    const id = num((req.params as Row).id);
    if (!r.photoIds.includes(id)) return notFound(rep);
    const p = one('SELECT path, file FROM photos WHERE id = ?', id);
    if (!p) return notFound(rep, 'The original file is missing');
    const q = req.query as Row;
    const n = Math.round(num(q.n, 0));
    const pad = Math.min(4, Math.max(0, Math.round(num(q.pad, 0))));
    // Kept here as a smaller copy: the full-size original comes from the owner's cloud account.
    let remote = null;
    try { remote = await remoteOriginal(db, x.cfg, p.path); } catch { return rep.code(502).send({ error: 'The original is not available right now. Try again later.' }); }
    if (remote) {
      const rn = (n > 0 ? `${String(n).padStart(pad, '0')}_` : '') + remote.name;
      db.prepare('UPDATE shares SET downloads = downloads + 1 WHERE id = ?').run(r.share.id);
      return rep.header('Content-Type', 'application/octet-stream').header('Cache-Control', 'no-store')
        .header('Content-Disposition', `attachment; filename="${rn.replace(/[^\x20-\x7e]|["\\;]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(rn)}`)
        .send(remote.stream);
    }
    if (!fs.existsSync(p.path)) return notFound(rep, 'The original file is missing');
    const name = (n > 0 ? `${String(n).padStart(pad, '0')}_` : '') + p.file;
    db.prepare('UPDATE shares SET downloads = downloads + 1 WHERE id = ?').run(r.share.id);
    return rep
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\;]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`)
      .header('Content-Length', String(fs.statSync(p.path).size))
      .send(fs.createReadStream(p.path));
  });

  // A guest suggests another candidate in place of one of the chosen prints. One suggestion per person per print; sending none takes theirs back.
  const MAX_SUGGESTIONS = 2000;
  app.post('/api/s/:token/suggest', async (req, rep) => {
    noindex(rep);
    if (limited(req, rep, 'review')) return;
    const r = resolve((req.params as Row).token, req, rep);
    if (!r) return;
    if (!canSuggest(r.share)) return rep.code(403).send({ error: 'Suggestions are not allowed on this link' });
    const b = (req.body ?? {}) as Row;
    const forId = num(b.forId), photoId = b.photoId === null ? null : num(b.photoId);
    const reviewer = String(b.reviewer ?? '').trim().slice(0, 60) || 'Guest';
    if (!r.chosenIds?.includes(forId)) return rep.code(400).send({ error: 'That is not one of the prints' });
    if (photoId !== null && (!r.photoIds.includes(photoId) || r.chosenIds.includes(photoId))) return rep.code(400).send({ error: 'That photograph cannot be suggested' }); // checked first, so a bad request never wipes an earlier good one
    db.prepare('DELETE FROM share_suggestions WHERE share_id = ? AND for_id = ? AND reviewer = ?').run(r.share.id, forId, reviewer);
    if (photoId === null) return { ok: true };
    if ((one('SELECT COUNT(*) n FROM share_suggestions WHERE share_id = ?', r.share.id) as Row).n >= MAX_SUGGESTIONS) return rep.code(429).send({ error: 'This link has reached its suggestion limit' });
    const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 500) : null;
    db.prepare('INSERT INTO share_suggestions(share_id, reviewer, for_id, photo_id, note, ts) VALUES(?, ?, ?, ?, ?, ?)').run(r.share.id, reviewer, forId, photoId, note, new Date().toISOString());
    tell(r.share, reviewer, 'guest-suggestion', 'suggested a change');
    return { ok: true };
  });

  // What a visitor needs before the link opens: whether it has a PIN (and whether this device is locked out). Nothing about what is in it.
  app.get('/api/s/:token/gate', async (req, rep) => {
    noindex(rep);
    if (limited(req, rep, 'lookup')) return;
    const token = (req.params as Row).token;
    const share = new RegExp(`^${TOKEN}$`).test(token) ? one('SELECT * FROM shares WHERE token = ?', token) : undefined;
    if (!share) return rep.code(404).send({ error: 'This link does not exist' });
    if (statusOf(share) !== 'active') return rep.code(410).send({ error: share.revoked ? 'This link has been turned off' : 'This link has expired' });
    const cookies: string[] = [];
    const dev = deviceOf(req, cookies);
    if (cookies.length) rep.header('Set-Cookie', cookies);
    return { pinRequired: !!share.pin && !pinPassed(share, req), lockedFor: share.pin ? lockOf(share, dev) : 0, askName: !!share.ask_name };
  });
  app.post('/api/s/:token/pin', async (req, rep) => {
    noindex(rep);
    if (limited(req, rep, 'lookup')) return;
    const token = (req.params as Row).token;
    const share = new RegExp(`^${TOKEN}$`).test(token) ? one('SELECT * FROM shares WHERE token = ?', token) : undefined;
    if (!share || statusOf(share) !== 'active') return rep.code(404).send({ error: 'This link does not exist' });
    if (!share.pin) return { ok: true };
    const cookies: string[] = [];
    const dev = deviceOf(req, cookies);
    const key = `${share.id}|${dev}`;
    const reply = (code: number, body: Row) => { if (cookies.length) rep.header('Set-Cookie', cookies); return rep.code(code).send(body); };
    const wait = lockOf(share, dev);
    if (wait) return reply(429, { error: 'Too many wrong PINs. This link is locked on this device for a while.', lockedFor: wait });
    const given = String(((req.body ?? {}) as Row).pin ?? '');
    const a = Buffer.from(given.padEnd(8).slice(0, 8)), b = Buffer.from(String(share.pin).padEnd(8).slice(0, 8));
    if (/^\d{4}$/.test(given) && crypto.timingSafeEqual(a, b)) {
      pinFails.delete(key);
      cookies.push(`frames_pin_${share.id}=${pinSig(share)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`);
      return reply(200, { ok: true });
    }
    const f = pinFails.get(key) ?? { n: 0, until: 0 };
    f.n = f.until && f.until <= Date.now() ? 1 : f.n + 1;
    if (f.n >= PIN_TRIES) { f.until = Date.now() + PIN_LOCK_MS; f.n = 0; }
    pinFails.set(key, f);
    if (pinFails.size > 5000) for (const [k, v] of pinFails) if (v.until < Date.now() && !v.n) pinFails.delete(k);
    const locked = f.until > Date.now();
    return reply(400, { error: locked ? 'Too many wrong PINs. This link is locked on this device for 15 minutes.' : 'That PIN is not right.', triesLeft: locked ? 0 : PIN_TRIES - f.n, lockedFor: locked ? Math.ceil((f.until - Date.now()) / 1000) : 0 });
  });

  // Passing the Turnstile check for share links: the answer is checked with Cloudflare and, if good, a signed cookie says so for a while.
  app.post('/api/s/:token/human', async (req, rep) => {
    noindex(rep);
    if (limited(req, rep, 'lookup')) return;
    const v = await verifyToken(x.sys, ((req.body ?? {}) as Row).token, req.ip, x.cfg.turnstileUrl);
    if (v === 'bad') return rep.code(400).send({ error: 'That check did not pass. Try again.' });
    rep.header('Set-Cookie', humanCookie(x.sys, req.protocol === 'https' || String(req.headers['x-forwarded-proto'] ?? '') === 'https'));
    return { ok: true };
  });

  // A guest suggests a different layout: other sizes, frames, more or fewer prints. It is kept apart from the composition and carries no photographs
  // (the photographer's stay where they are when it is applied). One per person per link; sending null takes it back.
  const MAX_LAYOUTS = 500;
  app.post('/api/s/:token/layout', async (req, rep) => {
    noindex(rep);
    if (limited(req, rep, 'review')) return;
    const r = resolve((req.params as Row).token, req, rep);
    if (!r) return;
    if (!canSuggest(r.share)) return rep.code(403).send({ error: 'Suggestions are not allowed on this link' });
    if (r.share.kind !== 'collection') return rep.code(400).send({ error: 'Only a composition has a layout' });
    const b = (req.body ?? {}) as Row;
    const reviewer = String(b.reviewer ?? '').trim().slice(0, 60) || 'Guest';
    if (b.layout === null) { db.prepare('DELETE FROM share_layouts WHERE share_id = ? AND reviewer = ?').run(r.share.id, reviewer); return { ok: true }; }
    const raw = b.layout as { mode?: unknown; prints?: unknown } | undefined;
    const bare = raw && Array.isArray(raw.prints) ? { mode: raw.mode, prints: raw.prints.map((p) => (p && typeof p === 'object' ? { ...(p as object), photoId: null, photoId2: null } : p)) } : null;
    const layout = bare ? parseLayout(bare, new Set()) : null;
    if (!layout) return rep.code(400).send({ error: 'That is not a layout we can use' }); // checked first, so a bad request never wipes an earlier good one
    if (!one('SELECT 1 x FROM share_layouts WHERE share_id = ? AND reviewer = ?', r.share.id, reviewer) && (one('SELECT COUNT(*) n FROM share_layouts WHERE share_id = ?', r.share.id) as Row).n >= MAX_LAYOUTS) return rep.code(429).send({ error: 'This link has reached its suggestion limit' });
    const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 500) : null;
    db.prepare('INSERT INTO share_layouts(share_id, reviewer, layout, note, ts) VALUES(?, ?, ?, ?, ?) ON CONFLICT(share_id, reviewer) DO UPDATE SET layout = excluded.layout, note = excluded.note, ts = excluded.ts')
      .run(r.share.id, reviewer, JSON.stringify(layout), note, new Date().toISOString());
    return { ok: true };
  });

  // A guest suggests another colour for one print's frame. One per person per print; null takes it back. Kept apart until the photographer applies it.
  app.post('/api/s/:token/frame', async (req, rep) => {
    noindex(rep);
    if (limited(req, rep, 'review')) return;
    const r = resolve((req.params as Row).token, req, rep);
    if (!r) return;
    if (!canSuggest(r.share)) return rep.code(403).send({ error: 'Suggestions are not allowed on this link' });
    const b = (req.body ?? {}) as Row;
    const reviewer = String(b.reviewer ?? '').trim().slice(0, 60) || 'Guest';
    const printId = num(b.printId);
    const print = ((r.layout as { prints?: { id: number; frame: { color: string } | null }[] } | undefined)?.prints ?? []).find((p) => p.id === printId);
    if (!print?.frame) return rep.code(400).send({ error: 'That print has no frame' });
    if (b.color === null) { db.prepare('DELETE FROM share_frames WHERE share_id = ? AND reviewer = ? AND print_id = ?').run(r.share.id, reviewer, printId); return { ok: true }; }
    if (typeof b.color !== 'string' || !(FRAME_COLOURS as readonly string[]).includes(b.color) || b.color === 'none') return rep.code(400).send({ error: 'Choose a frame colour' });
    if ((one('SELECT COUNT(*) n FROM share_frames WHERE share_id = ?', r.share.id) as Row).n >= 2000) return rep.code(429).send({ error: 'This link has reached its suggestion limit' });
    db.prepare('INSERT INTO share_frames(share_id, reviewer, print_id, color, ts) VALUES(?, ?, ?, ?, ?) ON CONFLICT(share_id, reviewer, print_id) DO UPDATE SET color = excluded.color, ts = excluded.ts')
      .run(r.share.id, reviewer, printId, b.color, new Date().toISOString());
    return { ok: true };
  });

  // A guest's comment, on the whole link or on one photograph. Guests never see comments (their own or anyone's): they are for the photographer.
  const MAX_COMMENTS = 2000;
  app.post('/api/s/:token/comment', async (req, rep) => {
    noindex(rep);
    if (limited(req, rep, 'review')) return;
    const r = resolve((req.params as Row).token, req, rep);
    if (!r) return;
    if (!r.share.allow_review) return rep.code(403).send({ error: 'Comments are not allowed on this link' });
    const b = (req.body ?? {}) as Row;
    const body = typeof b.body === 'string' ? b.body.trim().slice(0, 1000) : '';
    if (!body) return rep.code(400).send({ error: 'Write a comment first' });
    const photoId = b.photoId === null || b.photoId === undefined ? null : num(b.photoId);
    if (photoId !== null && !r.photoIds.includes(photoId)) return rep.code(400).send({ error: 'That photograph is not on this link' });
    if ((one('SELECT COUNT(*) n FROM share_comments WHERE share_id = ?', r.share.id) as Row).n >= MAX_COMMENTS) return rep.code(429).send({ error: 'This link has reached its comment limit' });
    const reviewer = String(b.reviewer ?? '').trim().slice(0, 60) || 'Guest';
    db.prepare('INSERT INTO share_comments(share_id, reviewer, photo_id, body, ts) VALUES(?, ?, ?, ?, ?)').run(r.share.id, reviewer, photoId, body, new Date().toISOString());
    return { ok: true };
  });

  const MAX_GUEST_REVIEWS = 5000; // a ceiling on what one public link can store
  app.post('/api/s/:token/review', async (req, rep) => {
    noindex(rep);
    if (limited(req, rep, 'review')) return;
    const r = resolve((req.params as Row).token, req, rep);
    if (!r) return;
    if (!r.share.allow_review) return rep.code(403).send({ error: 'Reviews are not allowed on this link' });
    const b = (req.body ?? {}) as Row;
    const photoId = num(b.photoId), rating = Math.round(num(b.rating));
    if (!r.photoIds.includes(photoId) || rating < 1 || rating > 5) return rep.code(400).send({ error: 'That rating cannot be saved' });
    const reviewer = String(b.reviewer ?? '').trim().slice(0, 60) || 'Guest';
    const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 1000) : null;
    if ((one('SELECT COUNT(*) n FROM share_reviews WHERE share_id = ?', r.share.id) as Row).n >= MAX_GUEST_REVIEWS) return rep.code(429).send({ error: 'This link has reached its review limit' });
    // One rating per person per photograph: rating again replaces the earlier one.
    db.prepare('DELETE FROM share_reviews WHERE share_id = ? AND photo_id = ? AND reviewer = ?').run(r.share.id, photoId, reviewer);
    db.prepare('INSERT INTO share_reviews(share_id, photo_id, reviewer, rating, note, ts) VALUES(?, ?, ?, ?, ?, ?)').run(r.share.id, photoId, reviewer, rating, note, new Date().toISOString());
    tell(r.share, reviewer, 'guest-rating', 'rated your photos');
    return { ok: true };
  });
}
