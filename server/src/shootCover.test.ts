import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

let env: Env, ids: number[], shootId: number;
const patch = (payload: unknown) => env.app.inject({ method: 'PATCH', url: `/api/shoots/${shootId}`, payload: payload as any });
const cover = async () => ((await env.app.inject({ url: '/api/shoots' })).json() as any[]).find((s) => s.id === shootId).coverId;

beforeAll(async () => {
  env = makeEnv();
  for (const [i, n] of ['a', 'b', 'c'].entries()) fs.writeFileSync(path.join(env.lib, `${n}.jpg`), await jpg(svg(400, 300, '#223344', '#88aacc', [0.2 + i * 0.25, 0.5])));
  await env.app.inject({ method: 'POST', url: '/api/library/scan?wait=1' });
  ids = ((await env.app.inject({ url: '/api/photos' })).json().photos as any[]).map((p) => p.id).sort((x, y) => x - y);
  shootId = ((await env.app.inject({ method: 'POST', url: '/api/shoots', payload: { name: 'Cover', photoIds: ids } })).json() as any).id;
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('a shoot’s cover photograph', () => {
  it('is the highest rated photograph unless one is chosen', async () => {
    const rate = (id: number, rating: number) => env.db.prepare("INSERT INTO reviews(photo_id, session, run_id, date, rating, bin, note) VALUES(?, 1, 1, ?, ?, 0, '')").run(id, '2026-01-01', rating);
    expect(await cover()).toBe(ids[0]); // nothing rated yet: the first
    rate(ids[1], 3); rate(ids[2], 5);
    expect(await cover()).toBe(ids[2]);
    expect((await patch({ coverId: ids[1] })).statusCode).toBe(200);
    expect(await cover()).toBe(ids[1]);
    expect((await patch({ coverId: null })).statusCode).toBe(200);
    expect(await cover()).toBe(ids[2]); // back to automatic
  });
  it('refuses a photograph from another shoot or a wrong type', async () => {
    expect((await patch({ coverId: 99999 })).statusCode).toBe(400);
    expect((await patch({ coverId: 'x' })).statusCode).toBe(400);
  });
});
