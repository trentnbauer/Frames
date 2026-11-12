import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import sharp from 'sharp';
import type { Ctx, Row } from './ctx.js';
import type { Tenant, Tenants } from './tenants.js';
import { getSetting, setSetting, type DB } from './db.js';
import { loadAuth } from './auth.js';
import { remoteOriginal } from './cloud.js';
import { hostOfUrl } from './tunnel.js';
import { derivPath } from './ingest.js';
import { serveDerivative } from './imageServe.js';
import { avatarPath, displayNameOf } from './routes/profile.js';

/**
 * The public portfolio website, served by Frames from a collection you choose.
 *
 * The page itself (web/public/portfolio) is the same site that used to be built by GitHub Actions. Frames now supplies
 * what that build produced: config.json, images/manifest.json, resized progressive JPEGs, and gear.md.
 *
 * Safety:
 *  - Only the photographs in the chosen collection can be reached, and only through these addresses.
 *  - Visitors get a resized copy with all camera data removed. Serving the original files is an explicit choice,
 *    because an original can contain the location it was taken.
 *  - A dedicated hostname shows ONLY the portfolio. Pointing a tunnel or proxy at that name never exposes the app.
 */

export type PortfolioCfg = {
  enabled: boolean;
  host: string;
  collectionId: number | null;
  photographerName: string;
  tagline: string;
  accentColor: string;
  /** Links in the site's header, in this order: a short name (an emoji or up to 4 letters, used where space is tight), a full name and a link. */
  buttons: { short: string; name: string; url: string }[];
  gear: string;
  footer: string;
  /** What a visitor gets when they open a photo full size. */
  fullSize: 'resized' | 'original' | 'none';
  captions: boolean;
  order: 'collection' | 'newest' | 'oldest' | 'captured' | 'score';
  /** Photographs whose average rating reaches the threshold join the portfolio by themselves (unless left out). */
  autoAdd: boolean;
  autoThreshold: number;
};

export const DEFAULT_PORTFOLIO: PortfolioCfg = {
  enabled: false, host: '', collectionId: null, photographerName: '', tagline: '', accentColor: 'oklch(0.58 0.13 35)',
  buttons: [], gear: '', footer: '', fullSize: 'resized', captions: true, order: 'collection', autoAdd: false, autoThreshold: 4.3,
};
export const MAX_BUTTONS = 8;
/** The three fixed links an earlier version had (Instagram, X, Behance) become buttons the first time the settings are read. */
const LEGACY_SOCIAL: [string, string, string][] = [['instagram', 'IG', 'Instagram'], ['twitter', 'X', 'X'], ['behance', 'Bē', 'Behance']];
export const loadPortfolio = (db: DB): PortfolioCfg => {
  const { social, ...s } = getSetting<Partial<PortfolioCfg> & { social?: Record<string, string> }>(db, 'portfolio', {});
  const buttons = Array.isArray(s.buttons) ? s.buttons : LEGACY_SOCIAL.filter(([k]) => social?.[k]).map(([k, short, name]) => ({ short, name, url: social![k] }));
  return { ...DEFAULT_PORTFOLIO, ...s, buttons };
};
const save = (db: DB, c: PortfolioCfg) => setSetting(db, 'portfolio', c);

const MAX_DIM = 2400;
const BROWSER_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };

/** The exact addresses that anyone may fetch, whatever the host. Nothing else of the app is reachable this way. */
export const isPortfolioPath = (url: string): boolean => {
  const p = url.split('?')[0];
  return /^\/portfolio\/?$/.test(p) || /^\/portfolio\/(index\.html|config\.json|gear\.md|avatar\.jpg|css\/style\.css|js\/(app|theme)\.js|images\/manifest\.json|gear\.json|fonts\/[\w.-]{1,60}\.woff2|images\/\d{1,9}\.jpg|images\/\d{1,9}-full)$/.test(p);
};

/** "2026-Autumn-KonicaAutoS2-FujiC200-R01-0024" gives camera "Konica Auto S 2" and film "Fuji C 200". Same rule as the old build. */
const humanise = (t: string) => t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2').trim();
export function parseFilenameMeta(file: string): { camera?: string; film?: string } {
  const tokens = path.parse(file).name.split('-');
  return tokens.length < 4 ? {} : { camera: humanise(tokens[2]), film: humanise(tokens[3]) };
}

/** First path segments a handle may never take: the app's own pages, routes and files. */
export const RESERVED_HANDLES = new Set(['api', 'auth', 's', 'assets', 'admin', 'collections', 'community', 'compare', 'duplicates', 'gear', 'library', 'photo', 'review', 'settings', 'shoots', 'stats', 'todo', 'welcome', 'portfolio', 'signin', 'signup', 'terms', 'privacy', 'login', 'logout', 'static', 'public', 'www', 'icon', 'theme', 'favicon']);
export const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const HANDLE_URL = /^\/([a-z0-9][a-z0-9-]{1,28}[a-z0-9])(\/[^?]*)?(\?.*)?$/;
type HandleReq = { __handle?: string; __handleUser?: number };

/**
 * Fastify's rewriteUrl: "/jane/images/1.jpg" is answered as "/portfolio/images/1.jpg" for Jane, whose handle it is. Anything else is left alone.
 * Nothing is rewritten unless a person has claimed that handle, so the app's own addresses are untouched.
 */
export function portfolioHandleRewrite(sys: DB) {
  const find = sys.prepare('SELECT user_id FROM portfolio_handles WHERE handle = ?');
  return (raw: { url?: string }): string => {
    const url = raw.url ?? '';
    const m = HANDLE_URL.exec(url);
    if (!m || RESERVED_HANDLES.has(m[1])) return url;
    const row = find.get(m[1]) as { user_id: number } | undefined;
    if (!row) return url;
    Object.assign(raw, { __handle: m[1], __handleUser: row.user_id } satisfies HandleReq);
    return `/portfolio${m[2] ?? '/'}${m[3] ?? ''}`;
  };
}
const handleOfReq = (req: { raw: unknown }) => (req.raw as HandleReq).__handle;

const hostOf = (req: FastifyRequest) => String(req.hostname ?? '').toLowerCase();

/**
 * For the request hook. 'index' = serve the portfolio page; 'allow' = a portfolio address (skip the sign-in);
 * 'deny' = the portfolio hostname, but not a portfolio address (so: nothing); null = a normal request.
 * A hostname belongs to one person (the system database says whom), and then every answer comes from their library only.
 */
export function createPortfolioGate(sys: DB, tenants: Tenants, webDir?: string) {
  let index: string | null = null;
  /** The page; at a person's handle its relative links (<base>) point there instead of /portfolio/. */
  const indexHtml = (handle?: string) => { index ??= fs.readFileSync(path.join(webDir ?? '', 'portfolio', 'index.html'), 'utf8'); return handle ? index.replace('<base href="/portfolio/">', `<base href="/${handle}/">`) : index; };
  const none = { mode: null as null, tenant: null as Tenant | null };
  return {
    indexHtml,
    check(req: FastifyRequest): { mode: 'index' | 'allow' | 'deny' | null; tenant: Tenant | null } {
      const viaHandle = (req.raw as HandleReq).__handleUser;
      const row = viaHandle ? { user_id: viaHandle } : sys.prepare('SELECT user_id FROM portfolio_hosts WHERE host = ?').get(hostOf(req)) as { user_id: number } | undefined;
      if (!row) return none;
      const t = tenants.get(row.user_id);
      if (!t) return { mode: 'deny', tenant: null };
      if (!loadPortfolio(t.db).enabled) return { mode: 'deny', tenant: null };
      const p = req.url.split('?')[0];
      if (req.method !== 'GET' && req.method !== 'HEAD') return { mode: 'deny', tenant: null };
      if (p === '/' && !viaHandle) return { mode: 'index', tenant: t };
      return isPortfolioPath(req.url) ? { mode: 'allow', tenant: t } : { mode: 'deny', tenant: null };
    },
  };
}

import { gearJson, gearMarkdown } from './routes/gearitems.js';
export function registerPortfolio(app: FastifyInstance, x: Ctx, viewerId: (req: FastifyRequest) => number | null) {
  const { db, cfg, num, one, all, notFound } = x;

  /**
   * What the portfolio shows: photographs added by hand (the chosen collection), favourites, and photographs whose score reaches the
   * automatic threshold, minus any left out (which always wins).
   */
  const MEMBER = `p.has_derivs = 1 AND p.missing = 0 AND p.id NOT IN (SELECT photo_id FROM portfolio_marks WHERE out = 1) AND (
      p.id IN (SELECT photo_id FROM collection_photos WHERE collection_id = :col)
      OR p.id IN (SELECT photo_id FROM portfolio_marks WHERE favourite = 1)
      OR (:auto = 1 AND p.id IN (SELECT photo_id FROM reviews GROUP BY photo_id HAVING AVG(rating) >= :thr)))`;
  const photos = (c: PortfolioCfg): Row[] => {
    const order = c.order === 'newest' ? 'p.added_at DESC, p.id DESC' : c.order === 'oldest' ? 'p.added_at ASC, p.id ASC' : c.order === 'score' ? 'COALESCE((SELECT AVG(rating) FROM reviews r WHERE r.photo_id = p.id), 0) DESC, p.id ASC' : c.order === 'captured' ? 'COALESCE(p.captured_at, p.added_at) DESC, p.id DESC' : 'cp.pos IS NULL, cp.pos ASC, p.id ASC';
    return db.prepare(`SELECT p.* FROM photos p LEFT JOIN collection_photos cp ON cp.collection_id = :col AND cp.photo_id = p.id WHERE ${MEMBER} ORDER BY ${order}`)
      .all({ col: c.collectionId ?? 0, auto: c.autoAdd ? 1 : 0, thr: c.autoThreshold }) as Row[];
  };
  const inSet = (c: PortfolioCfg, id: number) => !!db.prepare(`SELECT 1 FROM photos p WHERE p.id = :id AND ${MEMBER}`).get({ id, col: c.collectionId ?? 0, auto: c.autoAdd ? 1 : 0, thr: c.autoThreshold });

  /**
   * The picture the portfolio shows: at most 2400 px, no camera data. A preview that is already that small (and has none: Frames
   * never writes it) is used as it is, so a photograph is not stored twice. A larger one is shrunk to a kept copy.
   */
  async function portfolioJpeg(id: number): Promise<string | null> {
    const src = derivPath(cfg, id, 'preview');
    if (!fs.existsSync(src)) return null;
    const m = await sharp(src).metadata();
    if (Math.max(m.width ?? 0, m.height ?? 0) <= MAX_DIM) return src;
    const out = path.join(path.dirname(src), 'portfolio.jpg');
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) return out;
    const tmp = `${out}.${process.pid}.tmp`;
    await sharp(src).resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(tmp); // mozjpeg is progressive
    fs.renameSync(tmp, out);
    return out;
  }

  const live = (rep: any) => { const c = loadPortfolio(db); if (!c.enabled) { notFound(rep); return null; } return c; };
  const open = (rep: any) => rep.header('Cache-Control', 'no-cache');

  /** Whether this server lets portfolios offer the original files at all (an administrator's choice, off by default). */
  const originalsAllowed = () => !!getSetting<{ allowOriginals?: boolean }>(x.sys, 'instance', {}).allowOriginals;

  // ---------- the public site ----------
  // A person with a handle is at /handle/. The old /portfolio/ address sends the owner there (and still serves the page when no handle is set).
  const ownHandle = (): string => (x.sys.prepare('SELECT handle FROM portfolio_handles WHERE user_id = ?').get(x.tenant().user.id) as { handle: string } | undefined)?.handle ?? '';
  const pageFor = (req: FastifyRequest, rep: any) => {
    const via = handleOfReq(req), mine = via ? '' : ownHandle();
    if (mine) return rep.redirect(`/${mine}/`, 301);
    if (!live(rep)) return;
    const html = fs.readFileSync(path.join(cfg.webDir ?? '', 'portfolio', 'index.html'), 'utf8');
    return rep.type('text/html').header('Cache-Control', 'no-cache').send(via ? html.replace('<base href="/portfolio/">', `<base href="/${via}/">`) : html);
  };
  app.get('/portfolio', async (req, rep) => (handleOfReq(req) ? pageFor(req, rep) : ownHandle() ? rep.redirect(`/${ownHandle()}/`, 301) : rep.redirect('/portfolio/')));
  app.get('/portfolio/', async (req, rep) => pageFor(req, rep));
  app.get('/portfolio/config.json', async (req, rep) => {
    const c = live(rep); if (!c) return;
    const own = viewerId(req) === x.tenant().user.id;
    // A separate portfolio hostname cannot serve the app; use its configured public address.
    const dedicated = !!x.sys.prepare('SELECT 1 FROM portfolio_hosts WHERE host = ?').get(hostOf(req));
    const appUrl = dedicated ? loadAuth(x.sys).publicUrl.replace(/\/+$/, '') : '';
    const edit = own && (!dedicated || appUrl) ? { portfolio: `${appUrl}/settings?section=portfolio`, gear: `${appUrl}/gear` } : null;
    rep.header('Cache-Control', 'private, no-store').header('Vary', 'Cookie');
    // The name and picture are the person's profile (Settings, Profile); a name typed here by an older version is used only until they set one.
    return rep.send({ edit, country: String(getSetting<{ country?: string }>(db, 'profile', {}).country ?? ''), photographerName: displayNameOf(db) || c.photographerName, avatar: fs.existsSync(avatarPath(cfg.dataDir)) ? 'avatar.jpg' : '', tagline: c.tagline, accentColor: c.accentColor, buttons: c.buttons, gearUrl: 'gear.md', footer: c.footer });
  });
  app.get('/portfolio/avatar.jpg', async (_req, rep) => {
    if (!live(rep)) return;
    const f = avatarPath(cfg.dataDir);
    if (!fs.existsSync(f)) return notFound(rep);
    return open(rep).type('image/jpeg').send(fs.readFileSync(f));
  });
  app.get('/portfolio/gear.json', async (_req, rep) => {
    const c = live(rep); if (!c) return;
    return open(rep).send(gearJson(db));
  });
  app.get('/portfolio/fonts/:name', async (req, rep) => {
    if (!live(rep)) return;
    const n = String((req.params as Row).name);
    const f = path.join(cfg.webDir ?? '', 'portfolio', 'fonts', n);
    if (!/^[\w.-]{1,60}\.woff2$/.test(n) || !fs.existsSync(f)) return notFound(rep);
    return rep.header('Cache-Control', 'public, max-age=86400').type('font/woff2').send(fs.readFileSync(f));
  });
  app.get('/portfolio/gear.md', async (_req, rep) => {
    const c = live(rep); if (!c) return;
    return open(rep).type('text/markdown; charset=utf-8').send(gearMarkdown(db) !== '# My gear\n\nNothing listed yet.' ? gearMarkdown(db) : c.gear || '# My gear\n\nNothing listed yet.');
  });
  app.get('/portfolio/images/manifest.json', async (_req, rep) => {
    const c = live(rep); if (!c) return;
    // Only what the page needs: a title, the date, the size, and (if allowed) the camera and film. No place, notes, file path or location.
    return open(rep).send(photos(c).map((p) => {
      const scale = Math.min(1, MAX_DIM / Math.max(p.w || 1, p.h || 1));
      const meta = c.captions ? { ...parseFilenameMeta(p.file), ...(parseFilenameMeta(p.file).camera ? {} : p.camera ? { camera: String(p.camera) } : {}) } : {};
      return {
        file: `images/${p.id}.jpg`,
        ...(c.fullSize === 'original' && originalsAllowed() ? { original: `images/${p.id}-full` } : {}),
        alt: p.title, date: p.captured_at ?? p.added_at,
        width: p.w ? Math.round(p.w * scale) : undefined, height: p.h ? Math.round(p.h * scale) : undefined, ...meta,
      };
    }));
  });
  app.get('/portfolio/images/:name', async (req, rep) => {
    const c = live(rep); if (!c) return;
    const m = /^(\d{1,9})(-full|\.jpg)$/.exec((req.params as Row).name);
    if (!m || !inSet(c, Number(m[1]))) return notFound(rep); // only photographs in the portfolio
    const id = Number(m[1]);
    const cache = 'public, max-age=3600';
    if (m[2] === '-full') {
      if (c.fullSize !== 'original' || !originalsAllowed()) return notFound(rep);
      const p = one('SELECT path, file FROM photos WHERE id = ?', id)!;
      // Kept here only as a smaller copy: the visitor gets the full-size original, fetched from the owner's cloud account (or the resized picture if that is not possible now).
      try {
        const remote = await remoteOriginal(db, cfg, p.path);
        if (remote) {
          const rt = BROWSER_TYPES[path.extname(remote.name).toLowerCase()];
          if (rt) return rep.header('Cache-Control', 'private, max-age=300').type(rt).send(remote.stream);
          remote.stream.destroy();
        }
      } catch { /* the cloud is not reachable: the resized picture below */ }
      const type = BROWSER_TYPES[path.extname(p.file).toLowerCase()];
      // A browser can show JPEG and PNG. A RAW or TIFF original cannot be shown, so those get the resized picture.
      if (type && fs.existsSync(p.path)) return rep.header('Cache-Control', cache).type(type).send(fs.createReadStream(p.path));
    }
    const f = await portfolioJpeg(id);
    if (!f) return notFound(rep);
    return serveDerivative(req, rep, f, String(one('SELECT hash FROM photos WHERE id = ?', id)?.hash ?? id), 'portfolio', 'public');
  });

  // ---------- the owner's settings (behind the sign-in) ----------
  const status = (c: PortfolioCfg) => {
    const col = c.collectionId ? one('SELECT id, name FROM collections WHERE id = ?', c.collectionId) : null;
    return { photoCount: photos(c).length, collection: col ? { id: col.id, name: col.name } : null };
  };
  const dto = (c: PortfolioCfg) => ({ originalsAllowed: originalsAllowed(), config: c, status: status(c), collections: all('SELECT c.id, c.name, COUNT(cp.photo_id) n FROM collections c LEFT JOIN collection_photos cp ON cp.collection_id = c.id GROUP BY c.id ORDER BY c.name') });

  app.get('/api/portfolio', async () => ({ ...dto(loadPortfolio(db)), handle: ownHandle(), dnsTarget: hostOfUrl(loadAuth(x.sys).publicUrl) }));

  app.put('/api/portfolio', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const cur = loadPortfolio(db);
    const n: PortfolioCfg = { ...cur, buttons: [...cur.buttons] };
    const bad = (error: string) => rep.code(400).send({ error });
    const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
    if (b.photographerName !== undefined) n.photographerName = text(b.photographerName, 80);
    if (b.tagline !== undefined) n.tagline = text(b.tagline, 200);
    if (b.footer !== undefined) n.footer = text(b.footer, 200);
    if (b.gear !== undefined) n.gear = String(b.gear).slice(0, 20_000);
    if (b.accentColor !== undefined) {
      // It goes into a CSS custom property on a public page, so only plain colour syntax is accepted.
      const v = text(b.accentColor, 60);
      if (v && !/^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(\s*[0-9a-z.%\s,/-]+\)|[a-z]{3,20})$/i.test(v)) return bad('That colour is not valid. Use a name (coral), a hex code (#d2691e) or oklch(...)/rgb(...)');
      n.accentColor = v || DEFAULT_PORTFOLIO.accentColor;
    }
    if (b.buttons !== undefined) {
      if (!Array.isArray(b.buttons) || b.buttons.length > MAX_BUTTONS) return bad(`Up to ${MAX_BUTTONS} buttons.`);
      const list: PortfolioCfg['buttons'] = [];
      for (const raw of b.buttons) {
        const r = (raw && typeof raw === 'object' ? raw : {}) as Row;
        const short = text(r.short, 40), name = text(r.name, 40), url = text(r.url, 300);
        if (!short || Array.from(short).length > 4) return bad('A short name is an emoji or up to 4 letters.');
        if (!name) return bad('Give each button a full name.');
        try { const u = new URL(url); if (!['https:', 'http:', 'mailto:'].includes(u.protocol)) throw new Error(); } catch { return bad(`The link for “${name}” must be a web address starting with https:// (or an email link starting with mailto:).`); }
        list.push({ short, name, url });
      }
      n.buttons = list;
    }
    if (b.host !== undefined) {
      const h = text(b.host, 253).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (h && !/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$|^localhost$/.test(h)) return bad('The hostname is not valid. Use something like photography.example.com');
      if (h && x.sys.prepare('SELECT 1 FROM portfolio_hosts WHERE host = ? AND user_id != ?').get(h, x.tenant().user.id)) return bad('Someone else already uses that address.');
      const envHost = (getSetting<{ env?: boolean }>(x.sys, 'tunnel', {}).env && x.tenant().user.id === 1) ? (x.sys.prepare('SELECT host FROM portfolio_hosts WHERE user_id = 1').get() as { host: string } | undefined)?.host : '';
      if (envHost && h !== envHost) return bad('The portfolio address is set by the PORTFOLIO_HOSTNAME environment variable. Change it there and restart Frames.');
      n.host = h;
    }
    if (b.handle !== undefined) {
      const h = text(b.handle, 40).toLowerCase();
      if (h && !HANDLE_RE.test(h)) return bad('A name is 3 to 30 letters, numbers or hyphens, like jane-smith.');
      if (h && RESERVED_HANDLES.has(h)) return bad('That name is used by Frames itself. Choose another.');
      if (h && x.sys.prepare('SELECT 1 FROM portfolio_handles WHERE handle = ? AND user_id != ?').get(h, x.tenant().user.id)) return bad('Someone else already uses that name.');
      x.sys.prepare('DELETE FROM portfolio_handles WHERE user_id = ?').run(x.tenant().user.id);
      if (h) x.sys.prepare('INSERT INTO portfolio_handles(handle, user_id) VALUES(?, ?)').run(h, x.tenant().user.id);
    }
    if (b.collectionId !== undefined) {
      if (b.collectionId === null) n.collectionId = null;
      else if (!one('SELECT 1 x FROM collections WHERE id = ?', num(b.collectionId))) return bad('That collection does not exist');
      else n.collectionId = num(b.collectionId);
    }
    if (b.fullSize === 'original' && !originalsAllowed()) return bad('Switched off on this server. An administrator can allow it under Settings, Photo folders.');
    for (const [k, vals] of [['fullSize', ['resized', 'original', 'none']], ['order', ['collection', 'newest', 'oldest', 'captured', 'score']]] as const) if (b[k] !== undefined) { if (!(vals as readonly string[]).includes(b[k])) return bad(`Unknown ${k}`); (n as any)[k] = b[k]; }
    if (typeof b.captions === 'boolean') n.captions = b.captions;
    if (typeof b.autoAdd === 'boolean') n.autoAdd = b.autoAdd;
    if (b.autoThreshold !== undefined) { const t = Math.round(Number(b.autoThreshold) * 10) / 10; if (!(t >= 1 && t <= 5)) return bad('The score must be between 1 and 5.'); n.autoThreshold = t; }
    if (typeof b.enabled === 'boolean') n.enabled = b.enabled;
    save(db, n);
    // The system database maps each hostname to its owner, so a visitor reaches the right library without signing in.
    x.sys.prepare('DELETE FROM portfolio_hosts WHERE user_id = ?').run(x.tenant().user.id);
    if (n.host) x.sys.prepare('INSERT INTO portfolio_hosts(host, user_id) VALUES(?, ?)').run(n.host.toLowerCase(), x.tenant().user.id);
    x.tunnelRefresh?.(); // the tunnel's routes follow the portfolio addresses
    return { ...dto(n), handle: ownHandle() };
  });

  /** One photograph's place in the portfolio: in (by hand or favourite), auto (added by the score rule), or none. */
  const stateOf = (id: number) => {
    const c = loadPortfolio(db);
    const m = (one('SELECT favourite, out FROM portfolio_marks WHERE photo_id = ?', id) ?? { favourite: 0, out: 0 }) as Row;
    const hand = !!c.collectionId && !!one('SELECT 1 x FROM collection_photos WHERE collection_id = ? AND photo_id = ?', c.collectionId, id);
    const score = (one('SELECT AVG(rating) a, COUNT(*) n FROM reviews WHERE photo_id = ?', id) ?? {}) as Row;
    const qualifies = c.autoAdd && score.n > 0 && score.a >= c.autoThreshold;
    const state = m.out ? 'none' : hand || m.favourite ? 'in' : qualifies ? 'auto' : 'none';
    return { state, inPortfolio: state !== 'none', favourite: !!m.favourite, score: score.n ? Math.round(score.a * 10) / 10 : null, enabled: c.enabled, autoAdd: c.autoAdd, collectionId: c.collectionId };
  };
  /** Makes sure the hand-picked collection exists ("Portfolio") and returns its id. */
  const handCollection = (): number => {
    const c = loadPortfolio(db);
    if (c.collectionId && one('SELECT 1 x FROM collections WHERE id = ?', c.collectionId)) return c.collectionId;
    const col = Number(db.prepare("INSERT INTO collections(name, description) VALUES('Portfolio', 'Shown on the public portfolio website')").run().lastInsertRowid);
    save(db, { ...c, collectionId: col });
    return col;
  };
  app.get('/api/portfolio/photos/:id', async (req) => stateOf(num((req.params as Row).id)));
  app.post('/api/portfolio/photos/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM photos WHERE id = ?', id)) return notFound(rep);
    const b = (req.body ?? {}) as Row;
    const config = loadPortfolio(db);
    if ((typeof b.on === 'boolean' || b.favourite === true) && config.collectionId && one("SELECT 1 x FROM collections WHERE id = ? AND stage = 'done'", config.collectionId)) {
      return rep.code(409).send({ error: 'The portfolio composition is Done. Reopen it before changing its candidates.' });
    }
    const before = stateOf(id);
    const mark = (col: 'favourite' | 'out', v: number) => { db.prepare('INSERT OR IGNORE INTO portfolio_marks(photo_id) VALUES(?)').run(id); db.prepare(`UPDATE portfolio_marks SET ${col} = ? WHERE photo_id = ?`).run(v, id); };
    const add = () => { const col = handCollection(); mark('out', 0); db.prepare('INSERT OR IGNORE INTO collection_photos(collection_id, photo_id, pos) VALUES(?, ?, (SELECT COALESCE(MAX(pos), -1) + 1 FROM collection_photos WHERE collection_id = ?))').run(col, id, col); };
    if (typeof b.favourite === 'boolean') { mark('favourite', b.favourite ? 1 : 0); if (b.favourite) add(); }
    if (typeof b.on === 'boolean') {
      if (b.on) add();
      else {
        // Out: take it off the hand-picked list and un-star it. If the score rule had added it, it is marked left out so the rule never re-adds it.
        const c = loadPortfolio(db);
        if (c.collectionId) db.prepare('DELETE FROM collection_photos WHERE collection_id = ? AND photo_id = ?').run(c.collectionId, id);
        mark('favourite', 0);
        if (before.state === 'auto' || stateOf(id).state === 'auto') mark('out', 1);
      }
    }
    return stateOf(id);
  });
  // Settings, Portfolio: who is in by hand, who is a favourite, who is left out.
  app.get('/api/portfolio/marks', async () => {
    const c = loadPortfolio(db);
    return {
      favourites: all('SELECT photo_id FROM portfolio_marks WHERE favourite = 1').map((r) => r.photo_id as number),
      out: all('SELECT photo_id FROM portfolio_marks WHERE out = 1').map((r) => r.photo_id as number),
      hand: c.collectionId ? all('SELECT photo_id FROM collection_photos WHERE collection_id = ?', c.collectionId).map((r) => r.photo_id as number) : [],
      count: photos(c).length,
    };
  });
  app.delete('/api/portfolio/marks/:id', async (req) => { db.prepare('UPDATE portfolio_marks SET out = 0 WHERE photo_id = ?').run(num((req.params as Row).id)); return { ok: true }; });
}
