import fs from 'node:fs';
import zlib from 'node:zlib';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import type { Ctx, Row } from './ctx.js';
import { derivPath } from './ingest.js';

/**
 * Instagram carousel slides made from photographs: each photograph fitted inside a border of one colour on a slide of a fixed shape,
 * or (split) a wide one laid across as many slides as it fills, so it scrolls as one picture. Made from the previews, which are already
 * upright and developed from RAW; the originals are only ever read by the import. Nothing is stored: the slides are made on request.
 */
export const RATIOS = { '4:5': 1350, '3:4': 1440, '1:1': 1080 } as const; // slide height at Instagram's 1080 px width
export const MAX_SLIDES = 20; // Instagram's carousel limit
const W = 1080;

export type CarouselOpts = { ids: number[]; ratio: keyof typeof RATIOS; border: number; colour: string; split: boolean };
export type Slide = { id: number; part: number; of: number };

/** The options from a query string, or a sentence saying what is wrong with them. */
export function parseOpts(q: Row): CarouselOpts | string {
  const ids = String(q.ids ?? '').split(',').filter(Boolean).map(Number);
  if (!ids.length || ids.length > MAX_SLIDES || !ids.every((n) => Number.isInteger(n) && n > 0)) return `Choose between 1 and ${MAX_SLIDES} photographs.`;
  const ratio = String(q.ratio ?? '4:5');
  if (!(ratio in RATIOS)) return 'The slide shape must be 4:5, 3:4 or 1:1.';
  const border = Number(q.border ?? 5);
  if (!Number.isFinite(border) || border < 0 || border > 25) return 'The border must be from 0 to 25 per cent.';
  const colour = String(q.colour ?? 'ffffff').replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(colour)) return 'The border colour must be six hex digits, like ffffff.';
  return { ids, ratio: ratio as CarouselOpts['ratio'], border, colour, split: q.split === 'true' || q.split === '1' };
}

/** How many slides a photograph of this shape takes: one, or when split, as many as its width fills (at most the carousel limit). */
export function partsFor(w: number, h: number, o: CarouselOpts) {
  if (!o.split || !w || !h) return 1;
  const H = RATIOS[o.ratio], m = Math.round((W * o.border) / 100);
  // The picture fills the height inside the border; the slides it spans are its width over one slide's.
  return Math.max(1, Math.min(MAX_SLIDES, Math.round(((H - 2 * m) * (w / h) + 2 * m) / W)));
}

/** Every slide in order, given each photograph's pixel size. Stops at the carousel limit. */
export function planSlides(sizes: Map<number, { w: number; h: number }>, o: CarouselOpts): Slide[] {
  const out: Slide[] = [];
  for (const id of o.ids) {
    const s = sizes.get(id);
    if (!s) continue;
    const of = partsFor(s.w, s.h, o);
    for (let part = 0; part < of && out.length < MAX_SLIDES; part++) out.push({ id, part, of });
  }
  return out;
}

/** One slide as a JPEG: the photograph fitted inside the border across `of` slides' width, and this slide's part of it. */
export async function renderSlide(file: string, s: Slide, o: CarouselOpts): Promise<Buffer> {
  const H = RATIOS[o.ratio], m = Math.round((W * o.border) / 100), bg = `#${o.colour}`;
  const pic = await sharp(file).resize({ width: W * s.of - 2 * m, height: H - 2 * m, fit: 'inside' }).toBuffer();
  const wide = sharp({ create: { width: W * s.of, height: H, channels: 3, background: bg } }).composite([{ input: pic, gravity: 'centre' }]);
  const flat = await wide.png().toBuffer(); // sharp crops after compositing only from a finished image
  return sharp(flat).extract({ left: W * s.part, top: 0, width: W, height: H }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

/** A zip of the files, stored without compression (they are JPEGs already). */
export function zipOf(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [], dir: Buffer[] = [];
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), crc = zlib.crc32(f.data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(f.data.length, 18); local.writeUInt32LE(f.data.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(f.data.length, 20); central.writeUInt32LE(f.data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    parts.push(local, name, f.data); dir.push(central, name);
    offset += 30 + name.length + f.data.length;
  }
  const size = dir.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...dir, end]);
}

export function registerCarousel(app: FastifyInstance, x: Ctx) {
  const { all, cfg } = x;
  /** The photographs that can be used (in this library, with a preview), with their preview sizes. */
  const load = async (o: CarouselOpts) => {
    const rows = all(`SELECT id FROM photos WHERE missing = 0 AND id IN (${o.ids.map(() => '?').join(',')})`, ...o.ids);
    const sizes = new Map<number, { w: number; h: number; file: string }>();
    for (const r of rows) {
      const file = derivPath(cfg, r.id as number, 'preview');
      if (!fs.existsSync(file)) continue;
      const meta = await sharp(file).metadata();
      if (meta.width && meta.height) sizes.set(r.id as number, { w: meta.width, h: meta.height, file });
    }
    return { sizes, slides: planSlides(sizes, o) };
  };
  const opts = (q: unknown) => parseOpts((q ?? {}) as Row);

  app.get('/api/carousel', async (req, rep) => {
    const o = opts(req.query);
    if (typeof o === 'string') return rep.code(400).send({ error: o });
    const { slides } = await load(o);
    return { slides, width: W, height: RATIOS[o.ratio] };
  });
  app.get('/api/carousel/slide/:n', async (req, rep) => {
    const o = opts(req.query);
    if (typeof o === 'string') return rep.code(400).send({ error: o });
    const n = Number((req.params as Row).n);
    const { sizes, slides } = await load(o);
    const s = Number.isInteger(n) ? slides[n] : undefined;
    if (!s) return rep.code(404).send({ error: 'There is no such slide.' });
    return rep.type('image/jpeg').header('Cache-Control', 'private, no-store').send(await renderSlide(sizes.get(s.id)!.file, s, o));
  });
  app.get('/api/carousel/download', async (req, rep) => {
    const o = opts(req.query);
    if (typeof o === 'string') return rep.code(400).send({ error: o });
    const { sizes, slides } = await load(o);
    if (!slides.length) return rep.code(404).send({ error: 'None of these photographs has a preview yet.' });
    const files = [];
    for (const [i, s] of slides.entries()) files.push({ name: `slide-${String(i + 1).padStart(2, '0')}.jpg`, data: await renderSlide(sizes.get(s.id)!.file, s, o) });
    return rep.type('application/zip').header('Content-Disposition', 'attachment; filename="carousel.zip"').header('Cache-Control', 'no-store').send(zipOf(files));
  });
}
