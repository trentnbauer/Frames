import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';

/** The administrator can require originals to live in cloud storage: no uploads, and cloud photographs kept only as smaller copies. */
let env: Env, A: ReturnType<typeof api>, data: Buffer;
const upload = () => {
  const boundary = '----frames-test';
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="up.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return env.app.inject({ method: 'POST', url: '/api/upload', payload: Buffer.concat([head, data, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
};

beforeAll(async () => { env = makeEnv(); A = api(env); data = await jpg(svg(800, 600, '#336699', '#eeeeee', [0.3, 0.3])); });
afterAll(() => { env.app.close(); cleanup(env); });

describe('requiring originals to be kept in cloud storage', () => {
  it('is off by default: uploads work, and nobody is told to use the cloud', async () => {
    expect((await A.get('/api/admin/instance')).body).toMatchObject({ cloudOnly: false });
    expect((await A.get('/api/me')).body.cloudOnly).toBe(false);
    expect((await upload()).statusCode).toBe(200);
  });

  it('turned on (Local storage off), it refuses uploads with the reason and says so to the app', async () => {
    expect((await A.put('/api/admin/instance', { cloudOnly: true })).body).toMatchObject({ cloudOnly: true });
    const r = await upload();
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatch(/cloud storage/);
    expect((await A.get('/api/me')).body.cloudOnly).toBe(true);
    expect((await A.get('/api/admin/instance')).body).toMatchObject({ localOn: false, cloudOn: true });
    expect((await A.get('/api/config/status')).body.storage.local).toBe(false);
  });

  it('only a true or false changes it, and turning it off brings uploads back', async () => {
    expect((await A.put('/api/admin/instance', { cloudOnly: 'yes' })).body).toMatchObject({ cloudOnly: true }); // not a boolean: ignored
    expect((await A.put('/api/admin/instance', { cloudOnly: false })).body).toMatchObject({ cloudOnly: false });
    expect((await A.get('/api/admin/instance')).body).toMatchObject({ localOn: true });
    await A.put('/api/admin/instance', { cloudOrig: false });
    expect((await A.get('/api/cloud')).body.shrinkEnforced).toBe(true); // Cloud storage, Store original quality off: smaller copies
    await A.put('/api/admin/instance', { cloudOrig: true });
    expect((await A.get('/api/cloud')).body.shrinkEnforced).toBe(false);
    expect((await upload()).statusCode).toBe(200);
  });
});

describe('the storage switches', () => {
  it('Local storage off stops library folders being read, and Cloud storage off refuses a connection and a sync', async () => {
    env = makeEnv(); const B = api(env);
    fs.writeFileSync(path.join(env.lib, 'one.jpg'), data);
    expect((await B.get('/api/config/status')).body.storage).toMatchObject({ local: true });
    await B.put('/api/admin/instance', { localOn: false });
    expect((await B.post('/api/library/scan?wait=1')).body).toMatchObject({ imported: 0 }); // the folder is not read
    await B.put('/api/admin/instance', { localOn: true });
    expect((await B.post('/api/library/scan?wait=1')).body).toMatchObject({ imported: 1 });
    await B.put('/api/admin/instance', { cloudOn: false });
    expect((await B.post('/api/cloud/connect/google')).status).toBe(403);
    expect((await B.get('/api/config/status')).body.storage.cloud).toBe(false);
    for (const [k, v] of [['localPx', 2048], ['cloudPx', 6144], ['localQ', 70], ['cloudQ', 95]] as const) expect((await B.put('/api/admin/instance', { [k]: v })).body[k]).toBe(v);
    for (const [k, v] of [['localPx', 1000], ['cloudQ', 12]] as const) expect((await B.put('/api/admin/instance', { [k]: v })).body[k]).not.toBe(v); // only the offered values
    cleanup(env);
  });
});
