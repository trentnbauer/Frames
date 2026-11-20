import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { FOLD_ORDER, imposeFold, pairBoxes, parsePages, printedPages, renderPage, type ZinePage } from './zine.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

let env: Env, a: ReturnType<typeof api>, ids: number[];
beforeEach(async () => {
  env = makeEnv(); a = api(env);
  fs.writeFileSync(env.lib + '/a.jpg', await jpg(svg(600, 400, '#203040', '#405060', [0.5, 0.5])));
  fs.writeFileSync(env.lib + '/b.jpg', await jpg(svg(1500, 500, '#102030', '#a0b0c0', [0.2, 0.5])));
  await a.scan();
  ids = ((await a.get('/api/photos')).body.photos as { id: number }[]).map((p) => p.id).sort((x, y) => x - y);
});
afterEach(async () => { await env.app.close(); cleanup(env); });

const kinds = (pages: ZinePage[]) => printedPages(pages).map((p) => p.layout);

it('puts a spread on facing pages, adding a blank page before it when needed, and fills out to a multiple of four', () => {
  // Page 1 is the cover on its own, so a spread right after it lands on 2–3.
  expect(kinds([{ layout: 'one', photos: [1] }, { layout: 'spread', photos: [2] }])).toEqual(['one', 'left', 'right', 'blank']);
  // After two single pages the next page is a right-hand one: a blank goes first.
  expect(kinds([{ layout: 'one', photos: [1] }, { layout: 'two', photos: [1, 2] }, { layout: 'spread', photos: [2] }])).toEqual(['one', 'two', 'blank', 'left', 'right', 'blank', 'blank', 'blank']);
  expect(kinds([])).toEqual([]);
});

it('refuses pages it cannot use and fills or trims photo slots to the layout', () => {
  expect(parsePages('x')).toMatch(/100/);
  expect(parsePages(Array(101).fill({ layout: 'one', photos: [] }))).toMatch(/100/);
  expect(parsePages([{ layout: 'three', photos: [] }])).toMatch(/layout/);
  expect(parsePages([{ layout: 'one', photos: ['a'] }])).toMatch(/number/);
  expect(parsePages([{ layout: 'two', photos: [5] }, { layout: 'blank', photos: [5] }])).toEqual([{ layout: 'two', photos: [5, null] }, { layout: 'blank', photos: [] }]);
});

it('splits a spread so the two halves meet at the fold', async () => {
  const file = path.join(os.tmpdir(), `zine-half-${process.pid}.png`);
  // Left half red, right half blue: each printed page is one colour, edge to edge.
  await sharp({ create: { width: 400, height: 200, channels: 3, background: '#ff0000' } }).composite([{ input: { create: { width: 200, height: 200, channels: 3, background: '#0000ff' } }, left: 200, top: 0 }]).png().toFile(file);
  const colour = async (b: Buffer) => { const { data, info } = await sharp(b).raw().toBuffer({ resolveWithObject: true }); const at = (x: number) => [...data.subarray((Math.floor(info.height / 2) * info.width + x) * 3, (Math.floor(info.height / 2) * info.width + x) * 3 + 3)].map((v) => Math.round(v / 255)); return [at(0), at(info.width - 1)]; };
  const left = await renderPage({ layout: 'left', photos: [1], entry: 0 }, 'square', 6, () => file);
  const right = await renderPage({ layout: 'right', photos: [1], entry: 0 }, 'square', 6, () => file);
  expect(await colour(left)).toEqual([[1, 0, 0], [1, 0, 0]]);
  expect(await colour(right)).toEqual([[0, 0, 1], [0, 0, 1]]);
  fs.rmSync(file, { force: true });
});

it('saves a zine and exports it as a PDF with one page per printed page', async () => {
  // The chosen photographs become candidates; the pages start empty, as many as asked for.
  const made = await a.post('/api/zines', { name: 'Summer', photoIds: [...ids, ids[0], 'x'], pageCount: 8, pageSize: 'a5' });
  expect(made.status).toBe(201);
  expect(made.body).toMatchObject({ candidates: ids, pageCount: 8, printedCount: 8 });
  expect(made.body.pages).toEqual(Array(8).fill({ layout: 'one', photos: [null] }));
  expect((await a.post('/api/zines', { pageCount: 10 })).status).toBe(400);
  const id = made.body.id;
  const pages = [{ layout: 'one', photos: [ids[0]] }, { layout: 'spread', photos: [ids[1]] }, { layout: 'two', photos: [ids[0], ids[1]] }];
  const saved = await a.put(`/api/zines/${id}`, { pages, pageSize: 'a6', margin: 4 });
  expect(saved.body).toMatchObject({ pageSize: 'a6', margin: 4, printedCount: 8, coverId: ids[0] });
  // More pages than the zine has is refused; a longer zine takes them.
  const long = Array(9).fill({ layout: 'one', photos: [null] });
  expect((await a.put(`/api/zines/${id}`, { pages: long })).body.error).toMatch(/more than 8 pages/);
  expect((await a.put(`/api/zines/${id}`, { pages: long, pageCount: 16 })).body).toMatchObject({ pageCount: 16, printedCount: 16 });
  expect((await a.put(`/api/zines/${id}`, { pages, pageCount: 8 })).status).toBe(200);
  // Candidates: added to the end once each, replaced as a list, and a removed photograph drops out.
  expect((await a.put(`/api/zines/${id}`, { addCandidates: [ids[1], 999999] })).body.candidates).toEqual(ids);
  expect((await a.put(`/api/zines/${id}`, { candidates: 'no' })).status).toBe(400);
  expect((await a.put(`/api/zines/${id}`, { candidates: [ids[1]] })).body.candidates).toEqual([ids[1]]);
  expect((await a.put(`/api/zines/${id}`, { pageSize: 'a3' })).status).toBe(400);
  expect((await a.put(`/api/zines/${id}`, { name: '  ' })).status).toBe(400);
  expect((await a.get('/api/zines')).body.map((z: { name: string }) => z.name)).toEqual(['Summer']);

  const pdf = await a.get(`/api/zines/${id}/pdf`);
  expect(pdf.headers['content-type']).toBe('application/pdf');
  const text = (pdf.body as Buffer).toString('latin1');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text.match(/\/Type \/Page /g)).toHaveLength(8);
  expect(text).toContain('/MediaBox [0 0 297.64 419.53]'); // A6 in points
  // Every offset in the cross-reference table points at its object.
  const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
  const rows = text.slice(xref).split('\n').slice(3).filter((r) => / n $/.test(r));
  rows.forEach((r, i) => expect(text.slice(Number(r.slice(0, 10))).startsWith(`${i + 1} 0 obj\n`)).toBe(true));
  // A real PDF reader agrees, where one is installed (poppler's pdfinfo).
  try { expect(execFileSync('pdfinfo', ['-'], { input: pdf.body as Buffer, stdio: ['pipe', 'pipe', 'pipe'] }).toString()).toMatch(/Pages:\s+8/); } catch (e) { if ((e as { code?: string }).code !== 'ENOENT') throw e; }

  expect((await a.del(`/api/zines/${id}`)).status).toBe(200);
  expect((await a.get(`/api/zines/${id}`)).status).toBe(404);
  expect((await a.get(`/api/zines/${id}/pdf`)).status).toBe(404);
});

it('lays the 8 pages of a one-sheet zine out for folding, the top row upside down', async () => {
  expect(FOLD_ORDER.flat().sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  // Each page a different grey, with a black mark in its top-left corner.
  const page = (n: number) => sharp({ create: { width: 40, height: 60, channels: 3, background: { r: n * 25, g: n * 25, b: n * 25 } } }).composite([{ input: { create: { width: 8, height: 8, channels: 3, background: '#000' } }, left: 0, top: 0 }]).png().toBuffer();
  const sheet = await imposeFold(await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(page)), 40, 60);
  expect([sheet.w, sheet.h]).toEqual([160, 120]);
  const { data, info } = await sharp(sheet.data).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => Math.round(data[(y * info.width + x) * info.channels] / 25);
  FOLD_ORDER.forEach((row, r) => row.forEach((n, c) => expect(at(c * 40 + 20, r * 60 + 30), `page ${n}`).toBe(n)));
  expect(at(122, 62)).toBe(0); // page 1, the cover, bottom right, upright: its mark top-left
  expect(at(36, 56)).toBe(0); // page 5, top left, upside down: its mark bottom-right
});

it('makes a new zine a one-sheet A3 zine of 8 pages, and prints it on one sheet', async () => {
  const z = (await a.post('/api/zines', { photoIds: ids })).body;
  expect(z).toMatchObject({ pageSize: 'a3-fold', pageCount: 8, printedCount: 8 });
  expect((await a.post('/api/zines', { pageCount: 16 })).body.error).toMatch(/8 pages/);
  expect((await a.put(`/api/zines/${z.id}`, { pageCount: 16, pages: Array(16).fill({ layout: 'one', photos: [null] }) })).body.error).toMatch(/8 pages/);
  await a.put(`/api/zines/${z.id}`, { pages: [{ layout: 'one', photos: [ids[0]] }, { layout: 'spread', photos: [ids[1]] }] });
  const pdf = await a.get(`/api/zines/${z.id}/pdf`);
  const text = (pdf.body as Buffer).toString('latin1');
  expect(text.match(/\/Type \/Page /g)).toHaveLength(1);
  expect(text).toContain('/MediaBox [0 0 1190.55 841.89]'); // A3, landscape
  try { expect(execFileSync('pdfinfo', ['-'], { input: pdf.body as Buffer, stdio: ['pipe', 'pipe', 'pipe'] }).toString()).toMatch(/Pages:\s+1/); } catch (e) { if ((e as { code?: string }).code !== 'ENOENT') throw e; }
});

it('puts two photographs on a page one above the other or side by side, whichever shows more of them', () => {
  expect(pairBoxes({ w: 3, h: 2 }, { w: 3, h: 2 }, 1080, 1350, 54).map((b) => b[0])).toEqual([54, 54]); // landscapes stack: same left edge
  expect(pairBoxes({ w: 2, h: 3 }, { w: 2, h: 3 }, 1080, 1350, 54).map((b) => b[1])).toEqual([54, 54]); // portraits side by side: same top edge
});

it('makes a carousel: a slide a photograph, slides in a row with no cover or padding, and a zip of them', async () => {
  const c = (await a.post('/api/zines', { kind: 'carousel', photoIds: ids })).body;
  expect(c).toMatchObject({ kind: 'carousel', pageSize: '4:5', colour: 'ffffff', candidates: ids, printedCount: 2 });
  expect(c.pages).toEqual(ids.map((id) => ({ layout: 'one', photos: [id] })));
  expect((await a.post('/api/zines', { kind: 'poster' })).status).toBe(400);
  expect((await a.post('/api/zines', { kind: 'carousel', pageSize: 'a5' })).status).toBe(400);
  expect((await a.put(`/api/zines/${c.id}`, { pageSize: 'a3-fold' })).status).toBe(400);
  expect((await a.put(`/api/zines/${c.id}`, { colour: 'red' })).status).toBe(400);
  // A photograph across two slides starts right where it is: no blank slide, no padding.
  const saved = (await a.put(`/api/zines/${c.id}`, { pageSize: '1:1', colour: '#FF0000', margin: 10, pages: [{ layout: 'one', photos: [ids[0]] }, { layout: 'spread', photos: [ids[1]] }] })).body;
  expect(saved).toMatchObject({ pageSize: '1:1', colour: 'ff0000', printedCount: 3 });
  expect((await a.put(`/api/zines/${c.id}`, { pages: Array(21).fill({ layout: 'one', photos: [null] }) })).body.error).toMatch(/20 slides/);
  const zip = await a.get(`/api/zines/${c.id}/zip`);
  expect(zip.headers['content-type']).toBe('application/zip');
  expect((zip.body as Buffer).toString('latin1').match(/slide-0\d\.jpg/g)).toHaveLength(6); // three names, each in the entry and the directory
  // The first slide is 1080 square, with the red border in its corner.
  const at = (zip.body as Buffer).indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  const first = sharp((zip.body as Buffer).subarray(at));
  expect(await first.metadata()).toMatchObject({ width: 1080, height: 1080 });
  const { data } = await first.raw().toBuffer({ resolveWithObject: true });
  expect([data[0], data[1], data[2]].map((v) => Math.round(v / 32))).toEqual([8, 0, 0]);
  expect((await a.get(`/api/zines/${c.id}/pdf`)).status).toBe(404);
  const zine = (await a.post('/api/zines', {})).body;
  expect(zine.kind).toBe('zine');
  expect((await a.get(`/api/zines/${zine.id}/zip`)).status).toBe(404);
});
