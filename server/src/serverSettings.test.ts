import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSession, SESSION_COOKIE } from './auth.js';
import { setSetting, type DB } from './db.js';
import { getUser, resolveUser, type User } from './users.js';
import { cleanup, makeEnv, type Env } from './testutil.js';

const who = (sub: string, email: string, name: string) => ({ provider: 'g', sub, email, emailVerified: true, name });

describe('the first person to sign in is the administrator', () => {
  it('binds the first sign-in to the administrator account, and makes everyone after a member', () => {
    const e = makeEnv();
    try {
      const sys = (e.app as any).frames.sys as DB;
      expect(getUser(sys, 1)!.provider).toBe('local'); // nobody has signed in yet
      const first = resolveUser(sys, who('a', 'first@x.test', 'First'), true)!;
      expect(first.id).toBe(1);
      expect(first.role).toBe('admin');
      expect(first.email).toBe('first@x.test');
      const second = resolveUser(sys, who('b', 'second@x.test', 'Second'), true)!;
      expect(second.id).not.toBe(1);
      expect(second.role).toBe('member');
      expect(resolveUser(sys, who('a', 'first@x.test', 'First'), true)!.id).toBe(1); // and it is theirs from then on
    } finally { e.app.close(); cleanup(e); }
  });
});

describe('what the administrator sets up for the whole server', () => {
  let env: Env, sys: DB, alice: User;
  const cookie = (id: number) => ({ cookie: `${SESSION_COOKIE}=${createSession(sys, id)}` });
  const call = async (method: string, url: string, id: number, payload?: unknown) => {
    const r = await env.app.inject({ method: method as any, url, headers: cookie(id), payload: payload as any });
    const ct = String(r.headers['content-type'] ?? '');
    return { status: r.statusCode, body: ct.includes('json') ? r.json() : r.rawPayload, headers: r.headers };
  };
  beforeAll(() => {
    env = makeEnv();
    sys = (env.app as any).frames.sys;
    setSetting(sys, 'auth', { enabled: true, providers: [{ id: 'g', type: 'google', name: 'Google', clientId: 'x' }], allow: ['@x.test'], publicUrl: '', testedBy: null });
    resolveUser(sys, who('o', 'owner@x.test', 'Owner'), true); // the administrator
    alice = resolveUser(sys, who('a', 'alice@x.test', 'Alice'), true)!;
  });
  afterAll(() => { env.app.close(); cleanup(env); });

  const KEY = 'sk-shared-' + Buffer.from('server-ai').toString('hex');
  it('a shared AI is set up by an administrator only, and its key never leaves the server', async () => {
    expect((await call('POST', '/api/admin/ai/sources', alice.id, { type: 'ollama' })).status).toBe(403);
    const r = await call('POST', '/api/admin/ai/sources', 1, { type: 'openai', name: 'Studio AI', endpoint: 'https://api.example.test', model: 'm1', ack: true, key: KEY });
    expect(r.status).toBe(201);
    expect(r.body.sources[0]).toMatchObject({ name: 'Studio AI', hasKey: true, ready: true });
    expect(JSON.stringify(r.body)).not.toContain(KEY);
  });
  it('shows up in everyone’s list as the administrator’s, which they can use but not change or remove', async () => {
    const list = (await call('GET', '/api/ai/sources', alice.id)).body;
    const shared = list.sources.find((s: any) => s.name === 'Studio AI');
    expect(shared).toMatchObject({ shared: true, ready: true, hasKey: true });
    expect(JSON.stringify(list)).not.toContain(KEY);
    expect((await call('PUT', `/api/ai/sources/${shared.id}`, alice.id, { model: 'other' })).status).toBe(404);
    expect((await call('DELETE', `/api/ai/sources/${shared.id}`, alice.id)).status).toBe(404);
    const use = await call('PUT', '/api/ai/active', alice.id, { id: shared.id });
    expect(use.status).toBe(200);
    expect(use.body.active).toBe(shared.id);
    // The administrator removing it takes it away from everyone.
    await call('DELETE', `/api/admin/ai/sources/${shared.id}`, 1);
    expect((await call('GET', '/api/ai/sources', alice.id)).body.sources.some((s: any) => s.id === shared.id)).toBe(false);
  });
  it('the server backup is one archive of the server’s database and every library, for administrators only, with no secrets in it', async () => {
    expect((await call('GET', '/api/admin/backup', alice.id)).status).toBe(403);
    const r = await call('GET', '/api/admin/backup', 1);
    expect(r.status).toBe(200);
    expect(String(r.headers['content-type'])).toBe('application/x-tar');
    expect(String(r.headers['content-disposition'])).toContain('frames-server-backup-');
    const tar = r.body as Buffer;
    const names: string[] = [];
    for (let at = 0; at + 512 <= tar.length && tar[at] !== 0; ) {
      const name = tar.subarray(at, at + 100).toString().replace(/\0.*$/, '');
      const size = parseInt(tar.subarray(at + 124, at + 135).toString(), 8);
      names.push(name);
      expect(tar.subarray(at + 257, at + 262).toString()).toBe('ustar');
      expect(tar.subarray(at + 512, at + 512 + 16).toString()).toContain('SQLite format 3'); // each is a real database
      at += 512 + Math.ceil(size / 512) * 512;
    }
    expect(names[0]).toBe('system.db');
    expect(names.filter((n) => n.startsWith('library-')).length).toBeGreaterThanOrEqual(2); // the administrator's and Alice's
    expect(tar.includes(Buffer.from(KEY))).toBe(false);
  });
});
