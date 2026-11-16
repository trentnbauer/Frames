import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import { jpg, svg } from './testutil.js';

/** A share link for a single photograph. */
let tmp: string, app: ReturnType<typeof buildApp>, shared: number, other: number, token: string;
const owner = { authorization: 'Basic ' + Buffer.from('me:pw').toString('base64') };
const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as any, headers: owner });

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-share-photo-'));
  const lib = path.join(tmp, 'lib'), web = path.join(tmp, 'web');
  fs.mkdirSync(lib); fs.mkdirSync(web);
  fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><title>Frames</title>');
  for (const [i, n] of ['a', 'b'].entries()) fs.writeFileSync(path.join(lib, `${n}.jpg`), await jpg(svg(600, 400, '#223344', '#88aacc', [0.2 + i * 0.4, 0.5])));
  app = buildApp(openDb(path.join(tmp, 'data')), { libraries: [lib], dataDir: path.join(tmp, 'data'), authUser: 'me', authPassword: 'pw', webDir: web });
  await app.inject({ method: 'POST', url: '/api/library/scan?wait=1', headers: owner });
  const photos = (await app.inject({ url: '/api/photos', headers: owner })).json().photos as { id: number }[];
  [shared, other] = [photos[0].id, photos[1].id];
  token = (await post('/api/shares', { kind: 'photo', id: shared, allowReview: true, allowDownload: false })).json().token;
});
afterAll(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

describe('sharing one photograph', () => {
  it('opens exactly that photograph, with no other photos and nothing private', async () => {
    const guest = (await app.inject({ url: `/api/s/${token}` })).json();
    expect(guest.kind).toBe('photo');
    expect(guest.photos.map((p: { id: number }) => p.id)).toEqual([shared]);
    expect(JSON.stringify(guest)).not.toMatch(/path|lat|lon|camera/i);
    expect((await app.inject({ url: `/api/s/${token}/photos/${shared}/preview` })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/s/${token}/photos/${other}/preview` })).statusCode).toBe(404);
  });
  it('is listed for that photograph only, and refuses a photograph that does not exist', async () => {
    expect((await app.inject({ url: `/api/shares?kind=photo&id=${shared}`, headers: owner })).json()).toHaveLength(1);
    expect((await app.inject({ url: `/api/shares?kind=photo&id=${other}`, headers: owner })).json()).toHaveLength(0);
    expect((await post('/api/shares', { kind: 'photo', id: 99999 })).statusCode).toBe(404);
    expect((await post('/api/shares', { kind: 'album', id: shared })).statusCode).toBe(400);
  });
  it('stops working when the photograph is removed from Frames', async () => {
    expect((await post('/api/photos/remove', { ids: [shared], originals: 'keep' })).statusCode).toBe(200);
    expect([404, 410]).toContain((await app.inject({ url: `/api/s/${token}` })).statusCode);
  });
});
