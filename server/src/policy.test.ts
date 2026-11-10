import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, makeEnv, type Env } from './testutil.js';
import { madeWithin, policyPatch } from './policy.js';

let env: Env, A: ReturnType<typeof api>;
beforeAll(() => { env = makeEnv(); A = api(env); });
afterAll(() => { env.app.close(); cleanup(env); });

describe('server choices (sessions, guest links, backups)', () => {
  it('start at safe defaults', async () => {
    expect((await A.get('/api/admin/instance')).body).toMatchObject({ sessionDays: 14, shareExpireDays: 21, shareDownload: false, shareAskName: true, backupAuto: true, backupEveryDays: 1, backupKeep: 7 });
  });
  it('keep only valid values', async () => {
    expect(policyPatch({ sessionDays: 0, shareExpireDays: 5, backupEveryDays: 3, backupKeep: 99, shareDownload: 'yes' })).toEqual({});
    expect(policyPatch({ sessionDays: 30, shareExpireDays: 0, backupEveryDays: 7, backupKeep: 14, shareDownload: true, backupAuto: false, shareAskName: false }))
      .toEqual({ sessionDays: 30, shareExpireDays: 0, backupEveryDays: 7, backupKeep: 14, shareDownload: true, backupAuto: false, shareAskName: false });
    const r = await A.put('/api/admin/instance', { sessionDays: 9999, backupKeep: 0 });
    expect(r.body).toMatchObject({ sessionDays: 14, backupKeep: 7 });
  });
  it('apply to a new share link unless the request says otherwise', async () => {
    const c = (await A.post('/api/collections', { name: 'Wall' })).body as { id: number };
    await A.put('/api/admin/instance', { shareExpireDays: 7, shareDownload: true, shareAskName: false });
    const s = (await A.post('/api/shares', { kind: 'collection', id: c.id })).body as { allowDownload: boolean; askName: boolean; expiresAt: string | null };
    expect(s.allowDownload).toBe(true);
    expect(s.askName).toBe(false);
    const days = (new Date(s.expiresAt!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    const t = (await A.post('/api/shares', { kind: 'collection', id: c.id, allowDownload: false, askName: true })).body as { allowDownload: boolean; askName: boolean };
    expect(t).toMatchObject({ allowDownload: false, askName: true });
    await A.put('/api/admin/instance', { shareExpireDays: 0 });
    expect(((await A.post('/api/shares', { kind: 'collection', id: c.id })).body as { expiresAt: string | null }).expiresAt).toBeNull();
  });
  it('a weekly schedule skips a backup while one is younger than a week', () => {
    const now = Date.now();
    expect(madeWithin([{ mtimeMs: now - 2 * 86_400_000 }], 7, now)).toBe(true);
    expect(madeWithin([{ mtimeMs: now - 7 * 86_400_000 }], 7, now)).toBe(false);
    expect(madeWithin([], 7, now)).toBe(false);
  });
});

describe('guest ranking weight', () => {
  it('can be read as well as set', async () => {
    expect((await A.get('/api/collections/guest-weight')).body).toEqual({ weight: 35 });
    await A.put('/api/collections/guest-weight', { weight: 20 });
    expect((await A.get('/api/collections/guest-weight')).body).toEqual({ weight: 20 });
  });
});

describe('system information', () => {
  it('reports the version, disks, cache and health checks to an administrator', async () => {
    const r = (await A.get('/api/admin/system')).body as { version: string; cache: { bytes: number }; checks: { name: string; ok: boolean }[] };
    expect(typeof r.version).toBe('string');
    expect(r.cache.bytes).toBeGreaterThanOrEqual(0);
    expect(r.checks.map((c) => c.name)).toEqual(['database', 'library folder', 'cache', 'email']);
    expect(r.checks.find((c) => c.name === 'database')!.ok).toBe(true);
  });
});
