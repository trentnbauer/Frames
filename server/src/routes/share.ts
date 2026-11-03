import crypto from 'node:crypto';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { derivPath } from '../ingest.js';
import type { Ctx, Row } from '../ctx.js';

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

/** The only addresses served without the login: the share page shell, its assets, and the share API. */
export function isPublicPath(url: string): boolean {
  const path = url.split('?')[0];
  return new RegExp(`^/s/${TOKEN}/?$`).test(path) || new RegExp(`^/api/s/${TOKEN}(/|$)`).test(path) || /^\/assets\/[\w.-]+$/.test(path) || path === '/icon.svg';
}
export const isSharePath = (url: string) => /^\/(api\/)?s\//.test(url);

type Bucket = { n: number; reset: number };

export function registerShare(app: FastifyInstance, x: Ctx) {
  const { db, num, one, all, notFound } = x;

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
    reviews: (one('SELECT COUNT(*) n FROM share_reviews WHERE share_id = ?', s.id) as Row).n,
  });

  app.post('/api/shares', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const kind = b.kind === 'shoot' ? 'shoot' : b.kind === 'collection' ? 'collection' : null;
    if (!kind) return rep.code(400).send({ error: 'kind must be collection or shoot' });
    if (!one(`SELECT 1 x FROM ${kind === 'shoot' ? 'shoots' : 'collections'} WHERE id = ?`, num(b.id))) return notFound(rep);
    let expires: string | null = null;
    if (b.expiresAt) {
      const t = new Date(String(b.expiresAt));
      if (Number.isNaN(+t) || +t < Date.now()) return rep.code(400).send({ error: 'The expiry date must be in the future' });
      expires = t.toISOString();
    }
    // The first part names the owner, so a visitor with no sign-in is sent to the right library.
    const token = `${x.tenant().user.id.toString(36)}_${crypto.randomBytes(16).toString('base64url')}`;
    const id = Number(db.prepare('INSERT INTO shares(token, kind, target_id, label, allow_download, allow_review, expires_at, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
      .run(token, kind, num(b.id), String(b.label ?? '').slice(0, 80), b.allowDownload ? 1 : 0, b.allowReview ? 1 : 0, expires, new Date().toISOString()).lastInsertRowid);
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
  // What guests thought, per photograph. Kept apart from your own reviews: it never changes your ratings or schedule.
  app.get('/api/shares/:id/reviews', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shares WHERE id = ?', id)) return notFound(rep);
    const rows = all('SELECT r.photo_id, r.reviewer, r.rating, r.note, r.ts, p.title FROM share_reviews r JOIN photos p ON p.id = r.photo_id WHERE r.share_id = ? ORDER BY r.ts', id);
    const by = new Map<number, { photoId: number; title: string; entries: { reviewer: string; rating: number; note: string | null; ts: string }[] }>();
    for (const r of rows) (by.get(r.photo_id) ?? by.set(r.photo_id, { photoId: r.photo_id, title: r.title, entries: [] }).get(r.photo_id)!).entries.push({ reviewer: r.reviewer, rating: r.rating, note: r.note, ts: r.ts });
    return [...by.values()].map((p) => ({ ...p, n: p.entries.length, avg: p.entries.reduce((a, e) => a + e.rating, 0) / p.entries.length }));
  });

  // ---------- public side (no login) ----------
  type Resolved = { share: Row; name: string; description: string; photoIds: number[] };
  const resolve = (token: string, req: any, rep: any): Resolved | null => {
    if (!new RegExp(`^${TOKEN}$`).test(token)) { if (!limited(req, rep, 'lookup')) rep.code(404).send({ error: 'This link does not exist' }); return null; }
    const share = one('SELECT * FROM shares WHERE token = ?', token);
    if (!share) { if (!limited(req, rep, 'lookup')) rep.code(404).send({ error: 'This link does not exist' }); return null; }
    if (statusOf(share) !== 'active') { rep.code(410).send({ error: share.revoked ? 'This link has been turned off' : 'This link has expired' }); return null; }
    if (share.kind === 'collection') {
      const c = one('SELECT name, description FROM collections WHERE id = ?', share.target_id);
      if (!c) { rep.code(410).send({ error: 'This link is no longer available' }); return null; }
      return { share, name: c.name, description: c.description, photoIds: all('SELECT photo_id FROM collection_photos WHERE collection_id = ? ORDER BY pos', share.target_id).map((r) => r.photo_id) };
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
    return { kind: r.share.kind, name: r.name, description: r.description, allowDownload: !!r.share.allow_download, allowReview: !!r.share.allow_review, expiresAt: r.share.expires_at, photos };
  });

  const image = (kind: 'thumb' | 'preview') => async (req: any, rep: any) => {
    if (limited(req, rep, 'image')) return;
    const r = resolve(req.params.token, req, rep);
    if (!r) return;
    const id = num(req.params.id);
    if (!r.photoIds.includes(id)) return notFound(rep); // only this link's own photographs
    const f = derivPath(x.cfg, id, kind);
    if (!fs.existsSync(f)) return notFound(rep, 'No preview available');
    return noindex(rep).header('Cache-Control', 'private, max-age=3600').type('image/jpeg').send(fs.createReadStream(f));
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
    if (!p || !fs.existsSync(p.path)) return notFound(rep, 'The original file is missing');
    const q = req.query as Row;
    const n = Math.round(num(q.n, 0));
    const pad = Math.min(4, Math.max(0, Math.round(num(q.pad, 0))));
    const name = (n > 0 ? `${String(n).padStart(pad, '0')}_` : '') + p.file;
    db.prepare('UPDATE shares SET downloads = downloads + 1 WHERE id = ?').run(r.share.id);
    return rep
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\;]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`)
      .header('Content-Length', String(fs.statSync(p.path).size))
      .send(fs.createReadStream(p.path));
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
    return { ok: true };
  });
}
