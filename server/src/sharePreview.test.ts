import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

/** What a pasted share link shows (name and one picture), and what it never shows. */
process.env.TURNSTILE_DELAY_SECONDS = '0';
let env: Env, open: string, pinned: string, stopped: string, photoLink: string;
const get = (url: string) => env.app.inject({ url });
const post = async (url: string, payload: unknown, method: 'POST' | 'PATCH' | 'PUT' = 'POST') => (await env.app.inject({ method, url, payload: payload as any })).json();

beforeAll(async () => {
  const web = path.join(fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'frames-web-')), 'web');
  fs.mkdirSync(web);
  fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><html><head><title>Frames</title></head><body><div id="root"></div></body></html>');
  env = makeEnv({ webDir: web });
  fs.writeFileSync(path.join(env.lib, 'a.jpg'), await jpg(svg(800, 500, '#223344', '#88aacc', [0.3, 0.5])));
  await env.app.inject({ method: 'POST', url: '/api/library/scan?wait=1' });
  const photo = (await get('/api/photos')).json().photos[0];
  const shoot = (await post('/api/shoots', { name: 'Coastal <Light> & "more"', photoIds: [photo.id] }));
  open = (await post('/api/shares', { kind: 'shoot', id: shoot.id })).token;
  pinned = (await post('/api/shares', { kind: 'shoot', id: shoot.id, pin: '4827' })).token;
  const gone = await post('/api/shares', { kind: 'shoot', id: shoot.id });
  stopped = gone.token;
  await env.app.inject({ method: 'PATCH', url: `/api/shares/${gone.id}`, payload: { on: false } });
  photoLink = (await post('/api/shares', { kind: 'photo', id: photo.id })).token;
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('the address of a share link, as an app sees it', () => {
  it('names the shoot and points at one picture, with the name made safe', async () => {
    const page = await get(`/s/${open}`);
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('property="og:title" content="Coastal &lt;Light&gt; &amp; &quot;more&quot;"');
    expect(page.body).toMatch(new RegExp(`property="og:image" content="http://[^"]+/s/${open}/preview.jpg"`));
    expect(page.body).toContain('1 photograph');
    expect(page.body).toContain('<div id="root">'); // the page itself still starts the app
    expect(page.body).not.toContain('<Light>');
    expect((await get(`/s/${open}/preview.jpg`)).statusCode).toBe(200);
  });
  it('previews a single photograph link too', async () => {
    expect((await get(`/s/${photoLink}`)).body).toContain('A photograph shared with you');
    expect((await get(`/s/${photoLink}/preview.jpg`)).statusCode).toBe(200);
  });
  it('says nothing about a link with a PIN, a stopped link or one that does not exist', async () => {
    for (const t of [pinned, stopped, 'doesnotexistdoesnotexist']) {
      const page = await get(`/s/${t}`);
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain('Shared photographs');
      expect(page.body).not.toContain('og:image');
      expect(page.body).not.toContain('Coastal');
      expect((await get(`/s/${t}/preview.jpg`)).statusCode).toBe(404);
    }
  });
  it('is still reachable, and the data behind the link still asks for the check, when Turnstile is on', async () => {
    const r = await env.app.inject({ method: 'PUT', url: '/api/admin/turnstile', payload: { enabled: true, siteKey: 'site-key', secret: 'the-secret-value' } });
    expect(r.statusCode).toBe(200);
    expect((await get(`/s/${open}`)).body).toContain('og:image');
    expect((await get(`/s/${open}/preview.jpg`)).statusCode).toBe(200);
    expect((await get(`/api/s/${open}`)).statusCode).toBe(403);
  });
});
