import fs from 'node:fs';
import sharp, { type OverlayOptions } from 'sharp';
import type { FastifyInstance } from 'fastify';
import type { Ctx, Row } from './ctx.js';
import { derivPath } from './ingest.js';
import { zipOf } from './carousel.js';

/**
 * Zines: a booklet laid out page by page. A page holds one, two or three photographs, or nothing; a spread is one photograph
 * across two facing pages, borderless only at the fold. Page 1 is the cover, on its own on the right, so facing pages are 2–3, 4–5 and so on: a
 * spread that would start on a right-hand page gets a blank page before it, and the booklet is filled out with blank pages to a
 * multiple of four (a folded sheet holds four pages). Zine pages can carry a line or two of text. The PDF is made from the previews, at 300 dpi.
 */
export const LAYOUTS = { one: 1, two: 2, three: 3, spread: 1, blank: 0 } as const;
export type Layout = keyof typeof LAYOUTS;
export type PageText = { on: boolean; body: string; pos: 'top' | 'middle' | 'bottom'; font: 'serif' | 'mono' };
export type Arrange = 'portraits-top' | 'landscape-top';
export type ZinePage = { layout: Layout; photos: (number | null)[]; text?: PageText; arrange?: Arrange };
/** Page sizes in millimetres. Carousel slides are 1080 px wide, Instagram's width: 91.44 mm at 300 dpi. */
export const SIZES = { 'a3-fold': [105, 148.5], 'a4-fold': [74.25, 105], a5: [148, 210], a6: [105, 148], square: [200, 200], '4:5': [91.44, 114.3], '3:4': [91.44, 121.92], '1:1': [91.44, 91.44] } as const;
export const KINDS = ['zine', 'carousel'] as const;
export type Kind = (typeof KINDS)[number];
/** The same three stages as a composition. Done is read-only: only the stage itself can change. */
export const STAGES = ['progress', 'review', 'done'] as const;
export type Stage = (typeof STAGES)[number];
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
export const MAX_TEXT = 280;
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
      if (kind === 'zine' && out.length % 2 === 0) out.push({ layout: 'blank', photos: [], entry: null });
      out.push({ layout: 'left', photos: p.photos, entry }, { layout: 'right', photos: p.photos, entry });
    } else out.push({ layout: p.layout, photos: p.photos, entry });
  });
  while (kind === 'zine' && (count ? out.length < count : out.length % 4)) out.push({ layout: 'blank', photos: [], entry: null });
  return out;
}

const POS = ['top', 'middle', 'bottom'], FONTS = ['serif', 'mono'], ARRANGE = ['portraits-top', 'landscape-top'];
/** The pages from a request body, or a sentence saying what is wrong with them. */
export function parsePages(v: unknown): ZinePage[] | string {
  if (!Array.isArray(v) || v.length > MAX_PAGES) return `A zine holds up to ${MAX_PAGES} pages.`;
  const out: ZinePage[] = [];
  for (const p of v) {
    const layout = (p as Row)?.layout, photos = (p as Row)?.photos, text = (p as Row)?.text, arrange = (p as Row)?.arrange;
    if (typeof layout !== 'string' || !(layout in LAYOUTS)) return 'Each page needs a layout: one, two, three, spread or blank.';
    const n = LAYOUTS[layout as Layout];
    if (!Array.isArray(photos) || photos.length > 3 || !photos.every((id) => id === null || (Number.isInteger(id) && id > 0))) return 'Each page lists its photographs by number.';
    const page: ZinePage = { layout: layout as Layout, photos: Array.from({ length: n }, (_, i) => (photos[i] as number | null | undefined) ?? null) };
    if (text !== undefined && text !== null) {
      const t = text as Row;
      if (typeof t.on !== 'boolean' || typeof t.body !== 'string' || t.body.length > MAX_TEXT || !POS.includes(t.pos as string) || !FONTS.includes(t.font as string)) return `Page text is on or off, up to ${MAX_TEXT} characters, at the top, middle or bottom, in serif or mono.`;
      page.text = { on: t.on, body: t.body, pos: t.pos as PageText['pos'], font: t.font as PageText['font'] };
    }
    if (arrange !== undefined && arrange !== null) { if (!ARRANGE.includes(arrange as string)) return 'Three photos go portraits-top or landscape-top.'; page.arrange = arrange as Arrange; }
    out.push(page);
  }
  return out;
}

const px = (mm: number) => Math.round((mm / 25.4) * DPI);
type Box = [number, number, number, number];

/**
 * Where two photographs go on one page of W × H: one above the other, or side by side, whichever shows more of them (two landscapes
 * stack, two portraits sit side by side; a missing one counts as square). The margin is round the page and between them. [left, top, width, height].
 */
export function pairBoxes(a: { w: number; h: number }, b: { w: number; h: number }, W: number, H: number, m: number): Box[] {
  const area = (cw: number, ch: number) => [a, b].reduce((n, p) => { const k = Math.min(cw / p.w, ch / p.h); return n + p.w * p.h * k * k; }, 0);
  const sw = W - 2 * m, sh = Math.floor((H - 3 * m) / 2), bw = Math.floor((W - 3 * m) / 2), bh = H - 2 * m;
  return area(sw, sh) >= area(bw, bh) ? [[m, m, sw, sh], [m, 2 * m + sh, sw, sh]] : [[m, m, bw, bh], [2 * m + bw, m, bw, bh]];
}

/** Three photographs: two portraits side by side in one half, a landscape across the other. [portrait, portrait, landscape]. */
export function threeBoxes(W: number, H: number, m: number, arrange: Arrange = 'portraits-top'): Box[] {
  const h = Math.floor((H - 3 * m) / 2), bw = Math.floor((W - 3 * m) / 2), sw = W - 2 * m;
  const pt = arrange === 'landscape-top' ? 2 * m + h : m, lt = arrange === 'landscape-top' ? m : 2 * m + h;
  return [[m, pt, bw, h], [2 * m + bw, pt, bw, h], [m, lt, sw, h]];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const isDark = (hex: string) => { const n = parseInt(hex.replace('#', ''), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128; };
/**
 * A page's text as an SVG layer, centred, wrapped to the page, with a band of the paper colour behind it when it sits over a photo.
 * Matches the editor: serif at 12% of the page width, mono (uppercase, tracked) at 5.2%, 9% / 8% in from the edges.
 * Fonts: Instrument Serif and IBM Plex Mono if installed on the server (fontconfig), else Georgia / monospace.
 */
export function textLayer(t: PageText, W: number, H: number, bg: string, band: boolean): Buffer | null {
  if (!t.on || !t.body.trim()) return null;
  const serif = t.font !== 'mono', fs = Math.round(W * (serif ? 0.12 : 0.052)), lh = Math.round(fs * 1.1);
  const charW = fs * (serif ? 0.46 : 0.66), perLine = Math.max(4, Math.floor((W * 0.84) / charW));
  const lines: string[] = [];
  for (const para of (serif ? t.body : t.body.toUpperCase()).split('\n')) {
    let cur = '';
    for (const w of para.trim().split(/\s+/).filter(Boolean)) { if (cur && (cur + ' ' + w).length > perLine) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w; }
    if (cur) lines.push(cur);
  }
  if (!lines.length) return null;
  const block = lines.length * lh, padY = Math.round(H * 0.09);
  const top = t.pos === 'top' ? padY : t.pos === 'middle' ? Math.round((H - block) / 2) : H - padY - block;
  const ink = isDark(bg) ? '#ffffff' : '#1a1a1a', widest = Math.max(...lines.map((l) => l.length)) * charW;
  const family = serif ? "'Instrument Serif', Georgia, serif" : "'IBM Plex Mono', monospace";
  const rect = band ? `<rect x="${Math.round((W - widest) / 2 - fs * 0.5)}" y="${Math.round(top - fs * 0.25)}" width="${Math.round(widest + fs)}" height="${Math.round(block + fs * 0.5)}" fill="${bg}"/>` : '';
  const tspans = lines.map((l, k) => `<text x="${W / 2}" y="${Math.round(top + k * lh + fs * 0.85)}" text-anchor="middle" font-family="${family}" font-size="${fs}" letter-spacing="${serif ? 0 : Math.round(fs * 0.06)}" fill="${ink}">${esc(l)}</text>`).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rect}${tspans}</svg>`);
}

/** One printed page as a JPEG. `src` is the laid-out page it comes from (for text and three-photo arrangement). */
export async function renderPage(p: Printed, size: PageSize, marginPct: number, file: (id: number | null) => string | null, bg = '#ffffff', src?: ZinePage): Promise<Buffer> {
  const W = px(SIZES[size][0]), H = px(SIZES[size][1]), m = Math.round((W * marginPct) / 100);
  const layers: OverlayOptions[] = [];
  const fit = async (id: number | null, w: number, h: number, left: number, top: number) => {
    const f = file(id);
    if (!f || w < 1 || h < 1) return;
    const img = await sharp(f).resize({ width: w, height: h, fit: 'inside' }).toBuffer({ resolveWithObject: true });
    layers.push({ input: img.data, left: left + Math.round((w - img.info.width) / 2), top: top + Math.round((h - img.info.height) / 2) });
  };
  if (p.layout === 'left' || p.layout === 'right') {
    // The spread is made once across both pages inside the outer margin, and this page is its half: the halves meet at the fold, borderless only there.
    const f = file(p.photos[0]), half = W - m, h = H - 2 * m;
    if (f && half > 0 && h > 0) {
      const wide = await sharp(f).resize({ width: half * 2, height: h, fit: 'cover' }).toBuffer();
      layers.push({ input: await sharp(wide).extract({ left: p.layout === 'left' ? 0 : half, top: 0, width: half, height: h }).toBuffer(), left: p.layout === 'left' ? m : 0, top: m });
    }
  }
  if (p.layout === 'one') await fit(p.photos[0], W - 2 * m, H - 2 * m, m, m);
  if (p.layout === 'two') {
    const dims = async (id: number | null) => { const f = file(id); if (!f) return { w: 1, h: 1 }; const meta = await sharp(f).metadata(); return { w: meta.width ?? 1, h: meta.height ?? 1 }; };
    const boxes = pairBoxes(await dims(p.photos[0]), await dims(p.photos[1]), W, H, m);
    for (const k of [0, 1]) await fit(p.photos[k], boxes[k][2], boxes[k][3], boxes[k][0], boxes[k][1]);
  }
  if (p.layout === 'three') {
    const boxes = threeBoxes(W, H, m, src?.arrange);
    for (const k of [0, 1, 2]) await fit(p.photos[k], boxes[k][2], boxes[k][3], boxes[k][0], boxes[k][1]);
  }
  // Text sits on a page, or on the left page of a spread.
  if (src?.text && p.layout !== 'right') { const t = textLayer(src.text, W, H, bg, src.photos.some((x) => x != null)); if (t) layers.push({ input: t, left: 0, top: 0 }); }
  return sharp({ create: { width: W, height: H, channels: 3, background: bg } }).composite(layers).jpeg({ quality: 88 }).toBuffer();
}

/** The 8 pages (in reading order) laid on one sheet for folding, as FOLD_ORDER says, the top row turned upside down. */
export async function imposeFold(pages: Buffer[], pw: number, ph: number, bg = '#ffffff'): Promise<{ data: Buffer; w: number; h: number }> {
  const layers = await Promise.all(FOLD_ORDER.flatMap((row, r) => row.map(async (n, c) => {
    const page = pages[n - 1];
    const input = page ? (r === 0 ? await sharp(page).rotate(180).toBuffer() : page) : await sharp({ create: { width: pw, height: ph, channels: 3, background: bg } }).png().toBuffer();
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

type ZineRow = { id: number; kind: Kind; colour: string; name: string; page_size: PageSize; margin: number; pages: string; page_count: number; candidates: string; stage: Stage; created_at: string; updated_at: string };
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
    return { id: z.id, kind: z.kind, colour: z.colour, name: z.name, pageSize: z.page_size, margin: z.margin, pages, pageCount: z.page_count, candidates: ids.filter((id) => live.has(id)), printedCount: printedPages(pages, z.page_count, z.kind).length, coverId: pages.flatMap((p) => p.photos).find((id) => id != null) ?? null, stage: z.stage ?? 'progress', createdAt: z.created_at, updatedAt: z.updated_at };
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
    if (b.stage !== undefined) { if (!STAGES.includes(b.stage as Stage)) return rep.code(400).send({ error: 'The stage is progress, review or done.' }); set.stage = b.stage as Stage; }
    // Done is read-only, as for a composition: move it back to Progress or Review first.
    const editing = Object.keys(b).some((k) => k !== 'stage');
    if (editing && (set.stage ?? z.stage) === 'done') return rep.code(409).send({ error: `This ${z.kind} is done. Choose Progress or Review to change it.` });
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
    db.prepare('UPDATE zines SET name = ?, page_size = ?, margin = ?, colour = ?, pages = ?, page_count = ?, candidates = ?, stage = ?, updated_at = ? WHERE id = ?').run(next.name, next.page_size, next.margin, next.colour, next.pages, next.page_count, next.candidates, next.stage ?? 'progress', next.updated_at, z.id);
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
    const pages = readPages(z.pages), file = fileOf(), files = [];
    for (const [i, p] of printedPages(pages, 0, 'carousel').entries()) files.push({ name: `slide-${String(i + 1).padStart(2, '0')}.jpg`, data: await renderPage(p, z.page_size, z.margin, file, `#${z.colour}`, p.entry != null ? pages[p.entry] : undefined) });
    if (!files.length) return rep.code(404).send({ error: 'This carousel has no slides yet.' });
    return rep.type('application/zip').header('Content-Disposition', `attachment; filename="${safeName(z)}.zip"`).header('Cache-Control', 'no-store').send(zipOf(files));
  });
  app.get('/api/zines/:id/pdf', async (req, rep) => {
    const z = get((req.params as Row).id);
    if (!z || z.kind !== 'zine') return notFound(rep);
    const pages = readPages(z.pages), printed = printedPages(pages, z.page_count);
    const file = fileOf(), bg = `#${z.colour ?? 'ffffff'}`;
    const [mmW, mmH] = SIZES[z.page_size] ?? SIZES.a5;
    // shortcut: the whole PDF is built in memory (about 1 MB a page at 300 dpi); stream it page by page if zines grow past ~200 pages.
    const jpegs = [];
    for (const p of printed) jpegs.push({ data: await renderPage(p, z.page_size, z.margin, file, bg, p.entry != null ? pages[p.entry] : undefined), w: px(mmW), h: px(mmH) });
    const sheet = SHEETS[z.page_size];
    const pdf = sheet ? pdfOf([await imposeFold(jpegs.map((j) => j.data), px(mmW), px(mmH), bg)], (sheet[0] / 25.4) * 72, (sheet[1] / 25.4) * 72) : pdfOf(jpegs, (mmW / 25.4) * 72, (mmH / 25.4) * 72);
    return rep.type('application/pdf').header('Content-Disposition', `attachment; filename="${safeName(z)}.pdf"`).header('Cache-Control', 'no-store').send(pdf);
  });
}
