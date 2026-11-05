import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setSetting } from './db.js';
import { applyPendingRestore, archivesIn, readTar, stageRestore, writeServerArchive } from './serverBackup.js';
import { openSystemDb } from './users.js';
import { cleanup, makeEnv, type Env } from './testutil.js';

/** The whole-server backup leaves out the server's settings, and a restore is checked, put aside, and applied at the next start. */
let env: Env;
let archive: string;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-restore-'));
const frames = () => (env.app as any).frames as { sys: any; tenants: any };

beforeAll(async () => {
  env = makeEnv({ backupDir: scratch });
  setSetting(frames().sys, 'auth', { enabled: false, providers: [{ id: 'g', type: 'google', name: 'Google', clientId: 'x' }], allow: ['a@x.test'], publicUrl: '', testedBy: null });
  setSetting(frames().sys, 'tunnel', { appUrl: 'https://frames.example.org' });
  await env.app.inject({ method: 'POST', url: '/api/collections', payload: { name: 'Kept in the backup' } });
  const name = await writeServerArchive(frames(), scratch);
  archive = path.join(scratch, name!);
});
afterAll(() => { env.app.close(); cleanup(env); fs.rmSync(scratch, { recursive: true, force: true }); });

const dbOf = (data: Buffer, name: string) => { const f = path.join(scratch, `peek-${name}`); fs.writeFileSync(f, data); return new Database(f, { readonly: true }); };

describe('server backup', () => {
  it('holds the people and each library, but none of the server settings', () => {
    const parts = readTar(archive);
    expect(parts.map((p) => p.name)).toEqual(['system.db', expect.stringMatching(/^library-1-/)]);
    const sys = dbOf(parts[0].data, 'sys.db');
    expect((sys.prepare('SELECT COUNT(*) n FROM settings').get() as any).n).toBe(0); // no sign-in providers, no tunnel
    expect((sys.prepare('SELECT COUNT(*) n FROM users').get() as any).n).toBeGreaterThan(0);
    sys.close();
    const lib = dbOf(parts[1].data, 'lib.db');
    expect((lib.prepare('SELECT name FROM collections').all() as any[]).map((r) => r.name)).toContain('Kept in the backup');
    lib.close();
    expect(archivesIn(scratch).map((a) => a.name)).toEqual([path.basename(archive)]);
    expect(fs.existsSync(path.join(scratch, '.scratch'))).toBe(false);
  });
  it('is made once a day', async () => {
    expect(await writeServerArchive(frames(), scratch)).toBeNull();
  });
});

describe('restoring', () => {
  it('refuses a file that is not a backup, and puts nothing aside', () => {
    const dir = fs.mkdtempSync(path.join(scratch, 'd-'));
    const junk = path.join(dir, 'junk.tar'); fs.writeFileSync(junk, 'this is not an archive at all'.repeat(40));
    expect(() => stageRestore(junk, dir)).toThrow(/not a Frames backup/);
    const empty = path.join(dir, 'empty.tar'); fs.writeFileSync(empty, Buffer.alloc(1024));
    expect(() => stageRestore(empty, dir)).toThrow(/no people|whole-server/);
    expect(fs.existsSync(path.join(dir, 'restore-pending'))).toBe(false);
  });
  it('is applied at the next start: the people and libraries come back, the server keeps its own settings, and what it replaced is kept', () => {
    const data = fs.mkdtempSync(path.join(scratch, 'fresh-'));
    // A server with its own settings and a different, older library.
    const sys = openSystemDb(data);
    setSetting(sys, 'auth', { enabled: true, providers: [{ id: 'mine', type: 'github', name: 'GitHub', clientId: 'y' }], allow: [], publicUrl: '', testedBy: null });
    sys.close();
    fs.writeFileSync(path.join(data, 'frames.db'), 'old library');
    const staged = stageRestore(archive, data);
    expect(staged.parts).toContain('system.db');
    expect(applyPendingRestore(data)).toMatch(/before-restore-/);
    const lib = new Database(path.join(data, 'frames.db'), { readonly: true });
    expect((lib.prepare('SELECT name FROM collections').all() as any[]).map((r) => r.name)).toContain('Kept in the backup');
    lib.close();
    const back = new Database(path.join(data, 'system.db'), { readonly: true });
    const rows = back.prepare("SELECT value FROM settings WHERE key = 'auth'").all() as any[];
    expect(JSON.parse(rows[0].value).providers[0].id).toBe('mine'); // this server's settings, not the backup's (which has none)
    expect((back.prepare('SELECT COUNT(*) n FROM sessions').get() as any).n).toBe(0);
    back.close();
    const kept = fs.readdirSync(path.join(data, 'backups')).find((n) => n.startsWith('before-restore-'))!;
    expect(fs.readFileSync(path.join(data, 'backups', kept, 'frames.db'), 'utf8')).toBe('old library');
    expect(fs.existsSync(path.join(data, 'restore-pending'))).toBe(false);
    expect(applyPendingRestore(data)).toBeNull(); // nothing pending any more
  });
});

describe('restore in Settings', () => {
  it('lists the archives, stages one by name, and can cancel', async () => {
    const call = (method: string, url: string, payload?: unknown) => env.app.inject({ method: method as any, url, payload: payload as any }).then((r) => ({ status: r.statusCode, body: r.json() }));
    const l = (await call('GET', '/api/admin/restore')).body;
    expect(l.archives.map((a: any) => a.name)).toEqual([path.basename(archive)]);
    expect(l.pending).toBeNull();
    expect((await call('POST', '/api/admin/restore', { name: '../../etc/passwd' })).status).toBe(404);
    expect((await call('POST', '/api/admin/restore', { name: 'nope.tar' })).status).toBe(404);
    const ok = await call('POST', '/api/admin/restore', { name: path.basename(archive) });
    expect(ok.body).toMatchObject({ staged: true });
    expect((await call('GET', '/api/admin/restore')).body.pending.parts).toContain('system.db');
    expect((await call('POST', '/api/admin/restart')).status).toBe(409); // a test server cannot restart itself
    await call('DELETE', '/api/admin/restore');
    expect((await call('GET', '/api/admin/restore')).body.pending).toBeNull();
  });
});
