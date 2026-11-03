import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import type { AppCfg } from './ctx.js';

/** Test helpers: patterned test photographs (flat colours all hash the same, so they would all look like duplicates). */
export const svg = (w: number, h: number, a: string, b: string, circle: [number, number], bars = false) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>${bars ? Array.from({ length: 6 }, (_, i) => `<rect x="${(i * w) / 6}" y="0" width="${w / 12}" height="${h}" fill="#000" opacity=".5"/>`).join('') : ''}<circle cx="${circle[0] * w}" cy="${circle[1] * h}" r="${Math.min(w, h) * 0.2}" fill="#fff"/></svg>`);

export const jpg = (input: Buffer, opts: { exif?: object } = {}) => {
  let s = sharp(input).jpeg({ quality: 90 });
  if (opts.exif) s = s.withExif(opts.exif as any);
  return s.toBuffer();
};

export type Env = { tmp: string; lib: string; data: string; app: ReturnType<typeof buildApp>; db: ReturnType<typeof openDb>; cfg: AppCfg };
export function makeEnv(extra: Partial<AppCfg> = {}): Env {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-t-'));
  const lib = path.join(tmp, 'lib');
  const data = path.join(tmp, 'data');
  fs.mkdirSync(lib, { recursive: true });
  const db = openDb(data);
  const cfg: AppCfg = { libraries: [lib, path.join(data, 'originals')], dataDir: data, ...extra };
  return { tmp, lib, data, db, cfg, app: buildApp(db, cfg) };
}

export const api = (env: Env) => {
  const call = async (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) => {
    const r = await env.app.inject({ method: method as any, url, payload: payload as any, headers });
    const ct = String(r.headers['content-type'] ?? '');
    return { status: r.statusCode, body: ct.includes('json') ? r.json() : r.rawPayload, headers: r.headers };
  };
  return {
    get: (u: string) => call('GET', u), post: (u: string, p?: unknown) => call('POST', u, p ?? {}),
    put: (u: string, p?: unknown) => call('PUT', u, p ?? {}), patch: (u: string, p?: unknown) => call('PATCH', u, p ?? {}), del: (u: string) => call('DELETE', u),
    raw: call,
    scan: () => call('POST', '/api/library/scan?wait=1', {}),
  };
};

export const cleanup = (env: Env) => fs.rmSync(env.tmp, { recursive: true, force: true });
