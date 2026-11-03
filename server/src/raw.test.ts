import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { developRaw, rawInfo, rawToJpeg, rawTools, resetRawTools } from './raw.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

const hasExiftool = (() => { try { execFileSync('exiftool', ['-ver'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const test = it.skipIf(!hasExiftool); // CI installs exiftool, so these run there; they only skip on a machine without it

/** A RAW-style file: TIFF header, then IFD0 (size and orientation), then IFD1 holding a JPEG preview, which is where cameras keep one. */
function fakeRaw(o: { w?: number; h?: number; orientation?: number; preview?: Buffer }): Buffer {
  const entries: [number, number, number][] = []; // tag, type (3 SHORT, 4 LONG), value
  if (o.w) entries.push([0x0100, 4, o.w], [0x0101, 4, o.h ?? o.w]);
  if (o.orientation) entries.push([0x0112, 3, o.orientation]);
  const ifd0Len = 2 + entries.length * 12 + 4;
  const ifd1At = 8 + ifd0Len;
  const ifd0 = Buffer.alloc(ifd0Len);
  ifd0.writeUInt16LE(entries.length, 0);
  entries.forEach(([tag, type, val], i) => { const at = 2 + i * 12; ifd0.writeUInt16LE(tag, at); ifd0.writeUInt16LE(type, at + 2); ifd0.writeUInt32LE(1, at + 4); type === 3 ? ifd0.writeUInt16LE(val, at + 8) : ifd0.writeUInt32LE(val, at + 8); });
  ifd0.writeUInt32LE(o.preview ? ifd1At : 0, ifd0Len - 4);
  const parts = [Buffer.from([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]), ifd0];
  if (o.preview) {
    const ifd1 = Buffer.alloc(30);
    ifd1.writeUInt16LE(2, 0);
    ifd1.writeUInt16LE(0x0201, 2); ifd1.writeUInt16LE(4, 4); ifd1.writeUInt32LE(1, 6); ifd1.writeUInt32LE(ifd1At + 30, 10);
    ifd1.writeUInt16LE(0x0202, 14); ifd1.writeUInt16LE(4, 16); ifd1.writeUInt32LE(1, 18); ifd1.writeUInt32LE(o.preview.length, 22);
    parts.push(ifd1, o.preview);
  } else parts.push(Buffer.alloc(64));
  return Buffer.concat(parts);
}

let tmp: string, env: Env, A: ReturnType<typeof api>;
beforeAll(() => { env = makeEnv(); A = api(env); tmp = env.tmp; });
afterAll(() => cleanup(env));
// Unit tests read files from a scratch folder that is not a library, so scans only import what a test means to import.
const write = (name: string, b: Buffer) => { const d = path.join(env.tmp, 'scratch'); fs.mkdirSync(d, { recursive: true }); const f = path.join(d, name); fs.writeFileSync(f, b); return f; };
const writeLib = (name: string, b: Buffer) => { const f = path.join(env.lib, name); fs.writeFileSync(f, b); return f; };

describe('reading a RAW file', () => {
  test('reports its real size and camera details from the header', async () => {
    const f = write('hdr.nef', fakeRaw({ w: 6000, h: 4000 }));
    const i = await rawInfo(f);
    expect(i).toMatchObject({ w: 6000, h: 4000, orientation: 1 });
  });
  test('swaps the size for a camera held upright, as the picture will be shown', async () => {
    const f = write('upright.nef', fakeRaw({ w: 6000, h: 4000, orientation: 6 }));
    expect(await rawInfo(f)).toMatchObject({ w: 4000, h: 6000, orientation: 6 });
  });
  test('makes a JPEG from the embedded preview', async () => {
    const f = write('prev.dng', fakeRaw({ w: 3000, h: 2000, preview: await jpg(svg(1800, 1200, '#c0392b', '#f5b041', [0.3, 0.3])) }));
    const r = await rawToJpeg(f);
    expect(r).toMatchObject({ source: 'embedded', w: 1800, h: 1200 });
    expect((await sharp(r!.jpeg).metadata()).format).toBe('jpeg');
  });
  test('turns the picture upright using the file’s orientation when the preview has no tag of its own', async () => {
    const f = write('rot.nef', fakeRaw({ w: 3000, h: 2000, orientation: 6, preview: await jpg(svg(1800, 1200, '#1b4f9c', '#5dade2', [0.7, 0.7])) }));
    const r = await rawToJpeg(f);
    expect([r!.w, r!.h]).toEqual([1200, 1800]); // landscape preview, camera held upright, so shown as portrait
  });
  test('gives up cleanly on a file with no picture in it', async () => {
    const f = write('empty.nef', fakeRaw({ w: 3000, h: 2000 }));
    expect(await rawToJpeg(f)).toBeNull();
  });
});

describe('when the embedded preview is small, the RAW is developed instead', () => {
  const fakeDir = () => path.join(tmp, 'fakebin');
  const withFakeDcraw = async <T>(tiff: Buffer, fn: () => Promise<T>) => {
    fs.mkdirSync(fakeDir(), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'developed.tiff'), tiff);
    fs.writeFileSync(path.join(fakeDir(), 'dcraw'), `#!/bin/sh\ncat "${path.join(tmp, 'developed.tiff')}"\n`, { mode: 0o755 });
    const old = process.env.PATH;
    process.env.PATH = `${fakeDir()}:${old}`; resetRawTools();
    try { return await fn(); } finally { process.env.PATH = old; resetRawTools(); }
  };
  // The stand-in dcraw writes a TIFF to stdout, as the real one does with -c -T.
  test('uses the developed picture when it is larger than the embedded one', async () => {
    const tiff = await sharp(svg(2400, 1600, '#145a32', '#58d68d', [0.5, 0.5])).tiff().toBuffer();
    const f = write('small.nef', fakeRaw({ w: 4800, h: 3200, preview: await jpg(svg(320, 240, '#c0392b', '#f5b041', [0.5, 0.5])) }));
    const r = await withFakeDcraw(tiff, () => rawToJpeg(f));
    expect(r).toMatchObject({ source: 'developed', w: 2400, h: 1600 });
    expect(await withFakeDcraw(tiff, () => developRaw(f))).not.toBeNull();
  });
  test('keeps a big embedded preview and does not bother developing', async () => {
    const tiff = await sharp(svg(5000, 3000, '#000', '#fff', [0.5, 0.5])).tiff().toBuffer(); // larger, but should not even be asked for
    const f = write('big.nef', fakeRaw({ w: 4800, h: 3200, preview: await jpg(svg(2000, 1333, '#c0392b', '#f5b041', [0.5, 0.5])) }));
    const r = await withFakeDcraw(tiff, () => rawToJpeg(f));
    expect(r).toMatchObject({ source: 'embedded', w: 2000 });
  });
});

describe('importing and uploading RAW files', () => {
  const multipart = (name: string, data: Buffer) => {
    const b = '----rawTest';
    return { payload: Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), data, Buffer.from(`\r\n--${b}--\r\n`)]), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
  };
  test('an uploaded RAW gets a JPEG thumbnail and preview, its real size, and its camera details', { timeout: 30_000 }, async () => {
    const raw = fakeRaw({ w: 6000, h: 4000, preview: await jpg(svg(2400, 1600, '#7e5109', '#f5cba7', [0.2, 0.8])) });
    const m = multipart('uploaded.cr2', raw);
    const up = await env.app.inject({ method: 'POST', url: '/api/upload', payload: m.payload, headers: m.headers });
    expect(up.json().saved).toEqual(['uploaded.cr2']);
    await A.scan();
    const p = ((await A.get('/api/photos')).body.photos as any[]).find((x) => x.file === 'uploaded.cr2');
    expect(p.hasImage).toBe(true);
    expect([p.w, p.h]).toEqual([6000, 4000]); // the real size, not the 2400 px preview's
    const thumb = (await A.get(`/api/photos/${p.id}/thumb`)).body as Buffer;
    const prev = (await A.get(`/api/photos/${p.id}/preview`)).body as Buffer;
    expect((await sharp(thumb).metadata())).toMatchObject({ format: 'jpeg', width: 480 });
    expect((await sharp(prev).metadata())).toMatchObject({ format: 'jpeg', width: 2400 });
    expect(p.palette.length).toBeGreaterThan(0);
    // The RAW itself is untouched.
    expect(((await A.get(`/api/photos/${p.id}/original`)).body as Buffer).equals(raw)).toBe(true);
  });
  test('a RAW with no picture in it is still imported, with a placeholder', { timeout: 30_000 }, async () => {
    writeLib('nopic.nef', fakeRaw({ w: 3000, h: 2000 }));
    await A.scan();
    const p = ((await A.get('/api/photos')).body.photos as any[]).find((x) => x.file === 'nopic.nef');
    expect(p).toBeDefined();
    expect(p.hasImage).toBe(false);
  });
});

describe('without the helper tools installed', () => {
  it('still works: a RAW falls back to the small thumbnail inside it', { timeout: 30_000 }, async () => {
    const old = process.env.PATH;
    process.env.PATH = '/nonexistent'; resetRawTools();
    try {
      expect(await rawTools()).toEqual({ exiftool: false, dcraw: false });
      const f = writeLib('legacy.dng', fakeRaw({ preview: await jpg(svg(320, 240, '#c0392b', '#f5b041', [0.5, 0.5])) }));
      expect(await rawInfo(f)).toBeNull();
      expect(await rawToJpeg(f)).toBeNull();
      await A.scan();
      const p = ((await A.get('/api/photos')).body.photos as any[]).find((x) => x.file === 'legacy.dng');
      expect(p.hasImage).toBe(true); // via the old route, so nothing regresses where the tools are missing
    } finally { process.env.PATH = old; resetRawTools(); }
  });
});
