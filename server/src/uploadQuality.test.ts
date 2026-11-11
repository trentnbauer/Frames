import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

/** Uploading when original quality is not stored: the file is kept as a smaller copy, because no cloud account holds the original. */
let env: Env, A: ReturnType<typeof api>, big: Buffer, png: Buffer;
beforeAll(async () => {
  env = makeEnv(); A = api(env);
  const noise = { create: { width: 2400, height: 1600, channels: 3 as const, noise: { type: 'gaussian' as const, mean: 128, sigma: 60 } } };
  big = await sharp(noise).jpeg({ quality: 98 }).toBuffer();
  png = await sharp(noise).png().toBuffer();
});
afterAll(() => cleanup(env));

const send = (name: string, data: Buffer) => {
  const boundary = '----frames-test';
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/jpeg\r\n\r\n`);
  return env.app.inject({ method: 'POST', url: '/api/upload', payload: Buffer.concat([head, data, Buffer.from(`\r\n--${boundary}--\r\n`)]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
};
const stored = (name: string) => path.join(env.data, 'originals', name);

it('keeps an upload as a smaller copy by default, and tells the page so it can warn', async () => {
  expect((await A.get('/api/me')).body.storeOriginalQuality).toBe(false);
  const r = (await send('shrunk.jpg', big)).json();
  expect(r).toMatchObject({ saved: ['shrunk.jpg'], shrunk: 1 });
  expect(fs.statSync(stored('shrunk.jpg')).size).toBeLessThan(big.length * 0.9);
  const m = await sharp(stored('shrunk.jpg')).metadata();
  expect([m.width, m.height]).toEqual([2400, 1600]); // the same pixels
});

it('an upload keeps every pixel: it is the only copy, and print sizes depend on them', { timeout: 60_000 }, async () => {
  const wide = await sharp({ create: { width: 4300, height: 1000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } } }).jpeg({ quality: 98 }).toBuffer();
  expect((await send('wide.jpg', wide)).json()).toMatchObject({ saved: ['wide.jpg'], shrunk: 1 });
  const m = await sharp(stored('wide.jpg')).metadata();
  expect([m.width, m.height]).toEqual([4300, 1000]); // not held to 4096 as a cloud copy is
  await A.scan();
  expect((await A.get('/api/photos')).body.photos.find((p: any) => p.file === 'wide.jpg')).toMatchObject({ w: 4300, h: 1000 });
});

it('a PNG becomes a JPEG, and never replaces a photograph that already has that name', { timeout: 60_000 }, async () => {
  fs.writeFileSync(stored('same.jpg'), 'an earlier photograph');
  const r = (await send('same.png', png)).json();
  expect(r.shrunk).toBe(0); // left as it was rather than written over same.jpg
  expect(fs.readFileSync(stored('same.jpg'), 'utf8')).toBe('an earlier photograph');
  expect(fs.existsSync(stored('same.png'))).toBe(true);
  const r2 = (await send('fresh.png', png)).json();
  expect(r2).toMatchObject({ saved: ['fresh.jpg'], shrunk: 1 });
  expect(fs.existsSync(stored('fresh.png'))).toBe(false);
});

it('with original quality stored, the file is kept byte for byte', async () => {
  await A.put('/api/admin/instance', { storeOriginalQuality: true });
  expect((await A.get('/api/me')).body.storeOriginalQuality).toBe(true);
  const r = (await send('whole.jpg', big)).json();
  expect(r).toMatchObject({ saved: ['whole.jpg'], shrunk: 0 });
  expect(fs.readFileSync(stored('whole.jpg')).equals(big)).toBe(true);
});

it('Resize to (Local storage) holds an upload to that size, and the photograph still counts as its original size', { timeout: 60_000 }, async () => {
  await A.put('/api/admin/instance', { localOrig: false, localPx: 2048, localQ: 70 });
  const wide = await sharp({ create: { width: 4300, height: 1000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } } }).jpeg({ quality: 98 }).toBuffer();
  expect((await send('resized.jpg', wide)).json()).toMatchObject({ saved: ['resized.jpg'], shrunk: 1 });
  expect((await sharp(stored('resized.jpg')).metadata()).width).toBe(2048);
  await A.scan();
  for (let k = 0; k < 200 && !(await (async () => { const p = (await A.get('/api/photos')).body.photos.find((q: any) => q.file === 'resized.jpg'); return p && env.db.prepare("SELECT has_derivs d FROM photos WHERE file = 'resized.jpg'").get()?.d === 1; })()); k++) await new Promise((ok) => setTimeout(ok, 100));
  expect((await A.get('/api/photos')).body.photos.find((p: any) => p.file === 'resized.jpg')).toMatchObject({ w: 4300, h: 1000 }); // print sizes use the original
});
