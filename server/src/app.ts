import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { getSetting, setSetting, type DB } from './db.js';
import { derivPath, pending, scan, type Cfg } from './ingest.js';
import { addDays, nextIntervalDays } from './schedule.js';
import { loadSettings, saveSettings } from './settings.js';

type Row = Record<string, any>;
export type AppCfg = Cfg & { webDir?: string; authUser?: string; authPassword?: string; allowedHosts?: string[]; version?: string };

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const avgOf = (r: number[]) => (r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0);
const digest = (s: string) => crypto.createHash('sha256').update(s).digest();

// Fonts come from Google Fonts. Everything else must be same-origin.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export function buildApp(db: DB, cfg: AppCfg) {
  const app = Fastify({ logger: false });
  let scanning = false;

  // ---------- security ----------
  app.addHook('onRequest', async (req, rep) => {
    // Optional single-user login (HTTP Basic). Set AUTH_PASSWORD to turn it on. /api/health stays open for container health checks.
    if (cfg.authPassword && req.url !== '/api/health') {
      const m = /^Basic (.+)$/.exec(req.headers.authorization ?? '');
      const [u = '', ...rest] = m ? Buffer.from(m[1], 'base64').toString().split(':') : [];
      const ok = crypto.timingSafeEqual(digest(u + ':' + rest.join(':')), digest(`${cfg.authUser ?? 'frames'}:${cfg.authPassword}`));
      if (!m || !ok) return rep.code(401).header('WWW-Authenticate', 'Basic realm="Frames", charset="UTF-8"').send({ error: 'Authentication required' });
    }
    // Block cross-site writes (CSRF). Browsers always send Origin or Sec-Fetch-Site on these; plain API clients send neither.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      const sameHost = !origin || (() => { try { const h = new URL(origin).host; return h === req.headers.host || (cfg.allowedHosts ?? []).includes(h); } catch { return false; } })();
      if (!sameHost || req.headers['sec-fetch-site'] === 'cross-site') return rep.code(403).send({ error: 'Cross-site request blocked' });
    }
  });
  app.addHook('onSend', async (_req, rep) => {
    rep.header('Content-Security-Policy', CSP).header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer').header('X-Frame-Options', 'DENY');
  });
  // Never echo internal errors (SQL, file paths) to the client.
  app.setErrorHandler((e, _req, rep) => {
    const err = e as { statusCode?: number; message?: string };
    const code = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (code === 500) console.error(e);
    return rep.code(code).send({ error: code === 500 ? 'Internal error' : err.message });
  });

  // ---------- DTO helpers ----------
  const tagsOf = (id: number) =>
    (db.prepare('SELECT name, source, accepted FROM tags WHERE photo_id = ? ORDER BY name').all(id) as Row[]).map((t) => ({ name: t.name, source: t.source, accepted: !!t.accepted }));
  const reviewsOf = (id: number) =>
    (db.prepare('SELECT session, date, rating, note FROM reviews WHERE photo_id = ? ORDER BY session, id').all(id) as Row[]).map((r) => ({ session: r.session, date: r.date, rating: r.rating, note: r.note ?? undefined }));
  // The server path of an original is never sent to the browser.
  const photoDto = (p: Row, full = false, agg?: Map<number, { n: number; a: number }>) => {
    const ratings = agg ? [] : (db.prepare('SELECT rating FROM reviews WHERE photo_id = ?').all(p.id) as Row[]).map((r) => r.rating);
    const g = agg?.get(p.id);
    return {
      id: p.id, title: p.title, file: p.file, shootId: p.shoot_id, w: p.w, h: p.h,
      ar: p.w && p.h ? p.w / p.h : 1.5, hasImage: !!p.has_derivs,
      capturedAt: p.captured_at, camera: p.camera, lens: p.lens, exposure: p.exposure,
      fileType: p.file_type, sizeMb: Math.round(p.size_bytes / 1048576), archived: !!p.archived, missing: !!p.missing,
      nextReviewAt: p.next_review_at, reviewCount: g ? g.n : ratings.length, avgRating: g ? g.a : avgOf(ratings),
      ...(full ? { tags: tagsOf(p.id), reviews: reviewsOf(p.id) } : {}),
    };
  };
  const shootDto = (s: Row) => {
    const st = db.prepare('SELECT COUNT(*) n, MIN(captured_at) a, MAX(captured_at) b, MIN(id) first FROM photos WHERE shoot_id = ?').get(s.id) as Row;
    const sessions = loadSettings(db).sessions;
    const done = (db.prepare(`SELECT COUNT(*) n FROM (SELECT photo_id, COUNT(*) c FROM reviews WHERE photo_id IN (SELECT id FROM photos WHERE shoot_id = ?) GROUP BY photo_id HAVING c >= ?)`).get(s.id, sessions) as Row).n;
    const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    const dates = st.a ? (st.a.slice(0, 10) === st.b.slice(0, 10) ? fmt(st.a) : `${fmt(st.a)} – ${fmt(st.b)}`) : fmt(s.imported_at);
    return { id: s.id, name: s.name, source: s.source, place: s.place, dates, importedAt: s.imported_at, count: st.n, coverId: st.first, reviewPct: st.n ? Math.round((done / st.n) * 100) : 0, sessions };
  };
  const collectionDto = (c: Row) => {
    const rows = db.prepare('SELECT photo_id, chosen FROM collection_photos WHERE collection_id = ? ORDER BY pos').all(c.id) as Row[];
    return { id: c.id, name: c.name, description: c.description, target: c.target ? JSON.parse(c.target) : null, photoIds: rows.map((r) => r.photo_id), chosenIds: rows.filter((r) => r.chosen).map((r) => r.photo_id) };
  };

  const notFound = (rep: any, what = 'Not found') => rep.code(404).send({ error: what });
  const one = (sql: string, ...a: unknown[]) => db.prepare(sql).get(...a) as Row | undefined;

  // ---------- health / settings ----------
  app.get('/api/health', async () => ({ ok: true, version: cfg.version ?? 'dev' }));
  app.get('/api/settings', async () => ({ settings: loadSettings(db), libraries: cfg.libraries.map((l) => ({ path: l, exists: fs.existsSync(l), lastScan: getSetting<string | null>(db, `lastScan:${l}`, null) })) }));
  app.put('/api/settings', async (req) => saveSettings(db, (req.body ?? {}) as any));

  // ---------- library / photos ----------
  app.get('/api/library/pending', async () => {
    const p = pending(db, cfg);
    return { count: p.count, folders: p.folders, lastScan: getSetting<string | null>(db, 'lastScan', null) };
  });
  app.post('/api/library/scan', async (_req, rep) => {
    // One scan at a time, otherwise two overlapping scans import the same files twice.
    if (scanning) return rep.code(409).send({ error: 'A sync is already running' });
    scanning = true;
    try {
      const r = await scan(db, cfg);
      const stamp = new Date().toISOString();
      setSetting(db, 'lastScan', stamp);
      for (const l of cfg.libraries) setSetting(db, `lastScan:${l}`, stamp);
      // Flag files that disappeared from disk. Never delete anything.
      for (const p of db.prepare('SELECT id, path FROM photos').all() as Row[]) db.prepare('UPDATE photos SET missing = ? WHERE id = ?').run(fs.existsSync(p.path) ? 0 : 1, p.id);
      return { ...r, errors: r.errors.slice(0, 20).map((e) => ({ file: path.basename(e.file), error: 'unreadable' })) };
    } finally {
      scanning = false;
    }
  });

  app.get('/api/photos', async (req) => {
    const q = req.query as Row;
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.shoot) { where.push('p.shoot_id = ?'); args.push(num(q.shoot)); }
    if (q.tag) { where.push('EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.name = ? AND t.accepted = 1)'); args.push(String(q.tag)); }
    if (q.archived !== 'all') where.push('p.archived = 0');
    for (const w of String(q.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)) {
      where.push(`(lower(p.file) LIKE ? OR lower(p.title) LIKE ? OR lower(p.camera) LIKE ? OR lower(p.lens) LIKE ? OR lower(p.file_type) = ? OR EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.accepted = 1 AND lower(t.name) LIKE ?))`);
      args.push(`%${w}%`, `%${w}%`, `%${w}%`, `%${w}%`, w, `%${w}%`);
    }
    const order = q.order === 'oldest' ? 'ASC' : 'DESC';
    const agg = new Map((db.prepare('SELECT photo_id, COUNT(*) n, AVG(rating) a FROM reviews GROUP BY photo_id').all() as Row[]).map((r) => [r.photo_id as number, { n: r.n as number, a: r.a as number }]));
    let photos = (db.prepare(`SELECT p.* FROM photos p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(p.captured_at, p.added_at) ${order}, p.id ${order} LIMIT 5000`).all(...args) as Row[]).map((p) => photoDto(p, false, agg));
    if (q.rating) {
      const f = String(q.rating);
      photos = photos.filter((p) => p.reviewCount > 0 && (f === '4+' ? p.avgRating >= 4 : f === '3+' ? p.avgRating >= 3 : p.avgRating < 3));
    }
    return { total: (one('SELECT COUNT(*) n FROM photos WHERE archived = 0') as Row).n, photos };
  });
  app.get('/api/photos/:id', async (req, rep) => {
    const p = one('SELECT * FROM photos WHERE id = ?', num((req.params as Row).id));
    if (!p) return notFound(rep);
    return photoDto(p, true);
  });
  app.patch('/api/photos/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM photos WHERE id = ?', id)) return notFound(rep);
    const b = (req.body ?? {}) as Row;
    if (typeof b.title === 'string' && b.title.trim()) db.prepare('UPDATE photos SET title = ? WHERE id = ?').run(b.title.trim().slice(0, 200), id);
    if (typeof b.archived === 'boolean') db.prepare('UPDATE photos SET archived = ? WHERE id = ?').run(b.archived ? 1 : 0, id);
    if (b.reviewAgain === true) db.prepare('UPDATE photos SET next_review_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    return photoDto(one('SELECT * FROM photos WHERE id = ?', id)!, true);
  });
  app.put('/api/photos/:id/tags', async (req, rep) => {
    // Body: { name, accepted?: boolean, remove?: boolean }. Adding a tag by hand makes it a user tag.
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM photos WHERE id = ?', id)) return notFound(rep);
    const b = (req.body ?? {}) as Row;
    const name = String(b.name ?? '').trim().toLowerCase().slice(0, 60);
    if (!name) return rep.code(400).send({ error: 'name required' });
    if (b.remove) db.prepare('DELETE FROM tags WHERE photo_id = ? AND name = ?').run(id, name);
    else if (b.accepted === false) db.prepare('UPDATE tags SET accepted = 0 WHERE photo_id = ? AND name = ?').run(id, name);
    else db.prepare("INSERT INTO tags(photo_id, name, source, accepted) VALUES(?, ?, 'user', 1) ON CONFLICT(photo_id, name) DO UPDATE SET accepted = 1").run(id, name);
    return tagsOf(id);
  });
  app.get('/api/tags', async () => (db.prepare('SELECT name, COUNT(*) n FROM tags WHERE accepted = 1 GROUP BY name ORDER BY n DESC, name').all() as Row[]));

  // images: only ever served by id, never by path
  const sendImage = (kind: 'thumb' | 'preview') => async (req: any, rep: any) => {
    const id = num(req.params.id);
    const f = derivPath(cfg, id, kind);
    if (!fs.existsSync(f)) return notFound(rep, 'No preview available');
    return rep.header('Cache-Control', 'private, max-age=86400').type('image/jpeg').send(fs.createReadStream(f));
  };
  app.get('/api/photos/:id/thumb', sendImage('thumb'));
  app.get('/api/photos/:id/preview', sendImage('preview'));

  // ---------- shoots ----------
  app.get('/api/shoots', async () => (db.prepare('SELECT * FROM shoots ORDER BY imported_at DESC, id DESC').all() as Row[]).map(shootDto));
  app.post('/api/shoots', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const name = String(b.name ?? '').trim();
    if (!name) return rep.code(400).send({ error: 'name required' });
    const id = Number(db.prepare('INSERT INTO shoots(name, source, place, imported_at) VALUES(?, ?, ?, ?)').run(name.slice(0, 120), 'Manual', String(b.place ?? '').slice(0, 120), new Date().toISOString()).lastInsertRowid);
    return shootDto(one('SELECT * FROM shoots WHERE id = ?', id)!);
  });
  app.patch('/api/shoots/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shoots WHERE id = ?', id)) return notFound(rep);
    const b = (req.body ?? {}) as Row;
    if (typeof b.name === 'string' && b.name.trim()) db.prepare('UPDATE shoots SET name = ? WHERE id = ?').run(b.name.trim().slice(0, 120), id);
    if (typeof b.place === 'string') db.prepare('UPDATE shoots SET place = ? WHERE id = ?').run(b.place.slice(0, 120), id);
    return shootDto(one('SELECT * FROM shoots WHERE id = ?', id)!);
  });

  // ---------- reviews ----------
  type Session = { runId: string; queue: { id: number; ar: number }[]; index: number; ratings: Record<number, number>; notes: Record<number, string> };
  const dueIds = () => (db.prepare("SELECT id FROM photos WHERE archived = 0 AND missing = 0 AND next_review_at IS NOT NULL AND next_review_at <= ? ORDER BY next_review_at").all(new Date().toISOString()) as Row[]).map((r) => r.id as number);
  const getSession = () => getSetting<Session | null>(db, 'reviewSession', null);

  app.get('/api/review/summary', async () => {
    const s = getSession();
    const due = dueIds().length;
    const resumable = !!s && s.index > 0 && s.index < s.queue.length;
    const left = s ? Math.max(0, s.queue.length - s.index) : 0;
    const count = resumable ? left : due;
    const ids = dueIds();
    const nextId = resumable && s ? s.queue[s.index].id : ids[0] ?? null;
    const shootNames = ids.length
      ? (db.prepare(`SELECT DISTINCT sh.name FROM photos p JOIN shoots sh ON sh.id = p.shoot_id WHERE p.id IN (${ids.slice(0, 500).join(',')}) LIMIT 2`).all() as Row[]).map((r) => r.name as string)
      : [];
    return { due: count, resumable, nextId, shootNames, total: (one('SELECT COUNT(*) n FROM photos') as Row).n, minutes: Math.max(1, Math.round(count * 0.19)), sessions: loadSettings(db).sessions };
  });
  app.post('/api/review/start', async () => {
    const existing = getSession();
    if (existing && existing.index < existing.queue.length) return existing;
    const ids = dueIds().sort(() => Math.random() - 0.5);
    const s: Session = {
      runId: crypto.randomUUID(), index: 0, ratings: {}, notes: {},
      queue: ids.map((id) => { const p = one('SELECT w, h FROM photos WHERE id = ?', id)!; return { id, ar: p.w && p.h ? p.w / p.h : 1.5 }; }),
    };
    setSetting(db, 'reviewSession', s);
    return s;
  });
  app.get('/api/review/session', async () => getSession());
  app.put('/api/review/session', async (req) => {
    const s = getSession();
    if (!s) return null;
    s.index = Math.max(0, Math.min(s.queue.length, Math.round(num((req.body as Row)?.index, s.index))));
    setSetting(db, 'reviewSession', s);
    return s;
  });
  app.delete('/api/review/session', async () => { setSetting(db, 'reviewSession', null); return { ok: true }; });
  app.post('/api/review/rate', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const photoId = num(b.photoId), rating = Math.round(num(b.rating));
    const s = getSession();
    if (!s || rating < 1 || rating > 5 || !s.queue.some((q) => q.id === photoId)) return rep.code(400).send({ error: 'bad rating' });
    const settings = loadSettings(db);
    const now = new Date();
    const prior = one('SELECT id FROM reviews WHERE photo_id = ? AND run_id = ?', photoId, s.runId);
    if (prior) db.prepare('UPDATE reviews SET rating = ?, note = COALESCE(?, note) WHERE id = ?').run(rating, typeof b.note === 'string' ? b.note.slice(0, 2000) : null, prior.id);
    else {
      const n = (one('SELECT COUNT(*) n FROM reviews WHERE photo_id = ?', photoId) as Row).n;
      db.prepare('INSERT INTO reviews(photo_id, session, run_id, date, rating, note) VALUES(?, ?, ?, ?, ?, ?)').run(photoId, n + 1, s.runId, now.toISOString(), rating, typeof b.note === 'string' ? b.note.slice(0, 2000) : null);
    }
    const ratings = (db.prepare('SELECT rating FROM reviews WHERE photo_id = ? ORDER BY session, id').all(photoId) as Row[]).map((r) => r.rating as number);
    const days = nextIntervalDays(settings, ratings);
    db.prepare('UPDATE photos SET next_review_at = ? WHERE id = ?').run(days === null ? null : addDays(now, days).toISOString(), photoId);
    s.ratings[photoId] = rating;
    if (typeof b.note === 'string') s.notes[photoId] = b.note;
    if (b.advance !== false) s.index = Math.max(s.index, s.queue.findIndex((q) => q.id === photoId) + 1);
    setSetting(db, 'reviewSession', s);
    return s;
  });
  app.post('/api/review/note', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const s = getSession();
    if (!s || !s.queue.some((q) => q.id === num(b.photoId))) return rep.code(400).send({ error: 'photo not in session' });
    s.notes[num(b.photoId)] = String(b.note ?? '').slice(0, 2000);
    db.prepare('UPDATE reviews SET note = ? WHERE photo_id = ? AND run_id = ?').run(s.notes[num(b.photoId)], num(b.photoId), s.runId);
    setSetting(db, 'reviewSession', s);
    return s;
  });

  // ---------- collections ----------
  const parseTarget = (t: any) => {
    if (t === null || t === undefined) return null;
    const size = ['A4', 'A3', 'A2'].includes(t.size) ? t.size : 'A3';
    const orientation = ['portrait', 'landscape', 'any'].includes(t.orientation) ? t.orientation : 'any';
    return { count: Math.max(1, Math.round(num(t.count, 1))), size, orientation, ppi: Math.min(600, Math.max(72, Math.round(num(t.ppi, 300)))) };
  };
  app.get('/api/collections', async () => (db.prepare('SELECT * FROM collections ORDER BY id DESC').all() as Row[]).map(collectionDto));
  app.post('/api/collections', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const name = String(b.name ?? '').trim();
    if (!name) return rep.code(400).send({ error: 'name required' });
    const id = Number(db.prepare('INSERT INTO collections(name, description, target) VALUES(?, ?, ?)').run(name.slice(0, 120), String(b.description ?? '').slice(0, 1000), b.target ? JSON.stringify(parseTarget(b.target)) : null).lastInsertRowid);
    return collectionDto(one('SELECT * FROM collections WHERE id = ?', id)!);
  });
  app.get('/api/collections/:id', async (req, rep) => {
    const c = one('SELECT * FROM collections WHERE id = ?', num((req.params as Row).id));
    return c ? collectionDto(c) : notFound(rep);
  });
  app.patch('/api/collections/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM collections WHERE id = ?', id)) return notFound(rep);
    const b = (req.body ?? {}) as Row;
    if (typeof b.name === 'string' && b.name.trim()) db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(b.name.trim().slice(0, 120), id);
    if (typeof b.description === 'string') db.prepare('UPDATE collections SET description = ? WHERE id = ?').run(b.description.slice(0, 1000), id);
    if ('target' in b) db.prepare('UPDATE collections SET target = ? WHERE id = ?').run(b.target ? JSON.stringify(parseTarget(b.target)) : null, id);
    if (Array.isArray(b.order)) b.order.forEach((pid: number, i: number) => db.prepare('UPDATE collection_photos SET pos = ? WHERE collection_id = ? AND photo_id = ?').run(i, id, num(pid)));
    if (Array.isArray(b.chosenIds)) {
      db.prepare('UPDATE collection_photos SET chosen = 0 WHERE collection_id = ?').run(id);
      for (const pid of b.chosenIds) db.prepare('UPDATE collection_photos SET chosen = 1 WHERE collection_id = ? AND photo_id = ?').run(id, num(pid));
    }
    return collectionDto(one('SELECT * FROM collections WHERE id = ?', id)!);
  });
  app.delete('/api/collections/:id', async (req) => { db.prepare('DELETE FROM collections WHERE id = ?').run(num((req.params as Row).id)); return { ok: true }; });
  app.put('/api/collections/:id/photos/:photoId', async (req, rep) => {
    const { id, photoId } = req.params as Row;
    if (!one('SELECT 1 x FROM collections WHERE id = ?', num(id)) || !one('SELECT 1 x FROM photos WHERE id = ?', num(photoId))) return notFound(rep);
    const pos = (one('SELECT COALESCE(MAX(pos), -1) + 1 p FROM collection_photos WHERE collection_id = ?', num(id)) as Row).p;
    db.prepare('INSERT OR IGNORE INTO collection_photos(collection_id, photo_id, pos) VALUES(?, ?, ?)').run(num(id), num(photoId), pos);
    return collectionDto(one('SELECT * FROM collections WHERE id = ?', num(id))!);
  });
  app.delete('/api/collections/:id/photos/:photoId', async (req) => {
    const { id, photoId } = req.params as Row;
    db.prepare('DELETE FROM collection_photos WHERE collection_id = ? AND photo_id = ?').run(num(id), num(photoId));
    return collectionDto(one('SELECT * FROM collections WHERE id = ?', num(id))!);
  });

  // The original file, byte for byte, as a download. ?n=3&pad=2 prefixes the saved name with "03_" so a
  // collection saved in order sorts correctly. Looked up by id only, never by a client-supplied path.
  app.get('/api/photos/:id/original', async (req, rep) => {
    const p = one('SELECT path, file FROM photos WHERE id = ?', num((req.params as Row).id));
    if (!p || !fs.existsSync(p.path)) return notFound(rep, 'The original file is missing');
    const n = Math.round(num((req.query as Row).n, 0));
    const pad = Math.min(4, Math.max(0, Math.round(num((req.query as Row).pad, 0))));
    const name = (n > 0 ? `${String(n).padStart(pad, '0')}_` : '') + p.file;
    const ascii = name.replace(/[^\x20-\x7e]|["\\;]/g, '_');
    return rep
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`)
      .header('Content-Length', String(fs.statSync(p.path).size))
      .send(fs.createReadStream(p.path));
  });

  // ---------- stats / recommendations ----------
  app.get('/api/stats', async () => {
    const p = one('SELECT COUNT(*) n, COALESCE(SUM(size_bytes), 0) bytes FROM photos WHERE archived = 0') as Row;
    const sessions = loadSettings(db).sessions;
    const complete = (one('SELECT COUNT(*) n FROM (SELECT photo_id FROM reviews GROUP BY photo_id HAVING COUNT(*) >= ?)', sessions) as Row).n;
    const dist = [1, 2, 3, 4, 5].map((v) => ({ value: v, n: (one('SELECT COUNT(*) n FROM reviews WHERE rating = ?', v) as Row).n }));
    const avg = (one('SELECT AVG(rating) a FROM reviews') as Row).a ?? 0;
    const perShoot = (db.prepare('SELECT s.id, s.name, COUNT(p.id) n FROM shoots s LEFT JOIN photos p ON p.shoot_id = s.id GROUP BY s.id ORDER BY s.imported_at DESC').all() as Row[]);
    const inCollections = (one('SELECT COUNT(DISTINCT photo_id) n FROM collection_photos') as Row).n;
    const top = (db.prepare('SELECT p.* FROM photos p JOIN reviews r ON r.photo_id = p.id WHERE p.archived = 0 GROUP BY p.id ORDER BY AVG(r.rating) DESC, COUNT(r.id) DESC LIMIT 10').all() as Row[]).map((r) => photoDto(r));
    return { photos: p.n, bytes: p.bytes, completePct: p.n ? Math.round((complete / p.n) * 100) : 0, avgRating: avg, inCollections, dist, perShoot, top };
  });

  app.get('/api/recommendations', async () => {
    const dismissed = new Set((db.prepare("SELECT kind || ':' || photo_id k FROM dismissed").all() as Row[]).map((r) => r.k));
    const settings = loadSettings(db);
    const all = (db.prepare('SELECT * FROM photos WHERE archived = 0').all() as Row[]);
    const withRatings = all.map((p) => ({ p, rs: (db.prepare('SELECT rating, date FROM reviews WHERE photo_id = ? ORDER BY session, id').all(p.id) as Row[]) }));
    const inColl = new Set((db.prepare('SELECT DISTINCT photo_id FROM collection_photos').all() as Row[]).map((r) => r.photo_id));
    const keep = (kind: string, p: Row) => !dismissed.has(`${kind}:${p.id}`);
    const growing = withRatings.filter(({ p, rs }) => rs.length >= 3 && rs[rs.length - 1].rating - rs[0].rating >= 1 && keep('growing', p)).slice(0, 12)
      .map(({ p, rs }) => ({ ...photoDto(p), from: rs[0].rating, to: rs[rs.length - 1].rating }));
    const quiet = withRatings.filter(({ p, rs }) => rs.length >= Math.min(4, settings.sessions) && avgOf(rs.map((r) => r.rating)) >= 4.5 && !inColl.has(p.id) && keep('quiet', p)).slice(0, 12).map(({ p }) => photoDto(p));
    const yearAgo = Date.now() - 365 * 86_400_000;
    const forgotten = withRatings.filter(({ rs }) => rs.length > 0 && rs[0].rating >= 4 && new Date(rs[rs.length - 1].date).getTime() < yearAgo).slice(0, 14).map(({ p }) => photoDto(p));
    const archive = settings.archiveSuggest
      ? withRatings.filter(({ p, rs }) => rs.length >= 4 && avgOf(rs.map((r) => r.rating)) < 2 && keep('archive', p)).slice(0, 12).map(({ p }) => photoDto(p))
      : [];
    // "Belongs together" and "More like this" need image analysis, which is not built yet.
    return { growing, quiet, forgotten, archive, needsAi: ['together', 'similar'] };
  });
  app.post('/api/recommendations/dismiss', async (req) => {
    const b = (req.body ?? {}) as Row;
    for (const id of Array.isArray(b.photoIds) ? b.photoIds : []) db.prepare('INSERT OR IGNORE INTO dismissed(kind, photo_id) VALUES(?, ?)').run(String(b.kind).slice(0, 20), num(id));
    return { ok: true };
  });

  // ---------- web UI ----------
  if (cfg.webDir && fs.existsSync(cfg.webDir)) {
    void app.register(fastifyStatic, { root: path.resolve(cfg.webDir) });
    app.setNotFoundHandler((req, rep) => (req.url.startsWith('/api/') ? rep.code(404).send({ error: 'Not found' }) : rep.sendFile('index.html')));
  }
  return app;
}
