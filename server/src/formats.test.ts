import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>;

/** A RAW-style file: a TIFF container with a JPEG preview in its second directory, where cameras keep it. */
function fakeRaw(preview?: Buffer): Buffer {
  const header = Buffer.from([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]);
  const ifd0 = Buffer.alloc(6);
  ifd0.writeUInt16LE(0, 0); ifd0.writeUInt32LE(preview ? 14 : 0, 2);
  if (!preview) return Buffer.concat([header, ifd0, Buffer.alloc(64)]);
  const ifd1 = Buffer.alloc(30);
  ifd1.writeUInt16LE(2, 0);
  ifd1.writeUInt16LE(0x0201, 2); ifd1.writeUInt16LE(4, 4); ifd1.writeUInt32LE(1, 6); ifd1.writeUInt32LE(44, 10);
  ifd1.writeUInt16LE(0x0202, 14); ifd1.writeUInt16LE(4, 16); ifd1.writeUInt32LE(1, 18); ifd1.writeUInt32LE(preview.length, 22);
  return Buffer.concat([header, ifd0, ifd1, preview]);
}

/** A JPEG carrying IPTC fields (title, keywords, caption, city) in the segment photo agencies use. */
function withIptc(jpeg: Buffer, f: { title: string; keywords: string[]; caption: string; city: string }): Buffer {
  const rec = (tag: number, s: string) => { const b = Buffer.from(s); const h = Buffer.from([0x1c, 0x02, tag, b.length >> 8, b.length & 255]); return Buffer.concat([h, b]); };
  let data = Buffer.concat([rec(0x05, f.title), ...f.keywords.map((k) => rec(0x19, k)), rec(0x78, f.caption), rec(0x5a, f.city)]);
  if (data.length % 2) data = Buffer.concat([data, Buffer.from([0])]);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const res = Buffer.concat([Buffer.from('8BIM'), Buffer.from([0x04, 0x04]), Buffer.from([0, 0]), size, data]);
  const body = Buffer.concat([Buffer.from('Photoshop 3.0\0'), res]);
  const seg = Buffer.concat([Buffer.from([0xff, 0xed, (body.length + 2) >> 8, (body.length + 2) & 255]), body]);
  return Buffer.concat([jpeg.subarray(0, 2), seg, jpeg.subarray(2)]);
}

const files: Record<string, Buffer> = {};
beforeAll(async () => {
  env = makeEnv();
  A = api(env);
  const base = svg(900, 600, '#1b4f9c', '#5dade2', [0.3, 0.4]);
  const thumb = await jpg(svg(320, 240, '#c0392b', '#f5b041', [0.5, 0.5]));
  files['plain.png'] = await sharp(base).png().toBuffer();
  files['scan.tiff'] = await sharp(svg(800, 800, '#145a32', '#58d68d', [0.5, 0.2], true)).tiff().toBuffer();
  files['camera.dng'] = fakeRaw(thumb);
  files['nopreview.nef'] = fakeRaw();
  files['agency.jpg'] = withIptc(await jpg(svg(700, 500, '#7e5109', '#f5cba7', [0.2, 0.8])), { title: 'Heron at dawn', keywords: ['wetland', 'birds'], caption: 'A heron wading', city: 'Broome' });
  for (const [n, b] of Object.entries(files)) fs.writeFileSync(path.join(env.lib, n), b);
  await A.scan();
});
afterAll(() => cleanup(env));

const photo = async (file: string) => ((await A.get('/api/photos')).body.photos as any[]).find((p) => p.file === file);

describe('file types', () => {
  it('imports PNG and TIFF with previews, sizes and colour analysis', async () => {
    for (const [f, w, h] of [['plain.png', 900, 600], ['scan.tiff', 800, 800]] as const) {
      const p = await photo(f);
      expect(p, f).toBeDefined();
      expect([p.w, p.h], f).toEqual([w, h]);
      expect(p.hasImage).toBe(true);
      expect(p.palette.length).toBeGreaterThan(0);
      expect((await A.get(`/api/photos/${p.id}/thumb`)).headers['content-type']).toBe('image/jpeg');
    }
  });
  it('uses the embedded JPEG preview of a RAW-style file', async () => {
    const p = await photo('camera.dng');
    expect(p.fileType).toBe('DNG');
    expect(p.hasImage).toBe(true);
    expect(p.palette[0].name).toMatch(/red|orange/); // the colours of the embedded preview, not a guess
    const t = await sharp((await A.get(`/api/photos/${p.id}/thumb`)).body as Buffer).metadata();
    expect(t.format).toBe('jpeg');
  });
  it('still imports a RAW file with no embedded preview: it shows a placeholder instead of failing', async () => {
    const p = await photo('nopreview.nef');
    expect(p).toBeDefined();
    expect(p.hasImage).toBe(false);
    expect((await A.get(`/api/photos/${p.id}/thumb`)).status).toBe(404);
    expect((await A.get('/api/photos')).body.photos).toHaveLength(5);
  });
  it('hands back every type unchanged, byte for byte', async () => {
    for (const [name, bytes] of Object.entries(files)) {
      const p = await photo(name);
      const r = await A.get(`/api/photos/${p.id}/original?n=1`);
      expect(r.status, name).toBe(200);
      expect((r.body as Buffer).equals(bytes), name).toBe(true);
    }
  });
});

describe('IPTC', () => {
  it('reads title, keywords, caption and place from inside the file', async () => {
    const p = await photo('agency.jpg');
    const full = (await A.get(`/api/photos/${p.id}`)).body;
    expect(full.title).toBe('Heron at dawn');
    expect(full.description).toBe('A heron wading');
    expect(full.descSource).toBe('iptc');
    expect(full.place).toBe('Broome');
    expect(full.tags.map((t: any) => t.name)).toEqual(expect.arrayContaining(['wetland', 'birds']));
  });
});

describe('searching by composition and light', () => {
  const ids = async (qs: string) => ((await A.get(`/api/photos?${qs}`)).body.photos as any[]).map((p) => p.file).sort();
  it('finds photos by shape', async () => {
    expect(await ids('shape=square')).toEqual(['scan.tiff']);
    expect(await ids('shape=landscape')).toEqual(expect.arrayContaining(['plain.png', 'agency.jpg']));
    expect(await ids('shape=portrait')).toEqual([]);
  });
  it('finds photos by brightness and contrast', async () => {
    const all = (await A.get('/api/photos')).body.photos as any[];
    const dark = all.filter((p) => p.brightness !== null && p.brightness < 0.35).map((p) => p.file).sort();
    const bright = all.filter((p) => p.brightness > 0.65).map((p) => p.file).sort();
    expect(await ids('light=dark')).toEqual(dark);
    expect(await ids('light=bright')).toEqual(bright);
    expect((await ids('light=dark')).length + (await ids('light=mid')).length + (await ids('light=bright')).length).toBeGreaterThanOrEqual(4);
    expect((await ids('contrast=low')).length + (await ids('contrast=medium')).length + (await ids('contrast=high')).length).toBeGreaterThanOrEqual(4);
  });
  it('searches the AI’s notes on composition and light once analysed', async () => {
    const p = await photo('plain.png');
    env.db.prepare("UPDATE photos SET ai_status = 'done', ai_json = ? WHERE id = ?").run(JSON.stringify({ description: 'x', composition: 'Strong leading lines', lighting: 'Golden hour' }), p.id);
    expect(await ids('q=leading%20lines')).toEqual(['plain.png']);
    expect(await ids('q=golden')).toEqual(['plain.png']);
  });
});
