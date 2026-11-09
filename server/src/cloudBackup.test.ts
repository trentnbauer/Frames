import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, makeEnv, api, type Env } from './testutil.js';

/**
 * Backups to Dropbox, Google Drive and OneDrive, against a stand-in for each (shaped from the providers' documented calls, not the
 * real services). One file store per provider; the stand-in checks the sign-in asked for write access and that every call carries a token.
 */
type Provider = 'google' | 'dropbox' | 'onedrive';
const files: Record<Provider, Map<string, Buffer>> = { google: new Map(), dropbox: new Map(), onedrive: new Map() };
const seenScope: Record<string, string> = {};
let srv: http.Server, base = '', env: Env, A: ReturnType<typeof api>;
const body = (req: http.IncomingMessage) => new Promise<Buffer>((r) => { const c: Buffer[] = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const send = (res: http.ServerResponse, code: number, data: unknown = {}, headers: Record<string, string> = {}) => { res.writeHead(code, { 'content-type': Buffer.isBuffer(data) ? 'application/octet-stream' : 'application/json', ...headers }); res.end(Buffer.isBuffer(data) ? data : JSON.stringify(data)); };
const FOLDER = 'FOLDERID';

beforeAll(async () => {
  srv = http.createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    const m = /^\/(google|dropbox|onedrive)\/(token|api|content|upload|chunks)(\/.*)?$/.exec(url.pathname);
    if (!m) return send(res, 404);
    const p = m[1] as Provider, kind = m[2], rest = m[3] ?? '';
    const data = await body(req);
    if (kind === 'token') {
      const f = Object.fromEntries(new URLSearchParams(data.toString()));
      if (f.grant_type === 'authorization_code') return f.code === 'GOODCODE' ? send(res, 200, { access_token: 'acc-1', expires_in: 3600, refresh_token: 'refresh-1' }) : send(res, 400, { error: 'invalid_grant' });
      return send(res, 200, { access_token: 'acc-2', expires_in: 3600 });
    }
    if (kind !== 'chunks' && !/^Bearer acc-/.test(String(req.headers.authorization ?? ''))) return send(res, 401, {});
    const store = files[p];
    if (p === 'dropbox') {
      if (rest === '/users/get_current_account') return send(res, 200, { email: 'me@dropbox.test' });
      const arg = req.headers['dropbox-api-arg'] ? JSON.parse(String(req.headers['dropbox-api-arg'])) : JSON.parse(data.toString() || '{}');
      if (rest === '/files/upload') { store.set(String(arg.path), data); return send(res, 200, {}); }
      if (rest === '/files/list_folder') {
        const entries = [...store].filter(([k]) => k.startsWith(`${arg.path}/`)).map(([k, v]) => ({ '.tag': 'file', name: k.slice(arg.path.length + 1), size: v.length, server_modified: '2026-01-01T00:00:00Z' }));
        return entries.length || [...store.keys()].some((k) => k.startsWith(arg.path)) ? send(res, 200, { entries, has_more: false }) : send(res, 409, { error_summary: 'path/not_found/' });
      }
      if (rest === '/files/download') return store.has(arg.path) ? send(res, 200, store.get(arg.path)!) : send(res, 409, {});
      if (rest === '/files/delete_v2') { store.delete(arg.path); return send(res, 200, {}); }
    }
    if (p === 'google') {
      if (rest === '/about') return send(res, 200, { user: { emailAddress: 'me@gmail.test' } });
      if (kind === 'api' && rest === '/files' && req.method === 'GET') {
        const q = url.searchParams.get('q') ?? '';
        if (q.includes('mimeType')) return send(res, 200, { files: store.has('FOLDER') ? [{ id: FOLDER }] : [] });
        const nm = /name='([^']+)'/.exec(q)?.[1];
        if (nm) return send(res, 200, { files: store.has(`file:${nm}`) ? [{ id: `id-${nm}` }] : [] });
        return send(res, 200, { files: [...store.keys()].filter((k) => k.startsWith('file:')).map((k) => ({ name: k.slice(5), size: String(store.get(k)!.length), modifiedTime: '2026-01-01T00:00:00Z' })) });
      }
      if (kind === 'api' && rest === '/files' && req.method === 'POST') { store.set('FOLDER', Buffer.alloc(0)); return send(res, 200, { id: FOLDER }); }
      if (kind === 'upload' && rest === '/files') { const meta = JSON.parse(data.toString()); return send(res, 200, {}, { location: `${base}/google/chunks/${encodeURIComponent(meta.name)}` }); }
      if (kind === 'chunks') { store.set(`file:${decodeURIComponent(rest.slice(1))}`, data); return send(res, 200, {}); }
      const one = /^\/files\/id-(.+)$/.exec(rest);
      if (one && req.method === 'DELETE') { store.delete(`file:${decodeURIComponent(one[1])}`); return send(res, 204); }
      if (one) return send(res, 200, store.get(`file:${decodeURIComponent(one[1])}`) ?? Buffer.alloc(0));
    }
    if (p === 'onedrive') {
      if (rest === '/me') return send(res, 200, { mail: 'me@onedrive.test' });
      const item = /^\/me\/drive\/root:\/Frames%20backups(?:\/([^:]+))?(:\/(createUploadSession|children|content))?$/.exec(rest) ?? /^\/me\/drive\/root:\/Frames backups(?:\/([^:]+))?(:\/(createUploadSession|children|content))?$/.exec(decodeURIComponent(rest));
      if (item) {
        const name = item[1] ? decodeURIComponent(item[1]) : '';
        if (item[3] === 'createUploadSession') return send(res, 200, { uploadUrl: `${base}/onedrive/chunks/${encodeURIComponent(name)}` });
        if (item[3] === 'children') return store.size ? send(res, 200, { value: [...store].map(([k, v]) => ({ name: k, size: v.length, file: {}, lastModifiedDateTime: '2026-01-01T00:00:00Z' })) }) : send(res, 404, {});
        if (item[3] === 'content') return store.has(name) ? send(res, 200, store.get(name)!) : send(res, 404, {});
        if (req.method === 'DELETE') { store.delete(name); return send(res, 204); }
      }
      if (kind === 'chunks') {
        const name = decodeURIComponent(rest.slice(1));
        const range = /bytes (\d+)-(\d+)\/(\d+)/.exec(String(req.headers['content-range']));
        if (!range) return send(res, 400);
        store.set(`${name}.part${range[1]}`, data);
        if (Number(range[2]) + 1 === Number(range[3])) {
          const parts = [...store.keys()].filter((k) => k.startsWith(`${name}.part`)).sort((a, b) => Number(a.split('.part')[1]) - Number(b.split('.part')[1]));
          store.set(name, Buffer.concat(parts.map((k) => store.get(k)!)));
          for (const k of parts) store.delete(k);
          return send(res, 201);
        }
        return send(res, 202);
      }
    }
    return send(res, 404);
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  env = makeEnv({ cloudBase: base });
  A = api(env);
});
afterAll(() => { srv.close(); env.app.close(); cleanup(env); });

describe.each(['dropbox', 'google', 'onedrive'] as const)('backup to %s', (provider) => {
  it('asks for write access, connects, and shows who is connected', async () => {
    await A.put(`/api/cloud/client/${provider}`, { clientId: 'CID' });
    const r = await A.post(`/api/admin/backup/cloud/connect/${provider}`);
    expect(r.status).toBe(200);
    const u = new URL(r.body.url);
    seenScope[provider] = u.searchParams.get('scope') ?? '';
    expect(seenScope[provider]).toMatch(provider === 'dropbox' ? /files\.content\.write/ : provider === 'google' ? /drive\.file/ : /Files\.ReadWrite/);
    const cb = await A.get(`/api/cloud/callback?code=GOODCODE&state=${u.searchParams.get('state')}`);
    expect(String(cb.headers.location)).toContain('backup=connected');
    expect((await A.get('/api/admin/backup/cloud')).body).toMatchObject({ connected: true, provider, account: `me@${provider === 'google' ? 'gmail' : provider}.test` });
    expect(JSON.stringify((await A.get('/api/admin/backup/cloud')).body)).not.toContain('refresh-1');
  });

  it('copies the daily archive up, lists it, restores from it, and keeps the newest seven', async () => {
    files[provider].clear();
    const r = await A.post('/api/admin/backup/sync');
    expect(r.status).toBe(200);
    expect(r.body.uploaded).toHaveLength(1);
    const name = r.body.uploaded[0] as string;
    const remote = (await A.get('/api/admin/backup/remote?from=cloud')).body as { name: string; bytes: number }[];
    expect(remote.map((o) => o.name)).toEqual([name]);
    expect(remote[0].bytes).toBeGreaterThan(1000);
    expect((await A.post('/api/admin/backup/sync')).body.uploaded).toEqual([]);
    const restored = await A.post('/api/admin/backup/remote/restore', { from: 'cloud', name });
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ staged: true });
    await A.del('/api/admin/restore');
    // Old archives beyond seven go; a file that is not one of Frames' archives never does.
    const put = (n: string) => files[provider].set(provider === 'dropbox' ? `/Frames backups/${n}` : provider === 'google' ? `file:${n}` : n, Buffer.from('x'));
    for (let d = 1; d <= 9; d++) put(`frames-server-backup-2025-01-0${d}.tar`);
    put('notes.txt');
    await A.post('/api/admin/backup/sync');
    const names = ((await A.get('/api/admin/backup/remote?from=cloud')).body as { name: string }[]).map((o) => o.name);
    expect(names).toHaveLength(7);
    expect(names).toContain(name);
    expect([...files[provider].keys()].some((k) => k.endsWith('notes.txt'))).toBe(true);
  });

  it('disconnects, and then there is nothing to copy to', async () => {
    expect((await A.del('/api/admin/backup/cloud')).body).toMatchObject({ connected: false });
    expect((await A.post('/api/admin/backup/sync')).status).toBe(400);
    expect((await A.get('/api/admin/backup/remote?from=cloud')).body).toEqual([]);
  });
});
