import { signupsOn } from '../users.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { derivPath } from '../ingest.js';
import type { Ctx, Row } from '../ctx.js';
import { remoteOriginal } from '../cloud.js';
import { loadAuth } from '../auth.js';
import { parseLayout } from '../layout.js';

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
  return new RegExp(`^/s/${TOKEN}/?$`).test(path) || new RegExp(`^/api/s/${TOKEN}(/|$)`).test(path) || /^\/assets\/[\w.-]+$/.test(path) || path === '/icon.svg' || path === '/privacy';
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

  // ---------- public side (no login) ----------
  type Resolved = { share: Row; name: string; description: string; photoIds: number[]; chosenIds?: number[]; target?: unknown; layout?: unknown };
  const resolve = (token: string, req: any, rep: any): Resolved | null => {
    if (!new RegExp(`^${TOKEN}$`).test(token)) { if (!limited(req, rep, 'lookup')) rep.code(404).send({ error: 'This link does not exist' }); return null; }
    const share = one('SELECT * FROM shares WHERE token = ?', token);
    if (!share) { if (!limited(req, rep, 'lookup')) rep.code(404).send({ error: 'This link does not exist' }); return null; }
    if (statusOf(share) !== 'active') { rep.code(410).send({ error: share.revoked ? 'This link has been turned off' : 'This link has expired' }); return null; }
    if (share.kind === 'collection') {
      const c = one('SELECT name, description FROM collections WHERE id = ?', share.target_id);
      if (!c) { rep.code(410).send({ error: 'This link is no longer available' }); return null; }
      const rows = all('SELECT photo_id, chosen FROM collection_photos WHERE collection_id = ? ORDER BY pos', share.target_id);
      const t = one('SELECT target FROM collections WHERE id = ?', share.target_id);
      return { share, name: c.name, description: c.description, photoIds: rows.map((r) => r.photo_id), chosenIds: rows.filter((r) => r.chosen).map((r) => r.photo_id), target: t?.target ? JSON.parse(t.target) : null, layout: x.collectionDto(one('SELECT * FROM collections WHERE id = ?', share.target_id)!).layout };
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
    return { kind: r.share.kind, name: r.name, description: r.description, chosenIds: r.chosenIds ?? [], target: r.target ?? null, layout: r.layout ?? null, allowDownload: !!r.share.allow_download, allowReview: !!r.share.allow_review, expiresAt: r.share.expires_at, photos,
      // Who is looking, if they are signed in, and how a visitor could make an account (a guest one) instead of only giving a name.
      viewer: ((req as any).shareViewer as { name: string; role: string } | null) ? { name: (req as any).shareViewer.name, role: (req as any).shareViewer.role } : null,
      signIn: (() => { const a = loadAuth(x.sys); return a.enabled && signupsOn(x.sys, x.cfg.allowSignups !== false) ? a.providers.filter((p) => p.type !== 'cloudflare').map((p) => ({ id: p.id, name: p.name })) : []; })() };
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
    if (!r.share.allow_review) return rep.code(403).send({ error: 'Suggestions are not allowed on this link' });
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
    if (!r.share.allow_review) return rep.code(403).send({ error: 'Suggestions are not allowed on this link' });
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
    return { ok: true };
  });
}
