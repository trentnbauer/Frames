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

  it('turned on, it refuses uploads with the reason, says so to the app, and makes smaller copies required', async () => {
    expect((await A.put('/api/admin/instance', { cloudOnly: true })).body).toMatchObject({ cloudOnly: true });
    const r = await upload();
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatch(/cloud storage/);
    expect((await A.get('/api/me')).body.cloudOnly).toBe(true);
    expect((await A.get('/api/cloud')).body.shrinkEnforced).toBe(true);
  });

  it('only a true or false changes it, and turning it off brings uploads back', async () => {
    expect((await A.put('/api/admin/instance', { cloudOnly: 'yes' })).body).toMatchObject({ cloudOnly: true }); // not a boolean: ignored
    expect((await A.put('/api/admin/instance', { cloudOnly: false })).body).toMatchObject({ cloudOnly: false });
    expect((await A.get('/api/cloud')).body.shrinkEnforced).toBe(true); // original quality is off by default: smaller copies
    await A.put('/api/admin/instance', { storeOriginalQuality: true });
    expect((await A.get('/api/cloud')).body.shrinkEnforced).toBe(false);
    expect((await upload()).statusCode).toBe(200);
  });
});
