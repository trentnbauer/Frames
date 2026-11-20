import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { parsePages, printedPages, renderPage, type ZinePage } from './zine.js';
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
  const made = await a.post('/api/zines', { name: 'Summer', photoIds: ids });
  expect(made.status).toBe(201);
  expect(made.body.pages).toEqual(ids.map((id) => ({ layout: 'one', photos: [id] })));
  const id = made.body.id;
  const pages = [{ layout: 'one', photos: [ids[0]] }, { layout: 'spread', photos: [ids[1]] }, { layout: 'two', photos: [ids[0], ids[1]] }];
  const saved = await a.put(`/api/zines/${id}`, { pages, pageSize: 'a6', margin: 4 });
  expect(saved.body).toMatchObject({ pageSize: 'a6', margin: 4, printedCount: 4, coverId: ids[0] });
  expect((await a.put(`/api/zines/${id}`, { pageSize: 'a3' })).status).toBe(400);
  expect((await a.put(`/api/zines/${id}`, { name: '  ' })).status).toBe(400);
  expect((await a.get('/api/zines')).body.map((z: { name: string }) => z.name)).toEqual(['Summer']);

  const pdf = await a.get(`/api/zines/${id}/pdf`);
  expect(pdf.headers['content-type']).toBe('application/pdf');
  const text = (pdf.body as Buffer).toString('latin1');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text.match(/\/Type \/Page /g)).toHaveLength(4);
  expect(text).toContain('/MediaBox [0 0 297.64 419.53]'); // A6 in points
  // Every offset in the cross-reference table points at its object.
  const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
  const rows = text.slice(xref).split('\n').slice(3).filter((r) => / n $/.test(r));
  rows.forEach((r, i) => expect(text.slice(Number(r.slice(0, 10))).startsWith(`${i + 1} 0 obj\n`)).toBe(true));
  // A real PDF reader agrees, where one is installed (poppler's pdfinfo).
  try { expect(execFileSync('pdfinfo', ['-'], { input: pdf.body as Buffer, stdio: ['pipe', 'pipe', 'pipe'] }).toString()).toMatch(/Pages:\s+4/); } catch (e) { if ((e as { code?: string }).code !== 'ENOENT') throw e; }

  expect((await a.del(`/api/zines/${id}`)).status).toBe(200);
  expect((await a.get(`/api/zines/${id}`)).status).toBe(404);
  expect((await a.get(`/api/zines/${id}/pdf`)).status).toBe(404);
});
