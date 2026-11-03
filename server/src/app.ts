import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { aiConfig, createAiWorker, getSecret } from './ai.js';
import type { AppCfg, Ctx, Row } from './ctx.js';
import { getSetting, setSetting, type DB } from './db.js';
import { derivPath, pending, scan } from './ingest.js';
import { parseTarget } from './target.js';
import { addDays, nextIntervalDays } from './schedule.js';
import { loadSettings, saveSettings } from './settings.js';
import { registerInsights } from './routes/insights.js';
import { registerLibrary } from './routes/library.js';
import { isPublicPath, registerShare } from './routes/share.js';
import { createTunnelRunner, loadTunnel, registerTunnel } from './tunnel.js';
import { createPortfolioGate, isPortfolioPath, registerPortfolio } from './portfolio.js';
import { registerPhotos } from './routes/photos.js';

export type { AppCfg } from './ctx.js';

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const avgOf = (r: number[]) => (r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0);
const digest = (s: string) => crypto.createHash('sha256').update(s).digest();

// Fonts come from Google Fonts. Everything else must be same-origin.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

export function buildApp(db: DB, cfg: AppCfg) {
  // trustProxy: behind a reverse proxy, take the visitor's address from X-Forwarded-For (needed for per-visitor rate limits).
  const app = Fastify({ logger: false, trustProxy: !!cfg.trustProxy });
  let scanning = false;
  const portfolioGate = createPortfolioGate(db, cfg.webDir);

  // ---------- security ----------
  app.addHook('onRequest', async (req, rep) => {
    // Optional single-user login (HTTP Basic). Set AUTH_PASSWORD to turn it on. /api/health stays open for container health checks.
    // Only the exact share-link addresses (and the page assets they need) are public; see routes/share.ts.
    // The portfolio hostname shows the public portfolio and nothing else, whatever else is asked of it.
    const pg = portfolioGate.check(req);
    if (pg === 'deny') return rep.code(404).send({ error: 'Not found' });
    if (pg === 'index') return rep.type('text/html').header('Cache-Control', 'no-cache').send(portfolioGate.indexHtml());
    if (cfg.authPassword && req.url !== '/api/health' && !isPublicPath(req.url) && !isPortfolioPath(req.url)) {
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
  app.addHook('onSend', async (req, rep) => {
    if (/^\/(api\/)?s\//.test(req.url)) rep.header('X-Robots-Tag', 'noindex, nofollow'); // share pages are never for search engines
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
  // accepted: 1 = in use, 0 = suggested (AI), -1 = rejected. Rejected tags are remembered so they are not suggested again, but never shown.
  const tagsOf = (id: number) =>
    (db.prepare('SELECT name, kind, source, accepted FROM tags WHERE photo_id = ? AND accepted >= 0 ORDER BY kind DESC, name').all(id) as Row[]).map((t) => ({ name: t.name, kind: t.kind, source: t.source, accepted: t.accepted === 1 }));
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
      lat: p.lat, lon: p.lon, place: p.place, parentId: p.parent_id,
      palette: p.palette ? JSON.parse(p.palette) : [], brightness: p.brightness, contrast: p.contrast, saturation: p.saturation,
      xmpRating: p.xmp_rating, aiStatus: p.ai_status,
      ...(full ? {
        tags: tagsOf(p.id), reviews: reviewsOf(p.id), description: p.description, descSource: p.desc_source,
        aiSuggestion: aiSuggestion(p), variants: (db.prepare('SELECT id FROM photos WHERE parent_id = ?').all(p.id) as Row[]).map((r) => r.id as number),
        conflicts: db.prepare('SELECT field, mine, theirs FROM xmp_conflicts WHERE photo_id = ?').all(p.id),
      } : {}),
    };
  };
  // The AI's own description and notes, shown for the user to accept or reject. Never used as fact until accepted.
  const aiSuggestion = (p: Row) => {
    if (!p.ai_json) return null;
    try {
      const a = JSON.parse(p.ai_json);
      return a.descriptionRejected ? { ...a, description: '' } : a;
    } catch { return null; }
  };
  const shootDto = (s: Row) => {
    const st = db.prepare('SELECT COUNT(*) n, MIN(captured_at) a, MAX(captured_at) b, MIN(id) first FROM photos WHERE shoot_id = ?').get(s.id) as Row;
    const sessions = loadSettings(db).sessions;
    const done = (db.prepare(`SELECT COUNT(*) n FROM (SELECT photo_id, COUNT(*) c FROM reviews WHERE photo_id IN (SELECT id FROM photos WHERE shoot_id = ?) GROUP BY photo_id HAVING c >= ?)`).get(s.id, sessions) as Row).n;
    const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    // Dates the user typed win; otherwise they come from the photographs' capture times, then the import date.
    const from = s.date_from ?? st.a, to = s.date_to ?? st.b;
    const dates = from ? (!to || from.slice(0, 10) === to.slice(0, 10) ? fmt(from) : `${fmt(from)} – ${fmt(to)}`) : fmt(s.imported_at);
    return { id: s.id, name: s.name, source: s.source, place: s.place, description: s.description, dateFrom: s.date_from, dateTo: s.date_to, dates, importedAt: s.imported_at, count: st.n, coverId: st.first, reviewPct: st.n ? Math.round((done / st.n) * 100) : 0, sessions };
  };
  const collectionDto = (c: Row) => {
    const rows = db.prepare('SELECT photo_id, chosen FROM collection_photos WHERE collection_id = ? ORDER BY pos').all(c.id) as Row[];
    return { id: c.id, name: c.name, description: c.description, theme: c.theme ?? '', target: c.target ? JSON.parse(c.target) : null, photoIds: rows.map((r) => r.photo_id), chosenIds: rows.filter((r) => r.chosen).map((r) => r.photo_id) };
  };

  const notFound = (rep: any, what = 'Not found') => rep.code(404).send({ error: what });
  const one = (sql: string, ...a: unknown[]) => db.prepare(sql).get(...a) as Row | undefined;
  const all = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as Row[];
  const ratingAgg = () => new Map(all('SELECT photo_id, COUNT(*) n, AVG(rating) a FROM reviews GROUP BY photo_id').map((r) => [r.photo_id as number, { n: r.n as number, a: r.a as number }]));
  // Photographs are analysed in the background once AI is on. Errors are retried a few times and never block anything else.
  const ai = createAiWorker(db, cfg);
  const kickAi = () => { if (aiConfig(db)) void ai.run().catch((e) => console.error('AI run failed', e)); };

  // ---------- health / settings ----------
  app.get('/api/health', async () => ({ ok: true, version: cfg.version ?? 'dev' }));
  app.get('/api/settings', async () => ({
    settings: loadSettings(db),
    hasKey: !!getSecret(db, 'aiKey'), // the key itself is never sent to the browser
    internalDir: path.join(cfg.dataDir, 'originals'),
    libraries: cfg.libraries.map((l) => ({ path: l, exists: fs.existsSync(l), lastScan: getSetting<string | null>(db, `lastScan:${l}`, null) })),
  }));
  app.put('/api/settings', async (req) => {
    const s = saveSettings(db, (req.body ?? {}) as any);
    kickAi();
    return s;
  });

  // ---------- library / photos ----------
  app.get('/api/library/pending', async () => {
    const p = pending(db, cfg);
    return { count: p.count, folders: p.folders, lastScan: getSetting<string | null>(db, 'lastScan', null) };
  });
  // A sync can take minutes on a big library, so it runs in the background and the browser polls
  // /api/library/scan/status. ?wait=1 holds the request open and returns the result (scripts, tests).
  type ScanState = { running: boolean; done: number; total: number; startedAt: string | null; finishedAt: string | null; result: any; error: string | null };
  const scanState: ScanState = { running: false, done: 0, total: 0, startedAt: null, finishedAt: null, result: null, error: null };
  const runScan = async () => {
    scanning = true;
    Object.assign(scanState, { running: true, done: 0, total: 0, startedAt: new Date().toISOString(), finishedAt: null, result: null, error: null });
    try {
      const r = await scan(db, cfg, (done, total) => { scanState.done = done; scanState.total = total; });
      const stamp = new Date().toISOString();
      setSetting(db, 'lastScan', stamp);
      for (const l of cfg.libraries) setSetting(db, `lastScan:${l}`, stamp);
      // Flag files that disappeared from disk. Never delete anything.
      for (const p of db.prepare('SELECT id, path FROM photos').all() as Row[]) db.prepare('UPDATE photos SET missing = ? WHERE id = ?').run(fs.existsSync(p.path) ? 0 : 1, p.id);
      scanState.result = { ...r, errors: r.errors.slice(0, 20).map((e) => ({ file: path.basename(e.file), error: 'unreadable' })) };
    } catch (e) {
      console.error(e);
      scanState.error = 'The sync failed. Check the server log.';
    } finally {
      scanning = false;
      scanState.running = false;
      scanState.finishedAt = new Date().toISOString();
      kickAi();
    }
    return scanState;
  };
  app.post('/api/library/scan', async (req, rep) => {
    // One scan at a time, otherwise two overlapping scans import the same files twice.
    if (scanning) return rep.code(409).send({ error: 'A sync is already running' });
    const p = runScan();
    if ((req.query as Row).wait === '1') return (await p).result ?? rep.code(500).send({ error: scanState.error });
    return rep.code(202).send({ started: true });
  });
  app.get('/api/library/scan/status', async () => scanState);


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
    const ids = dueIds();
    // Fisher-Yates. Sorting with a random comparator is biased, and the order must be properly random.
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
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
  app.get('/api/collections', async () => (db.prepare('SELECT * FROM collections ORDER BY id DESC').all() as Row[]).map(collectionDto));
  app.post('/api/collections', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const name = String(b.name ?? '').trim();
    if (!name) return rep.code(400).send({ error: 'name required' });
    const id = Number(db.prepare('INSERT INTO collections(name, description, theme, target) VALUES(?, ?, ?, ?)').run(name.slice(0, 120), String(b.description ?? '').slice(0, 1000), String(b.theme ?? '').slice(0, 120), b.target ? JSON.stringify(parseTarget(b.target)) : null).lastInsertRowid);
    // A suggested set arrives with its photographs.
    (Array.isArray(b.photoIds) ? b.photoIds : []).slice(0, 500).forEach((pid: unknown, i: number) => db.prepare('INSERT OR IGNORE INTO collection_photos(collection_id, photo_id, pos) SELECT ?, id, ? FROM photos WHERE id = ?').run(id, i, num(pid)));
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
    if (typeof b.theme === 'string') db.prepare('UPDATE collections SET theme = ? WHERE id = ?').run(b.theme.slice(0, 120), id);
    if ('target' in b) {
      const t = b.target ? parseTarget(b.target) : null;
      db.prepare('UPDATE collections SET target = ? WHERE id = ?').run(t ? JSON.stringify(t) : null, id);
      // Fewer slots than chosen photos: keep the first ones, so the count never reads "3 of 2".
      const keep = t ? t.count : 0;
      const chosen = db.prepare('SELECT photo_id FROM collection_photos WHERE collection_id = ? AND chosen = 1 ORDER BY pos').all(id) as Row[];
      chosen.slice(keep).forEach((r) => db.prepare('UPDATE collection_photos SET chosen = 0 WHERE collection_id = ? AND photo_id = ?').run(id, r.photo_id));
    }
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

  const ctx: Ctx = { db, cfg, num, one, all, notFound, photoDto, shootDto, collectionDto, tagsOf, ratingAgg, ai, startScan: runScan, scanning: () => scanning, isProtected: () => !!cfg.authPassword };
  registerPhotos(app, ctx);
  registerLibrary(app, ctx);
  registerInsights(app, ctx);
  registerShare(app, ctx);
  registerPortfolio(app, ctx);
  const tunnelRunner = createTunnelRunner(db);
  registerTunnel(app, ctx, tunnelRunner);
  app.addHook('onClose', async () => { await tunnelRunner.stop(); }); // cloudflared goes down with the server
  setTimeout(() => { if (loadTunnel(db).enabled) tunnelRunner.start(); }, 1500).unref(); // and comes back up with it
  // Pick up where it left off after a restart.
  setTimeout(kickAi, 2000).unref();

  // ---------- web UI ----------
  if (cfg.webDir && fs.existsSync(cfg.webDir)) {
    void app.register(fastifyStatic, { root: path.resolve(cfg.webDir) });
    app.setNotFoundHandler((req, rep) => (req.url.startsWith('/api/') ? rep.code(404).send({ error: 'Not found' }) : rep.sendFile('index.html')));
  }
  return app;
}
