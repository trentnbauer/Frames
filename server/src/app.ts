import { noteUse } from './activity.js';
import { ensureDeriv } from './cache.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { aiConfig, getSecret } from './ai.js';
import { serveDerivative } from './imageServe.js';
import { mfaRequired, factorVerified } from './mfa.js';
import { registerMfa } from './routes/mfa.js';
import { createAuth, isAuthPath, sessionUser, sessionIdOf } from './auth.js';
import { active as turnstileOn, anyActive, isHuman } from './turnstile.js';
import { applyEnvConfig } from './envConfig.js';
import { createTenants, migrateLegacy, tenantProxy, type Tenant } from './tenants.js';
import { openSystemDb } from './users.js';
import type { AppCfg, Ctx, Row } from './ctx.js';
import { getSetting, setSetting, type DB } from './db.js';
import { derivPath, pending, scan } from './ingest.js';
import { parseTarget } from './target.js';
import { printSheetPdf, type SheetLine } from './printSheet.js';
import { chosenOf, deriveLayout, parseLayout, targetOf, type Layout } from './layout.js';
import { addDays, nextIntervalDays } from './schedule.js';
import { remoteOriginal } from './cloud.js';
import { loadSettings, saveSettings } from './settings.js';
import { runtime } from './policy.js';
import { registerAuth } from './routes/auth.js';
import { registerProfile } from './routes/profile.js';
import { registerNotifications } from './routes/notifications.js';
import { registerHome } from './routes/home.js';
import { registerGearItems } from './routes/gearitems.js';
import { registerCommunity } from './routes/community.js';
import { registerSystem, startEmailHealth } from './routes/system.js';
import { registerInsights } from './routes/insights.js';
import { parseGear } from './gear.js';
import { registerTodo } from './routes/todo.js';
import { registerMap } from './routes/map.js';
import { backgroundOf, registerBackground, removeBackground } from './routes/background.js';
import { createAccessGate } from './access.js';
import { registerAdmin } from './routes/admin.js';
import { registerCloud } from './routes/cloud.js';
import { registerPrivacy } from './privacy.js';
import { registerLibrary } from './routes/library.js';
import { isPublicPath, registerShare } from './routes/share.js';
import { createPortfolioGate, isPortfolioPath, loadPortfolio, portfolioHandleRewrite, registerPortfolio } from './portfolio.js';
import { registerPhotos } from './routes/photos.js';
import { createTunnelRunner, loadTunnel, registerTunnel } from './tunnel.js';
import { applyEnvTunnel, readEnvTunnel, seedTunnelFromEnv } from './tunnelEnv.js';

export type { AppCfg } from './ctx.js';

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const avgOf = (r: number[]) => (r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0);
const digest = (s: string) => crypto.createHash('sha256').update(s).digest();

// Fonts are bundled with the app. Everything must be same-origin.
const CSP_TS = (c: string) => c.replace("script-src 'self'", "script-src 'self' https://challenges.cloudflare.com").replace("connect-src 'self'", "connect-src 'self' https://challenges.cloudflare.com") + '; frame-src https://challenges.cloudflare.com';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const ADMIN_ONLY = /^\/api\/(auth|tunnel|admin|cloud\/client)(\/|\?|$)/;
/** The only signed-in addresses a guest may use: who they are, their list of shared links, and the welcome check the app makes. */
const GUEST_OK = /^\/api\/(me|guest\/links)$/;
const SHARE_URL = /^\/(?:api\/)?s\/([A-Za-z0-9_-]{16,64})(?:[/?]|$)/;

export function buildApp(ownerDb: DB, baseCfg: AppCfg) {
  // trustProxy: behind a reverse proxy, take the visitor's address from X-Forwarded-For (needed for per-visitor rate limits).
  // A person's portfolio can live at /handle/ (answered as /portfolio/ for them). The system database is opened below, so the rewrite looks it up when called.
  let handleRewrite: (raw: { url?: string }) => string = (raw) => raw.url ?? '';
  const app = Fastify({ logger: false, trustProxy: !!baseCfg.trustProxy, rewriteUrl: (raw) => handleRewrite(raw) });
  // A ceiling per visitor on everything, high enough that a grid of thousands of thumbnails never meets it, low enough to stop a flood.
  // (The sign-in, password and share-link routes have their own, much stricter limits.)
  void app.register(rateLimit, { global: false, max: 6000, timeWindow: '1 minute', allowList: (req) => req.url === '/api/health' });
  // Routes are added below before the plugin has loaded, so the limit is attached as a hook on the whole app instead of per route.
  // It is the first hook, so a flood is counted before sign-in or anything else runs.
  let limit: (req: any, rep: any) => Promise<unknown> = async () => undefined;
  app.addHook('onRequest', async (req, rep) => { noteUse(req.url); await limit(req, rep); });
  app.after(() => { limit = app.rateLimit() as typeof limit; });
  // Who the people are lives in the system database. Each person's library is their own database (see tenants.ts), and `db` and
  // `cfg` below answer from the library of whoever is making the request, so a route can only ever reach its own caller's data.
  const sys = openSystemDb(baseCfg.dataDir);
  baseCfg.sys = sys; // the instance-wide settings (the cloud services' app registrations) are reachable from a person's config
  migrateLegacy(sys, ownerDb);
  const tenants = createTenants(sys, baseCfg, ownerDb);
  // An env file (FRAMES_CONFIG_SYSTEM / FRAMES_CONFIG_OWNER) wins over what was saved in the app, every start.
  for (const p of applyEnvConfig(sys, ownerDb).problems) console.error(p);
  const db = tenantProxy<DB>(() => tenants.current().db);
  const cfg = tenantProxy<AppCfg>(() => tenants.currentOrNull()?.cfg ?? baseCfg);
  handleRewrite = portfolioHandleRewrite(sys);
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
      // Optional sign-in: OAuth providers (Settings, Sign-in & access) and/or a shared password (AUTH_PASSWORD). Neither set = open (the owner).
      const v = auth.verify(req);
      if (!v.ok) return auth.deny(req, rep, v.limited);
      r.authUser = v.user;
      r.authVia = v.via;
      // A guest has no library to work in: they sign in to open what was shared with them, and nothing else.
      if (v.user.role === 'guest' && req.url.startsWith('/api/') && !GUEST_OK.test(req.url.split('?')[0])) return rep.code(403).send({ error: 'A guest account can only open what has been shared with it' });
      if (ADMIN_ONLY.test(req.url) && v.user.role !== 'admin') return rep.code(403).send({ error: 'Only an administrator can do that' });
      if (!baseCfg.authDisabled && mfaRequired(sys, v.user) && (v.via !== 'session' || !factorVerified(sys, sessionIdOf(req)))) {
        const path = req.url.split('?')[0];
        const setup = /^\/api\/me\/mfa(?:\/|$)/.test(path) || path === '/api/me' || /^\/api\/me\/passkeys(?:\/(options|verify))?$/.test(path);
        if ((req.url.startsWith('/api/') && !setup) || path.startsWith('/auth/link/')) return rep.code(403).send({ error: 'Verify two-factor authentication to continue.', mfaRequired: true });
        if (setup && v.via !== 'session') return rep.code(401).send({ error: 'Sign in with a personal account.', signIn: '/signin' });
      }
      r.tenant = tenants.get(v.user.id);
      if (!r.tenant) return rep.code(403).send({ error: 'This account has no library' });
    } else if (isPortfolioPath(req.url)) {
      r.tenant = tenants.owner(); // the portfolio at /portfolio/ on the main address is the owner's; everyone else has their own hostname
    } else {
      const m = SHARE_URL.exec(req.url);
      // An unknown link still goes to the owner's library, so the share routes give their usual answer and count the wrong guess.
      if (m) r.tenant = shareTenant(m[1]) ?? tenants.owner();
      // Share links can ask for the Turnstile check: the data, pictures and actions behind a link need the check passed (or a signed-in account).
      const ts = m && req.url.startsWith('/api/s/') && !/^\/api\/s\/[^/?]+\/human(\?|$)/.test(req.url) ? turnstileOn(sys, 'shares') : null;
      if (ts && !isHuman(sys, req) && !sessionUser(sys, req)) return rep.code(403).send({ error: 'Please confirm you are a person to open this link.', challenge: { siteKey: ts.siteKey } });
      // A guest who opens a link while signed in finds it again in their "Shared with you" list.
      if (m && req.method === 'GET' && !req.url.includes('/', req.url.indexOf(m[1]) + m[1].length) && auth.oauthOn()) {
        const g = sessionUser(sys, req), t = shareTenant(m[1]);
        r.shareViewer = g; // the share page greets an account by name and skips asking it for one
        const s = g?.role === 'guest' && t ? t.db.prepare('SELECT kind, target_id, label FROM shares WHERE token = ?').get(m[1]) as { kind: string; target_id: number; label: string } | undefined : undefined;
        if (g && s) {
          const name = (t!.db.prepare(`SELECT name FROM ${s.kind === 'shoot' ? 'shoots' : 'collections'} WHERE id = ?`).get(s.target_id) as { name: string } | undefined)?.name ?? '';
          sys.prepare('INSERT INTO guest_links(user_id, token, label, kind, seen) VALUES(?, ?, ?, ?, ?) ON CONFLICT(user_id, token) DO UPDATE SET label = excluded.label, seen = excluded.seen').run(g.id, m[1], s.label || name, s.kind, new Date().toISOString());
        }
      }
    }
    // Block cross-site writes (CSRF). Browsers always send Origin or Sec-Fetch-Site on these; plain API clients send neither.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      const sameHost = !origin || (() => { try { const h = new URL(origin).host; return h === req.headers.host || (baseCfg.allowedHosts ?? []).includes(h); } catch { return false; } })();
      if (!sameHost || req.headers['sec-fetch-site'] === 'cross-site') return rep.code(403).send({ error: 'Cross-site request blocked' });
    }
  });
  // A request body is a JSON object of plain values. Routes read it as one, so anything else (a number, a list, a deeply nested one, or an
  // object that carries its own toString or valueOf, which breaks turning it into text) is refused here instead of failing deep inside a route.
  app.addHook('preValidation', async (req, rep) => {
    const b = req.body as unknown;
    if (b === undefined || b === null) return;
    const bad = (v: unknown, depth = 0): boolean => {
      if (!v || typeof v !== 'object') return false;
      if (depth > 8) return true;
      return Object.keys(v).some((k) => k === 'toString' || k === 'valueOf' || k === 'toJSON' || k === 'constructor' || bad((v as Record<string, unknown>)[k], depth + 1));
    };
    if (typeof b !== 'object' || Array.isArray(b) || bad(b)) return rep.code(400).send({ error: 'The request must be a JSON object.' });
  });
  // Everything after this runs as the person the request is for.
  app.addHook('onRequest', (req, _rep, done) => { const t = (req as any).tenant as Tenant | null; if (t) tenants.enter(t, done); else done(); });
  app.addHook('onSend', async (req, rep) => {
    if (/^\/(api\/)?s\//.test(req.url)) rep.header('X-Robots-Tag', 'noindex, nofollow'); // share pages are never for search engines
    rep.header('Content-Security-Policy', anyActive(sys) ? CSP_TS(CSP) : CSP).header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer').header('X-Frame-Options', 'DENY').header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
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
  const photoDto = (p: Row, full = false, agg?: Map<number, { n: number; a: number; d?: string }>) => {
    const ratings = agg ? [] : (db.prepare('SELECT rating FROM reviews WHERE photo_id = ?').all(p.id) as Row[]).map((r) => r.rating);
    const g = agg?.get(p.id);
    return {
      id: p.id, title: p.title, file: p.file, shootId: p.shoot_id, w: p.w, h: p.h,
      ar: p.w && p.h ? p.w / p.h : 1.5, hasImage: !!p.has_derivs,
      capturedAt: p.captured_at, addedAt: p.added_at, dateEdit: p.date_edit ?? null, camera: p.camera, lens: p.lens, exposure: p.exposure,
      iso: p.iso ?? null, aperture: p.aperture ?? null, shutter: p.shutter ?? '', focalMm: p.focal_mm ?? null, medium: p.medium ?? '', film: p.film ?? '',
      fileType: p.file_type, sizeMb: Math.round(p.size_bytes / 1048576), archived: !!p.archived, missing: !!p.missing,
      // When it was last reviewed; a photograph never reviewed counts from when it was added.
      lastReviewedAt: agg ? (g?.d ?? p.added_at) : ((one('SELECT MAX(date) d FROM reviews WHERE photo_id = ?', p.id)?.d as string | undefined) ?? p.added_at),
      nextReviewAt: p.next_review_at, reviewCount: g ? g.n : ratings.length, avgRating: g ? g.a : avgOf(ratings),
      lat: p.lat, lon: p.lon, place: p.place, placeAddress: p.place_address ?? '', placeKind: p.place_kind ?? '', placePrecision: p.place_precision ?? 'exact', parentId: p.parent_id,
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
  /** The subjects and tags a photoshoot gives to every photograph in it. */
  const sharedOf = (s: Row): { subjects: string[]; tags: string[] } => {
    try { const j = JSON.parse(s.shared || '{}'); return { subjects: Array.isArray(j.subjects) ? j.subjects : [], tags: Array.isArray(j.tags) ? j.tags : [] }; } catch { return { subjects: [], tags: [] }; }
  };
  const shootDto = (s: Row) => {
    const st = db.prepare('SELECT COUNT(*) n, MIN(captured_at) a, MAX(captured_at) b, MIN(id) first FROM photos WHERE shoot_id = ?').get(s.id) as Row;
    const sessions = loadSettings(db).sessions;
    const done = (db.prepare(`SELECT COUNT(*) n FROM (SELECT photo_id, COUNT(*) c FROM reviews WHERE photo_id IN (SELECT id FROM photos WHERE shoot_id = ?) GROUP BY photo_id HAVING c >= ?)`).get(s.id, sessions) as Row).n;
    const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    // Dates the user typed win; otherwise they come from the photographs' capture times, then the import date.
    const from = s.date_from ?? st.a, to = s.date_to ?? st.b;
    const dates = from ? (!to || from.slice(0, 10) === to.slice(0, 10) ? fmt(from) : `${fmt(from)} – ${fmt(to)}`) : fmt(s.imported_at);
    return { id: s.id, name: s.name, source: s.source, place: s.place, gear: parseGear(s.gear), ...sharedOf(s), description: s.description, dateFrom: s.date_from, dateTo: s.date_to, dates, importedAt: s.imported_at, count: st.n, coverId: st.first, reviewPct: st.n ? Math.round((done / st.n) * 100) : 0, sessions };
  };
  /** The layout stored for a composition, or null (older compositions have none until they are edited). */
  const storedLayout = (c: Row, members: Set<number>): Layout | null => { if (!c.layout) return null; try { return parseLayout(JSON.parse(c.layout), members); } catch { return null; } };
  /** Keeps the chosen photographs (and their order) in step with the prints that hold them. */
  const syncChosen = (id: number, layout: Layout) => {
    const chosen = chosenOf(layout);
    const rows = db.prepare('SELECT photo_id FROM collection_photos WHERE collection_id = ? ORDER BY pos').all(id) as Row[];
    const rest = rows.map((r) => r.photo_id as number).filter((p) => !chosen.includes(p));
    db.transaction(() => {
      db.prepare('UPDATE collection_photos SET chosen = 0 WHERE collection_id = ?').run(id);
      [...chosen, ...rest].forEach((pid, i) => db.prepare('UPDATE collection_photos SET pos = ?, chosen = ? WHERE collection_id = ? AND photo_id = ?').run(i, i < chosen.length ? 1 : 0, id, pid));
    })();
  };
  const saveLayout = (id: number, layout: Layout) => { db.prepare('UPDATE collections SET layout = ? WHERE id = ?').run(JSON.stringify(layout), id); syncChosen(id, layout); };
  const collectionDto = (c: Row) => {
    const rows = db.prepare('SELECT photo_id, chosen FROM collection_photos WHERE collection_id = ? ORDER BY pos').all(c.id) as Row[];
    const members = new Set(rows.map((r) => r.photo_id as number));
    const stored = storedLayout(c, members);
    const oldChosen = rows.filter((r) => r.chosen).map((r) => r.photo_id as number);
    const portrait = (pid: number) => { const p = one('SELECT w, h FROM photos WHERE id = ?', pid); return p && p.w && p.h ? p.h > p.w : null; };
    const layout = stored ?? deriveLayout(c.target ? JSON.parse(c.target) : null, oldChosen, portrait);
    return {
      id: c.id, name: c.name, description: c.description, theme: c.theme ?? '', stage: c.stage ?? 'progress', updatedAt: c.updated_at ?? '',
      target: stored ? targetOf(stored) : c.target ? JSON.parse(c.target) : null,
      layout, layoutSaved: !!stored, background: backgroundOf(db, c.id),
      photoIds: rows.map((r) => r.photo_id), chosenIds: stored ? chosenOf(stored) : oldChosen, printedAt: c.printed_at ?? null,
    };
  };

  const notFound = (rep: any, what = 'Not found') => rep.code(404).send({ error: what });
  const one = (sql: string, ...a: unknown[]) => db.prepare(sql).get(...a) as Row | undefined;
  const all = (sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as Row[];
  const ratingAgg = () => new Map(all('SELECT photo_id, COUNT(*) n, AVG(rating) a, MAX(date) d FROM reviews GROUP BY photo_id').map((r) => [r.photo_id as number, { n: r.n as number, a: r.a as number, d: r.d as string }]));
  // Photographs are analysed in the background once AI is on. Errors are retried a few times and never block anything else.
  const ai = tenantProxy(() => tenants.current().ai);
  const kickAi = (t: Tenant = tenants.current()) => { if (aiConfig(t.db)) void t.ai.run().catch((e) => console.error('AI run failed', e)); };

  // ---------- health / settings ----------
  app.get('/api/health', async () => ({ ok: true, version: cfg.version ?? 'dev' }));
  // The welcome tour: shown once to someone with a new, empty library. A library that already has photographs is counted as welcomed.
  app.get('/api/welcome', async () => {
    let done = getSetting<boolean | null>(db, 'welcomed', null);
    if (done === null) { done = ((one('SELECT COUNT(*) n FROM photos') as Row).n as number) > 0; setSetting(db, 'welcomed', done); }
    return { done };
  });
  app.put('/api/welcome', async (req) => {
    const done = ((req.body ?? {}) as Row).done !== false; // `done: false` shows it again
    setSetting(db, 'welcomed', done);
    return { done };
  });

  app.get('/api/settings', async () => ({
    settings: loadSettings(db),
    limits: { previewPx: runtime.previewPx, previewQuality: runtime.previewQuality }, // what the server allows, so the choices above it can be greyed out
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
    const row = one('SELECT hash FROM photos WHERE id = ?', id); // a derivative with no photograph behind it is never sent
    if (!row || !(await ensureDeriv(db, cfg, id, kind))) return notFound(rep, 'No preview available');
    return serveDerivative(req, rep, f, String(row.hash), kind);
  };
  app.get('/api/photos/:id/thumb', sendImage('thumb'));
  app.get('/api/photos/:id/preview', sendImage('preview'));

  // ---------- shoots ----------
  app.get('/api/shoots', async () => (db.prepare('SELECT * FROM shoots ORDER BY imported_at DESC, id DESC').all() as Row[]).map(shootDto));

  // ---------- reviews ----------
  type Session = { runId: string; queue: { id: number; ar: number }[]; index: number; ratings: Record<number, number>; notes: Record<number, string> };
  // Due photographs, the one reviewed longest ago first. One never reviewed counts as reviewed when it was added.
  const dueIds = () => (db.prepare("SELECT id FROM photos p WHERE archived = 0 AND missing = 0 AND next_review_at IS NOT NULL AND next_review_at <= ? ORDER BY COALESCE((SELECT MAX(date) FROM reviews r WHERE r.photo_id = p.id), p.added_at), p.id").all(new Date().toISOString()) as Row[]).map((r) => r.id as number);
  const getSession = () => getSetting<Session | null>(db, 'reviewSession', null);
  // When nothing is due, a person can still begin: the photographs reviewed longest ago (never reviewed counts from when it was added).
  const EARLY = 20;
  const oldestIds = (n = EARLY) => (db.prepare("SELECT id FROM photos p WHERE archived = 0 AND missing = 0 ORDER BY COALESCE((SELECT MAX(date) FROM reviews r WHERE r.photo_id = p.id), p.added_at), p.id LIMIT ?").all(n) as Row[]).map((r) => r.id as number);

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
    const early = due === 0 && !resumable ? oldestIds() : [];
    return { due: count, resumable, nextId: nextId ?? early[0] ?? null, early: early.length, shootNames, total: (one('SELECT COUNT(*) n FROM photos') as Row).n, minutes: Math.max(1, Math.round(count * 0.19)), sessions: loadSettings(db).sessions };
  });
  app.post('/api/review/start', async (req) => {
    const body = (req.body ?? {}) as Row;
    // Rating particular photographs (a composition's candidates): a session of just those, replacing any unfinished one.
    const chosen = Array.isArray(body.photoIds) ? [...new Set((body.photoIds as unknown[]).map((v) => num(v)))].slice(0, 500).filter((id) => one('SELECT 1 x FROM photos WHERE id = ? AND missing = 0', id)) : null;
    const existing = chosen ? undefined : getSession();
    if (existing && existing.index < existing.queue.length) return existing;
    let ids = chosen ?? dueIds(); // oldest review first
    if (!chosen) {
      const st = loadSettings(db);
      // New shoots first: photographs from the newest photoshoots jump the queue (the order inside a shoot is kept).
      if (st.newShootsFirst && ids.length > 1) {
        const at = new Map((db.prepare('SELECT p.id, s.imported_at t FROM photos p JOIN shoots s ON s.id = p.shoot_id').all() as { id: number; t: string }[]).map((r) => [r.id, r.t]));
        ids = [...ids].sort((x, y) => String(at.get(y) ?? '').localeCompare(String(at.get(x) ?? '')));
      }
      ids = ids.slice(0, st.reviewSize); // one review is a short session
    }
    if (!chosen && ids.length === 0 && body.early === true) ids = oldestIds(); // nothing due, and the person asked to begin anyway
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

  // Done compositions can be reopened, but content cannot be changed in the same request.
  app.addHook('preHandler', async (req, rep) => {
    if (!['PATCH', 'PUT', 'POST', 'DELETE'].includes(req.method)) return;
    const route = req.routeOptions.url ?? '';
    if (!/^\/api\/collections\/:id(?:\/|$)/.test(route)) return;
    const c = one('SELECT stage FROM collections WHERE id = ?', num((req.params as Row).id));
    if (c?.stage !== 'done') return;
    const b = (req.body ?? {}) as Row;
    const reopen = req.method === 'PATCH' && route === '/api/collections/:id'
      && Object.keys(b).length === 1 && (['progress', 'review', 'done'].includes(b.stage) || b.printed === false);
    if (!reopen) return rep.code(409).send({ error: 'This composition is Done and read-only. Move it to Progress or Review before editing.' });
  });
  const fullComposition = (c: Row) => {
    const ps = collectionDto(c).layout.prints;
    return ps.length > 0 && ps.every((p) => p.photoId !== null && (!p.stack || p.photoId2 !== null));
  };

  // ---------- collections ----------
  app.get('/api/collections', async () => {
    const portfolioId = loadPortfolio(db).collectionId;
    // Manage the implicit portfolio backing list in settings. A regular composition selected for the portfolio still appears here.
    return (db.prepare('SELECT * FROM collections ORDER BY id DESC').all() as Row[])
      .filter((c) => c.id !== portfolioId || c.description !== 'Shown on the public portfolio website')
      .map(collectionDto);
  });
  app.post('/api/collections', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const name = String(b.name ?? '').trim();
    if (!name) return rep.code(400).send({ error: 'name required' });
    const id = Number(db.prepare('INSERT INTO collections(name, description, theme, target) VALUES(?, ?, ?, ?)').run(name.slice(0, 120), String(b.description ?? '').slice(0, 1000), String(b.theme ?? '').slice(0, 120), b.target ? JSON.stringify(parseTarget(b.target)) : null).lastInsertRowid);
    // A suggested set arrives with its photographs.
    (Array.isArray(b.photoIds) ? b.photoIds : []).slice(0, 500).forEach((pid: unknown, i: number) => db.prepare('INSERT OR IGNORE INTO collection_photos(collection_id, photo_id, pos) SELECT ?, id, ? FROM photos WHERE id = ?').run(id, i, num(pid)));
    if (b.layout) {
      const members = new Set((db.prepare('SELECT photo_id FROM collection_photos WHERE collection_id = ?').all(id) as Row[]).map((r) => r.photo_id as number));
      const l = parseLayout(b.layout, members);
      if (!l) { db.prepare('DELETE FROM collections WHERE id = ?').run(id); return rep.code(400).send({ error: 'That layout is not valid' }); }
      saveLayout(id, l);
    }
    return collectionDto(one('SELECT * FROM collections WHERE id = ?', id)!);
  });
  app.get('/api/collections/:id', async (req, rep) => {
    const c = one('SELECT * FROM collections WHERE id = ?', num((req.params as Row).id));
    return c ? collectionDto(c) : notFound(rep);
  });
  // The print sheet: what to order, print by print (sizes, frames, the photograph in each), as a one-page PDF.
  app.get('/api/collections/:id/print-sheet', async (req, rep) => {
    const c = one('SELECT * FROM collections WHERE id = ?', num((req.params as Row).id));
    if (!c) return notFound(rep);
    const dto = collectionDto(c);
    const lines: SheetLine[] = [{ text: dto.name, size: 20, bold: true }, { text: `Print sheet - ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`, size: 10 }, { text: '' }];
    dto.layout.prints.forEach((p, i) => {
      const ph = p.photoId ? one('SELECT title, file, w, h FROM photos WHERE id = ?', p.photoId) : undefined;
      const frame = p.frame ? `${p.frame.color} ${p.frame.size} frame${p.frame.size !== p.size ? `, ${p.frame.mat} mat` : ', no mat'}` : 'poster, no frame';
      lines.push({ text: `Print ${i + 1}: ${p.size} ${p.orientation}${p.stack ? ' (two stacked)' : ''} - ${frame}`, bold: true });
      lines.push({ text: ph ? `   ${ph.title || ph.file} (${ph.w} x ${ph.h} px)` : '   No photograph chosen yet' });
    });
    return rep.header('Content-Type', 'application/pdf').header('Content-Disposition', `attachment; filename="${String(dto.name).replace(/[^\w .-]/g, '_')} print sheet.pdf"`).header('Cache-Control', 'no-store').send(printSheetPdf(lines));
  });
  app.patch('/api/collections/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM collections WHERE id = ?', id)) return notFound(rep);
    const b = (req.body ?? {}) as Row;
    if ('stage' in b || 'printed' in b) {
      if (Object.keys(b).length !== 1) return rep.code(400).send({ error: 'Change the composition stage separately from its content.' });
      const stage = 'stage' in b ? b.stage : b.printed === true ? 'done' : b.printed === false ? 'progress' : null;
      if (!['progress', 'review', 'done'].includes(stage)) return rep.code(400).send({ error: 'Choose Progress, Review or Done.' });
      const c = one('SELECT * FROM collections WHERE id = ?', id)!;
      if (stage !== 'progress' && !fullComposition(c)) return rep.code(409).send({ error: 'Fill every artwork slot before moving to Review or Done.' });
      db.prepare('UPDATE collections SET stage = ?, printed_at = ? WHERE id = ?').run(stage, b.printed === true ? new Date().toISOString() : stage === 'done' ? c.printed_at : null, id);
      return collectionDto(one('SELECT * FROM collections WHERE id = ?', id)!);
    }
    if (typeof b.name === 'string' && b.name.trim()) db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(b.name.trim().slice(0, 120), id);
    if (typeof b.description === 'string') db.prepare('UPDATE collections SET description = ? WHERE id = ?').run(b.description.slice(0, 1000), id);
    if (typeof b.theme === 'string') db.prepare('UPDATE collections SET theme = ? WHERE id = ?').run(b.theme.slice(0, 120), id);
    const memberSet = () => new Set((db.prepare('SELECT photo_id FROM collection_photos WHERE collection_id = ?').all(id) as Row[]).map((r) => r.photo_id as number));
    if ('layout' in b) {
      const l = parseLayout(b.layout, memberSet());
      if (!l) return rep.code(400).send({ error: 'That layout is not valid' });
      saveLayout(id, l);
    }
    if ('target' in b) {
      const t = b.target ? parseTarget(b.target) : null;
      db.prepare('UPDATE collections SET target = ? WHERE id = ?').run(t ? JSON.stringify(t) : null, id);
      // Fewer slots than chosen photos: keep the first ones, so the count never reads "3 of 2".
      const keep = t ? t.count : 0;
      const chosen = db.prepare('SELECT photo_id FROM collection_photos WHERE collection_id = ? AND chosen = 1 ORDER BY pos').all(id) as Row[];
      chosen.slice(keep).forEach((r) => db.prepare('UPDATE collection_photos SET chosen = 0 WHERE collection_id = ? AND photo_id = ?').run(id, r.photo_id));
      // A composition that has a layout follows the target it is given: that many prints, the first ones keeping their photographs.
      const cur = storedLayout(one('SELECT * FROM collections WHERE id = ?', id)!, memberSet());
      if (cur && t && !('layout' in b)) saveLayout(id, deriveLayout(t, chosenOf(cur), () => null));
    }
    if (Array.isArray(b.order)) b.order.forEach((pid: number, i: number) => db.prepare('UPDATE collection_photos SET pos = ? WHERE collection_id = ? AND photo_id = ?').run(i, id, num(pid)));
    if (Array.isArray(b.chosenIds) && !('layout' in b)) {
      const cur = storedLayout(one('SELECT * FROM collections WHERE id = ?', id)!, memberSet());
      if (cur) {
        // With a layout, the chosen photographs are what the prints hold: print i gets the i-th one.
        const want = (b.chosenIds as unknown[]).map((v) => num(v)).filter((v) => memberSet().has(v));
        saveLayout(id, { ...cur, prints: cur.prints.map((p, i) => ({ ...p, photoId: want[i] ?? null, photoId2: p.photoId2 !== null && !want.includes(p.photoId2) ? p.photoId2 : null })) });
      } else {
        db.prepare('UPDATE collection_photos SET chosen = 0 WHERE collection_id = ?').run(id);
        for (const pid of b.chosenIds) db.prepare('UPDATE collection_photos SET chosen = 1 WHERE collection_id = ? AND photo_id = ?').run(id, num(pid));
      }
    }
    const updated = one('SELECT * FROM collections WHERE id = ?', id)!;
    if (updated.stage === 'review' && !fullComposition(updated)) db.prepare("UPDATE collections SET stage = 'progress' WHERE id = ?").run(id);
    return collectionDto(one('SELECT * FROM collections WHERE id = ?', id)!);
  });
  app.delete('/api/collections/:id', async (req) => { const id = num((req.params as Row).id); db.prepare("DELETE FROM shares WHERE kind = 'collection' AND target_id = ?").run(id); db.prepare('DELETE FROM collections WHERE id = ?').run(id); removeBackground(db, cfg.dataDir, id); return { ok: true }; });
  app.put('/api/collections/:id/photos/:photoId', async (req, rep) => {
    const { id, photoId } = req.params as Row;
    if (!one('SELECT 1 x FROM collections WHERE id = ?', num(id)) || !one('SELECT 1 x FROM photos WHERE id = ?', num(photoId))) return notFound(rep);
    const pos = (one('SELECT COALESCE(MAX(pos), -1) + 1 p FROM collection_photos WHERE collection_id = ?', num(id)) as Row).p;
    db.prepare('INSERT OR IGNORE INTO collection_photos(collection_id, photo_id, pos) VALUES(?, ?, ?)').run(num(id), num(photoId), pos);
    return collectionDto(one('SELECT * FROM collections WHERE id = ?', num(id))!);
  });
  app.delete('/api/collections/:id/photos/:photoId', async (req, rep) => {
    const { id, photoId } = req.params as Row;
    if (!one('SELECT 1 x FROM collections WHERE id = ?', num(id))) return notFound(rep);
    db.prepare('DELETE FROM collection_photos WHERE collection_id = ? AND photo_id = ?').run(num(id), num(photoId));
    // A print that held it is left empty.
    const row = one('SELECT * FROM collections WHERE id = ?', num(id))!;
    const cur = storedLayout(row, new Set((db.prepare('SELECT photo_id FROM collection_photos WHERE collection_id = ?').all(num(id)) as Row[]).map((r) => r.photo_id as number).concat(num(photoId))));
    if (cur && cur.prints.some((p) => p.photoId === num(photoId) || p.photoId2 === num(photoId))) saveLayout(num(id), { ...cur, prints: cur.prints.map((p) => ({ ...p, photoId: p.photoId === num(photoId) ? null : p.photoId, photoId2: p.photoId2 === num(photoId) ? null : p.photoId2 })) });
    const updated = one('SELECT * FROM collections WHERE id = ?', num(id))!;
    if (updated.stage === 'review' && !fullComposition(updated)) db.prepare("UPDATE collections SET stage = 'progress' WHERE id = ?").run(num(id));
    return collectionDto(one('SELECT * FROM collections WHERE id = ?', num(id))!);
  });

  // The original file, byte for byte, as a download. ?n=3&pad=2 prefixes the saved name with "03_" so a
  // collection saved in order sorts correctly. Looked up by id only, never by a client-supplied path.
  app.get('/api/photos/:id/original', async (req, rep) => {
    const p = one('SELECT path, file FROM photos WHERE id = ?', num((req.params as Row).id));
    if (!p) return notFound(rep, 'The original file is missing');
    const n = Math.round(num((req.query as Row).n, 0));
    const pad = Math.min(4, Math.max(0, Math.round(num((req.query as Row).pad, 0))));
    // A photograph kept as a smaller copy: its full-size original is fetched from the cloud account it came from, now.
    let remote = null;
    try { remote = await remoteOriginal(db, cfg, p.path); } catch (e) { return rep.code(502).send({ error: (e as Error).message }); }
    if (remote) {
      const rn = (n > 0 ? `${String(n).padStart(pad, '0')}_` : '') + remote.name;
      return rep.header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${rn.replace(/[^\x20-\x7e]|["\\;]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(rn)}`)
        .header('Cache-Control', 'no-store')
        .header(...(remote.size ? ['Content-Length', String(remote.size)] as [string, string] : ['X-Original-From', 'cloud'] as [string, string]))
        .send(remote.stream);
    }
    if (!fs.existsSync(p.path)) return notFound(rep, 'The original file is missing');
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
  registerTodo(app, ctx);
  registerBackground(app, ctx);
  registerMap(app, ctx);
  registerShare(app, ctx);
  registerPortfolio(app, ctx, (req) => { const v = auth.verify(req); return v.ok && v.user.role !== 'guest' ? v.user.id : null; });
  registerAuth(app, ctx, auth);
  registerMfa(app, ctx, auth);
  registerProfile(app, ctx);
  registerNotifications(app, ctx);
  registerHome(app, ctx);
  registerGearItems(app, ctx);
  registerCommunity(app, ctx);
  registerSystem(app, ctx);
  startEmailHealth(ctx, (fn) => app.addHook('onClose', async () => fn()));
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
  }
  // The tunnel saved in Settings comes back up with the server whatever else is set, and is set up again (it turns itself on if it is not).
  // Left-over environment variables that fail (a revoked API token) must not keep it down: if they do work, they take over and restart it.
  startup.push(setTimeout(() => { if (loadTunnel(sys).enabled) tunnelRunner.start(); ctx.tunnelRefresh?.(); }, 1500));
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
