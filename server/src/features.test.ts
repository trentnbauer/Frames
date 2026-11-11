import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { analyseLocal, colorName, hamming, hammingInts, hashInts, paletteDistance } from './analysis.js';
import { applyExternal } from './ingest.js';
import { buildXmp, parseXmp } from './xmp.js';
import { checkTarget, parseTarget, requiredPx } from './target.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>;

beforeAll(async () => {
  env = makeEnv();
  A = api(env);
  await A.put('/api/admin/instance', { storeOriginalQuality: true }); // these tests are about names and hard links: the files are stored as they arrive (quality has its own tests)
  const put = (rel: string, b: Buffer) => { fs.mkdirSync(path.dirname(path.join(env.lib, rel)), { recursive: true }); fs.writeFileSync(path.join(env.lib, rel), b); };
  // Day 1, folder "Coast": a red scene, and the same scene re-exported smaller (a near-duplicate / variant).
  put('Coast/red.jpg', await jpg(svg(1200, 800, '#b71c1c', '#e53935', [0.3, 0.3]), { exif: { IFD0: { Make: 'Fuji', Model: 'X-T5' }, IFD2: { DateTimeOriginal: '2026:10:12 06:30:00' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '33/1 51/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '151/1 12/1 0/1' } } }));
  put('Coast/red_small.jpg', await jpg(svg(600, 400, '#b71c1c', '#e53935', [0.3, 0.3])));
  // Day 2, folder "Hills": blue and green scenes.
  put('Hills/blue.jpg', await jpg(svg(800, 1200, '#1b4f9c', '#5dade2', [0.7, 0.7]), { exif: { IFD2: { DateTimeOriginal: '2026:10:13 17:00:00' } } }));
  put('Hills/green.jpg', await jpg(svg(1000, 1000, '#145a32', '#58d68d', [0.5, 0.2], true), { exif: { IFD2: { DateTimeOriginal: '2026:10:13 17:30:00' } } }));
  await A.scan();
});
afterAll(() => cleanup(env));

const photo = async (file: string) => ((await A.get('/api/photos')).body.photos as any[]).find((p) => p.file === file);

describe('image analysis (no AI)', () => {
  it('names colours sensibly', () => {
    expect(colorName(200, 30, 30)).toBe('red');
    expect(colorName(30, 90, 200)).toBe('blue');
    expect(colorName(40, 160, 70)).toBe('green');
    expect(colorName(10, 10, 10)).toBe('black');
    expect(colorName(250, 250, 250)).toBe('white');
    expect(colorName(120, 120, 120)).toBe('grey');
    expect(colorName(110, 70, 30)).toBe('brown');
  });
  it('finds the palette, brightness and a perceptual hash', async () => {
    const a = await analyseLocal(await jpg(svg(400, 300, '#c0392b', '#c0392b', [0.5, 0.5])));
    expect(a.dhash).toMatch(/^[0-9a-f]{16}$/);
    expect(a.palette[0].name).toBe('red');
    expect(a.palette.reduce((n, s) => n + s.pct, 0)).toBeLessThanOrEqual(100);
    expect(a.brightness).toBeGreaterThan(0.1);
    expect(a.colors).toContain(' red ');
  });
  it('gives near-identical pictures nearly identical hashes, and different ones distant hashes', async () => {
    const big = await analyseLocal(await jpg(svg(1200, 800, '#b71c1c', '#e53935', [0.3, 0.3])));
    const small = await analyseLocal(await jpg(svg(600, 400, '#b71c1c', '#e53935', [0.3, 0.3])));
    const other = await analyseLocal(await jpg(svg(800, 1200, '#1b4f9c', '#5dade2', [0.7, 0.7])));
    expect(hamming(big.dhash, small.dhash)).toBeLessThanOrEqual(4);
    expect(hamming(big.dhash, other.dhash)).toBeGreaterThan(8);
    expect(hammingInts(hashInts(big.dhash), hashInts(other.dhash))).toBe(hamming(big.dhash, other.dhash));
    expect(paletteDistance(big.palette, small.palette)).toBeLessThan(paletteDistance(big.palette, other.palette));
  });
});

describe('importing', () => {
  it('reads GPS and capture time from the file, and analyses every photo', async () => {
    const red = await photo('red.jpg');
    expect(red.lat).toBeCloseTo(-33.85, 2);
    expect(red.lon).toBeCloseTo(151.2, 2);
    expect(red.capturedAt).toContain('2026-10-12');
    expect(red.camera).toBe('Fuji X-T5');
    expect(red.palette.length).toBeGreaterThan(0);
    expect((await photo('green.jpg')).brightness).toBeGreaterThan(0);
  });
  it('notices a changed original and keeps its reviews', async () => {
    const f = path.join(env.lib, 'Hills/green.jpg');
    const before = await photo('green.jpg');
    await A.put(`/api/photos/${before.id}/tags`, { name: 'keepme' });
    fs.writeFileSync(f, await jpg(svg(500, 700, '#145a32', '#58d68d', [0.2, 0.8])));
    fs.utimesSync(f, new Date(), new Date(Date.now() + 5000));
    const r = (await A.scan()).body;
    expect(r.changed).toBe(1);
    const after = await photo('green.jpg');
    expect(after.id).toBe(before.id);
    expect(after.w).toBe(500);
    expect(((await A.get(`/api/photos/${after.id}`)).body.tags as any[]).map((t) => t.name)).toContain('keepme');
  });
});

describe('searching and filtering', () => {
  const ids = async (qs: string) => ((await A.get(`/api/photos?${qs}`)).body.photos as any[]).map((p) => p.file).sort();
  it('filters by colour, date range, location and GPS', async () => {
    expect(await ids('colour=red')).toEqual(['red.jpg', 'red_small.jpg']);
    expect(await ids('colour=blue')).toEqual(['blue.jpg']);
    expect(await ids('from=2026-10-13&to=2026-10-13')).toEqual(['blue.jpg']);
    expect(await ids('gps=1')).toEqual(['red.jpg']);
    expect(await ids('near=-33.9,151.2,20')).toEqual(['red.jpg']);
    expect(await ids('near=48.8,2.3,50')).toEqual([]);
  });
  it('combines several criteria at once', async () => {
    expect(await ids('colour=red&from=2026-10-12&gps=1&q=red')).toEqual(['red.jpg']);
    expect(await ids('colour=red&to=2026-10-11')).toEqual([]);
  });
  it('filters by tag and subject separately, with several tags meaning all of them', async () => {
    const red = await photo('red.jpg'), blue = await photo('blue.jpg');
    await A.put(`/api/photos/${red.id}/tags`, { name: 'harbour', kind: 'subject' });
    await A.put(`/api/photos/${red.id}/tags`, { name: 'moody' });
    await A.put(`/api/photos/${blue.id}/tags`, { name: 'moody' });
    expect(await ids('subject=harbour')).toEqual(['red.jpg']);
    expect(await ids('tag=moody')).toEqual(['blue.jpg', 'red.jpg']);
    expect(await ids('tag=moody,harbour')).toEqual(['red.jpg']);
    expect(await ids('subject=moody')).toEqual([]);
  });
  it('searches the place and description text', async () => {
    const blue = await photo('blue.jpg');
    await A.patch(`/api/photos/${blue.id}`, { place: 'Blue Mountains', description: 'Late light on the ridge' });
    expect(await ids('q=mountains')).toEqual(['blue.jpg']);
    expect(await ids('place=blue%20mount')).toEqual(['blue.jpg']);
    expect(await ids('q=ridge')).toEqual(['blue.jpg']);
  });
  it('excludes things and filters by time of day', async () => {
    const red = await photo('red.jpg');
    await A.put(`/api/photos/${red.id}/tags`, { name: 'people' });
    expect(await ids('exclude=people&tag=moody')).toEqual(['blue.jpg']);
    expect(await ids('exclude=people&gps=1')).toEqual([]);
    expect(await ids('time=05:00-08:00')).toEqual(['red.jpg']); // 06:30 capture
    expect(await ids('time=16:00-18:00')).toEqual(['blue.jpg']); // 17:00 capture
    expect(await ids('time=5:00-8:00&exclude=nothing')).toEqual(['red.jpg']);
    await A.put(`/api/photos/${red.id}/tags`, { name: 'people', action: 'remove' });
  });
  it('pages results', async () => {
    const r = (await A.get('/api/photos?limit=2&offset=1')).body;
    expect(r.photos).toHaveLength(2);
    expect(r.total).toBe(4);
  });
});

describe('similarity, near-duplicates and variants', () => {
  it('ranks the near-copy as most similar', async () => {
    const red = await photo('red.jpg');
    const s = (await A.get(`/api/photos/${red.id}/similar`)).body;
    expect(s[0].file).toBe('red_small.jpg');
    expect(s[0].similarity).toBeGreaterThan(s[1].similarity);
    const ranked = (await A.get(`/api/photos?similarTo=${red.id}`)).body.photos;
    expect(ranked[0].file).toBe('red_small.jpg');
  });
  it('finds the near-duplicate pair, suggests the larger as the original, and links them as variants', async () => {
    const groups = (await A.get('/api/duplicates')).body as any[];
    expect(groups).toHaveLength(1);
    const red = await photo('red.jpg'), small = await photo('red_small.jpg');
    expect(groups[0].suggestedParentId).toBe(red.id);
    expect((await A.post('/api/duplicates/variants', { parentId: red.id, childIds: [small.id] })).status).toBe(200);
    expect((await A.get('/api/duplicates')).body).toHaveLength(0);
    const full = (await A.get(`/api/photos/${red.id}`)).body;
    expect(full.variants).toEqual([small.id]);
    expect((await photo('red_small.jpg')).parentId).toBe(red.id);
    // both stay ordinary, browsable photographs
    expect(((await A.get('/api/photos')).body.photos as any[])).toHaveLength(4);
    expect(((await A.get('/api/photos?variants=hide')).body.photos as any[])).toHaveLength(3);
  });
  it('refuses a photo as its own variant and can detach one', async () => {
    const red = await photo('red.jpg'), small = await photo('red_small.jpg');
    expect((await A.post('/api/duplicates/variants', { parentId: small.id, childIds: [red.id] })).status).toBe(400);
    await A.patch(`/api/photos/${small.id}`, { parentId: null });
    expect((await photo('red_small.jpg')).parentId).toBeNull();
  });
  it('lets "not a duplicate" be remembered', async () => {
    const red = await photo('red.jpg'), small = await photo('red_small.jpg');
    expect((await A.get('/api/duplicates')).body).toHaveLength(1);
    await A.post('/api/duplicates/ignore', { photoIds: [red.id, small.id] });
    expect((await A.get('/api/duplicates')).body).toHaveLength(0);
  });
});

describe('subjects and tags', () => {
  it('creates, lists, renames, merges and deletes them', async () => {
    await A.post('/api/tags', { name: 'Street', kind: 'subject' });
    const list = (await A.get('/api/tags?kind=subject')).body as any[];
    expect(list.find((t) => t.name === 'street').n).toBe(0);
    await A.patch('/api/tags/tag/moody', { name: 'atmospheric' });
    expect(((await A.get('/api/tags?kind=tag')).body as any[]).map((t) => [t.name, t.n])).toContainEqual(['atmospheric', 2]);
    await A.patch('/api/tags/subject/harbour', { name: 'street' });
    expect(((await A.get('/api/tags?kind=subject')).body as any[]).find((t) => t.name === 'street').n).toBe(1);
    await A.del('/api/tags/tag/atmospheric');
    expect(((await A.get('/api/tags?kind=tag')).body as any[]).some((t) => t.name === 'atmospheric')).toBe(false);
  });
});

describe('photoshoots', () => {
  it('edits description, place and dates, which then show on the shoot', async () => {
    const shoot = (await A.get('/api/shoots')).body[0];
    const r = (await A.patch(`/api/shoots/${shoot.id}`, { description: 'Autumn trip', place: 'NSW', dateFrom: '2026-10-12', dateTo: '2026-10-14' })).body;
    expect(r.description).toBe('Autumn trip');
    expect(r.dates).toContain('12 Oct 2026');
    expect(r.dates).toContain('14 Oct 2026');
    await A.patch(`/api/shoots/${shoot.id}`, { dateFrom: null, dateTo: null });
  });
  it('suggests splitting by folder and day, and moves photos when accepted', async () => {
    const sug = (await A.get('/api/shoots/suggestions')).body as any[];
    expect(sug).toHaveLength(1);
    expect(sug[0].groups).toHaveLength(2);
    const hills = sug[0].groups.find((g: any) => g.name.includes('Hills') || g.photoIds.length === 2);
    const created = (await A.post('/api/shoots', { name: 'Hills trip', photoIds: hills.photoIds })).body;
    expect(created.count).toBe(hills.photoIds.length);
  });
  it('moves a photo to another photoshoot, and rejects one that does not exist', async () => {
    const shoots = (await A.get('/api/shoots')).body as any[];
    const p = await photo('red.jpg');
    const target = shoots.find((s) => s.id !== p.shootId);
    expect(((await A.patch(`/api/photos/${p.id}`, { shootId: target.id })).body).shootId).toBe(target.id);
    expect((await A.patch(`/api/photos/${p.id}`, { shootId: 9999 })).status).toBe(400);
  });
});

describe('XMP and external metadata', () => {
  it('parses and builds XMP', () => {
    const x = buildXmp({ title: 'A & B', description: 'Quiet <light>', keywords: ['fog', 'sea'], rating: 4 });
    expect(parseXmp(x)).toEqual({ title: 'A & B', description: 'Quiet <light>', keywords: ['fog', 'sea'], rating: 4 });
  });
  it('reads a sidecar next to the photo: keywords become tags, a title fills a blank, a rating is recorded', async () => {
    const f = path.join(env.lib, 'Hills/blue.jpg');
    fs.writeFileSync(`${f}.xmp`, buildXmp({ title: 'Ridge at dusk', description: '', keywords: ['dusk', 'ridge'], rating: 5 }));
    await A.scan();
    const b = await photo('blue.jpg');
    const full = (await A.get(`/api/photos/${b.id}`)).body;
    expect(full.tags.map((t: any) => t.name)).toEqual(expect.arrayContaining(['dusk', 'ridge']));
    expect(full.xmpRating).toBe(5);
    expect(full.title).toBe('Ridge at dusk');
  });
  it('never overwrites what the user wrote: a different value becomes a conflict they resolve', async () => {
    const b = await photo('blue.jpg');
    await A.patch(`/api/photos/${b.id}`, { title: 'My own title' });
    const f = path.join(env.lib, 'Hills/blue.jpg.xmp');
    fs.writeFileSync(f, buildXmp({ title: 'Ridge at dusk v2', description: '', keywords: [], rating: 5 }));
    fs.utimesSync(f, new Date(), new Date(Date.now() + 9000));
    await A.scan();
    const c = (await A.get('/api/metadata/conflicts')).body as any[];
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ field: 'title', mine: 'My own title', theirs: 'Ridge at dusk v2' });
    expect((await A.get(`/api/photos/${b.id}`)).body.title).toBe('My own title');
    await A.post('/api/metadata/resolve', { photoId: b.id, field: 'title', use: 'theirs' });
    expect((await A.get(`/api/photos/${b.id}`)).body.title).toBe('Ridge at dusk v2');
    expect((await A.get('/api/metadata/conflicts')).body).toHaveLength(0);
  });
  it('adds tags from outside but never removes any', () => {
    const p = env.db.prepare('SELECT id FROM photos LIMIT 1').get() as { id: number };
    env.db.prepare("INSERT OR IGNORE INTO tags(photo_id, name, source, accepted, kind) VALUES(?, 'mine', 'user', 1, 'tag')").run(p.id);
    applyExternal(env.db, p.id, { keywords: ['theirs'] }, 'xmp');
    const names = (env.db.prepare('SELECT name FROM tags WHERE photo_id = ?').all(p.id) as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['mine', 'theirs']));
  });
  it('exports only approved metadata, to the data folder by default and never into the image', async () => {
    const b = await photo('blue.jpg');
    const x = (await A.get(`/api/photos/${b.id}/xmp`)).body.toString();
    expect(x).toContain('Ridge at dusk v2');
    const before = fs.readFileSync(path.join(env.lib, 'Hills/blue.jpg'));
    const r = (await A.post('/api/metadata/export', {})).body;
    expect(r.written).toBe(4);
    expect(r.writtenBeside).toBe(0);
    expect(fs.existsSync(path.join(env.data, 'xmp'))).toBe(true);
    expect(fs.readFileSync(path.join(env.lib, 'Hills/blue.jpg')).equals(before)).toBe(true);
  });
  it('with write-back on, writes beside the original but skips a sidecar another program made', async () => {
    // A sidecar written by another program: no Frames marker.
    fs.writeFileSync(path.join(env.lib, 'Hills/blue.jpg.xmp'), '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF></x:xmpmeta>');
    await A.put('/api/settings', { xmpWriteBack: true });
    const r = (await A.post('/api/metadata/export', {})).body;
    expect(r.writtenBeside).toBe(3);
    expect(r.skipped).toHaveLength(1); // blue.jpg.xmp was written by test code, not by Frames
    expect(r.skipped[0].reason).toMatch(/another program/);
    expect(fs.existsSync(path.join(env.lib, 'Coast/red.jpg.xmp'))).toBe(true);
    await A.put('/api/settings', { xmpWriteBack: false });
  });
});

describe('uploads (internal storage)', () => {
  const multipart = (files: { name: string; data: Buffer }[]) => {
    const b = '----framesTest';
    const parts = files.flatMap((f) => [Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), f.data, Buffer.from('\r\n')]);
    return { payload: Buffer.concat([...parts, Buffer.from(`--${b}--\r\n`)]), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
  };
  it('saves photos into the internal library and imports them; rejects other files and path tricks', async () => {
    const m = multipart([
      { name: 'upload one.jpg', data: await jpg(svg(300, 200, '#8e44ad', '#d2b4de', [0.5, 0.5])) },
      { name: '../../escape.jpg', data: await jpg(svg(300, 200, '#000', '#fff', [0.1, 0.1])) },
      { name: 'notes.txt', data: Buffer.from('hello') },
    ]);
    const r = await env.app.inject({ method: 'POST', url: '/api/upload', payload: m.payload, headers: m.headers });
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.saved.sort()).toEqual(['escape.jpg', 'upload one.jpg']);
    expect(j.rejected.map((x: any) => x.file)).toEqual(['notes.txt']);
    expect(fs.existsSync(path.join(env.data, 'originals', 'escape.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(env.tmp, 'escape.jpg'))).toBe(false);
    const s = (await A.scan()).body;
    expect(s.imported).toBe(2);
  });
  it('still saves uploads on a filesystem that refuses hard links, and still never overwrites', async () => {
    const dir = path.join(env.data, 'originals');
    const a = await jpg(svg(300, 200, '#101010', '#202020', [0.2, 0.2]));
    const b = await jpg(svg(300, 200, '#e0e0e0', '#f0f0f0', [0.8, 0.8]));
    const send = (data: Buffer) => { const m = multipart([{ name: 'nolinks.jpg', data }]); return env.app.inject({ method: 'POST', url: '/api/upload', payload: m.payload, headers: m.headers }); };
    const spy = vi.spyOn(fs, 'linkSync').mockImplementation(() => { throw Object.assign(new Error('no links here'), { code: 'EPERM' }); });
    try {
      expect((await send(a)).json().saved).toEqual(['nolinks.jpg']);
      expect((await send(b)).json().saved).toEqual(['nolinks-1.jpg']);
    } finally { spy.mockRestore(); }
    expect(fs.readFileSync(path.join(dir, 'nolinks.jpg')).equals(a)).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'nolinks-1.jpg')).equals(b)).toBe(true);
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('.upload-'))).toEqual([]);
  });
  it('says why an upload failed when the data folder cannot be written', async () => {
    const m = multipart([{ name: 'denied.jpg', data: await jpg(svg(300, 200, '#333', '#444', [0.5, 0.5])) }]);
    const link = vi.spyOn(fs, 'linkSync').mockImplementation(() => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const r = (await env.app.inject({ method: 'POST', url: '/api/upload', payload: m.payload, headers: m.headers })).json();
      expect(r.saved).toEqual([]);
      expect(r.rejected[0].reason).toMatch(/cannot write to its data folder.*permissions/);
      expect(log.mock.calls.flat().join(' ')).toMatch(/denied\.jpg failed \(EACCES\)/);
    } finally { link.mockRestore(); log.mockRestore(); }
    expect(fs.existsSync(path.join(env.data, 'originals', 'denied.jpg'))).toBe(false);
  });
  it('never overwrites an original, even when two uploads of one name arrive at the same moment', async () => {
    const dir = path.join(env.data, 'originals');
    const a = await jpg(svg(300, 200, '#111', '#222', [0.2, 0.2]));
    const b = await jpg(svg(300, 200, '#eee', '#ddd', [0.8, 0.8]));
    const send = (data: Buffer) => { const m = multipart([{ name: 'clash.jpg', data }]); return env.app.inject({ method: 'POST', url: '/api/upload', payload: m.payload, headers: m.headers }); };
    const [r1, r2] = await Promise.all([send(a), send(b)]);
    const names = [...r1.json().saved, ...r2.json().saved].sort();
    expect(names).toEqual(['clash-1.jpg', 'clash.jpg']);
    const stored = names.map((n) => fs.readFileSync(path.join(dir, n)));
    expect(stored.some((x) => x.equals(a))).toBe(true);
    expect(stored.some((x) => x.equals(b))).toBe(true);
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('.upload-'))).toEqual([]);
  });
});

describe('backup, recovery and processing', () => {
  it('downloads a consistent database copy without the AI key', async () => {
    await A.post('/api/ai/sources', { type: 'openai', key: 'sk-secret' });
    const r = await A.get('/api/backup');
    expect(r.status).toBe(200);
    expect((r.body as Buffer).subarray(0, 15).toString()).toBe('SQLite format 3');
    expect((r.body as Buffer).includes(Buffer.from('sk-secret'))).toBe(false);
    expect(JSON.stringify((await A.get('/api/ai/sources')).body)).not.toContain('sk-secret');
    expect(JSON.stringify((await A.get('/api/settings')).body)).not.toContain('sk-secret');
  });
  it('rebuilds missing previews and analysis from the originals', async () => {
    const p = await photo('blue.jpg');
    fs.rmSync(path.join(env.data, 'derivatives', String(p.id)), { recursive: true });
    env.db.prepare('UPDATE photos SET has_derivs = 0, dhash = NULL WHERE id = ?').run(p.id);
    const r = (await A.raw('POST', '/api/library/rebuild?wait=1', {})).body;
    expect(r.result.rebuilt).toBe(1);
    expect((await A.get(`/api/photos/${p.id}/thumb`)).status).toBe(200);
    expect((await photo('blue.jpg')).hasImage).toBe(true);
  });
});

describe('collection specifications', () => {
  it('parses and cleans untrusted targets', () => {
    expect(parseTarget({ size: 'A3', orientation: 'portrait', ppi: 300, count: 3 })).toMatchObject({ size: 'A3', count: 3 });
    expect(parseTarget({ size: 'bogus', ppi: 9999, count: -4 })).toMatchObject({ size: 'A3', ppi: 1200, count: 1 });
    expect(parseTarget({ size: 'custom', widthMm: 500, heightMm: 300 })).toMatchObject({ widthMm: 300, heightMm: 500 });
    expect(parseTarget({ size: 'none', aspect: '2:3', aspectMode: 'required' })).toMatchObject({ aspect: '3:2', aspectMode: 'required' });
    expect(parseTarget({ size: 'none', aspect: 'junk' }).aspect).toBeUndefined();
  });
  it('checks minimum pixels, print size, orientation and aspect ratio, and says why', () => {
    const t = (o: object) => parseTarget({ size: 'none', orientation: 'any', ppi: 300, count: 1, ...o });
    expect(requiredPx(t({ size: 'A3' })!)).toEqual([3508, 4961]);
    expect(requiredPx(t({ size: 'custom', widthMm: 100, heightMm: 150 })!)).toEqual([1181, 1772]);
    expect(requiredPx(t({})!)).toBeNull();
    expect(checkTarget({ w: 3000, h: 2000 }, t({ minWidth: 4000, minHeight: 3000 })).problem).toBe('3000 × 2000 px. Needs at least 4000 × 3000 px.');
    expect(checkTarget({ w: 4000, h: 3000 }, t({ minWidth: 4000, minHeight: 3000 })).problem).toBeNull();
    expect(checkTarget({ w: 3000, h: 4000 }, t({ minWidth: 4000, minHeight: 3000 })).problem).toBeNull(); // either orientation
    expect(checkTarget({ w: 4000, h: 3000 }, t({ aspect: '3:2', aspectMode: 'required' })).problem).toMatch(/Aspect 1\.33:1\. Target is 3:2/);
    const soft = checkTarget({ w: 4000, h: 3000 }, t({ aspect: '3:2', aspectMode: 'preferred' }));
    expect(soft.problem).toBeNull();
    expect(soft.note).toMatch(/cropping/);
    expect(checkTarget({ w: 6000, h: 4000 }, t({ aspect: '3:2', aspectMode: 'required' })).problem).toBeNull();
    expect(checkTarget({ w: 100, h: 100 }, t({ size: 'A4' })).problem).toMatch(/A4 at 300 PPI needs 3508 × 2480/);
    expect(checkTarget({ w: 100, h: 100 }, null)).toEqual({ problem: null, note: null });
  });
  it('stores extended specs and a theme through the API', async () => {
    const c = (await A.post('/api/collections', { name: 'Specs', theme: 'Quiet light', target: { size: 'none', minWidth: 800, aspect: '3:2', aspectMode: 'required', count: 2 } })).body;
    expect(c.theme).toBe('Quiet light');
    expect(c.target).toMatchObject({ size: 'none', minWidth: 800, aspect: '3:2', aspectMode: 'required' });
    expect((await A.patch(`/api/collections/${c.id}`, { target: null })).body.target).toBeNull();
  });
});
