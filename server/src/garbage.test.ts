import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setSetting } from './db.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

/**
 * Nothing that takes input from a browser may ever cause a server error, whatever is sent: wrong types, nulls, huge strings,
 * objects where text is expected, odd characters in an address or a query. Every request must get a normal 2xx, 3xx or 4xx.
 */
let env: Env, A: ReturnType<typeof api>;
beforeAll(async () => {
  env = makeEnv();
  A = api(env);
  fs.writeFileSync(path.join(env.lib, 'a.jpg'), await jpg(svg(600, 400, '#336699', '#99ccff', [0.5, 0.5])));
  await A.scan();
  const sys = (env.app as any).frames.sys;
  setSetting(sys, 'auth', { enabled: false, providers: [{ id: 'g', type: 'google', name: 'G', clientId: 'x' }], allow: [], publicUrl: '', testedBy: null });
  await A.post('/api/ai/sources', { type: 'openai', endpoint: 'https://api.example.test', model: 'm' });
  await A.post('/api/collections', { name: 'c' });
});
afterAll(() => { env.app.close(); cleanup(env); });

const BIG = 'x'.repeat(200_000);
const VALUES: unknown[] = [null, true, false, 0, -1, 1e308, NaN, '', ' ', 'a', BIG, [], [null], ['a'], {}, { a: 1 }, { toString: 1 }, '__proto__', '../etc/passwd', '<script>', '\u0000', 'https://', 'javascript:alert(1)'];
const KEYS = ['name', 'type', 'host', 'enabled', 'email', 'role', 'folder', 'disabled', 'key', 'clearKey', 'model', 'endpoint', 'embedModel', 'ack', 'id', 'sessions', 'intervals', 'adaptive', 'aiActive', 'publicUrl', 'allow', 'providers', 'appUrl', 'portfolios', 'tunnelToken', 'intervalMin', 'folderId', 'clientId', 'clientSecret', 'operator', 'contact', 'extra', 'collectionId', 'social', 'order', 'fullSize', 'confirm', 'photographerName', 'accentColor', 'tagline', 'captions', 'xmpWriteBack', 'archiveSuggest'];

// Every route the server defines, read from the source so a new route is covered without anyone remembering to add it here.
const ROUTES: [string, string][] = [];
const dir = path.join(__dirname);
for (const f of [path.join(dir, 'app.ts'), path.join(dir, 'portfolio.ts'), path.join(dir, 'privacy.ts'), path.join(dir, 'tunnel.ts'), ...fs.readdirSync(path.join(dir, 'routes')).map((n) => path.join(dir, 'routes', n))]) {
  if (!f.endsWith('.ts')) continue;
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/app\.(get|post|put|patch|delete)\(\s*'(\/[^']*)'/g)) ROUTES.push([m[1].toUpperCase(), m[2]]);
}
const SKIP = new Set(['POST /api/upload', 'GET /api/backup', 'POST /api/library/scan', 'GET /api/admin/env/export']); // multipart, files, long-running, secrets
const todo = ROUTES.filter(([m, u]) => !SKIP.has(`${m} ${u}`));

describe('garbage', () => {
  it('finds the routes it is meant to cover', () => { expect(todo.length).toBeGreaterThan(80); });

  it.each(todo)('%s %s never answers with a server error', async (method, url) => {
    const bad: string[] = [];
    const hit = async (u: string, payload?: unknown) => {
      const r = await env.app.inject({ method: method as any, url: u, ...(payload !== undefined ? { payload: payload as any } : {}), headers: { 'content-type': 'application/json' } });
      if (r.statusCode >= 500) bad.push(`${r.statusCode} ${u.slice(0, 80)} ${payload === undefined ? '' : JSON.stringify(payload).slice(0, 80)}`);
    };
    // Odd things in the address: each :param gets a bad value, and the query string gets bad numbers and text.
    for (const p of ['abc', '0', '-1', '99999999999999999999', '%00', '..', 'x'.repeat(5000), '%E0%A4%A', '1.5', 'NaN']) {
      const u = url.replace(/:[A-Za-z]+/g, p);
      await hit(u);
      await hit(`${u}?q=${encodeURIComponent(p)}&limit=${encodeURIComponent(p)}&offset=${encodeURIComponent(p)}&n=${encodeURIComponent(p)}&pad=${encodeURIComponent(p)}&parent=${encodeURIComponent(p)}&wait=1&all=1`);
    }
    // Odd things in the body (only where a body makes sense).
    if (method !== 'GET') {
      const u = url.replace(/:[A-Za-z]+/g, '1');
      for (const k of KEYS) for (const v of VALUES) await hit(u, { [k]: v });
      for (const whole of [null, [], 'text', 7, [{ a: 1 }], { a: { b: { c: [] } } }]) await hit(u, whole);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, 180_000);
});
