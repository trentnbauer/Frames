import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { aiConfig, getSecret } from './ai.js';
import { createAuth, isAuthPath } from './auth.js';
import { applyEnvConfig } from './envConfig.js';
import { createTenants, migrateLegacy, tenantProxy, type Tenant } from './tenants.js';
import { openSystemDb } from './users.js';
import type { AppCfg, Ctx, Row } from './ctx.js';
import { getSetting, setSetting, type DB } from './db.js';
import { derivPath, pending, scan } from './ingest.js';
import { parseTarget } from './target.js';
import { addDays, nextIntervalDays } from './schedule.js';
import { loadSettings, saveSettings } from './settings.js';
import { registerAuth } from './routes/auth.js';
import { registerInsights } from './routes/insights.js';
import { createAccessGate } from './access.js';
import { registerAdmin } from './routes/admin.js';
import { registerCloud } from './routes/cloud.js';
import { registerPrivacy } from './privacy.js';
import { registerLibrary } from './routes/library.js';
import { isPublicPath, registerShare } from './routes/share.js';
import { createPortfolioGate, isPortfolioPath, registerPortfolio } from './portfolio.js';
import { registerPhotos } from './routes/photos.js';
import { createTunnelRunner, loadTunnel, registerTunnel } from './tunnel.js';
import { applyEnvTunnel, readEnvTunnel, seedTunnelFromEnv } from './tunnelEnv.js';

export type { AppCfg } from './ctx.js';

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const avgOf = (r: number[]) => (r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0);
const digest = (s: string) => crypto.createHash('sha256').update(s).digest();

// Fonts come from Google Fonts. Everything else must be same-origin.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const ADMIN_ONLY = /^\/api\/(auth|tunnel|admin)(\/|\?|$)/;
const SHARE_URL = /^\/(?:api\/)?s\/([A-Za-z0-9_-]{16,64})(?:[/?]|$)/;

export function buildApp(ownerDb: DB, baseCfg: AppCfg) {
  // trustProxy: behind a reverse proxy, take the visitor's address from X-Forwarded-For (needed for per-visitor rate limits).
  const app = Fastify({ logger: false, trustProxy: !!baseCfg.trustProxy });
  // Who the people are lives in the system database. Each person's library is their own database (see tenants.ts), and `db` and
  // `cfg` below answer from the library of whoever is making the request, so a route can only ever reach its own caller's data.
  const sys = openSystemDb(baseCfg.dataDir);
  migrateLegacy(sys, ownerDb);
  const tenants = createTenants(sys, baseCfg, ownerDb);
  // An env file (FRAMES_CONFIG_SYSTEM / FRAMES_CONFIG_OWNER) wins over what was saved in the app, every start.
  for (const p of applyEnvConfig(sys, ownerDb).problems) console.error(p);
  const db = tenantProxy<DB>(() => tenants.current().db);
  const cfg = tenantProxy<AppCfg>(() => tenants.currentOrNull()?.cfg ?? baseCfg);
  const portfolioGate = createPortfolioGate(sys, tenants, baseCfg.webDir);
  const auth = createAuth(sys, baseCfg);
  const access = createAccessGate(sys, baseCfg.accessCertsBase);
  app.decorateRequest('authUser', null);
  app.decorateRequest('authVia', null);
  app.decorateRequest('tenant', null);

  /** A share link's owner, found from the address alone: its prefix names the person; links from before accounts are the owner's. */
  const shareTenant = (token: string): Tenant | null => {
    const prefix = /^([0-9a-z]{1,8})_/.exec(token)?.[1];
    const ids = [...(prefix ? [parseInt(prefix, 36)] : []), 1];
    for (const id of ids) { const t = tenants.get(id); if (t && t.db.prepare('SELECT 1 FROM shares WHERE token = ?').get(token)) return t; }
    return null;
  };

  // ---------- security ----------
  app.addHook('onRequest', async (req, rep) => {
    const r = req as any;
    // The portfolio hostname shows the public portfolio and nothing else, whatever else is asked of it.
    // The app's own address, when Cloudflare Access protects it: only a valid Access token gets past (public paths excepted).
    if (access.applies(req) && (await access.check(req)) !== 'ok') return rep.code(403).send({ error: 'Sign in through Cloudflare Access to use this address.' });
    const pg = portfolioGate.check(req);
    if (pg.mode === 'deny') return rep.code(404).send({ error: 'Not found' });
    if (pg.mode === 'index') return rep.type('text/html').header('Cache-Control', 'no-cache').send(portfolioGate.indexHtml());
    if (pg.mode === 'allow') r.tenant = pg.tenant;
    else if (req.url !== '/api/health' && !isPublicPath(req.url) && !isAuthPath(req.url) && !isPortfolioPath(req.url)) {
      // Optional sign-in: OAuth providers (Settings, Access) and/or a shared password (AUTH_PASSWORD). Neither set = open (the owner).
      const v = auth.verify(req);
      if (!v.ok) return auth.deny(req, rep, v.limited);
      r.authUser = v.user;
      r.authVia = v.via;
      if (ADMIN_ONLY.test(req.url) && v.user.role !== 'admin') return rep.code(403).send({ error: 'Only an administrator can do that' });
      r.tenant = tenants.get(v.user.id);
      if (!r.tenant) return rep.code(403).send({ error: 'This account has no library' });
    } else if (isPortfolioPath(req.url)) {
      r.tenant = tenants.owner(); // the portfolio at /portfolio/ on the main address is the owner's; everyone else has their own hostname
    } else {
      const m = SHARE_URL.exec(req.url);
      // An unknown link still goes to the owner's library, so the share routes give their usual answer and count the wrong guess.
      if (m) r.tenant = shareTenant(m[1]) ?? tenants.owner();
    }
    // Block cross-site writes (CSRF). Browsers always send Origin or Sec-Fetch-Site on these; plain API clients send neither.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      const sameHost = !origin || (() => { try { const h = new URL(origin).host; return h === req.headers.host || (baseCfg.allowedHosts ?? []).includes(h); } catch { return false; } })();
      if (!sameHost || req.headers['sec-fetch-site'] === 'cross-site') return rep.code(403).send({ error: 'Cross-site request blocked' });
    }
  });
  // Everything after this runs as the person the request is for.
  app.addHook('onRequest', (req, _rep, done) => { const t = (req as any).tenant as Tenant | null; if (t) tenants.enter(t, done); else done(); });
  app.addHook('onSend', async (req, rep) => {
    if (/^\/(api\/)?s\//.test(req.url)) rep.header('X-Robots-Tag', 'noindex, nofollow'); // share pages are never for search engines
    rep.header('Content-Security-Policy', CSP).header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer').header('X-Frame-Options', 'DENY').header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
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
  const ai = tenantProxy(() => tenants.current().ai);
  const kickAi = (t: Tenant = tenants.current()) => { if (aiConfig(t.db)) void t.ai.run().catch((e) => console.error('AI run failed', e)); };

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
  const runScan = async (t: Tenant = tenants.current()) => {
    const scanState = t.scan;
    Object.assign(scanState, { running: true, done: 0, total: 0, startedAt: new Date().toISOString(), finishedAt: null, result: null, error: null });
    try {
      const r = await scan(t.db, t.cfg, (done, total) => { scanState.done = done; scanState.total = total; });
      const stamp = new Date().toISOString();
      setSetting(t.db, 'lastScan', stamp);
      for (const l of t.cfg.libraries) setSetting(t.db, `lastScan:${l}`, stamp);
      // Flag files that disappeared from disk. Never delete anything.
      for (const p of t.db.prepare('SELECT id, path FROM photos').all() as Row[]) t.db.prepare('UPDATE photos SET missing = ? WHERE id = ?').run(fs.existsSync(p.path) ? 0 : 1, p.id);
      scanState.result = { ...r, errors: r.errors.slice(0, 20).map((e) => ({ file: path.basename(e.file), error: 'unreadable' })) };
    } catch (e) {
      console.error(e);
      scanState.error = 'The sync failed. Check the server log.';
    } finally {
      scanState.running = false;
      scanState.finishedAt = new Date().toISOString();
      kickAi(t);
    }
    return scanState;
  };
  app.post('/api/library/scan', async (req, rep) => {
    // One scan at a time, otherwise two overlapping scans import the same files twice.
    const scanState = tenants.current().scan;
    if (scanState.running) return rep.code(409).send({ error: 'A sync is already running' });
    const p = runScan();
    if ((req.query as Row).wait === '1') return (await p).result ?? rep.code(500).send({ error: scanState.error });
    return rep.code(202).send({ started: true });
  });
  app.get('/api/library/scan/status', async () => tenants.current().scan);


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

  const ctx: Ctx = { db, cfg, num, one, all, notFound, photoDto, shootDto, collectionDto, tagsOf, ratingAgg, ai, startScan: () => runScan(), scanning: () => tenants.current().scan.running, sys, tenants, tenant: () => tenants.current(), bag: (key, init) => { const m = tenants.current().bag; if (!m.has(key)) m.set(key, init()); return m.get(key); }, baseUrl: auth.baseUrl, isProtected: () => auth.protectedNow() };
  registerPhotos(app, ctx);
  registerLibrary(app, ctx);
  registerInsights(app, ctx);
  registerShare(app, ctx);
  registerPortfolio(app, ctx);
  registerAuth(app, ctx, auth);
  registerCloud(app, ctx);
  registerAdmin(app, ctx);
  registerPrivacy(app, ctx);
  const tunnelRunner = createTunnelRunner(sys);
  registerTunnel(app, ctx, tunnelRunner);
  app.addHook('onClose', async () => { await tunnelRunner.stop(); }); // cloudflared goes down with the server
  // The start-up jobs are cancelled if the app is closed before they run (tests, a quick shutdown), so they never touch a closed database.
  const envTunnel = readEnvTunnel();
  for (const p of envTunnel.problems) console.error(`Cloudflare tunnel (environment): ${p}`);
  const startup: NodeJS.Timeout[] = [];
  if (envTunnel.cfg) {
    // Set up from environment variables: make Cloudflare match, and try again every five minutes until that has worked.
    const apply = async () => {
      const r = await applyEnvTunnel(envTunnel.cfg!, { sys, ownerDb, runner: tunnelRunner, port: Number(process.env.PORT ?? 3000), apiBase: baseCfg.cloudflareApi });
      if (r.error) { console.error(`Cloudflare tunnel: ${r.error}. Trying again in five minutes.`); const t = setTimeout(() => void apply(), 5 * 60_000); t.unref(); startup.push(t); }
      else console.log(`Cloudflare tunnel ready${envTunnel.cfg!.appHost ? `: ${envTunnel.cfg!.appHost} (Access: ${envTunnel.cfg!.emails.length} email${envTunnel.cfg!.emails.length === 1 ? '' : 's'})` : ''}${envTunnel.cfg!.portfolioHost ? `, portfolio ${envTunnel.cfg!.portfolioHost}` : ''}.`);
    };
    startup.push(setTimeout(() => void apply(), 1500));
  } else {
    seedTunnelFromEnv(sys, ownerDb); // TUNNEL_TOKEN, APP_HOSTNAME and PORTFOLIO_HOSTNAME pre-fill Settings and win over what was saved
    startup.push(setTimeout(() => { if (loadTunnel(sys).enabled) tunnelRunner.start(); }, 1500)); // the tunnel comes back up with the server
  }
  startup.push(setTimeout(() => { for (const t of tenants.all()) tenants.run(t, () => kickAi(t)); }, 2000)); // and so does AI analysis, where it left off
  for (const t of startup) t.unref();
  app.decorate('frames', { sys, tenants });
  app.addHook('onClose', async () => { for (const t of startup) clearTimeout(t); for (const t of tenants.all()) tenants.forget(t.user.id); sys.close(); });

  // ---------- web UI ----------
  if (baseCfg.webDir && fs.existsSync(baseCfg.webDir)) {
    void app.register(fastifyStatic, { root: path.resolve(baseCfg.webDir) });
    app.setNotFoundHandler((req, rep) => (req.url.startsWith('/api/') ? rep.code(404).send({ error: 'Not found' }) : rep.sendFile('index.html')));
  }
  return app;
}
