import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDb } from './db.js';

let app: ReturnType<typeof buildApp>, lib: string, tmp: string;
const basic = (u: string, p: string) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
const PW = 's3cret:with:colons';
const auth = { authorization: basic('me', PW) };
const jpg = (c: string, w = 50, h = 40) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).jpeg().toBuffer();

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-sec-'));
  lib = path.join(tmp, 'library');
  fs.mkdirSync(lib, { recursive: true });
  fs.writeFileSync(path.join(lib, 'x.jpg'), await jpg('#445566'));
  app = buildApp(openDb(path.join(tmp, 'data')), { libraries: [lib], dataDir: path.join(tmp, 'data'), authUser: 'me', authPassword: PW });
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('login', () => {
  it('is required when a password is set, but /api/health stays open', async () => {
    expect((await app.inject('/api/photos')).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/photos', headers: { authorization: basic('me', 'wrong') } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/photos', headers: { authorization: basic('other', PW) } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/photos', headers: auth })).statusCode).toBe(200);
    expect((await app.inject('/api/health')).statusCode).toBe(200);
    expect((await app.inject('/api/photos')).headers['www-authenticate']).toContain('Basic');
  });
});

describe('cross-site requests', () => {
  const h = { ...auth, host: 'frames.local' };
  it('blocks cross-site writes', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/library/scan?wait=1', headers: { ...h, origin: 'https://evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/library/scan?wait=1', headers: { ...h, 'sec-fetch-site': 'cross-site' } })).statusCode).toBe(403);
  });
  it('allows same-origin browsers and plain API clients', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/review/start', headers: { ...h, origin: 'http://frames.local' }, payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/review/start', headers: h, payload: {} })).statusCode).toBe(200);
  });
});

describe('version', () => {
  it('is reported by the health check', async () => {
    const v = buildApp(openDb(path.join(tmp, 'data')), { libraries: [lib], dataDir: path.join(tmp, 'data'), version: '1.2.3' });
    expect((await v.inject('/api/health')).json()).toEqual({ ok: true, version: '1.2.3' });
  });
});

describe('behind a reverse proxy', () => {
  it('accepts writes from a listed public host even when the Host header was rewritten', async () => {
    const proxied = buildApp(openDb(path.join(tmp, 'data')), { libraries: [lib], dataDir: path.join(tmp, 'data'), allowedHosts: ['frames.example.com'] });
    const post = (origin: string) => proxied.inject({ method: 'POST', url: '/api/review/start', headers: { origin, host: 'frames:3000' }, payload: {} });
    expect((await post('https://frames.example.com')).statusCode).toBe(200);
    expect((await post('https://evil.example')).statusCode).toBe(403);
  });
});

describe('responses', () => {
  it('carry security headers', async () => {
    const r = await app.inject('/api/health');
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
  });
  it('never include the server path of an original', async () => {
    await app.inject({ method: 'POST', url: '/api/library/scan?wait=1', headers: auth });
    const body = (await app.inject({ url: '/api/photos/1', headers: auth })).body;
    expect(body).not.toContain(tmp);
    expect(body).not.toContain('"path"');
    const patched = (await app.inject({ method: 'PATCH', url: '/api/photos/1', headers: auth, payload: { title: 'x' } })).body;
    expect(patched).not.toContain(tmp);
  });
  it('reject malformed JSON cleanly', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/collections', headers: { ...auth, 'content-type': 'application/json' }, payload: '{not json' });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).not.toMatch(/node_modules|\/src\/|\.ts:\d+/);
  });
});

describe('library folder', () => {
  it('ignores symlinks, so a link cannot pull in files from outside it', async () => {
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.jpg'), await jpg('#000000', 20, 20));
    fs.symlinkSync(outside, path.join(lib, 'linkdir'));
    fs.symlinkSync(path.join(outside, 'secret.jpg'), path.join(lib, 'link.jpg'));
    expect((await app.inject({ url: '/api/library/pending', headers: auth })).json().count).toBe(0);
  });
  it('rejects overlapping syncs instead of importing twice', async () => {
    fs.writeFileSync(path.join(lib, 'y.jpg'), await jpg('#aa5500', 30, 30));
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/library/scan?wait=1', headers: auth }),
      app.inject({ method: 'POST', url: '/api/library/scan?wait=1', headers: auth }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect((await app.inject({ url: '/api/photos', headers: auth })).json().photos).toHaveLength(2);
  });
  it('relinks a moved file to its existing photo instead of orphaning its history', async () => {
    await app.inject({ method: 'PUT', url: '/api/photos/1/tags', headers: auth, payload: { name: 'keep' } });
    fs.mkdirSync(path.join(lib, 'moved'));
    fs.renameSync(path.join(lib, 'x.jpg'), path.join(lib, 'moved', 'x2.jpg'));
    const r = (await app.inject({ method: 'POST', url: '/api/library/scan?wait=1', headers: auth })).json();
    expect(r.relinked).toBe(1);
    const photos = (await app.inject({ url: '/api/photos', headers: auth })).json().photos;
    expect(photos).toHaveLength(2);
    const moved = photos.find((p: any) => p.file === 'x2.jpg');
    expect(moved.missing).toBe(false);
    const full = (await app.inject({ url: `/api/photos/${moved.id}`, headers: auth })).json();
    expect(full.tags.map((t: any) => t.name)).toContain('keep');
  });
});
