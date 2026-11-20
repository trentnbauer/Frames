import fs from 'node:fs';
import sharp, { type OverlayOptions } from 'sharp';
import type { FastifyInstance } from 'fastify';
import type { Ctx, Row } from './ctx.js';
import { derivPath } from './ingest.js';

/**
 * Zines: a booklet laid out page by page. A page holds one photograph, two photographs, or nothing; a spread is one photograph
 * across two facing pages, edge to edge. Page 1 is the cover, on its own on the right, so facing pages are 2–3, 4–5 and so on: a
 * spread that would start on a right-hand page gets a blank page before it, and the booklet is filled out with blank pages to a
 * multiple of four (a folded sheet holds four pages). The PDF is made from the previews, at 300 dpi; originals are only read.
 */
export const LAYOUTS = { one: 1, two: 2, spread: 1, blank: 0 } as const;
export type Layout = keyof typeof LAYOUTS;
export type ZinePage = { layout: Layout; photos: (number | null)[] };
/** Page sizes in millimetres. */
export const SIZES = { a5: [148, 210], a6: [105, 148], square: [200, 200] } as const;
export type PageSize = keyof typeof SIZES;
export const MAX_PAGES = 100; // entries a person lays out; with spreads and padding, at most about 200 printed pages
const DPI = 300;

/** One printed page: what is on it, and whether Frames added it (a blank before a spread, or padding at the end). */
export type Printed = { layout: Layout | 'left' | 'right'; photos: (number | null)[]; entry: number | null };

/** The printed pages, in order, for the pages a person laid out. */
export function printedPages(pages: ZinePage[]): Printed[] {
  const out: Printed[] = [];
  pages.forEach((p, entry) => {
    if (p.layout === 'spread') {
      if (out.length % 2 === 0) out.push({ layout: 'blank', photos: [], entry: null }); // the next page would be a right-hand one
      out.push({ layout: 'left', photos: p.photos, entry }, { layout: 'right', photos: p.photos, entry });
    } else out.push({ layout: p.layout, photos: p.photos, entry });
  });
  while (out.length % 4) out.push({ layout: 'blank', photos: [], entry: null });
  return out;
}

/** The pages from a request body, or a sentence saying what is wrong with them. */
export function parsePages(v: unknown): ZinePage[] | string {
  if (!Array.isArray(v) || v.length > MAX_PAGES) return `A zine holds up to ${MAX_PAGES} pages.`;
  const out: ZinePage[] = [];
  for (const p of v) {
    const layout = (p as Row)?.layout, photos = (p as Row)?.photos;
    if (typeof layout !== 'string' || !(layout in LAYOUTS)) return 'Each page needs a layout: one, two, spread or blank.';
    const n = LAYOUTS[layout as Layout];
    if (!Array.isArray(photos) || photos.length > 2 || !photos.every((id) => id === null || (Number.isInteger(id) && id > 0))) return 'Each page lists its photographs by number.';
    out.push({ layout: layout as Layout, photos: Array.from({ length: n }, (_, i) => (photos[i] as number | null | undefined) ?? null) });
  }
  return out;
}

const px = (mm: number) => Math.round((mm / 25.4) * DPI);

/** One printed page as a JPEG, on white paper. `file` gives a photograph's preview, or null when it has none. */
export async function renderPage(p: Printed, size: PageSize, marginPct: number, file: (id: number | null) => string | null): Promise<Buffer> {
  const W = px(SIZES[size][0]), H = px(SIZES[size][1]), m = Math.round((W * marginPct) / 100);
  const layers: OverlayOptions[] = [];
  const fit = async (id: number | null, w: number, h: number, left: number, top: number) => {
    const f = file(id);
    if (!f || w < 1 || h < 1) return;
    const img = await sharp(f).resize({ width: w, height: h, fit: 'inside' }).toBuffer({ resolveWithObject: true });
    layers.push({ input: img.data, left: left + Math.round((w - img.info.width) / 2), top: top + Math.round((h - img.info.height) / 2) });
  };
  if (p.layout === 'left' || p.layout === 'right') {
    // The spread is made once at two pages' width, edge to edge, and this page is its half, so the halves meet at the fold.
    const f = file(p.photos[0]);
    const page = sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } });
    if (!f) return page.jpeg({ quality: 88 }).toBuffer();
    const wide = await sharp(f).resize({ width: W * 2, height: H, fit: 'cover' }).toBuffer();
    return sharp(wide).extract({ left: p.layout === 'left' ? 0 : W, top: 0, width: W, height: H }).removeAlpha().jpeg({ quality: 88 }).toBuffer();
  }
  if (p.layout === 'one') await fit(p.photos[0], W - 2 * m, H - 2 * m, m, m);
  if (p.layout === 'two') {
    // Stacked on a tall page, side by side on a square or wide one.
    const tall = H > W;
    const cw = tall ? W - 2 * m : Math.floor((W - 3 * m) / 2), ch = tall ? Math.floor((H - 3 * m) / 2) : H - 2 * m;
    await fit(p.photos[0], cw, ch, m, m);
    await fit(p.photos[1], cw, ch, tall ? m : 2 * m + cw, tall ? 2 * m + ch : m);
  }
  return sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite(layers).jpeg({ quality: 88 }).toBuffer();
}

/** A PDF with one full-page JPEG on each page. */
export function pdfOf(jpegs: { data: Buffer; w: number; h: number }[], ptW: number, ptH: number): Buffer {
  const chunks: Buffer[] = [], offsets: number[] = [];
  let length = 0;
  const put = (b: Buffer | string) => { const buf = typeof b === 'string' ? Buffer.from(b, 'latin1') : b; chunks.push(buf); length += buf.length; };
  const obj = (n: number, body: (Buffer | string)[]) => { offsets[n] = length; put(`${n} 0 obj\n`); body.forEach(put); put('\nendobj\n'); };
  put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  const n = jpegs.length, pageObj = (i: number) => 3 + i * 3;
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Count ${n} /Kids [${jpegs.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`]);
  const W = ptW.toFixed(2), H = ptH.toFixed(2);
  jpegs.forEach((j, i) => {
    const p = pageObj(i), img = p + 1, content = p + 2, draw = `q ${W} 0 0 ${H} 0 0 cm /Im Do Q`;
    obj(p, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im ${img} 0 R >> >> /Contents ${content} 0 R >>`]);
    obj(img, [`<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.data.length} >>\nstream\n`, j.data, '\nendstream']);
    obj(content, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
  });
  const xref = length, count = 3 + n * 3;
  put(`xref\n0 ${count}\n0000000000 65535 f \n${Array.from({ length: count - 1 }, (_, i) => `${String(offsets[i + 1]).padStart(10, '0')} 00000 n \n`).join('')}`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

type ZineRow = { id: number; name: string; page_size: PageSize; margin: number; pages: string; created_at: string; updated_at: string };
const readPages = (s: string): ZinePage[] => { try { const p = parsePages(JSON.parse(s)); return typeof p === 'string' ? [] : p; } catch { return []; } };
const dto = (z: ZineRow) => { const pages = readPages(z.pages); return { id: z.id, name: z.name, pageSize: z.page_size, margin: z.margin, pages, printedCount: printedPages(pages).length, coverId: pages.flatMap((p) => p.photos).find((id) => id != null) ?? null, createdAt: z.created_at, updatedAt: z.updated_at }; };

export function registerZines(app: FastifyInstance, x: Ctx) {
  const { db, cfg, num, notFound } = x;
  const get = (id: unknown) => db.prepare('SELECT * FROM zines WHERE id = ?').get(num(id)) as ZineRow | undefined;
  const name = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);

  app.get('/api/zines', async () => (db.prepare('SELECT * FROM zines ORDER BY updated_at DESC, id DESC').all() as ZineRow[]).map(dto));
  app.post('/api/zines', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const ids = Array.isArray(b.photoIds) ? b.photoIds.filter((id): id is number => Number.isInteger(id) && id > 0).slice(0, MAX_PAGES) : [];
    // Started from a selection: one photograph a page, in the order they were picked.
    const pages: ZinePage[] = ids.map((id) => ({ layout: 'one', photos: [id] }));
    const now = new Date().toISOString();
    const id = Number(db.prepare('INSERT INTO zines(name, pages, created_at, updated_at) VALUES(?, ?, ?, ?)').run(name(b.name) ?? 'Untitled zine', JSON.stringify(pages), now, now).lastInsertRowid);
    return rep.code(201).send(dto(get(id)!));
  });
  app.get('/api/zines/:id', async (req, rep) => { const z = get((req.params as Row).id); return z ? dto(z) : notFound(rep); });
  app.put('/api/zines/:id', async (req, rep) => {
    const z = get((req.params as Row).id);
    if (!z) return notFound(rep);
    const b = (req.body ?? {}) as Row, set: Partial<ZineRow> = {};
    if (b.name !== undefined) { const n = name(b.name); if (!n) return rep.code(400).send({ error: 'Give the zine a name.' }); set.name = n; }
    if (b.pageSize !== undefined) { if (typeof b.pageSize !== 'string' || !(b.pageSize in SIZES)) return rep.code(400).send({ error: 'The page size must be a5, a6 or square.' }); set.page_size = b.pageSize as PageSize; }
    if (b.margin !== undefined) { if (typeof b.margin !== 'number' || !Number.isFinite(b.margin) || b.margin < 0 || b.margin > 20) return rep.code(400).send({ error: 'The margin must be from 0 to 20 per cent.' }); set.margin = b.margin; }
    if (b.pages !== undefined) { const p = parsePages(b.pages); if (typeof p === 'string') return rep.code(400).send({ error: p }); set.pages = JSON.stringify(p); }
    const next = { ...z, ...set, updated_at: new Date().toISOString() };
    db.prepare('UPDATE zines SET name = ?, page_size = ?, margin = ?, pages = ?, updated_at = ? WHERE id = ?').run(next.name, next.page_size, next.margin, next.pages, next.updated_at, z.id);
    return dto(next);
  });
  app.delete('/api/zines/:id', async (req, rep) => {
    if (!db.prepare('DELETE FROM zines WHERE id = ?').run(num((req.params as Row).id)).changes) return notFound(rep);
    return { ok: true };
  });
  app.get('/api/zines/:id/pdf', async (req, rep) => {
    const z = get((req.params as Row).id);
    if (!z) return notFound(rep);
    const printed = printedPages(readPages(z.pages));
    const live = new Set((db.prepare('SELECT id FROM photos WHERE missing = 0').all() as { id: number }[]).map((r) => r.id));
    const file = (id: number | null) => { if (id == null || !live.has(id)) return null; const f = derivPath(cfg, id, 'preview'); return fs.existsSync(f) ? f : null; };
    const [mmW, mmH] = SIZES[z.page_size] ?? SIZES.a5;
    // shortcut: the whole PDF is built in memory (about 1 MB a page at 300 dpi); stream it page by page if zines grow past ~200 pages.
    const jpegs = [];
    for (const p of printed) jpegs.push({ data: await renderPage(p, z.page_size, z.margin, file), w: px(mmW), h: px(mmH) });
    const safe = z.name.replace(/[^\w .-]+/g, '_').slice(0, 80) || 'zine';
    return rep.type('application/pdf').header('Content-Disposition', `attachment; filename="${safe}.pdf"`).header('Cache-Control', 'no-store').send(pdfOf(jpegs, (mmW / 25.4) * 72, (mmH / 25.4) * 72));
  });
}
