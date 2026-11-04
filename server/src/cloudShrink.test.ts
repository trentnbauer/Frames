import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

/** Keeping only a smaller copy of cloud photographs, and fetching the original from the cloud when it is exported. */
type Node = { id: string; name: string; data: Buffer; version: string };
let nodes: Node[] = [];
const hits = { downloads: 0 };
let srv: http.Server, base = '', env: Env, A: ReturnType<typeof api>;

// A noisy picture saved at full quality: big, and a lot smaller at quality 80.
const noisy = async (w: number, h: number) => {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (Math.sin(i * 0.0007) * 80 + 128 + Math.random() * 60) & 255;
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
};
const send = (res: http.ServerResponse, code: number, body: unknown, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body)); };

beforeAll(async () => {
  srv = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    const p = url.pathname;
    if (p === '/google/token') { req.resume(); return send(res, 200, { access_token: 'acc-1', expires_in: 3600, refresh_token: 'REFRESH' }); }
    if (p === '/google/api/about') return send(res, 200, { user: { emailAddress: 'me@gmail.test' } });
    if (p === '/google/api/files') return send(res, 200, { files: nodes.map((n) => ({ id: n.id, name: n.name, mimeType: 'image/jpeg', size: String(n.data.length), md5Checksum: n.version })) });
    const f = /^\/google\/api\/files\/([^/]+)$/.exec(p);
    const node = f && nodes.find((n) => n.id === f[1]);
    if (node) { hits.downloads++; return send(res, 200, node.data, 'image/jpeg'); }
    send(res, 404, {});
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  env = makeEnv({ cloudBase: base }); A = api(env);
});
afterAll(() => { env.app.close(); srv.close(); cleanup(env); });

const connect = async () => {
  await A.put('/api/cloud/client/google', { clientId: 'CID', clientSecret: 'S' });
  const r = await A.post('/api/cloud/connect/google');
  const state = new URL(r.body.url).searchParams.get('state');
  await A.get(`/api/cloud/callback?code=GOODCODE&state=${state}`);
  const id = (await A.get('/api/cloud')).body.connections[0].id as string;
  await A.put(`/api/cloud/${id}`, { folderId: 'root', folderName: '' });
  return id;
};
const sync = async (id: string) => (await A.post(`/api/cloud/${id}/sync?wait=1`)).body;
/** A sync starts a scan of its own in the background: wait for it, then scan once more to be sure. */
const settle = async () => { for (let i = 0; i < 100 && (await A.get('/api/library/scan/status')).body.running; i++) await new Promise((r) => setTimeout(r, 100)); await A.scan(); };
const photoByFile = async (file: string) => ((await A.get('/api/photos')).body.photos as any[]).find((p) => p.file === file);

describe('keeping a smaller copy of cloud photographs', () => {
  let big: Buffer, id = '', dir = '';
  beforeAll(async () => { big = await noisy(1600, 1200); nodes = [{ id: 'f1', name: 'Beach At Dawn.jpg', data: big, version: 'v1' }, { id: 'f2', name: 'tiny.jpg', data: await jpg(svg(300, 200, '#336699', '#336699', [0.5, 0.5])), version: 'v1' }]; id = await connect(); dir = path.join(env.data, 'cloud', id); });

  it('by default copies every photograph whole', async () => {
    const r = await sync(id);
    expect(r.downloaded).toBe(2);
    expect(fs.statSync(path.join(dir, 'Beach At Dawn.jpg')).size).toBe(big.length);
    await settle();
    expect((await photoByFile('Beach At Dawn.jpg')).w).toBe(1600);
  });

  it('once switched on, the next sync makes the copies already here smaller, only where the original is still the same in the cloud, and keeps the photograph', async () => {
    nodes.find((n) => n.id === 'f2')!.version = 'v2'; // changed online since: not touched
    const before = (await photoByFile('Beach At Dawn.jpg')).id;
    expect((await A.put(`/api/cloud/${id}`, { shrink: true })).body.connections[0].shrink).toBe(true);
    const r = await sync(id);
    expect(r.shrunk).toBe(1);
    expect(r.freed).toBeGreaterThan(big.length * 0.1);
    expect(r.changedRemotely).toBe(1);
    const small = fs.statSync(path.join(dir, 'Beach At Dawn.jpg')).size;
    expect(small).toBeLessThan(big.length * 0.9);
    // The same photograph (reviews and tags are kept), with the same pixels, its record following the new file.
    const p = await photoByFile('Beach At Dawn.jpg');
    expect(p.id).toBe(before);
    expect(p).toMatchObject({ w: 1600, h: 1200 });
    expect(env.db.prepare('SELECT size_bytes FROM photos WHERE id = ?').get(p.id)).toEqual({ size_bytes: small });
    const meta = await sharp(path.join(dir, 'Beach At Dawn.jpg')).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 1200]); // quality, not size
    expect(env.db.prepare('SELECT shrunk, orig_size, orig_w, orig_h, remote_name FROM cloud_files WHERE remote_id = ?').get('f1')).toEqual({ shrunk: 1, orig_size: big.length, orig_w: 1600, orig_h: 1200, remote_name: 'Beach At Dawn.jpg' });
    await settle(); // a scan does not mistake it for a new or edited photograph
    expect((await photoByFile('Beach At Dawn.jpg')).id).toBe(before);
  });

  it('exporting fetches the full-size original from the cloud, by its own name, through the same download', async () => {
    const p = await photoByFile('Beach At Dawn.jpg');
    const d0 = hits.downloads;
    const r = await A.raw('GET', `/api/photos/${p.id}/original?n=3&pad=2`);
    expect(r.status).toBe(200);
    expect(Buffer.from(r.body as Buffer).equals(big)).toBe(true); // byte for byte the original
    expect(String(r.headers['content-disposition'])).toContain('03_Beach At Dawn.jpg');
    expect(String(r.headers['cache-control'])).toBe('no-store');
    expect(hits.downloads).toBe(d0 + 1);
    // A photograph that was not made smaller is served from Frames, with no call to the cloud.
    const t = await photoByFile('tiny.jpg');
    const d1 = hits.downloads;
    expect((await A.raw('GET', `/api/photos/${t.id}/original`)).status).toBe(200);
    expect(hits.downloads).toBe(d1);
  });

  it('new photographs are made smaller as they come in, and the print check keeps the original pixels', async () => {
    nodes.push({ id: 'f3', name: 'New Roll 01.jpg', data: await noisy(2000, 1000), version: 'v1' });
    const r = await sync(id);
    expect(r.downloaded).toBe(1);
    expect(r.shrunk).toBe(1);
    await settle();
    expect(await photoByFile('New Roll 01.jpg')).toMatchObject({ w: 2000, h: 1000 });
  });

  it('a photograph not worth shrinking is left as it was', async () => {
    expect(env.db.prepare('SELECT shrunk FROM cloud_files WHERE remote_id = ?').get('f2')).toEqual({ shrunk: 0 });
  });

  it('says plainly when the original cannot be fetched, and disconnecting does not lose the way back to it', async () => {
    const p = await photoByFile('Beach At Dawn.jpg');
    await A.del(`/api/cloud/${id}`);
    expect(env.db.prepare('SELECT COUNT(*) n FROM cloud_files WHERE conn_id = ? AND shrunk = 1').get(id)).toEqual({ n: 2 }); // kept: it is how the original is found again
    const r = await A.get(`/api/photos/${p.id}/original`);
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/disconnected/);
    const t = await photoByFile('tiny.jpg');
    expect((await A.raw('GET', `/api/photos/${t.id}/original`)).status).toBe(200); // the rest still downloads
  });
});
