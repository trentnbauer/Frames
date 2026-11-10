import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isPortfolioPath, parseFilenameMeta } from './portfolio.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>, web: string;
const ids: Record<string, number> = {};
let originals: Record<string, Buffer> = {};
const gps = { IFD0: { Make: 'Fuji', Model: 'X-T5' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '33/1 51/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '151/1 12/1 0/1' } };

beforeAll(async () => {
  const tmpWeb = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-web-'));
  web = tmpWeb;
  fs.mkdirSync(path.join(web, 'portfolio', 'css'), { recursive: true });
  fs.mkdirSync(path.join(web, 'portfolio', 'js'), { recursive: true });
  fs.writeFileSync(path.join(web, 'portfolio', 'index.html'), '<!doctype html><title>Portfolio page</title>');
  fs.writeFileSync(path.join(web, 'portfolio', 'css', 'style.css'), 'body{}');
  fs.writeFileSync(path.join(web, 'portfolio', 'js', 'app.js'), 'void 0');
  fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><title>The app</title>');
  env = makeEnv({ webDir: web });
  A = api(env);
  const put = async (n: string, b: Buffer) => { fs.writeFileSync(path.join(env.lib, n), b); originals[n] = b; };
  await put('2026-Autumn-KonicaAutoS2-FujiC200-R01-0024.jpg', await jpg(svg(3600, 2400, '#c0392b', '#f5b041', [0.3, 0.3]), { exif: gps }));
  await put('plain.jpg', await jpg(svg(1200, 800, '#1b4f9c', '#5dade2', [0.7, 0.7]), { exif: gps }));
  await put('third.png', await sharp(svg(800, 1200, '#145a32', '#58d68d', [0.5, 0.2], true)).png().toBuffer());
  await put('private.jpg', await jpg(svg(900, 900, '#7e5109', '#f5cba7', [0.2, 0.8])));
  await A.scan();
  for (const p of (await A.get('/api/photos')).body.photos as any[]) ids[p.file] = p.id;
  await A.patch(`/api/photos/${ids['plain.jpg']}`, { place: 'Secret cove', description: 'private notes about this' });
  const c = (await A.post('/api/collections', { name: 'Showcase', photoIds: [ids['plain.jpg'], ids['2026-Autumn-KonicaAutoS2-FujiC200-R01-0024.jpg'], ids['third.png']] })).body;
  ids.collection = c.id;
});
afterAll(() => { cleanup(env); fs.rmSync(web, { recursive: true, force: true }); });

const on = (extra: object = {}) => A.put('/api/portfolio', { enabled: true, collectionId: ids.collection, photographerName: 'Trent Bauer', tagline: 'Film photographer', ...extra });
const get = (url: string, host?: string) => env.app.inject({ url, headers: host ? { host } : {} });

describe('while it is off', () => {
  it('serves nothing', async () => {
    for (const u of ['/portfolio/', '/portfolio/config.json', '/portfolio/images/manifest.json', '/portfolio/gear.md', `/portfolio/images/${ids['plain.jpg']}.jpg`]) expect((await get(u)).statusCode, u).toBe(404);
  });
  it('can be turned on with nothing in it yet, and fills from favourites, hand-picked photographs and the score rule', async () => {
    expect((await A.put('/api/portfolio', { enabled: true })).status).toBe(200);
    expect((await A.get('/api/portfolio/marks')).body.count).toBe(0);
    const id = ids['plain.jpg'], other = ids['third.png'];
    // A favourite is in, and starring adds it by hand too.
    expect((await A.post(`/api/portfolio/photos/${id}`, { favourite: true })).body).toMatchObject({ state: 'in', favourite: true });
    expect((await A.get('/api/portfolio/marks')).body.count).toBe(1);
    // The score rule adds a well-rated photograph, shown as "auto", and clicking it keeps it out for good.
    await A.put('/api/portfolio', { autoAdd: true, autoThreshold: 4.3 });
    for (const rating of [5, 5]) env.db.prepare("INSERT INTO reviews(photo_id, session, date, rating) VALUES(?, ?, ?, ?)").run(other, rating === 5 ? 1 : 2, '2026-01-01', rating);
    expect((await A.get(`/api/portfolio/photos/${other}`)).body).toMatchObject({ state: 'auto', inPortfolio: true, score: 5 });
    expect((await A.get('/api/portfolio/marks')).body.count).toBe(2);
    expect((await A.post(`/api/portfolio/photos/${other}`, { on: false })).body.state).toBe('none');
    expect((await A.get('/api/portfolio/marks')).body.out).toContain(other);
    expect((await A.get('/api/portfolio/marks')).body.count).toBe(1);
    expect((await A.put('/api/portfolio', { autoThreshold: 9 })).status).toBe(400);
    // Left out always wins, even over a favourite.
    await A.post(`/api/portfolio/photos/${id}`, { on: false });
    expect((await A.get('/api/portfolio/marks')).body.count).toBe(0);
    await A.put('/api/portfolio', { autoAdd: false, enabled: false });
    env.db.prepare('DELETE FROM reviews').run();
    env.db.prepare('DELETE FROM portfolio_marks').run();
  });
});

describe('settings are checked', () => {
  it('refuses colours that could do more than colour a page, bad links and bad hostnames', async () => {
    for (const [k, v] of [['accentColor', 'red;background:url(http://evil)'], ['accentColor', 'url(x)'], ['accentColor', '</style><script>']] as const) expect((await A.put('/api/portfolio', { [k]: v })).status, `${k}=${v}`).toBe(400);
    const btn = (o: object) => ({ short: 'IG', name: 'Instagram', url: 'https://instagram.com/me', ...o });
    expect((await A.put('/api/portfolio', { buttons: [btn({ url: 'javascript:alert(1)' })] })).status).toBe(400);
    expect((await A.put('/api/portfolio', { buttons: [btn({ short: 'ABCDE' })] })).status).toBe(400); // an emoji or up to 4 letters
    expect((await A.put('/api/portfolio', { buttons: [btn({ short: '' })] })).status).toBe(400);
    expect((await A.put('/api/portfolio', { buttons: [btn({ name: '' })] })).status).toBe(400);
    expect((await A.put('/api/portfolio', { buttons: Array.from({ length: 9 }, () => btn({})) })).status).toBe(400);
    expect((await A.put('/api/portfolio', { buttons: 'nope' })).status).toBe(400);
    expect((await A.put('/api/portfolio', { buttons: [btn({ short: '📷' }), btn({ short: '✉️', name: 'Email me', url: 'mailto:me@example.com' })] })).status).toBe(200); // emoji and mailto: links are fine
    expect((await A.get('/api/portfolio')).body.config.buttons.map((b: any) => b.short)).toEqual(['📷', '✉️']);
    await A.put('/api/portfolio', { buttons: [] });
    expect((await A.put('/api/portfolio', { host: 'not a host!' })).status).toBe(400);
    expect((await A.put('/api/portfolio', { host: 'photography.example.com/admin' })).status).toBe(200); // a path is dropped, not kept
    expect((await A.get('/api/portfolio')).body.config.host).toBe('photography.example.com');
    await A.put('/api/portfolio', { host: '' });
    for (const ok of ['oklch(0.58 0.13 35)', '#d2691e', 'coral', 'rgb(10, 20, 30)']) expect((await A.put('/api/portfolio', { accentColor: ok })).status, ok).toBe(200);
  });
});

describe('the public site', () => {
  beforeAll(async () => { await on({ accentColor: 'coral', footer: 'Made by me', gear: '# Gear\n- Leica', buttons: [{ short: '📷', name: 'Instagram', url: 'https://instagram.com/me' }] }); });

  it('serves the page and its config', async () => {
    expect((await get('/portfolio/')).body).toContain('Portfolio page');
    expect((await get('/portfolio')).statusCode).toBe(302);
    expect((await get('/portfolio/config.json')).json()).toEqual({ country: '', photographerName: 'Trent Bauer', avatar: '', tagline: 'Film photographer', accentColor: 'coral', buttons: [{ short: '📷', name: 'Instagram', url: 'https://instagram.com/me' }], gearUrl: 'gear.md', footer: 'Made by me' });
    expect((await get('/portfolio/gear.md')).body).toBe('# Gear\n- Leica');
    expect((await get('/portfolio/css/style.css')).statusCode).toBe(200);
    // The gear page as data: nothing owned yet, so it is empty; and the files the new design needs are public.
    expect((await get('/portfolio/gear.json')).json()).toMatchObject({ empty: true, showWant: false });
    expect(isPortfolioPath('/portfolio/js/theme.js')).toBe(true);
    expect(isPortfolioPath('/portfolio/fonts/ibm-plex-sans-400.woff2')).toBe(true);
    expect(isPortfolioPath('/portfolio/fonts/../../etc/passwd')).toBe(false);
  });
  it('lists the collection in its own order, with only what the page needs', async () => {
    const m = (await get('/portfolio/images/manifest.json')).json() as any[];
    expect(m.map((e) => e.file)).toEqual([`images/${ids['plain.jpg']}.jpg`, `images/${ids['2026-Autumn-KonicaAutoS2-FujiC200-R01-0024.jpg']}.jpg`, `images/${ids['third.png']}.jpg`]);
    expect(m[0]).toMatchObject({ alt: expect.any(String), width: 1200, height: 800, camera: 'Fuji X-T5' });
    expect(m[1]).toMatchObject({ width: 2400, height: 1600, camera: 'Konica Auto S 2', film: 'Fuji C 200' }); // big one is scaled to fit 2400; names read from the filename
    expect(m[0].original).toBeUndefined(); // full-size originals are off by default
    const text = JSON.stringify(m);
    for (const secret of ['Secret cove', 'private notes', 'lat', 'lon', 'path', env.tmp, 'place', 'description', 'private.jpg']) expect(text, secret).not.toContain(secret);
  });
  it('leaves the camera details out when captions are off', async () => {
    await A.put('/api/portfolio', { captions: false });
    const m = (await get('/portfolio/images/manifest.json')).json() as any[];
    expect(m.every((e) => !('camera' in e) && !('film' in e))).toBe(true);
    await A.put('/api/portfolio', { captions: true });
  });
  it('serves a resized progressive JPEG with no camera data, even from a file that has GPS', async () => {
    const r = await get(`/portfolio/images/${ids['2026-Autumn-KonicaAutoS2-FujiC200-R01-0024.jpg']}.jpg`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('image/jpeg');
    expect(r.headers['cache-control']).toContain('public');
    const m = await sharp(r.rawPayload).metadata();
    expect(m).toMatchObject({ format: 'jpeg', width: 2400, isProgressive: true });
    expect(m.exif).toBeUndefined();
    expect(r.rawPayload.includes(Buffer.from('Exif'))).toBe(false);
  });
  it('serves only photographs that are in the portfolio', async () => {
    expect((await get(`/portfolio/images/${ids['private.jpg']}.jpg`)).statusCode).toBe(404);
    expect((await get(`/portfolio/images/${ids['private.jpg']}-full`)).statusCode).toBe(404);
    expect((await get('/portfolio/images/99999.jpg')).statusCode).toBe(404);
    expect((await get('/portfolio/images/..%2F..%2Fetc%2Fpasswd')).statusCode).toBe(404);
  });
  it('does not hand out originals unless that is chosen, then gives them untouched (and a JPEG for what a browser cannot show)', async () => {
    expect((await get(`/portfolio/images/${ids['plain.jpg']}-full`)).statusCode).toBe(404);
    // Off on this server unless an administrator allows it: the choice is refused, with the reason.
    const refused = await A.put('/api/portfolio', { fullSize: 'original' });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/Switched off on this server/);
    expect((await A.get('/api/portfolio')).body.originalsAllowed).toBe(false);
    expect((await A.put('/api/admin/instance', { allowOriginals: true })).body.allowOriginals).toBe(true);
    await A.put('/api/portfolio', { fullSize: 'original' });
    const m = (await get('/portfolio/images/manifest.json')).json() as any[];
    expect(m[0].original).toBe(`images/${ids['plain.jpg']}-full`);
    const full = await get(`/portfolio/images/${ids['plain.jpg']}-full`);
    expect(full.rawPayload.equals(originals['plain.jpg'])).toBe(true);
    expect((await get(`/portfolio/images/${ids['third.png']}-full`)).headers['content-type']).toBe('image/png');
    // Switching it off on the server takes the originals away again, even for a portfolio that had chosen them.
    await A.put('/api/admin/instance', { allowOriginals: false });
    expect(((await get('/portfolio/images/manifest.json')).json() as any[])[0].original).toBeUndefined();
    expect((await get(`/portfolio/images/${ids['plain.jpg']}-full`)).statusCode).toBe(404);
    await A.put('/api/portfolio', { fullSize: 'resized' });
  });
  it('can be ordered newest, oldest or as collected', async () => {
    await A.put('/api/portfolio', { order: 'newest' });
    const newest = ((await get('/portfolio/images/manifest.json')).json() as any[]).map((e) => e.file);
    await A.put('/api/portfolio', { order: 'oldest' });
    const oldest = ((await get('/portfolio/images/manifest.json')).json() as any[]).map((e) => e.file);
    expect(newest).toEqual([...oldest].reverse());
    await A.put('/api/portfolio', { order: 'collection' });
  });
  it('shows the photos the owner adds or removes', async () => {
    expect((await A.post(`/api/portfolio/photos/${ids['private.jpg']}`, { on: true })).body.inPortfolio).toBe(true);
    expect(((await get('/portfolio/images/manifest.json')).json() as any[]).length).toBe(4);
    expect((await A.get(`/api/portfolio/photos/${ids['private.jpg']}`)).body.inPortfolio).toBe(true);
    await A.post(`/api/portfolio/photos/${ids['private.jpg']}`, { on: false });
    expect(((await get('/portfolio/images/manifest.json')).json() as any[]).length).toBe(3);
  });
  it('knows which addresses are public', () => {
    for (const ok of ['/portfolio', '/portfolio/', '/portfolio/config.json', '/portfolio/images/manifest.json', '/portfolio/images/12.jpg', '/portfolio/images/12-full', '/portfolio/css/style.css', '/portfolio/js/app.js']) expect(isPortfolioPath(ok), ok).toBe(true);
    for (const no of ['/api/photos', '/portfolio/../api/photos', '/portfolio/images/12.png', '/portfolio/images/../x.jpg', '/portfolio/secret.json', '/portfolioX/', '/portfolio/images/']) expect(isPortfolioPath(no), no).toBe(false);
  });
  it('reads film and camera from the old filename convention', () => {
    expect(parseFilenameMeta('2026-Autumn-KonicaAutoS2-FujiC200-R01-0024.jpg')).toEqual({ camera: 'Konica Auto S 2', film: 'Fuji C 200' });
    expect(parseFilenameMeta('holiday.jpg')).toEqual({});
  });
});

describe('a dedicated hostname shows only the portfolio', () => {
  const HOST = 'photography.test';
  beforeAll(async () => { await A.put('/api/portfolio', { host: HOST }); });

  it('serves the portfolio at the root of that name', async () => {
    const r = await get('/', HOST);
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('Portfolio page');
    expect((await get('/portfolio/images/manifest.json', HOST)).statusCode).toBe(200);
    expect((await get(`/portfolio/images/${ids['plain.jpg']}.jpg`, HOST)).statusCode).toBe(200);
  });
  it('shows nothing of the app, share links, or anything else on that name', async () => {
    for (const u of ['/api/photos', '/api/settings', '/api/me', '/api/health', '/library', '/settings', '/s/AAAAAAAAAAAAAAAAAAAAAA', '/api/s/AAAAAAAAAAAAAAAAAAAAAA', '/auth/signin', '/assets/x.js', `/api/photos/${ids['plain.jpg']}/original`, '/api/backup', '/portfolio/../api/photos']) {
      expect((await get(u, HOST)).statusCode, u).toBe(404);
    }
    const w = await env.app.inject({ method: 'POST', url: '/api/collections', payload: { name: 'x' }, headers: { host: HOST } });
    expect(w.statusCode).toBe(404);
  });
  it('is matched on the name only, case-insensitively and ignoring the port', async () => {
    expect((await get('/api/health', 'PHOTOGRAPHY.TEST:8080')).statusCode).toBe(404);
    expect((await get('/api/health', 'photography.test.evil.com')).statusCode).toBe(200); // a different host is a normal request
    expect((await get('/', 'other.test')).body).toContain('The app');
  });
  it('shows nothing at all on that name while the portfolio is off', async () => {
    await A.put('/api/portfolio', { enabled: false });
    expect((await get('/', HOST)).statusCode).toBe(404);
    expect((await get('/api/photos', HOST)).statusCode).toBe(404);
    await A.put('/api/portfolio', { enabled: true });
  });
});

describe('the page works at the root of its own hostname', () => {
  it('allows its <base> tag (it points at this site) in the security policy, but no other', async () => {
    const csp = String((await get('/portfolio/')).headers['content-security-policy']);
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain('base-uri *');
  });
});

describe('with a login on', () => {
  it('keeps the portfolio public and the app private', async () => {
    const e = makeEnv({ webDir: web, authUser: 'me', authPassword: 'pw' });
    try {
      const h = { authorization: 'Basic ' + Buffer.from('me:pw').toString('base64') };
      await e.app.inject({ method: 'PUT', url: '/api/portfolio', headers: h, payload: { enabled: true, collectionId: (await e.app.inject({ method: 'POST', url: '/api/collections', headers: h, payload: { name: 'S' } })).json().id } });
      expect((await e.app.inject('/portfolio/config.json')).statusCode).toBe(200);
      expect((await e.app.inject('/portfolio/images/manifest.json')).statusCode).toBe(200);
      expect((await e.app.inject('/api/photos')).statusCode).toBe(401);
      expect((await e.app.inject('/api/portfolio')).statusCode).toBe(401); // the settings are not public
      expect((await e.app.inject({ method: 'PUT', url: '/api/portfolio', payload: { enabled: false } })).statusCode).toBe(401);
    } finally { cleanup(e); }
  });
});

describe('the three fixed links of an earlier version', () => {
  it('become buttons the first time the settings are read', async () => {
    const db = env.db;
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('portfolio', ?)").run(JSON.stringify({ enabled: false, social: { instagram: 'https://instagram.com/me', twitter: '', behance: 'https://behance.net/me' } }));
    const c = (await A.get('/api/portfolio')).body.config;
    expect(c.buttons).toEqual([{ short: 'IG', name: 'Instagram', url: 'https://instagram.com/me' }, { short: 'Bē', name: 'Behance', url: 'https://behance.net/me' }]);
    expect(c.social).toBeUndefined();
  });
});
