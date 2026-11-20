import fs from 'node:fs';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { parseOpts, partsFor, zipOf } from './carousel.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

let env: Env, a: ReturnType<typeof api>, square: number, pano: number;
beforeEach(async () => {
  env = makeEnv(); a = api(env);
  fs.writeFileSync(env.lib + '/a-square.jpg', await jpg(svg(600, 600, '#203040', '#405060', [0.5, 0.5])));
  fs.writeFileSync(env.lib + '/b-pano.jpg', await jpg(svg(1500, 500, '#102030', '#a0b0c0', [0.2, 0.5])));
  await a.scan();
  const photos = (await a.get('/api/photos')).body.photos as { id: number; file: string }[];
  square = photos.find((p) => p.file === 'a-square.jpg')!.id; pano = photos.find((p) => p.file === 'b-pano.jpg')!.id;
});
afterEach(async () => { await env.app.close(); cleanup(env); });

it('refuses options it cannot use', () => {
  expect(parseOpts({})).toMatch(/photographs/);
  expect(parseOpts({ ids: '1', ratio: '16:9' })).toMatch(/shape/);
  expect(parseOpts({ ids: '1', border: '40' })).toMatch(/border/);
  expect(parseOpts({ ids: '1', colour: 'red' })).toMatch(/colour/);
  expect(parseOpts({ ids: Array.from({ length: 21 }, (_, i) => i + 1).join(',') })).toMatch(/20/);
  expect(parseOpts({ ids: '3,4', colour: '#FFEEDD', split: 'true' })).toEqual({ ids: [3, 4], ratio: '4:5', border: 5, colour: 'ffeedd', split: true });
});

it('splits a wide photograph across as many slides as it fills', () => {
  const o = { ids: [1], ratio: '4:5' as const, border: 0, colour: 'ffffff', split: true };
  expect(partsFor(3, 1, o)).toBe(4); // 1350 * 3 = 4050 px wide, about four 1080 slides
  expect(partsFor(1, 1, o)).toBe(1);
  expect(partsFor(3, 1, { ...o, split: false })).toBe(1);
});

it('makes bordered slides in the chosen order and a zip of them', async () => {
  const q = `ids=${pano},${square}&ratio=4:5&border=10&colour=ff0000&split=true`;
  const plan = (await a.get(`/api/carousel?${q}`)).body;
  expect(plan.slides.map((s: { id: number }) => s.id)).toEqual([pano, pano, pano, square]);
  const slide = await a.get(`/api/carousel/slide/3?${q}`);
  expect(slide.headers['content-type']).toBe('image/jpeg');
  const img = sharp(slide.body as Buffer);
  expect(await img.metadata()).toMatchObject({ width: 1080, height: 1350 });
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  expect([data[0], data[1], data[2]].map((v) => Math.round(v / 32))).toEqual([8, 0, 0]); // the corner is the red border
  expect((await a.get(`/api/carousel/slide/4?${q}`)).status).toBe(404);
  const zip = await a.get(`/api/carousel/download?${q}`);
  expect(zip.headers['content-type']).toBe('application/zip');
  expect((zip.body as Buffer).toString('latin1').match(/slide-0\d\.jpg/g)).toHaveLength(8); // four names, each in the entry and the directory
  expect((await a.get('/api/carousel?ids=999999')).body.slides).toEqual([]);
});

it('writes a zip that unzip can read', () => {
  const zip = zipOf([{ name: 'one.txt', data: Buffer.from('hello') }]);
  expect(zip.readUInt32LE(0)).toBe(0x04034b50);
  expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  expect(zip.subarray(30 + 7, 30 + 7 + 5).toString()).toBe('hello');
});
