import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { safeName } from './cloud.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

// ---- a stand-in for the three providers: one folder tree, served in each provider's own shape ----
type Node = { id: string; name: string; folder: boolean; parent: string; data?: Buffer; version: string };
let nodes: Node[] = [];
const hits = { refresh: 0, evil: 0, tokenCalls: [] as Record<string, string>[], auth: new Set<string>() };
let refreshOk = true;
let srv: http.Server, evil: http.Server, base = '', evilBase = '';

const readBody = (req: http.IncomingMessage) => new Promise<string>((res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => res(b)); });
const send = (res: http.ServerResponse, code: number, body: unknown, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body)); };

function kids(parent: string, root: string) { return nodes.filter((n) => n.parent === (parent === root ? 'ROOT' : parent)); }

beforeAll(async () => {
  evil = http.createServer((req, res) => { hits.evil++; res.end('{}'); });
  await new Promise<void>((r) => evil.listen(0, '127.0.0.1', r));
  evilBase = `http://127.0.0.1:${(evil.address() as AddressInfo).port}`;
  srv = http.createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    const m = /^\/(google|dropbox|onedrive)\/(auth|token|api|content)(\/.*)?$/.exec(url.pathname);
    if (!m) return send(res, 404, {});
    const [, p, kind, rest = ''] = m;
    const body = await readBody(req);
    if (kind === 'token') {
      const f = Object.fromEntries(new URLSearchParams(body));
      hits.tokenCalls.push(f);
      if (f.client_id !== 'CID') return send(res, 401, { error: 'invalid_client' });
      if (f.grant_type === 'authorization_code') {
        if (!['GOODCODE', 'SECONDCODE'].includes(f.code) || !f.code_verifier) return send(res, 400, { error: 'invalid_grant' });
        return send(res, 200, { access_token: f.code === 'SECONDCODE' ? 'acc-second' : 'acc-1', expires_in: 3600, refresh_token: 'REFRESH-SECRET' });
      }
      hits.refresh++;
      if (!refreshOk || f.refresh_token !== 'REFRESH-SECRET') return send(res, 400, { error: 'invalid_grant' });
      return send(res, 200, { access_token: `acc-r${hits.refresh}`, expires_in: 3600 });
    }
    const bearer = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''))?.[1];
    if (!bearer || !/^acc-/.test(bearer)) return send(res, 401, { error: 'no' });
    hits.auth.add(bearer);
    const file = (id: string) => nodes.find((n) => n.id === id && !n.folder);
    if (p === 'google') {
      if (rest === '/about') return send(res, 200, { user: { emailAddress: bearer === 'acc-second' ? 'second@gmail.test' : 'me@gmail.test' } });
      if (rest === '/files') {
        const parent = /'([^']+)' in parents/.exec(url.searchParams.get('q') ?? '')?.[1] ?? '';
        return send(res, 200, { files: kids(parent, 'root').map((n) => ({ id: n.id, name: n.name, mimeType: n.folder ? 'application/vnd.google-apps.folder' : 'image/jpeg', size: String(n.data?.length ?? 0), md5Checksum: n.version })) });
      }
      const f = /^\/files\/([^/]+)$/.exec(rest);
      if (f && file(f[1])) return send(res, 200, file(f[1])!.data!, 'image/jpeg');
    }
    if (p === 'dropbox') {
      if (rest === '/users/get_current_account') return send(res, 200, { email: bearer === 'acc-second' ? 'second@dropbox.test' : 'me@dropbox.test' });
      if (rest === '/files/list_folder') {
        const path = (JSON.parse(body).path as string).replace(/^id:/, '');
        return send(res, 200, { entries: kids(path || 'ROOT', 'ROOT').map((n) => ({ '.tag': n.folder ? 'folder' : 'file', id: `id:${n.id}`, name: n.name, size: n.data?.length ?? 0, content_hash: n.version })), has_more: false });
      }
      if (rest === '/files/download') { const f = file(JSON.parse(String(req.headers['dropbox-api-arg'])).path.replace(/^id:/, '')); if (f) return send(res, 200, f.data!, 'application/octet-stream'); }
    }
    if (p === 'onedrive') {
      if (rest === '/me') return send(res, 200, { userPrincipalName: bearer === 'acc-second' ? 'second@onedrive.test' : 'me@onedrive.test' });
      const c = /^\/me\/drive\/items\/([^/]+)\/children$/.exec(rest);
      if (c) {
        const list = kids(c[1], 'root').map((n) => ({ id: n.id, name: n.name, size: n.data?.length ?? 0, ...(n.folder ? { folder: {} } : { file: { hashes: { sha1Hash: n.version } } }) }));
        // First page carries a link to a different host: the bearer token must never go there.
        if (c[1] === 'root' && !url.searchParams.get('page')) return send(res, 200, { value: list.slice(0, 1), '@odata.nextLink': `${base}/onedrive/api/me/drive/items/root/children?page=2` });
        if (c[1] === 'root' && url.searchParams.get('page') === '2') return send(res, 200, { value: list.slice(1), '@odata.nextLink': `${evilBase}/steal` });
        return send(res, 200, { value: list });
      }
      const d = /^\/me\/drive\/items\/([^/]+)\/content$/.exec(rest);
      if (d && file(d[1])) return send(res, 200, file(d[1])!.data!, 'image/jpeg');
    }
    send(res, 404, {});
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv.close(); evil.close(); });

let imgA: Buffer, imgB: Buffer, imgC: Buffer;
const resetTree = () => {
  nodes = [
    { id: 'f1', name: 'a.jpg', folder: false, parent: 'ROOT', data: imgA, version: 'v1' },
    { id: 'd1', name: 'Trip', folder: true, parent: 'ROOT', version: '' },
    { id: 'f2', name: 'b.jpg', folder: false, parent: 'd1', data: imgB, version: 'v1' },
    { id: 'f3', name: 'notes.txt', folder: false, parent: 'd1', data: Buffer.from('hi'), version: 'v1' },
    { id: 'f4', name: '../evil.jpg', folder: false, parent: 'd1', data: imgC, version: 'v1' },
    { id: 'f5', name: 'a.jpg', folder: false, parent: 'ROOT', data: imgC, version: 'v1' }, // same name as f1, different file
  ];
};
// ids differ per provider because the stand-in speaks each one's shape; Dropbox wants "id:" folder ids
const fid = (p: string, id: string) => (p === 'dropbox' ? `id:${id}` : id);

describe('safeName', () => {
  it('makes a provider file name safe to use on disk', () => {
    expect(safeName('../evil.jpg')).toBe('__evil.jpg');
    expect(safeName('a/b\\c:d.jpg')).toBe('a_b_c_d.jpg');
    expect(safeName('..')).toBe('_');
    expect(safeName('')).toBe('_');
    expect(safeName('x'.repeat(500)).length).toBe(200);
  });
});

describe.each(['google', 'dropbox', 'onedrive'] as const)('cloud sync: %s', (provider) => {
  let env: Env, A: ReturnType<typeof api>, id = '', dest = '';
  beforeAll(async () => {
    imgA = await jpg(svg(1200, 800, '#c0392b', '#f5b041', [0.3, 0.3]));
    imgB = await jpg(svg(1000, 700, '#1b4f9c', '#5dade2', [0.7, 0.7]));
    imgC = await jpg(svg(900, 900, '#145a32', '#58d68d', [0.2, 0.8]));
    resetTree();
    refreshOk = true;
    env = makeEnv({ cloudBase: base });
    A = api(env);
  });
  afterAll(() => cleanup(env));

  const connect = async () => {
    const r = await A.post(`/api/cloud/connect/${provider}`);
    const u = new URL(r.body.url);
    const cb = await A.get(`/api/cloud/callback?code=GOODCODE&state=${u.searchParams.get('state')}`);
    return { url: u, cb };
  };

  it('needs the client ID before it can connect, and never shows the secret back', async () => {
    expect((await A.post(`/api/cloud/connect/${provider}`)).status).toBe(400);
    const r = await A.put(`/api/cloud/client/${provider}`, { clientId: 'CID', clientSecret: 'CLIENT-SECRET-VALUE' });
    expect(r.status).toBe(200);
    expect(JSON.stringify((await A.get('/api/cloud')).body)).not.toContain('CLIENT-SECRET-VALUE');
    expect((await A.get('/api/cloud')).body.providers.find((p: any) => p.id === provider)).toMatchObject({ clientId: 'CID', hasSecret: true });
  });

  it('sends you to the provider with PKCE and a state, then stores the account', async () => {
    const { url, cb } = await connect();
    expect(url.origin + url.pathname).toBe(`${base}/${provider}/auth`);
    expect(url.searchParams.get('client_id')).toBe('CID');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toMatch(/\/api\/cloud\/callback$/);
    expect(cb.status).toBe(302);
    expect(String(cb.headers.location)).toBe('/settings?cloud=connected');
    const c = (await A.get('/api/cloud')).body.connections;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ provider, account: `me@${provider === 'google' ? 'gmail' : provider}.test`, folderId: null, enabled: false });
    id = c[0].id;
  });

  it('keeps tokens and secrets out of the API and out of backups', async () => {
    const all = JSON.stringify((await A.get('/api/cloud')).body);
    expect(all).not.toContain('REFRESH-SECRET');
    expect(all).not.toContain('acc-1');
    const backup = Buffer.from((await A.get('/api/backup')).body as Buffer);
    expect(backup.includes('REFRESH-SECRET')).toBe(false);
    expect(backup.includes('CLIENT-SECRET-VALUE')).toBe(false);
  });

  it('holds several accounts of the same service, each with its own login and folder, and a repeated account renews its own', async () => {
    const before = (await A.get('/api/cloud')).body.connections.length;
    const connectWith = async (code: string) => {
      const r = await A.post(`/api/cloud/connect/${provider}`);
      const u = new URL(r.body.url);
      await A.get(`/api/cloud/callback?code=${code}&state=${u.searchParams.get('state')}`);
      return u;
    };
    const url = await connectWith('SECONDCODE');
    const conns = (await A.get('/api/cloud')).body.connections;
    expect(conns).toHaveLength(before + 1);
    expect(conns.map((c: any) => c.account)).toEqual(expect.arrayContaining([`me@${provider === 'google' ? 'gmail' : provider}.test`, `second@${provider === 'google' ? 'gmail' : provider}.test`]));
    expect(new Set(conns.map((c: any) => c.id)).size).toBe(conns.length); // each has its own id, so its own login and folder
    // The browser is always asked which account, not quietly signed in as the one it already knows.
    expect(`${url.searchParams.get('prompt') ?? ''}${url.searchParams.get('force_reauthentication') ?? ''}`).toMatch(/select_account|true/);
    await connectWith('SECONDCODE'); // the same second account again
    expect((await A.get('/api/cloud')).body.connections).toHaveLength(before + 1);
    await A.del(`/api/cloud/${conns.find((c: any) => c.account.startsWith('second@')).id}`);
    expect((await A.get('/api/cloud')).body.connections).toHaveLength(before);
  });
  it('refuses a made-up, reused or missing state', async () => {
    expect(String((await A.get('/api/cloud/callback?code=GOODCODE&state=nope')).headers.location)).not.toBe('/settings?cloud=connected');
    const r = await A.post(`/api/cloud/connect/${provider}`);
    const state = new URL(r.body.url).searchParams.get('state');
    await A.get(`/api/cloud/callback?code=GOODCODE&state=${state}`);
    const again = await A.get(`/api/cloud/callback?code=GOODCODE&state=${state}`);
    expect(String(again.headers.location)).toContain('expired');
    expect((await A.get('/api/cloud')).body.connections).toHaveLength(1); // the same account again renews its connection instead of adding a second
    expect((await A.get('/api/cloud/callback?code=x')).status).toBe(302);
  });

  it('lists only folders for the picker, and will not sync or enable before one is chosen', async () => {
    const f = await A.get(`/api/cloud/${id}/folders`);
    expect(f.body).toEqual([{ id: fid(provider, 'd1'), name: 'Trip' }]);
    expect((await A.post(`/api/cloud/${id}/sync?wait=1`)).status).toBe(400);
    expect((await A.put(`/api/cloud/${id}`, { enabled: true })).status).toBe(400);
    expect((await A.put(`/api/cloud/${id}`, { folderId: '../etc' })).status).toBe(400);
    expect((await A.put(`/api/cloud/${id}`, { intervalMin: 3 })).status).toBe(400);
  });

  it('copies photographs (and nothing else) into its own folder, safely named', async () => {
    const root = provider === 'dropbox' ? '' : provider === 'google' ? 'root' : 'root';
    expect((await A.put(`/api/cloud/${id}`, { folderId: root, folderName: 'Everything', enabled: true, intervalMin: 60 })).status).toBe(200);
    const r = await A.post(`/api/cloud/${id}/sync?wait=1`);
    expect(r.body).toMatchObject({ downloaded: 4, skipped: 0, error: null });
    dest = path.join(env.data, 'cloud', id);
    const files: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.relative(dest, path.join(d, e.name)))); };
    walk(dest);
    expect(files.sort()).toEqual(['Trip/__evil.jpg', 'Trip/b.jpg', 'a.jpg', `a (${provider === 'dropbox' ? 'idf5' : 'f5'}).jpg`].sort());
    expect(fs.readFileSync(path.join(dest, 'a.jpg')).equals(imgA)).toBe(true);
    expect(fs.existsSync(path.join(env.data, 'evil.jpg'))).toBe(false);
    expect(fs.readdirSync(path.join(env.data, 'tmp'))).toEqual([]); // no half-finished downloads left behind
  });

  it('is safe to run again: nothing fetched twice, nothing overwritten, remote edits noted', async () => {
    nodes.find((n) => n.id === 'f1')!.version = 'v2';
    nodes.find((n) => n.id === 'f1')!.data = imgB;
    const r = await A.post(`/api/cloud/${id}/sync?wait=1`);
    expect(r.body).toMatchObject({ downloaded: 0, skipped: 3, changedRemotely: 1 });
    expect(fs.readFileSync(path.join(dest, 'a.jpg')).equals(imgA)).toBe(true); // the original stays as first received
    resetTree();
  });

  it('does not fetch an oversized metadata file', async () => {
    nodes.push({ id: 'fx', name: 'huge.xmp', folder: false, parent: 'ROOT', data: Buffer.alloc(6 * 1024 * 1024, 32), version: 'v1' });
    const r = await A.post(`/api/cloud/${id}/sync?wait=1`);
    expect(r.body.downloaded).toBe(0);
    expect(r.body.errors.join(' ')).toMatch(/huge\.xmp.*metadata file larger/);
    expect(fs.existsSync(path.join(dest, 'huge.xmp'))).toBe(false);
    nodes.pop();
  });
  it('syncs only the chosen folders (several allowed), and an empty choice turns syncing off', async () => {
    const root = provider === 'dropbox' ? '' : 'root';
    const trip = fid(provider, 'd1');
    expect((await A.put(`/api/cloud/${id}`, { folders: [{ id: trip, name: 'Trip' }, { id: trip, name: 'again' }, { id: root, name: 'All' }] })).status).toBe(200);
    expect((await A.get('/api/cloud')).body.connections[0]).toMatchObject({ folderId: trip, folderName: 'Trip', folders: [{ id: trip, name: 'Trip' }, { id: root, name: 'All' }] });
    expect((await A.put(`/api/cloud/${id}`, { folders: [{ id: '../etc' }] })).status).toBe(400);
    expect((await A.put(`/api/cloud/${id}`, { folders: 'x' })).status).toBe(400);
    expect((await A.put(`/api/cloud/${id}`, { folders: [{ id: trip, name: 'Trip' }] })).status).toBe(200);
    expect((await A.post(`/api/cloud/${id}/sync?wait=1`)).body).toMatchObject({ downloaded: 0, skipped: 2, error: null }); // only Trip's two photographs are looked at
    expect((await A.put(`/api/cloud/${id}`, { folders: [] })).status).toBe(200);
    expect((await A.get('/api/cloud')).body.connections[0]).toMatchObject({ folderId: null, enabled: false, folders: [] });
    expect((await A.post(`/api/cloud/${id}/sync?wait=1`)).status).toBe(400);
    await A.put(`/api/cloud/${id}`, { folders: [{ id: root, name: 'Everything' }] });
  });

  it('is scanned like any library, and the files stay when the connection is removed', async () => {
    // The sync already started a scan in the background; wait for it, then run one more to be sure.
    for (let i = 0; i < 100 && (await A.get('/api/library/scan/status')).body.running; i++) await new Promise((r) => setTimeout(r, 100));
    await A.scan();
    expect((env.db.prepare('SELECT COUNT(*) n FROM photos').get() as { n: number }).n).toBeGreaterThanOrEqual(3);
    await A.del(`/api/cloud/${id}`);
    expect((await A.get('/api/cloud')).body.connections).toHaveLength(0);
    expect(fs.existsSync(path.join(dest, 'a.jpg'))).toBe(true);
    expect(env.db.prepare('SELECT COUNT(*) n FROM cloud_files').get()).toEqual({ n: 0 });
  });

  it('refreshes an expired access token by itself, and asks to reconnect when the provider refuses', async () => {
    const { cb } = await connect();
    expect(String(cb.headers.location)).toContain('connected');
    const cid = (await A.get('/api/cloud')).body.connections[0].id;
    await A.put(`/api/cloud/${cid}`, { folderId: provider === 'dropbox' ? '' : 'root', folderName: 'All' });
    env.db.prepare("UPDATE settings SET value = ? WHERE key = 'secret:cloud:tok:" + cid + "'").run(JSON.stringify(JSON.stringify({ access: 'acc-old', exp: 1, refresh: 'REFRESH-SECRET' })));
    const before = hits.refresh;
    expect((await A.post(`/api/cloud/${cid}/sync?wait=1`)).body.error).toBeNull();
    expect(hits.refresh).toBe(before + 1);
    expect(hits.auth.has('acc-old')).toBe(false);
    refreshOk = false;
    env.db.prepare("UPDATE settings SET value = ? WHERE key = 'secret:cloud:tok:" + cid + "'").run(JSON.stringify(JSON.stringify({ access: 'acc-old', exp: 1, refresh: 'REFRESH-SECRET' })));
    const r = await A.post(`/api/cloud/${cid}/sync?wait=1`);
    expect(r.body.error).toMatch(/Reconnect/);
    const c = (await A.get('/api/cloud')).body.connections[0];
    expect(c).toMatchObject({ needsReconnect: true, enabled: false });
    expect((await A.put(`/api/cloud/${cid}`, { enabled: true })).status).toBe(400);
    refreshOk = true;
  });
});

describe('cloud sync: following links', () => {
  it('never sends the access token to a host other than the provider', () => {
    expect(hits.evil).toBe(0);
  });
});
