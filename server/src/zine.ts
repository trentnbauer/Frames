import fs from 'node:fs';
import sharp, { type OverlayOptions } from 'sharp';
import type { FastifyInstance } from 'fastify';
import type { Ctx, Row } from './ctx.js';
import { derivPath } from './ingest.js';
import { zipOf } from './carousel.js';

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
// Carousel slides are 1080 px wide, Instagram's width: 91.44 mm at 300 dpi.
export const SIZES = { 'a3-fold': [105, 148.5], 'a4-fold': [74.25, 105], a5: [148, 210], a6: [105, 148], square: [200, 200], '4:5': [91.44, 114.3], '3:4': [91.44, 121.92], '1:1': [91.44, 91.44] } as const;
export const KINDS = ['zine', 'carousel'] as const;
export type Kind = (typeof KINDS)[number];
const SHAPES = ['4:5', '3:4', '1:1'];
/** The page sizes each kind takes: a zine's sheet (or the sizes of zines made before), a carousel's slide shape. */
const sizeOk = (kind: Kind, size: string) => (kind === 'carousel' ? SHAPES.includes(size) : size in SIZES && !SHAPES.includes(size));
export const MAX_SLIDES = 20; // Instagram's carousel limit
export type PageSize = keyof typeof SIZES;
/**
 * A one-sheet zine: printed on one side of a sheet (landscape, in millimetres), cut along the middle and folded into 8 pages, each an
 * eighth of the sheet. The page sizes a5, a6 and square are kept for zines made before, which print one page per PDF page.
 */
export const SHEETS: Partial<Record<PageSize, [number, number]>> = { 'a3-fold': [420, 297], 'a4-fold': [297, 210] };
/** Where each page goes on the sheet, by printed page number: the top row upside down, so the pages read in order once folded. */
export const FOLD_ORDER = [[5, 4, 3, 2], [6, 7, 8, 1]] as const;
export const MAX_PAGES = 100; // entries a person lays out; with spreads and padding, at most about 200 printed pages
const DPI = 300;

/** One printed page: what is on it, and whether Frames added it (a blank before a spread, or padding at the end). */
export type Printed = { layout: Layout | 'left' | 'right'; photos: (number | null)[]; entry: number | null };

export const PAGE_COUNTS = [8, 16, 24] as const;
export const MAX_CANDIDATES = 500;

/** The printed pages, in order, for the pages a person laid out: filled out with blank pages to `count`, or (0) to a multiple of four. */
export function printedPages(pages: ZinePage[], count = 0, kind: Kind = 'zine'): Printed[] {
  const out: Printed[] = [];
  pages.forEach((p, entry) => {
    if (p.layout === 'spread') {
      // A carousel has no cover or facing pages: a photograph across two slides can start on any slide.
      if (kind === 'zine' && out.length % 2 === 0) out.push({ layout: 'blank', photos: [], entry: null }); // the next page would be a right-hand one
      out.push({ layout: 'left', photos: p.photos, entry }, { layout: 'right', photos: p.photos, entry });
    } else out.push({ layout: p.layout, photos: p.photos, entry });
  });
  while (kind === 'zine' && (count ? out.length < count : out.length % 4)) out.push({ layout: 'blank', photos: [], entry: null });
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

/**
 * Where two photographs go on one page of W × H: one above the other, or side by side, whichever shows more of them (two landscapes
 * stack, two portraits sit side by side; a missing one counts as square). The margin is round the page and between them. [left, top, width, height].
 */
export function pairBoxes(a: { w: number; h: number }, b: { w: number; h: number }, W: number, H: number, m: number): [number, number, number, number][] {
  const area = (cw: number, ch: number) => [a, b].reduce((n, p) => { const k = Math.min(cw / p.w, ch / p.h); return n + p.w * p.h * k * k; }, 0);
  const sw = W - 2 * m, sh = Math.floor((H - 3 * m) / 2), bw = Math.floor((W - 3 * m) / 2), bh = H - 2 * m;
  return area(sw, sh) >= area(bw, bh) ? [[m, m, sw, sh], [m, 2 * m + sh, sw, sh]] : [[m, m, bw, bh], [2 * m + bw, m, bw, bh]];
}

/** One printed page as a JPEG, on white paper. `file` gives a photograph's preview, or null when it has none. */
export async function renderPage(p: Printed, size: PageSize, marginPct: number, file: (id: number | null) => string | null, bg = '#ffffff'): Promise<Buffer> {
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
    const page = sharp({ create: { width: W, height: H, channels: 3, background: bg } });
    if (!f) return page.jpeg({ quality: 88 }).toBuffer();
    const wide = await sharp(f).resize({ width: W * 2, height: H, fit: 'cover' }).toBuffer();
    return sharp(wide).extract({ left: p.layout === 'left' ? 0 : W, top: 0, width: W, height: H }).removeAlpha().jpeg({ quality: 88 }).toBuffer();
  }
  if (p.layout === 'one') await fit(p.photos[0], W - 2 * m, H - 2 * m, m, m);
  if (p.layout === 'two') {
    const size = async (id: number | null) => { const f = file(id); if (!f) return { w: 1, h: 1 }; const meta = await sharp(f).metadata(); return { w: meta.width ?? 1, h: meta.height ?? 1 }; };
    const boxes = pairBoxes(await size(p.photos[0]), await size(p.photos[1]), W, H, m);
    for (const k of [0, 1]) await fit(p.photos[k], boxes[k][2], boxes[k][3], boxes[k][0], boxes[k][1]);
  }
  return sharp({ create: { width: W, height: H, channels: 3, background: bg } }).composite(layers).jpeg({ quality: 88 }).toBuffer();
}

/** The 8 pages (in reading order) laid on one sheet for folding, as FOLD_ORDER says, the top row turned upside down. */
export async function imposeFold(pages: Buffer[], pw: number, ph: number): Promise<{ data: Buffer; w: number; h: number }> {
  const layers = await Promise.all(FOLD_ORDER.flatMap((row, r) => row.map(async (n, c) => {
    const page = pages[n - 1];
    const input = page ? (r === 0 ? await sharp(page).rotate(180).toBuffer() : page) : await sharp({ create: { width: pw, height: ph, channels: 3, background: '#ffffff' } }).png().toBuffer();
    return { input, left: c * pw, top: r * ph };
  })));
  // The one cut: along the middle of the sheet, across the centre two pages' width. A thin grey line, gone once cut.
  const cut = { input: { create: { width: pw * 2, height: Math.max(2, Math.round(ph / 600)), channels: 3 as const, background: '#9a9a9a' } }, left: pw, top: ph - Math.max(1, Math.round(ph / 1200)) };
  const data = await sharp({ create: { width: pw * 4, height: ph * 2, channels: 3, background: '#ffffff' } }).composite([...layers, cut]).jpeg({ quality: 88 }).toBuffer();
  return { data, w: pw * 4, h: ph * 2 };
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

type ZineRow = { id: number; kind: Kind; colour: string; name: string; page_size: PageSize; margin: number; pages: string; page_count: number; candidates: string; created_at: string; updated_at: string };
const readPages = (s: string): ZinePage[] => { try { const p = parsePages(JSON.parse(s)); return typeof p === 'string' ? [] : p; } catch { return []; } };
const readIds = (s: string): number[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((id) => Number.isInteger(id) && id > 0) : []; } catch { return []; } };
/** Photograph numbers from a request: whole and positive, each once, at most `max`; null when it is not a list. */
export const parseIds = (v: unknown, max = MAX_CANDIDATES): number[] | null => (Array.isArray(v) ? [...new Set(v.filter((id): id is number => Number.isInteger(id) && id > 0))].slice(0, max) : null);
/** `count` pages laid out as one photograph each, empty: a new zine of that length. */
const emptyPages = (count: number): ZinePage[] => Array.from({ length: count }, () => ({ layout: 'one', photos: [null] }));

export function registerZines(app: FastifyInstance, x: Ctx) {
  const { db, cfg, num, notFound } = x;
  // A photograph taken out of Frames drops out of the candidates (its page slot just shows empty).
  const dto = (z: ZineRow) => {
    const pages = readPages(z.pages), ids = readIds(z.candidates);
    const live = ids.length ? new Set((db.prepare(`SELECT id FROM photos WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { id: number }[]).map((r) => r.id)) : new Set<number>();
    return { id: z.id, kind: z.kind, colour: z.colour, name: z.name, pageSize: z.page_size, margin: z.margin, pages, pageCount: z.page_count, candidates: ids.filter((id) => live.has(id)), printedCount: printedPages(pages, z.page_count, z.kind).length, coverId: pages.flatMap((p) => p.photos).find((id) => id != null) ?? null, createdAt: z.created_at, updatedAt: z.updated_at };
  };
  const get = (id: unknown) => db.prepare('SELECT * FROM zines WHERE id = ?').get(num(id)) as ZineRow | undefined;
  const name = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);

  app.get('/api/zines', async () => (db.prepare('SELECT * FROM zines ORDER BY updated_at DESC, id DESC').all() as ZineRow[]).map(dto));
  app.post('/api/zines', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const kind = b.kind === undefined ? 'zine' : b.kind;
    if (!KINDS.includes(kind as Kind)) return rep.code(400).send({ error: 'Make a zine or a carousel.' });
    const carousel = kind === 'carousel';
    const count = carousel ? 0 : b.pageCount === undefined ? 8 : b.pageCount;
    if (!carousel && !PAGE_COUNTS.includes(count as 8)) return rep.code(400).send({ error: 'A zine has 8, 16 or 24 pages.' });
    const size = b.pageSize === undefined ? (carousel ? '4:5' : 'a3-fold') : b.pageSize;
    if (typeof size !== 'string' || !sizeOk(kind as Kind, size)) return rep.code(400).send({ error: carousel ? 'The slide shape must be 4:5, 3:4 or 1:1.' : 'Choose the sheet to print on: a3-fold or a4-fold.' });
    if (SHEETS[size as PageSize] && count !== 8) return rep.code(400).send({ error: 'A zine folded from one sheet has 8 pages.' });
    // The chosen photographs become candidates to lay out, as in a composition. A zine's pages start empty; a carousel starts with one
    // slide a photograph, in the order they were picked, since that order is usually the point.
    const ids = parseIds(b.photoIds) ?? [];
    const pages = carousel ? ids.slice(0, MAX_SLIDES).map((id): ZinePage => ({ layout: 'one', photos: [id] })) : emptyPages(count as number);
    const now = new Date().toISOString();
    const id = Number(db.prepare('INSERT INTO zines(kind, name, page_size, margin, pages, page_count, candidates, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)').run(kind, name(b.name) ?? (carousel ? 'Untitled carousel' : 'Untitled zine'), size, carousel ? 5 : 6, JSON.stringify(pages), count, JSON.stringify(ids), now, now).lastInsertRowid);
    return rep.code(201).send(dto(get(id)!));
  });
  app.get('/api/zines/:id', async (req, rep) => { const z = get((req.params as Row).id); return z ? dto(z) : notFound(rep); });
  app.put('/api/zines/:id', async (req, rep) => {
    const z = get((req.params as Row).id);
    if (!z) return notFound(rep);
    const b = (req.body ?? {}) as Row, set: Partial<ZineRow> = {};
    if (b.name !== undefined) { const n = name(b.name); if (!n) return rep.code(400).send({ error: 'Give the zine a name.' }); set.name = n; }
    if (b.pageSize !== undefined) { if (typeof b.pageSize !== 'string' || !sizeOk(z.kind, b.pageSize)) return rep.code(400).send({ error: z.kind === 'carousel' ? 'The slide shape must be 4:5, 3:4 or 1:1.' : 'Choose the sheet to print on: a3-fold or a4-fold.' }); set.page_size = b.pageSize as PageSize; }
    if (b.colour !== undefined) { const c = typeof b.colour === 'string' ? b.colour.replace(/^#/, '').toLowerCase() : ''; if (!/^[0-9a-f]{6}$/.test(c)) return rep.code(400).send({ error: 'The colour must be six hex digits, like ffffff.' }); set.colour = c; }
    if (b.margin !== undefined) { if (typeof b.margin !== 'number' || !Number.isFinite(b.margin) || b.margin < 0 || b.margin > 20) return rep.code(400).send({ error: 'The margin must be from 0 to 20 per cent.' }); set.margin = b.margin; }
    if (b.pages !== undefined) { const p = parsePages(b.pages); if (typeof p === 'string') return rep.code(400).send({ error: p }); set.pages = JSON.stringify(p); }
    if (b.pageCount !== undefined) { if (z.kind === 'carousel' || !PAGE_COUNTS.includes(b.pageCount as 8)) return rep.code(400).send({ error: 'A zine has 8, 16 or 24 pages.' }); set.page_count = b.pageCount as number; }
    if (b.candidates !== undefined) { const c = parseIds(b.candidates); if (!c) return rep.code(400).send({ error: 'List the candidates by photograph number.' }); set.candidates = JSON.stringify(c); }
    // Adding photographs (from Add to… Zine) puts them at the end of the candidates.
    if (b.addCandidates !== undefined) { const c = parseIds(b.addCandidates); if (!c) return rep.code(400).send({ error: 'List the photographs by number.' }); set.candidates = JSON.stringify([...new Set([...readIds(set.candidates ?? z.candidates), ...c])].slice(0, MAX_CANDIDATES)); }
    const next = { ...z, ...set, updated_at: new Date().toISOString() };
    if (next.kind === 'carousel' && printedPages(readPages(next.pages), 0, 'carousel').length > MAX_SLIDES) return rep.code(400).send({ error: `A carousel holds ${MAX_SLIDES} slides.` });
    if (SHEETS[next.page_size] && next.page_count !== 8) return rep.code(400).send({ error: 'A zine folded from one sheet has 8 pages.' });
    if (next.page_count && printedPages(readPages(next.pages), next.page_count).length > next.page_count)
      return rep.code(400).send({ error: `That needs more than ${next.page_count} pages. Remove a page, or choose more pages.` });
    db.prepare('UPDATE zines SET name = ?, page_size = ?, margin = ?, colour = ?, pages = ?, page_count = ?, candidates = ?, updated_at = ? WHERE id = ?').run(next.name, next.page_size, next.margin, next.colour, next.pages, next.page_count, next.candidates, next.updated_at, z.id);
    return dto(next);
  });
  app.delete('/api/zines/:id', async (req, rep) => {
    if (!db.prepare('DELETE FROM zines WHERE id = ?').run(num((req.params as Row).id)).changes) return notFound(rep);
    return { ok: true };
  });
  const fileOf = () => {
    const live = new Set((db.prepare('SELECT id FROM photos WHERE missing = 0').all() as { id: number }[]).map((r) => r.id));
    return (id: number | null) => { if (id == null || !live.has(id)) return null; const f = derivPath(cfg, id, 'preview'); return fs.existsSync(f) ? f : null; };
  };
  const safeName = (z: ZineRow) => z.name.replace(/[^\w .-]+/g, '_').slice(0, 80) || z.kind;
  // A carousel's slides, as a zip of JPEGs in order, ready to post.
  app.get('/api/zines/:id/zip', async (req, rep) => {
    const z = get((req.params as Row).id);
    if (!z || z.kind !== 'carousel') return notFound(rep);
    const file = fileOf(), files = [];
    for (const [i, p] of printedPages(readPages(z.pages), 0, 'carousel').entries()) files.push({ name: `slide-${String(i + 1).padStart(2, '0')}.jpg`, data: await renderPage(p, z.page_size, z.margin, file, `#${z.colour}`) });
    if (!files.length) return rep.code(404).send({ error: 'This carousel has no slides yet.' });
    return rep.type('application/zip').header('Content-Disposition', `attachment; filename="${safeName(z)}.zip"`).header('Cache-Control', 'no-store').send(zipOf(files));
  });
  app.get('/api/zines/:id/pdf', async (req, rep) => {
    const z = get((req.params as Row).id);
    if (!z || z.kind !== 'zine') return notFound(rep);
    const printed = printedPages(readPages(z.pages), z.page_count);
    const file = fileOf();
    const [mmW, mmH] = SIZES[z.page_size] ?? SIZES.a5;
    // shortcut: the whole PDF is built in memory (about 1 MB a page at 300 dpi); stream it page by page if zines grow past ~200 pages.
    const jpegs = [];
    for (const p of printed) jpegs.push({ data: await renderPage(p, z.page_size, z.margin, file), w: px(mmW), h: px(mmH) });
    const safe = safeName(z);
    const sheet = SHEETS[z.page_size];
    const pdf = sheet ? pdfOf([await imposeFold(jpegs.map((j) => j.data), px(mmW), px(mmH))], (sheet[0] / 25.4) * 72, (sheet[1] / 25.4) * 72) : pdfOf(jpegs, (mmW / 25.4) * 72, (mmH / 25.4) * 72);
    return rep.type('application/pdf').header('Content-Disposition', `attachment; filename="${safe}.pdf"`).header('Cache-Control', 'no-store').send(pdf);
  });
}
