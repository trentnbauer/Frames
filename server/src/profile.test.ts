import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, makeEnv, type Env } from './testutil.js';

/** A person's display name and picture, and what the portfolio shows of them. */
let env: Env;
const call = async (method: string, url: string, payload?: unknown) => {
  const r = await env.app.inject({ method: method as any, url, payload: payload as any });
  const json = String(r.headers['content-type'] ?? '').includes('json');
  return { status: r.statusCode, body: json ? r.json() : r.rawPayload, type: String(r.headers['content-type'] ?? '') };
};
beforeAll(() => { env = makeEnv(); });
afterAll(() => { env.app.close(); cleanup(env); });

describe('profile', () => {
  it('starts empty, and keeps a display name', async () => {
    expect((await call('GET', '/api/profile')).body).toMatchObject({ displayName: '', hasAvatar: false });
    expect((await call('PUT', '/api/profile', { displayName: '  Ada Lovelace  ' })).body.displayName).toBe('Ada Lovelace');
    expect((await call('GET', '/api/me')).body).toMatchObject({ displayName: 'Ada Lovelace', hasAvatar: false });
    expect((await call('PUT', '/api/profile', { displayName: 42 })).status).toBe(400);
  });
  it('turns a picture into a small square JPEG, and refuses anything else', async () => {
    const png = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#c0392b' } }).png().toBuffer();
    const r = await call('PUT', '/api/profile/avatar', { image: `data:image/png;base64,${png.toString('base64')}` });
    expect(r.body.hasAvatar).toBe(true);
    const got = await call('GET', '/api/profile/avatar');
    expect(got.type).toContain('image/jpeg');
    const meta = await sharp(got.body as Buffer).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([256, 256, 'jpeg']);
    expect((await call('PUT', '/api/profile/avatar', { image: 'data:image/png;base64,AAAA' })).status).toBe(400); // not a picture
    expect((await call('PUT', '/api/profile/avatar', { image: 'data:text/html;base64,PGI+' })).status).toBe(400);
    expect((await call('PUT', '/api/profile/avatar', { image: 7 })).status).toBe(400);
  });
  it('is what the public portfolio shows, ahead of a name typed in the portfolio settings', async () => {
    const col = (await call('POST', '/api/collections', { name: 'Portfolio' })).body;
    await call('PUT', '/api/portfolio', { collectionId: col.id, enabled: true, photographerName: 'Old Typed Name' });
    const cfg = (await call('GET', '/portfolio/config.json')).body;
    expect(cfg).toMatchObject({ photographerName: 'Ada Lovelace', avatar: 'avatar.jpg' });
    const pic = await call('GET', '/portfolio/avatar.jpg');
    expect(pic.status).toBe(200);
    expect(pic.type).toContain('image/jpeg');
  });
  it('can be removed, and the portfolio falls back', async () => {
    expect((await call('DELETE', '/api/profile/avatar')).body.hasAvatar).toBe(false);
    expect((await call('GET', '/portfolio/avatar.jpg')).status).toBe(404);
    await call('PUT', '/api/profile', { displayName: '' });
    expect((await call('GET', '/portfolio/config.json')).body).toMatchObject({ photographerName: 'Old Typed Name', avatar: '' });
  });
});
