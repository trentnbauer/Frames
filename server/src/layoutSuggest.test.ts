import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, makeEnv, type Env } from './testutil.js';

/** A guest suggests a different layout; the photographer sees it apart from the composition and clears it. */
let env: Env;
let colId: number, token: string, shut: string;
const call = async (method: string, url: string, payload?: unknown) => {
  const r = await env.app.inject({ method: method as any, url, payload: payload as any });
  return { status: r.statusCode, body: String(r.headers['content-type'] ?? '').includes('json') ? r.json() : r.body };
};
const print = (id: number, size = 'A4', extra: object = {}) => ({ id, size, orientation: 'portrait', frame: null, photoId: null, stack: false, photoId2: null, x: 0, y: 0, ...extra });

beforeAll(async () => {
  env = makeEnv();
  colId = (await call('POST', '/api/collections', { name: 'Hall' })).body.id;
  token = (await call('POST', '/api/shares', { kind: 'collection', id: colId, allowReview: true })).body.token;
  shut = (await call('POST', '/api/shares', { kind: 'collection', id: colId, allowReview: false })).body.token;
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('layout suggestions from a guest', () => {
  it('are kept apart from the composition and shown to the photographer', async () => {
    const before = (await call('GET', `/api/collections/${colId}`)).body.layout;
    const layout = { mode: 'row', prints: [print(1, 'A3', { frame: { size: 'A2', mat: 'ivory', color: 'oak' }, photoId: 99 }), print(2, 'A5'), print(3, 'A5')] };
    expect((await call('POST', `/api/s/${token}/layout`, { reviewer: 'Ann', layout, note: 'Bigger in the middle' })).status).toBe(200);
    const list = (await call('GET', `/api/collections/${colId}/layout-suggestions`)).body.suggestions;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ by: 'Ann', note: 'Bigger in the middle' });
    expect(list[0].layout.prints.map((p: any) => p.size)).toEqual(['A3', 'A5', 'A5']);
    expect(list[0].layout.prints.every((p: any) => p.photoId === null && p.photoId2 === null)).toBe(true); // photographs never come with it
    expect((await call('GET', `/api/collections/${colId}`)).body.layout).toEqual(before); // the composition itself is untouched
  });
  it('are one per person: a second replaces the first, and null takes it back', async () => {
    await call('POST', `/api/s/${token}/layout`, { reviewer: 'Ann', layout: { mode: 'row', prints: [print(1, 'A2')] } });
    let list = (await call('GET', `/api/collections/${colId}/layout-suggestions`)).body.suggestions;
    expect(list).toHaveLength(1);
    expect(list[0].layout.prints).toHaveLength(1);
    await call('POST', `/api/s/${token}/layout`, { reviewer: 'Bob', layout: { mode: 'grid', prints: [print(1), print(2)] } });
    expect((await call('GET', `/api/collections/${colId}/layout-suggestions`)).body.suggestions).toHaveLength(2);
    await call('POST', `/api/s/${token}/layout`, { reviewer: 'Bob', layout: null });
    list = (await call('GET', `/api/collections/${colId}/layout-suggestions`)).body.suggestions;
    expect(list.map((s: any) => s.by)).toEqual(['Ann']);
  });
  it('are refused when they make no sense, without wiping an earlier good one', async () => {
    for (const layout of [{ mode: 'row', prints: [] }, { mode: 'row', prints: [print(1, 'A9')] }, { mode: 'row', prints: Array.from({ length: 13 }, (_, i) => print(i + 1)) }, 'x', { mode: 'row' }]) {
      expect((await call('POST', `/api/s/${token}/layout`, { reviewer: 'Ann', layout })).status, JSON.stringify(layout).slice(0, 40)).toBe(400);
    }
    expect((await call('GET', `/api/collections/${colId}/layout-suggestions`)).body.suggestions[0].layout.prints).toHaveLength(1);
  });
  it('need a link that allows suggestions, and a composition', async () => {
    expect((await call('POST', `/api/s/${shut}/layout`, { reviewer: 'Ann', layout: { mode: 'row', prints: [print(1)] } })).status).toBe(403);
    expect((await call('POST', '/api/s/aaaaaaaaaaaaaaaaaaaaaaaa/layout', { layout: null })).status).toBe(404);
    const shoot = (await call('POST', '/api/shoots', { name: 'Day' })).body;
    const st = (await call('POST', '/api/shares', { kind: 'shoot', id: shoot.id, allowReview: true })).body.token;
    expect((await call('POST', `/api/s/${st}/layout`, { reviewer: 'Ann', layout: { mode: 'row', prints: [print(1)] } })).status).toBe(400);
  });
  it('can be cleared by the photographer, and only for their own composition', async () => {
    const id = (await call('GET', `/api/collections/${colId}/layout-suggestions`)).body.suggestions[0].id;
    const other = (await call('POST', '/api/collections', { name: 'Other' })).body.id;
    expect((await call('DELETE', `/api/collections/${other}/layout-suggestions/${id}`)).body.removed).toBe(0);
    expect((await call('DELETE', `/api/collections/${colId}/layout-suggestions/${id}`)).body.removed).toBe(1);
    expect((await call('GET', `/api/collections/${colId}/layout-suggestions`)).body.suggestions).toEqual([]);
  });
});

describe('frame colour suggestions from a guest', () => {
  let tk: string, cid: number;
  beforeAll(async () => {
    cid = (await call('POST', '/api/collections', { name: 'Frames', layout: { mode: 'row', prints: [print(1, 'A3', { frame: { size: 'A2', mat: 'white', color: 'black' } }), print(2, 'A4')] } })).body.id;
    tk = (await call('POST', '/api/shares', { kind: 'collection', id: cid, allowReview: true })).body.token;
  });
  it('are grouped for the photographer, and only while they differ from the frame today', async () => {
    expect((await call('POST', `/api/s/${tk}/frame`, { reviewer: 'Ann', printId: 1, color: 'oak' })).status).toBe(200);
    expect((await call('POST', `/api/s/${tk}/frame`, { reviewer: 'Bob', printId: 1, color: 'oak' })).status).toBe(200);
    expect((await call('POST', `/api/s/${tk}/frame`, { reviewer: 'Cy', printId: 1, color: 'black' })).status).toBe(200); // same as now: not shown
    const list = (await call('GET', `/api/collections/${cid}/frame-suggestions`)).body.suggestions;
    expect(list).toEqual([{ printId: 1, color: 'oak', by: ['Ann', 'Bob'] }]);
    expect((await call('GET', `/api/collections/${colId}/frame-suggestions`)).body.suggestions).toEqual([]); // another composition
  });
  it('can be taken back, and are refused when they make no sense', async () => {
    await call('POST', `/api/s/${tk}/frame`, { reviewer: 'Bob', printId: 1, color: null });
    expect((await call('GET', `/api/collections/${cid}/frame-suggestions`)).body.suggestions[0].by).toEqual(['Ann']);
    for (const b of [{ printId: 2, color: 'oak' }, { printId: 9, color: 'oak' }, { printId: 1, color: 'neon' }, { printId: 1, color: 'none' }, { printId: 1, color: 4 }]) {
      expect((await call('POST', `/api/s/${tk}/frame`, { reviewer: 'Ann', ...b })).status, JSON.stringify(b)).toBe(400); // print 2 has no frame
    }
    expect((await call('GET', `/api/collections/${cid}/frame-suggestions`)).body.suggestions[0].by).toEqual(['Ann']); // nothing wiped
    expect((await call('POST', `/api/s/${shut}/frame`, { reviewer: 'Ann', printId: 1, color: 'oak' })).status).toBe(403);
  });
  it('can be dismissed by the photographer', async () => {
    expect((await call('DELETE', `/api/collections/${cid}/frame-suggestions?printId=1&color=oak`)).body.removed).toBe(1);
    expect((await call('GET', `/api/collections/${cid}/frame-suggestions`)).body.suggestions).toEqual([]);
  });
});
