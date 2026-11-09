import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, makeEnv, api, type Env } from './testutil.js';
import { cleanConfig } from './s3.js';

/** Backups to S3, against a stand-in server that checks every signature on its own. The real services are not reached. */
let env: Env, A: ReturnType<typeof api>, srv: http.Server, endpoint: string;
const store = new Map<string, Buffer>();
const log: string[] = [];
const KEY = 'test-access', SECRET = 'test-secret-value'; // built to look like nothing real

/** The signature a server would work out for the request it received (written apart from the client's). */
function expected(req: http.IncomingMessage, body: Buffer) {
  const u = new URL(req.url!, 'http://x');
  const amz = String(req.headers['x-amz-date']);
  const h = (v: crypto.BinaryLike | crypto.KeyObject, d: string) => crypto.createHmac('sha256', v as any).update(d).digest();
  const query = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const canon = [req.method, u.pathname, query, `host:${req.headers.host}\nx-amz-content-sha256:${req.headers['x-amz-content-sha256']}\nx-amz-date:${amz}\n`, 'host;x-amz-content-sha256;x-amz-date', crypto.createHash('sha256').update(body).digest('hex')].join('\n');
  const day = amz.slice(0, 8);
  const sts = `AWS4-HMAC-SHA256\n${amz}\n${day}/eu-west-1/s3/aws4_request\n${crypto.createHash('sha256').update(canon).digest('hex')}`;
  const k = h(h(h(h(`AWS4${SECRET}`, day), 'eu-west-1'), 's3'), 'aws4_request');
  return { sig: crypto.createHmac('sha256', k).update(sts).digest('hex'), hashOk: req.headers['x-amz-content-sha256'] === crypto.createHash('sha256').update(body).digest('hex') };
}

beforeAll(async () => {
  env = makeEnv(); A = api(env);
  srv = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const e = expected(req, body);
      if (!String(req.headers.authorization).includes(`Credential=${KEY}/`) || !String(req.headers.authorization).endsWith(`Signature=${e.sig}`) || !e.hashOk) { res.writeHead(403); res.end('<Error><Code>SignatureDoesNotMatch</Code></Error>'); return; }
      const u = new URL(req.url!, 'http://x');
      const m = /^\/bkt\/(.+)$/.exec(decodeURIComponent(u.pathname));
      log.push(`${req.method} ${u.pathname}`);
      if (req.method === 'PUT' && m) { store.set(m[1], body); res.writeHead(200); res.end(); }
      else if (req.method === 'DELETE' && m) { store.delete(m[1]); res.writeHead(204); res.end(); }
      else if (req.method === 'GET' && m) { const d = store.get(m[1]); if (!d) { res.writeHead(404); res.end('<Error><Code>NoSuchKey</Code></Error>'); } else { res.writeHead(200); res.end(d); } }
      else if (req.method === 'GET' && u.pathname === '/bkt') {
        const prefix = u.searchParams.get('prefix') ?? '';
        res.writeHead(200);
        res.end(`<ListBucketResult>${[...store].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => `<Contents><Key>${k}</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><Size>${v.length}</Size></Contents>`).join('')}</ListBucketResult>`);
      } else { res.writeHead(400); res.end(); }
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv.close(); env.app.close(); cleanup(env); });

describe('backups to S3', () => {
  it('refuses settings that are not usable, and never sends the secret key back', async () => {
    const good = { endpoint, region: 'eu-west-1', bucket: 'bkt', prefix: 'frames', accessKeyId: KEY, secretAccessKey: SECRET };
    for (const bad of [{ ...good, endpoint: 'nope' }, { ...good, endpoint: 'ftp://x.y' }, { ...good, endpoint: 'http://s3.example.com' }, { ...good, bucket: 'a' }, { ...good, accessKeyId: '' }, { ...good, secretAccessKey: '' }, { ...good, prefix: 'a/../b' }]) {
      expect((await A.put('/api/admin/backup/s3', bad)).status).toBe(400);
    }
    expect(() => cleanConfig({ ...good, endpoint: 'https://s3.example.com' }, SECRET)).not.toThrow();
    const r = await A.put('/api/admin/backup/s3', good);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ configured: true, bucket: 'bkt', hasSecret: true });
    expect(JSON.stringify((await A.get('/api/admin/backup/s3')).body)).not.toContain(SECRET);
    expect((await A.put('/api/admin/backup/s3', { ...good, secretAccessKey: '' })).status).toBe(200); // blank keeps the saved key
  });

  it('copies a backup to the bucket with a valid signature, lists it, and keeps only the newest seven', async () => {
    const r = await A.post('/api/admin/backup/s3/sync');
    expect(r.status).toBe(200);
    expect(r.body.uploaded).toHaveLength(1);
    const name = r.body.uploaded[0] as string;
    expect(store.has(`frames/${name}`)).toBe(true);
    expect(store.get(`frames/${name}`)!.length).toBeGreaterThan(1000); // a tar of databases
    expect(((await A.get('/api/admin/backup/s3/list')).body as any[]).map((o) => o.name)).toEqual([name]);
    expect((await A.post('/api/admin/backup/s3/sync')).body.uploaded).toEqual([]); // nothing new
    for (let d = 1; d <= 9; d++) store.set(`frames/frames-server-backup-2025-01-0${d}.tar`, Buffer.from('x'));
    store.set('frames/other-file.txt', Buffer.from('not ours'));
    await A.post('/api/admin/backup/s3/sync');
    const left = [...store.keys()].filter((k) => k.endsWith('.tar'));
    expect(left).toHaveLength(7);
    expect(left).toContain(`frames/${name}`);
    expect(store.has('frames/other-file.txt')).toBe(true); // only Frames' own archives are ever removed
    expect(JSON.stringify((await A.get('/api/admin/backup/s3')).body.status)).toContain('"ok":true');
  });

  it('puts a backup from the bucket aside for restore, refusing other names and a bad archive', async () => {
    const name = ((await A.get('/api/admin/backup/s3/list')).body as any[])[0].name as string;
    const r = await A.post('/api/admin/backup/s3/restore', { name });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ staged: true });
    await A.del('/api/admin/restore');
    expect((await A.post('/api/admin/backup/s3/restore', { name: '../etc/passwd' })).status).toBe(404);
    store.set('frames/frames-server-backup-2025-01-09.tar', Buffer.from('not a tar'));
    expect((await A.post('/api/admin/backup/s3/restore', { name: 'frames-server-backup-2025-01-09.tar' })).status).toBe(400);
  });

  it('says what went wrong when the service refuses, and can be removed', async () => {
    await A.put('/api/admin/backup/s3', { endpoint, region: 'eu-west-1', bucket: 'bkt', prefix: 'frames', accessKeyId: KEY, secretAccessKey: 'wrong-secret' });
    const r = await A.post('/api/admin/backup/s3/sync');
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('SignatureDoesNotMatch');
    expect(JSON.stringify((await A.get('/api/admin/backup/s3')).body.status)).toContain('"ok":false');
    expect((await A.del('/api/admin/backup/s3')).body).toMatchObject({ configured: false, hasSecret: false });
  });
});
