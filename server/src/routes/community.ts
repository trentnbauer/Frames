import { ensureDeriv } from '../cache.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { derivPath } from '../ingest.js';
import { serveDerivative } from '../imageServe.js';
import type { Ctx, Row } from '../ctx.js';
import { getSetting, setSetting, type DB } from '../db.js';
import { notify } from '../notifications.js';
import type { Tenant } from '../tenants.js';
import type { User } from '../users.js';

/**
 * Community review: rate other photographers' photos, anonymously both ways.
 *  - Only owners who switched on "Let other Frames users review my photos" (and only within their Share scope) are shown.
 *  - Never your own photos, never photos tagged nudity / violence / adult, never ones you already rated, never ones hidden by a report.
 *  - Least-reviewed first: a random pick from the band with the fewest community ratings, at most 2 per owner in 20 photos.
 *  - A report hides the photo from the reporter at once, and from everyone after 2 reports (or 1 from an administrator), until an
 *    administrator keeps or removes it.
 * A photo is only ever named to the reviewer by a signed, opaque token: no owner, no file name, no place.
 */
export type CommunityPrefs = { optIn: boolean; share: 'any' | 'portfolio' | 'rated4'; written: boolean; showOnHome: boolean };
export const COMMUNITY_DEFAULT: CommunityPrefs = { optIn: false, share: 'any', written: true, showOnHome: true };
export const communityPrefs = (db: DB): CommunityPrefs => ({ ...COMMUNITY_DEFAULT, ...getSetting<Partial<CommunityPrefs>>(db, 'community', {}) });
export const SENSITIVE = ['nudity', 'violence', 'adult'];

const SESSION = 20, PER_OWNER = 2;

export function registerCommunity(app: FastifyInstance, x: Ctx) {
  const { sys, db } = x;
  const me = (req: any) => req.authUser as User;
  const key = (): string => { let k = getSetting<string>(sys, 'shareKey', ''); if (!k) { k = crypto.randomBytes(32).toString('hex'); setSetting(sys, 'shareKey', k); } return k; };
  const sign = (o: number, p: number) => crypto.createHmac('sha256', key()).update(`community|${o}|${p}`).digest('base64url').slice(0, 22);
  const tokenOf = (o: number, p: number) => `${o.toString(36)}.${p.toString(36)}.${sign(o, p)}`;
  const parse = (t: unknown): { owner: number; photo: number } | null => {
    const m = /^([0-9a-z]{1,8})\.([0-9a-z]{1,10})\.([\w-]{22})$/.exec(String(t ?? ''));
    if (!m) return null;
    const owner = parseInt(m[1], 36), photo = parseInt(m[2], 36);
    const want = sign(owner, photo);
    return want.length === m[3].length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m[3])) ? { owner, photo } : null;
  };

  const status = (owner: number, photo: number) => (sys.prepare('SELECT status FROM community_reports WHERE owner = ? AND photo = ? ORDER BY CASE status WHEN \'removed\' THEN 0 WHEN \'open\' THEN 1 ELSE 2 END LIMIT 1').get(owner, photo) as { status: string } | undefined)?.status ?? '';
  const hiddenFor = (owner: number, photo: number, reporter: number): boolean => {
    const st = status(owner, photo);
    if (st === 'removed' || st === 'kept') return st === 'removed';
    const open = sys.prepare("SELECT reporter, admin FROM community_reports WHERE owner = ? AND photo = ? AND status = 'open'").all(owner, photo) as { reporter: number; admin: number }[];
    return open.length >= 2 || open.some((r) => r.admin === 1) || open.some((r) => r.reporter === reporter);
  };

  /** Everyone's photographs this person may be shown. */
  const candidates = (viewer: number): { owner: number; photo: number; n: number }[] => {
    const rated = new Set((sys.prepare('SELECT owner, photo FROM community_ratings WHERE reviewer = ?').all(viewer) as Row[]).map((r) => `${r.owner}:${r.photo}`));
    const counts = new Map((sys.prepare('SELECT owner, photo, COUNT(*) n FROM community_ratings GROUP BY owner, photo').all() as Row[]).map((r) => [`${r.owner}:${r.photo}`, r.n as number]));
    const out: { owner: number; photo: number; n: number }[] = [];
    for (const t of x.tenants.all()) {
      if (t.user.id === viewer || t.user.disabled || t.user.role === 'guest') continue;
      const prefs = communityPrefs(t.db);
      if (!prefs.optIn) continue;
      const where = prefs.share === 'portfolio' ? "AND (p.id IN (SELECT photo_id FROM portfolio_marks WHERE favourite = 1 AND out = 0) OR p.id IN (SELECT cp.photo_id FROM collection_photos cp WHERE cp.collection_id = (SELECT CAST(json_extract(value, '$.collectionId') AS INTEGER) FROM settings WHERE key = 'portfolio')))" : prefs.share === 'rated4' ? 'AND (SELECT AVG(r.rating) FROM reviews r WHERE r.photo_id = p.id) >= 4' : '';
      let rows: Row[] = [];
      try {
        rows = t.db.prepare(`SELECT p.id FROM photos p WHERE p.missing = 0 AND p.has_derivs = 1 AND p.archived = 0 ${where}
          AND NOT EXISTS (SELECT 1 FROM tags g WHERE g.photo_id = p.id AND g.accepted != -1 AND lower(g.name) IN (${SENSITIVE.map(() => '?').join(',')})) LIMIT 3000`).all(...SENSITIVE) as Row[];
      } catch { try { rows = t.db.prepare(`SELECT p.id FROM photos p WHERE p.missing = 0 AND p.archived = 0 AND NOT EXISTS (SELECT 1 FROM tags g WHERE g.photo_id = p.id AND g.accepted != -1 AND lower(g.name) IN (${SENSITIVE.map(() => '?').join(',')})) LIMIT 3000`).all(...SENSITIVE) as Row[]; } catch { rows = []; } }
      for (const r of rows) {
        const k = `${t.user.id}:${r.id}`;
        if (rated.has(k) || hiddenFor(t.user.id, r.id as number, viewer)) continue;
        out.push({ owner: t.user.id, photo: r.id as number, n: counts.get(k) ?? 0 });
      }
    }
    return out;
  };

  const recentOwners = (viewer: number): number[] => (sys.prepare('SELECT owner FROM community_ratings WHERE reviewer = ? ORDER BY id DESC LIMIT ?').all(viewer, SESSION - 1) as Row[]).map((r) => r.owner as number);

  app.get('/api/community/summary', async (req) => {
    const u = me(req);
    const prefs = communityPrefs(db);
    let waiting = 0;
    try { waiting = candidates(u.id).length; } catch { waiting = 0; }
    return { enabled: waiting > 0 || prefs.optIn, waiting: Math.min(waiting, SESSION), showOnHome: prefs.showOnHome, optIn: prefs.optIn };
  });

  app.get('/api/community/next', async (req) => {
    const u = me(req);
    const skipped = String(((req.query ?? {}) as Row).skip ?? '').split(',').map(parse).filter((v): v is { owner: number; photo: number } => !!v).map((v) => `${v.owner}:${v.photo}`);
    const all = candidates(u.id).filter((c) => !skipped.includes(`${c.owner}:${c.photo}`));
    if (!all.length) return { photo: null, left: 0 };
    const recent = recentOwners(u.id);
    const ok = all.filter((c) => recent.filter((o) => o === c.owner).length < PER_OWNER);
    const pool = ok.length ? ok : all;
    const min = Math.min(...pool.map((c) => c.n));
    const band = pool.filter((c) => c.n <= min + 1); // the band with the fewest community ratings
    const pick = band[crypto.randomInt(band.length)];
    const t = x.tenants.get(pick.owner);
    const p = t?.db.prepare('SELECT w, h, camera, lens, film, focal_mm FROM photos WHERE id = ?').get(pick.photo) as { w: number; h: number; camera: string; lens: string; film: string; focal_mm: number | null } | undefined;
    const prefs = t ? communityPrefs(t.db) : COMMUNITY_DEFAULT;
    const done = (sys.prepare('SELECT COUNT(*) n FROM community_ratings WHERE reviewer = ? AND ts > ?').get(u.id, new Date(Date.now() - 3_600_000).toISOString()) as { n: number }).n;
    // What the reviewer is told: an anonymous number for the photographer, and the camera details (never a name, place or file).
    const anon = `#${(parseInt(crypto.createHash('sha256').update(`${key()}|${pick.owner}`).digest('hex').slice(0, 6), 16) % 9000) + 1000}`;
    const seen = sys.prepare('SELECT COUNT(*) n, AVG(rating) a FROM community_ratings WHERE owner = ? AND photo = ?').get(pick.owner, pick.photo) as { n: number; a: number | null };
    return { others: { n: seen.n, avg: seen.a }, photo: { token: tokenOf(pick.owner, pick.photo), ar: p?.w && p?.h ? p.w / p.h : 1.5 }, meta: { anon, details: [p?.camera, p?.focal_mm ? `${Math.round(p.focal_mm)}mm` : '', p?.film].filter(Boolean).join(' · ') }, written: prefs.written, left: Math.min(all.length, SESSION), doneThisSession: done % SESSION };
  });

  // The picture, by token only. It checks again that the photograph may be shown, so a stale token never leaks a withdrawn one.
  app.get('/api/community/image/:token', async (req, rep) => {
    const u = me(req);
    const t = parse((req.params as Row).token);
    const owner = t ? x.tenants.get(t.owner) : null;
    if (!t || !owner || t.owner === u.id || !communityPrefs(owner.db).optIn || hiddenFor(t.owner, t.photo, u.id)) return rep.code(404).send({ error: 'Not found' });
    const row = owner.db.prepare('SELECT hash FROM photos WHERE id = ? AND missing = 0').get(t.photo) as { hash: string } | undefined;
    const f = derivPath(owner.cfg, t.photo, 'preview');
    if (!row || !(await ensureDeriv(owner.db, owner.cfg, t.photo, 'preview'))) return rep.code(404).send({ error: 'No preview' });
    return serveDerivative(req, rep, f, String(row.hash), 'preview');
  });

  app.post('/api/community/rate', async (req, rep) => {
    const u = me(req);
    const b = (req.body ?? {}) as Row;
    const t = parse(b.token);
    const rating = Math.round(Number(b.rating));
    const owner = t ? x.tenants.get(t.owner) : null;
    if (!t || !owner || t.owner === u.id || !(rating >= 1 && rating <= 5) || !communityPrefs(owner.db).optIn || hiddenFor(t.owner, t.photo, u.id)) return rep.code(400).send({ error: 'That rating cannot be saved.' });
    const note = communityPrefs(owner.db).written && typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 500) : null;
    sys.prepare('DELETE FROM community_ratings WHERE owner = ? AND photo = ? AND reviewer = ?').run(t.owner, t.photo, u.id);
    sys.prepare('INSERT INTO community_ratings (owner, photo, reviewer, rating, note, ts) VALUES (?,?,?,?,?,?)').run(t.owner, t.photo, u.id, rating, note, new Date().toISOString());
    notify(owner.db, 'community-rating', 'Someone in the community rated one of your photos', { screen: `/photo/${t.photo}` }, `cr:${t.photo}:${new Date().toISOString().slice(0, 10)}`);
    return { ok: true };
  });

  const REASONS = ['nudity', 'violence', 'adult', 'stolen', 'spam', 'harassment', 'not-mine-to-share', 'other'];
  app.post('/api/community/report', async (req, rep) => {
    const u = me(req);
    const b = (req.body ?? {}) as Row;
    const t = parse(b.token);
    const owner = t ? x.tenants.get(t.owner) : null;
    if (!t || !owner || t.owner === u.id) return rep.code(400).send({ error: 'That photo cannot be reported.' });
    const reason = REASONS.includes(String(b.reason)) ? String(b.reason) : 'other';
    if (sys.prepare("SELECT 1 FROM community_reports WHERE owner = ? AND photo = ? AND reporter = ? AND status = 'open'").get(t.owner, t.photo, u.id)) return { ok: true };
    const id = Number(sys.prepare('INSERT INTO community_reports (owner, photo, reporter, admin, reason, note, status, ts) VALUES (?,?,?,?,?,?,?,?)')
      .run(t.owner, t.photo, u.id, u.role === 'admin' ? 1 : 0, reason, typeof b.note === 'string' ? b.note.trim().slice(0, 500) : '', 'open', new Date().toISOString()).lastInsertRowid);
    for (const a of x.tenants.all().filter((a) => a.user.role === 'admin' && !a.user.disabled)) {
      notify(a.db, 'report-queue', 'A community photo was reported and is waiting for a decision', { screen: '/settings?section=members&reports=1' }, `rq:${id}`);
    }
    return { ok: true };
  });

  // ---------- administrators: the reports queue ----------
  const reportDto = (r: Row) => ({ id: r.id, owner: x.tenants.get(r.owner)?.user.name ?? 'Unknown', ownerId: r.owner, photo: r.photo, token: tokenOf(r.owner, r.photo), reason: r.reason, note: r.note, reporters: 1, status: r.status, at: r.ts, byAdmin: !!r.admin });
  app.get('/api/admin/community/reports', async () => {
    const rows = sys.prepare("SELECT * FROM community_reports WHERE status = 'open' ORDER BY id DESC LIMIT 200").all() as Row[];
    const g = new Map<string, Row[]>();
    for (const r of rows) (g.get(`${r.owner}:${r.photo}`) ?? g.set(`${r.owner}:${r.photo}`, []).get(`${r.owner}:${r.photo}`)!).push(r);
    return { reports: [...g.values()].map((l) => ({ ...reportDto(l[0]), reporters: l.length, ids: l.map((r) => r.id) })) };
  });
  app.get('/api/admin/community/image/:token', async (req, rep) => {
    const t = parse((req.params as Row).token);
    const owner = t ? x.tenants.get(t.owner) : null;
    const f = t && owner ? derivPath(owner.cfg, t.photo, 'thumb') : '';
    const row = t && owner ? owner.db.prepare('SELECT hash FROM photos WHERE id = ?').get(t.photo) as { hash: string } | undefined : undefined;
    if (!f || !row || !fs.existsSync(f)) return rep.code(404).send({ error: 'Not found' });
    return serveDerivative(req, rep, f, String(row.hash), 'thumb');
  });
  app.post('/api/admin/community/reports/:id', async (req, rep) => {
    const id = Number((req.params as Row).id);
    const r = sys.prepare('SELECT * FROM community_reports WHERE id = ?').get(id) as Row | undefined;
    const verdict = ((req.body ?? {}) as Row).decision;
    if (!r || (verdict !== 'keep' && verdict !== 'remove')) return rep.code(400).send({ error: 'Choose Keep or Remove.' });
    const status = verdict === 'keep' ? 'kept' : 'removed';
    const all = sys.prepare("SELECT * FROM community_reports WHERE owner = ? AND photo = ? AND status = 'open'").all(r.owner, r.photo) as Row[];
    sys.prepare("UPDATE community_reports SET status = ? WHERE owner = ? AND photo = ? AND status = 'open'").run(status, r.owner, r.photo);
    const text = verdict === 'keep' ? 'A photo you reported was reviewed and kept in community review.' : 'A photo you reported was reviewed and removed from community review.';
    for (const rp of all) { const t = x.tenants.get(rp.reporter); if (t) notify(t.db, 'report-outcome', text, { screen: '/community' }, `ro:${rp.id}`); }
    const o = x.tenants.get(r.owner);
    if (verdict === 'remove' && o) notify(o.db, 'report-outcome', 'One of your photos was removed from community review after a report.', { screen: '/community' }, `ro:o:${r.photo}`); // never says who reported it
    return { ok: true };
  });

  // ---------- settings: Reviews, Community ----------
  app.get('/api/community/prefs', async () => communityPrefs(db));
  app.put('/api/community/prefs', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const cur = communityPrefs(db);
    const next: CommunityPrefs = { ...cur };
    for (const k of ['optIn', 'written', 'showOnHome'] as const) if (typeof b[k] === 'boolean') next[k] = b[k] as boolean;
    if (b.share !== undefined) {
      // take the value from our own list, not the request: String(['any']) would pass an includes() check
      const share = (['any', 'portfolio', 'rated4'] as const).find((v) => v === b.share);
      if (!share) return rep.code(400).send({ error: 'Choose any photo, portfolio photos or photos rated 4 and up.' });
      next.share = share;
    }
    setSetting(db, 'community', next);
    return next;
  });

  // ---------- Stats: the community section ----------
  app.get('/api/community/stats', async (req) => {
    const u = me(req);
    const mine = db.prepare('SELECT photo_id, AVG(rating) a FROM reviews GROUP BY photo_id').all() as { photo_id: number; a: number }[];
    const received = sys.prepare('SELECT photo, rating, note FROM community_ratings WHERE owner = ?').all(u.id) as Row[];
    const reviewed = (sys.prepare('SELECT COUNT(*) n FROM community_ratings WHERE reviewer = ?').get(u.id) as { n: number }).n;
    const avg = received.length ? received.reduce((a, r) => a + r.rating, 0) / received.length : null;
    const you = mine.length ? mine.reduce((a, r) => a + r.a, 0) / mine.length : null;
    const guests = db.prepare('SELECT AVG(rating) a FROM share_reviews').get() as { a: number | null };
    const byPhoto = new Map<number, number[]>();
    for (const r of received) (byPhoto.get(r.photo) ?? byPhoto.set(r.photo, []).get(r.photo)!).push(r.rating);
    const favourites = [...byPhoto.entries()].map(([id, l]) => ({ id, avg: l.reduce((a, b) => a + b, 0) / l.length, n: l.length })).filter((f) => f.n >= 1).sort((a, b) => b.avg - a.avg || b.n - a.n).slice(0, 6);
    return { reviewed, shared: byPhoto.size, received: received.length, average: avg, notes: received.filter((r) => r.note).length, you, guests: guests.a, community: avg, favourites };
  });

  void (null as unknown as Tenant);
}
