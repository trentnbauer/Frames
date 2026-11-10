import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chosenOf, deriveLayout, fits, parseLayout, targetOf } from './layout.js';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';

describe('layout rules', () => {
  const members = new Set([1, 2, 3]);
  const print = (o: object = {}) => ({ id: 1, size: 'A4', orientation: 'portrait', frame: null, photoId: null, x: 0, y: 0, ...o });

  it('keeps a look-only crop on a print with a photograph, clamped, and drops it when there is nothing to crop', () => {
    const got = (o: object) => parseLayout({ prints: [print(o)] }, members)!.prints[0];
    expect(got({ photoId: 1, crop: { zoom: 2.5, shiftX: -20, shiftY: 40 } }).crop).toEqual({ zoom: 2.5, shiftX: -20, shiftY: 40 });
    expect(got({ photoId: 1, crop: { zoom: 2, fx: 0.2, fy: 0.9 } }).crop).toEqual({ zoom: 2, shiftX: -30, shiftY: 40 }); // an older focal-point save
    expect(got({ photoId: 1, crop: { zoom: 99, shiftX: -400, shiftY: 700 } }).crop).toEqual({ zoom: 2.5, shiftX: -50, shiftY: 50 });
    expect(got({ photoId: 1, crop: { zoom: 1, shiftX: 0, shiftY: 0 } }).crop).toBeUndefined(); // fill is the default
    expect(got({ photoId: null, crop: { zoom: 2, shiftX: 0, shiftY: 0 } }).crop).toBeUndefined();
    expect(got({ photoId: 1, crop: 'x' }).crop).toBeUndefined();
  });

  it('accepts a good layout, and refuses one that is not a list of prints, empty, too long or with an unknown size', () => {
    expect(parseLayout({ mode: 'grid', prints: [print()] }, members)).toMatchObject({ mode: 'grid', prints: [{ size: 'A4', orientation: 'portrait' }] });
    for (const bad of [null, 'x', {}, { prints: [] }, { prints: 'a' }, { prints: Array.from({ length: 13 }, () => print()) }, { prints: [print({ size: 'A9' })] }]) expect(parseLayout(bad, members)).toBeNull();
  });
  it('keeps the sharpness wanted (pixels per inch) when it is sensible, and leaves 300 (the usual) unsaid', () => {
    expect(parseLayout({ prints: [print()], ppi: 200 }, members)).toMatchObject({ ppi: 200 });
    expect(parseLayout({ prints: [print()], ppi: 149.6 }, members)).toMatchObject({ ppi: 150 });
    for (const bad of [300, 10, 5000, 'high', null, NaN]) expect(parseLayout({ prints: [print()], ppi: bad }, members)).not.toHaveProperty('ppi');
    expect(targetOf(parseLayout({ prints: [print()], ppi: 200 }, members)!).ppi).toBe(200);
    expect(targetOf(parseLayout({ prints: [print()] }, members)!).ppi).toBe(300);
  });
  it('puts a photograph in one print only, and only if it belongs to the composition', () => {
    const l = parseLayout({ prints: [print({ id: 1, photoId: 2 }), print({ id: 2, photoId: 2 }), print({ id: 3, photoId: 99 })] }, members)!;
    expect(l.prints.map((p) => p.photoId)).toEqual([2, null, null]);
    expect(chosenOf(l)).toEqual([2]);
  });
  it('cleans the frame: unknown colours fall back, and a frame smaller than its print becomes the print’s own size', () => {
    const l = parseLayout({ prints: [print({ size: 'A3', frame: { size: 'A4', color: 'pink', mat: 'purple' } }), print({ size: 'A4', frame: { size: 'A3', color: 'oak', mat: 'ivory' } })] }, members)!;
    expect(l.prints[0].frame).toEqual({ size: 'A3', color: 'black', mat: 'white' });
    expect(l.prints[1].frame).toEqual({ size: 'A3', color: 'oak', mat: 'ivory' });
    expect(fits('A3', 'A4')).toBe(true);
    expect(fits('A4', 'A3')).toBe(false);
  });
  it('gives prints unique ids, an unknown mode becomes a row, and positions are kept sane', () => {
    const l = parseLayout({ mode: 'sideways', prints: [print({ id: 5, x: 1e9, y: -1e9 }), print({ id: 5 })] }, members)!;
    expect(l.mode).toBe('row');
    expect(new Set(l.prints.map((p) => p.id)).size).toBe(2);
    expect(l.prints[0]).toMatchObject({ x: 20000, y: -20000 });
  });
  it('a stacked print holds two photographs, both counted as chosen; an unstacked one holds one', () => {
    const l = parseLayout({ prints: [print({ id: 1, stack: true, photoId: 1, photoId2: 2 }), print({ id: 2, stack: false, photoId: 3, photoId2: 2 })] }, members)!;
    expect(l.prints[0]).toMatchObject({ stack: true, photoId: 1, photoId2: 2 });
    expect(l.prints[1]).toMatchObject({ stack: false, photoId: 3, photoId2: null }); // a second photograph needs the stack
    expect(chosenOf(l)).toEqual([1, 2, 3]);
    const dup = parseLayout({ prints: [print({ stack: true, photoId: 1, photoId2: 1 })] }, members)!;
    expect(dup.prints[0].photoId2).toBeNull(); // the same photograph twice is one
  });
  it('derives a layout for an older composition, and says what the older fields would be', () => {
    const l = deriveLayout({ count: 3, size: 'A3', orientation: 'any' }, [7, 8], (id) => id === 8);
    expect(l.prints.map((p) => [p.size, p.orientation, p.photoId])).toEqual([['A3', 'landscape', 7], ['A3', 'portrait', 8], ['A3', 'landscape', null]]);
    expect(targetOf({ mode: 'row', prints: [print({ size: 'A3' }), print({ size: 'A3' }), print({ size: 'A4' })] as any })).toMatchObject({ count: 3, size: 'A3', orientation: 'portrait' });
    expect(targetOf({ mode: 'row', prints: [print({ size: '8×10″' }), print({ size: '8×10″', orientation: 'landscape' })] as any })).toMatchObject({ size: 'custom', widthMm: 203, heightMm: 254, orientation: 'any' });
  });
});

describe('a composition with a layout', () => {
  let env: Env, A: ReturnType<typeof api>, ids: number[], comp: number;
  const mk = (o: object = {}) => ({ id: 1, size: 'A4', orientation: 'landscape', frame: null, photoId: null, x: 0, y: 0, ...o });

  beforeAll(async () => {
    env = makeEnv(); A = api(env);
    (env.cfg as any).libraries = [env.lib];
    for (const [n, col] of [['a', '#336699'], ['b', '#993333'], ['c', '#339966'], ['d', '#996633']] as const) fs.writeFileSync(path.join(env.lib, `${n}.jpg`), await jpg(svg(900, 600, col, '#eeeeee', [0.3, 0.3])));
    await A.post('/api/library/scan?wait=1');
    ids = ((await A.get('/api/photos')).body.photos as any[]).sort((x, y) => x.file.localeCompare(y.file)).map((p) => p.id as number);
    comp = (await A.post('/api/collections', { name: 'Wall', photoIds: ids })).body.id;
  });
  afterAll(() => { env.app.close(); cleanup(env); });

  it('starts with a layout derived from nothing, and is not marked saved', async () => {
    const c = (await A.get(`/api/collections/${comp}`)).body;
    expect(c.layoutSaved).toBe(false);
    expect(c.layout.prints).toHaveLength(1);
  });

  it('stores a layout, keeps the chosen photographs in print order, and shows the older fields', async () => {
    const layout = { mode: 'feature', prints: [mk({ id: 1, size: 'A2', photoId: ids[2] }), mk({ id: 2, size: 'A5', orientation: 'portrait', photoId: null }), mk({ id: 3, size: 'A5', orientation: 'portrait', photoId: ids[0], frame: { size: 'A4', color: 'oak', mat: 'ivory' } })] };
    const c = (await A.patch(`/api/collections/${comp}`, { layout })).body;
    expect(c.layoutSaved).toBe(true);
    expect(c.chosenIds).toEqual([ids[2], ids[0]]); // in print order, skipping the empty print
    expect(c.layout.prints[2].frame).toEqual({ size: 'A4', color: 'oak', mat: 'ivory' });
    expect(c.target).toMatchObject({ count: 3, ppi: 300 });
    expect(c.photoIds.slice(0, 2)).toEqual([ids[2], ids[0]]); // the chosen come first
  });

  it('refuses a layout that is not valid, leaving the old one', async () => {
    expect((await A.patch(`/api/collections/${comp}`, { layout: { prints: [] } })).status).toBe(400);
    expect((await A.get(`/api/collections/${comp}`)).body.layout.prints).toHaveLength(3);
  });

  it('keeps both photographs of a stacked print in the chosen list, in order, and empties just the one that is taken out', async () => {
    const layout = { mode: 'row', prints: [mk({ id: 1, orientation: 'portrait', stack: true, photoId: ids[1], photoId2: ids[3] }), mk({ id: 2, photoId: ids[0] })] };
    const c = (await A.patch(`/api/collections/${comp}`, { layout })).body;
    expect(c.chosenIds).toEqual([ids[1], ids[3], ids[0]]);
    const after = (await A.del(`/api/collections/${comp}/photos/${ids[3]}`)).body;
    expect(after.layout.prints[0]).toMatchObject({ stack: true, photoId: ids[1], photoId2: null });
    expect(after.chosenIds).toEqual([ids[1], ids[0]]);
    await A.put(`/api/collections/${comp}/photos/${ids[3]}`);
    await A.patch(`/api/collections/${comp}`, { layout: { mode: 'feature', prints: [mk({ id: 1, size: 'A2', photoId: ids[2] }), mk({ id: 2, size: 'A5', orientation: 'portrait' }), mk({ id: 3, size: 'A5', orientation: 'portrait', photoId: ids[0], frame: { size: 'A4', color: 'oak', mat: 'ivory' } })] } }); // back to the layout the next tests expect
  });

  it('empties a print when its photograph is taken out of the composition', async () => {
    const c = (await A.del(`/api/collections/${comp}/photos/${ids[2]}`)).body;
    expect(c.layout.prints[0].photoId).toBeNull();
    expect(c.chosenIds).toEqual([ids[0]]);
  });

  it('still follows the older fields: a target resizes the prints, chosenIds fill them in order', async () => {
    await A.put(`/api/collections/${comp}/photos/${ids[2]}`);
    const c = (await A.patch(`/api/collections/${comp}`, { chosenIds: [ids[1], ids[2]] })).body;
    expect(c.layout.prints.map((p: any) => p.photoId)).toEqual([ids[1], ids[2], null]);
    const t = (await A.patch(`/api/collections/${comp}`, { target: { count: 2, size: 'A3', orientation: 'portrait', ppi: 300 } })).body;
    expect(t.layout.prints).toHaveLength(2);
    expect(t.layout.prints.every((p: any) => p.size === 'A3' && p.orientation === 'portrait')).toBe(true);
    expect(t.chosenIds).toEqual([ids[1], ids[2]]);
  });

  it('can be created with a layout, and one that is not valid creates nothing', async () => {
    const made = (await A.post('/api/collections', { name: 'Born with it', photoIds: ids, layout: { mode: 'row', prints: [mk({ id: 1, photoId: ids[3] }), mk({ id: 2, size: 'A3' })] } })).body;
    expect(made.layoutSaved).toBe(true);
    expect(made.chosenIds).toEqual([ids[3]]);
    const before = (await A.get('/api/collections')).body.length;
    expect((await A.post('/api/collections', { name: 'Bad', photoIds: ids, layout: { prints: [{ size: 'Z9' }] } })).status).toBe(400);
    expect((await A.get('/api/collections')).body.length).toBe(before);
  });
});
