import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import { isWeakPin, randomPin } from './routes/share.js';
import { jpg, svg } from './testutil.js';

/** The link PIN: the only 4-number PIN in Frames. An optional lock on a share link. */
let tmp: string, app: ReturnType<typeof buildApp>, token: string, id: number;
const owner = { authorization: 'Basic ' + Buffer.from('me:pw').toString('base64') };
const call = (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) => app.inject({ method: method as any, url, payload: payload as any, headers });
const own = (method: string, url: string, payload?: unknown) => call(method, url, payload, owner);
const cookies = (r: { headers: Record<string, any> }) => ([] as string[]).concat(r.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-pin-'));
  const lib = path.join(tmp, 'lib');
  fs.mkdirSync(lib);
  fs.writeFileSync(path.join(lib, 'a.jpg'), await jpg(svg(600, 400, '#223344', '#88aacc', [0.3, 0.5])));
  app = buildApp(openDb(path.join(tmp, 'data')), { libraries: [lib], dataDir: path.join(tmp, 'data'), authUser: 'me', authPassword: 'pw' });
  await own('POST', '/api/library/scan?wait=1');
  const photos = (await own('GET', '/api/photos')).json().photos as any[];
  const c = (await own('POST', '/api/collections', { name: 'Locked', photoIds: [photos[0].id] })).json();
  const s = (await own('POST', '/api/shares', { kind: 'collection', id: c.id, allowReview: true, pin: true })).json();
  token = s.token; id = s.id;
});
afterAll(() => { app.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

describe('PIN rules', () => {
  it('never makes, or accepts, four of a kind or a straight run', () => {
    for (const bad of ['1111', '0000', '1234', '4321', '9876', '0123', '6789']) expect(isWeakPin(bad), bad).toBe(true);
    for (const ok of ['1357', '2468', '1212', '4829']) expect(isWeakPin(ok), ok).toBe(false);
    for (let i = 0; i < 500; i++) expect(isWeakPin(randomPin())).toBe(false);
    for (let i = 0; i < 200; i++) expect(randomPin()).toMatch(/^\d{4}$/);
  });
  it('switching it on makes a random PIN; it can be edited, renewed and removed', async () => {
    const list = (await own('GET', '/api/shares')).json();
    const mine = list.find((s: any) => s.id === id);
    expect(mine.pin).toMatch(/^\d{4}$/);
    expect((await own('PATCH', `/api/shares/${id}`, { pin: '1234' })).statusCode).toBe(400);
    expect((await own('PATCH', `/api/shares/${id}`, { pin: 'abcd' })).statusCode).toBe(400);
    expect((await own('PATCH', `/api/shares/${id}`, { pin: '2468' })).json().pin).toBe('2468');
    const renewed = (await own('PATCH', `/api/shares/${id}`, { pin: true })).json().pin;
    expect(renewed).toMatch(/^\d{4}$/);
    expect((await own('PATCH', `/api/shares/${id}`, { pin: '' })).json().pin).toBe('');
    await own('PATCH', `/api/shares/${id}`, { pin: '2468' });
  });
});

describe('the gate', () => {
  it('hides everything behind the PIN, and says only that a PIN is needed', async () => {
    const g = (await call('GET', `/api/s/${token}/gate`)).json();
    expect(g).toMatchObject({ pinRequired: true, lockedFor: 0 });
    const r = await call('GET', `/api/s/${token}`);
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ pinRequired: true });
    expect(JSON.stringify(r.json())).not.toContain('Locked'); // not even the name
    expect((await call('GET', `/api/s/${token}/photos/1/thumb`)).statusCode).toBe(401);
  });
  it('opens with the right PIN, for that device only, and signs everyone out when the PIN changes', async () => {
    const first = await call('GET', `/api/s/${token}/gate`);
    const dev = cookies(first);
    const ok = await call('POST', `/api/s/${token}/pin`, { pin: '2468' }, { cookie: dev });
    expect(ok.statusCode).toBe(200);
    const both = `${dev}; ${cookies(ok)}`;
    expect((await call('GET', `/api/s/${token}`, undefined, { cookie: both })).statusCode).toBe(200);
    expect((await call('GET', `/api/s/${token}`)).statusCode).toBe(401); // another device is still locked out
    await own('PATCH', `/api/shares/${id}`, { pin: '1357' });
    expect((await call('GET', `/api/s/${token}`, undefined, { cookie: both })).statusCode).toBe(401);
    await own('PATCH', `/api/shares/${id}`, { pin: '2468' });
  });
  it('locks the link on a device after five wrong tries, even for the right PIN', async () => {
    const dev = cookies(await call('GET', `/api/s/${token}/gate`));
    for (let i = 0; i < 4; i++) {
      const r = await call('POST', `/api/s/${token}/pin`, { pin: '9999' }, { cookie: dev });
      expect(r.statusCode).toBe(400);
      expect(r.json().triesLeft).toBe(4 - i);
    }
    const fifth = await call('POST', `/api/s/${token}/pin`, { pin: '9999' }, { cookie: dev });
    expect(fifth.json()).toMatchObject({ triesLeft: 0 });
    expect(fifth.json().lockedFor).toBeGreaterThan(14 * 60);
    expect((await call('POST', `/api/s/${token}/pin`, { pin: '2468' }, { cookie: dev })).statusCode).toBe(429);
    expect((await call('GET', `/api/s/${token}/gate`, undefined, { cookie: dev })).json().lockedFor).toBeGreaterThan(0);
    // A different device is not affected.
    const other = cookies(await call('GET', `/api/s/${token}/gate`));
    expect((await call('POST', `/api/s/${token}/pin`, { pin: '2468' }, { cookie: other })).statusCode).toBe(200);
  });
  it('a link with no PIN opens as before, and "suggest" can be turned off apart from rating', async () => {
    const photos = (await own('GET', '/api/photos')).json().photos as any[];
    const c = (await own('POST', '/api/collections', { name: 'Open', photoIds: [photos[0].id] })).json();
    const s = (await own('POST', '/api/shares', { kind: 'collection', id: c.id, allowReview: true, allowSuggest: false })).json();
    expect(s.pin).toBe('');
    expect((await call('GET', `/api/s/${s.token}`)).statusCode).toBe(200);
    expect((await call('POST', `/api/s/${s.token}/suggest`, { forId: photos[0].id, photoId: null })).statusCode).toBe(403);
    expect((await own('PATCH', `/api/shares/${s.id}`, { on: false })).json().status).toBe('revoked');
    expect((await call('GET', `/api/s/${s.token}`)).statusCode).toBe(410);
    expect((await own('PATCH', `/api/shares/${s.id}`, { on: true })).json().status).toBe('active');
  });
});
