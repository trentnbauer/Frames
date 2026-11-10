import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dHash, hamming } from './analysis.js';
import { verifyDerivatives } from './derivCheck.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

/** A photograph's number must never show another photograph's picture, however the files and the database came to disagree. */
let env: Env, A: ReturnType<typeof api>;
let a: any, b: any;
const dp = (id: number, kind: 'thumb' | 'preview') => path.join(env.data, 'derivatives', String(id), `${kind}.jpg`);
const row = (id: number) => env.db.prepare('SELECT has_derivs, dhash FROM photos WHERE id = ?').get(id) as { has_derivs: number; dhash: string | null };

beforeAll(async () => {
  env = makeEnv();
  A = api(env);
  fs.writeFileSync(path.join(env.lib, 'red.jpg'), await jpg(svg(900, 600, '#c0392b', '#f1c40f', [0.25, 0.3])));
  fs.writeFileSync(path.join(env.lib, 'blue.jpg'), await jpg(svg(900, 600, '#1b4f9c', '#101820', [0.8, 0.7])));
  await A.scan();
  const photos = ((await A.get('/api/photos')).body as any).photos as any[];
  a = photos.find((p) => p.file === 'red.jpg'); b = photos.find((p) => p.file === 'blue.jpg');
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('how images are sent', () => {
  it('are never kept without asking: each has a tag, and the tag is checked every time', async () => {
    const r = await A.raw('GET', `/api/photos/${a.id}/thumb`);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-cache');
    const tag = String(r.headers.etag);
    expect(tag).toMatch(/^"[0-9a-f]{16}-thumb-\d+-\d+"$/);
    expect((await A.raw('GET', `/api/photos/${a.id}/thumb`, undefined, { 'if-none-match': tag })).status).toBe(304); // still this one
    expect((await A.raw('GET', `/api/photos/${a.id}/thumb`, undefined, { 'if-none-match': '"something-else"' })).status).toBe(200);
    expect(String((await A.raw('GET', `/api/photos/${b.id}/thumb`)).headers.etag)).not.toBe(tag); // another photograph, another tag
  });
  it('a different photograph under the same number has a different tag, so an image kept from before is not reused', async () => {
    const tag = String((await A.raw('GET', `/api/photos/${a.id}/preview`)).headers.etag);
    env.db.prepare("UPDATE photos SET hash = 'ffffffffffffffffffffffffffffffff' WHERE id = ?").run(a.id); // as if the number now meant another file
    expect((await A.raw('GET', `/api/photos/${a.id}/preview`, undefined, { 'if-none-match': tag })).status).toBe(200);
    expect(String((await A.raw('GET', `/api/photos/${a.id}/preview`)).headers.etag)).not.toBe(tag);
  });
  it('are never sent for a number that has no photograph', async () => {
    fs.mkdirSync(path.join(env.data, 'derivatives', '9999'), { recursive: true });
    fs.copyFileSync(dp(b.id, 'thumb'), path.join(env.data, 'derivatives', '9999', 'thumb.jpg'));
    expect((await A.raw('GET', '/api/photos/9999/thumb')).status).toBe(404);
  });
});

describe('checking the files against the database', () => {
  it('leaves correct previews alone', async () => {
    const r = await verifyDerivatives(env.db, { libraries: [], dataDir: env.data });
    expect(r).toMatchObject({ wrong: 0, rebuilt: 0 });
    expect(r.checked).toBeGreaterThanOrEqual(2);
  });
  it('finds previews that belong to another photograph, and makes them again from the originals', async () => {
    const hashA = row(a.id).dhash!, hashB = row(b.id).dhash!;
    expect(hamming(hashA, hashB)).toBeGreaterThan(10); // the two pictures really differ
    // the files of the two photographs end up under each other's number
    const tmp = path.join(env.data, 'swap.jpg');
    for (const kind of ['thumb', 'preview'] as const) { fs.copyFileSync(dp(a.id, kind), tmp); fs.copyFileSync(dp(b.id, kind), dp(a.id, kind)); fs.copyFileSync(tmp, dp(b.id, kind)); }
    expect(hamming(await dHash(dp(a.id, 'thumb')), hashA)).toBeGreaterThan(10); // a wrong picture is being served for it now
    const r = await verifyDerivatives(env.db, { libraries: [], dataDir: env.data });
    expect(r).toMatchObject({ wrong: 2, rebuilt: 2 });
    for (const [p, h] of [[a, hashA], [b, hashB]] as const) {
      expect(row(p.id).has_derivs).toBe(1);
      expect(hamming(await dHash(dp(p.id, 'thumb')), h)).toBeLessThanOrEqual(2); // its own picture again
    }
  });
  it('treats a missing thumbnail or an unreadable file as wrong, but a missing preview alone is not (the cache limit removes those)', async () => {
    fs.rmSync(dp(a.id, 'thumb'));
    fs.writeFileSync(dp(b.id, 'thumb'), 'not an image');
    const r = await verifyDerivatives(env.db, { libraries: [], dataDir: env.data });
    expect(r).toMatchObject({ wrong: 2, rebuilt: 2 });
    expect(fs.existsSync(dp(a.id, 'thumb'))).toBe(true);
    expect(hamming(await dHash(dp(b.id, 'thumb')), row(b.id).dhash!)).toBeLessThanOrEqual(2);
    fs.rmSync(dp(a.id, 'preview'));
    expect(await verifyDerivatives(env.db, { libraries: [], dataDir: env.data })).toMatchObject({ wrong: 0 });
  });
});
