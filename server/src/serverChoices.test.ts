import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>;
beforeAll(() => { env = makeEnv(); A = api(env); });
afterAll(() => { env.app.close(); cleanup(env); });

describe('cloud original resolution', () => {
  it('is off for everyone by default (Cloud storage, Store original quality); once an administrator turns it on it is each person\'s choice', async () => {
    expect((await A.get('/api/cloud/resolution')).body).toMatchObject({ saveOriginal: false, want: true, lockedByAdmin: true, shrunkCount: 0 });
    expect((await A.post('/api/cloud/resolution/fetch', {})).status).toBe(400); // locked: nothing to fetch
    expect((await A.put('/api/admin/cloud-originals', { allow: true })).body).toEqual({ allow: true });
    expect((await A.get('/api/admin/instance')).body).toMatchObject({ cloudOrig: true });
    expect((await A.get('/api/cloud/resolution')).body).toMatchObject({ saveOriginal: true, want: true, lockedByAdmin: false });
    expect((await A.put('/api/cloud/resolution', { saveOriginal: false })).body).toMatchObject({ saveOriginal: false, want: false });
    expect((await A.put('/api/cloud/resolution', { saveOriginal: 'yes' })).status).toBe(400);
    await A.put('/api/cloud/resolution', { saveOriginal: true });
    expect((await A.put('/api/admin/cloud-originals', { allow: false })).body).toEqual({ allow: false });
    expect((await A.get('/api/cloud/resolution')).body).toMatchObject({ saveOriginal: false, want: true, lockedByAdmin: true });
    await A.put('/api/admin/cloud-originals', { allow: true }); // the next test needs it unlocked
  });
  it('counts what is kept smaller, and fetch starts only when there is a connection to run', async () => {
    env.db.prepare("INSERT OR IGNORE INTO cloud_files (conn_id, remote_id, rel, version, size, synced, shrunk, orig_size, orig_w, orig_h, remote_name) VALUES ('c1', 'r1', 'a.jpg', 'v1', 1000, '2026-01-01', 1, 5000, 100, 100, 'a.jpg')").run();
    expect((await A.get('/api/cloud/resolution')).body).toMatchObject({ shrunkCount: 1, shrunkBytes: 4000 });
    const r = await A.post('/api/cloud/resolution/fetch', {});
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ started: true, connections: 0 });
  });
});

describe('where sidecars go', () => {
  it('is a server-wide choice between next to the photo and a Frames folder', async () => {
    expect((await A.get('/api/admin/xmp-location')).body).toEqual({ location: 'next' });
    expect((await A.put('/api/admin/xmp-location', { location: 'folder' })).body).toEqual({ location: 'folder' });
    expect((await A.put('/api/admin/xmp-location', { location: 'sideways' })).status).toBe(400);
    expect((await A.get('/api/admin/xmp-location')).body).toEqual({ location: 'folder' });
  });
});
