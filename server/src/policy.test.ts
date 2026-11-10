import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, makeEnv, type Env } from './testutil.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { madeWithin, policyPatch } from './policy.js';
import { trimCache } from './cache.js';
import { readLog, startLogger } from './logger.js';
import { sharedUsage } from './ai.js';

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

describe('limits and rules an administrator sets', () => {
  it('start at safe defaults and keep only valid values', async () => {
    expect((await A.get('/api/admin/instance')).body).toMatchObject({ cacheLimitGb: 0, previewPx: 2400, workers: 0, logLevel: 'info', updateChannel: 'stable', cloudWho: 'members', cloudMinSyncMin: 15, cloudQuotaGb: 0, membersSeeShoots: false, aiMonthlyLimit: 0, aiMembersOwn: true });
    expect(policyPatch({ cacheLimitGb: 7, previewPx: 99, workers: 99, logLevel: 'loud', updateChannel: 'nightly', cloudWho: 'everyone', cloudMinSyncMin: 5, aiMonthlyLimit: 3 })).toEqual({});
    const r = await A.put('/api/admin/instance', { cacheLimitGb: 50, previewPx: 3072, workers: 4, logLevel: 'warnings', updateChannel: 'beta', cloudWho: 'admins', cloudMinSyncMin: 60, cloudQuotaGb: 100, membersSeeShoots: true, aiMonthlyLimit: 500, aiMembersOwn: false });
    expect(r.body).toMatchObject({ cacheLimitGb: 50, previewPx: 3072, workers: 4, logLevel: 'warnings', updateChannel: 'beta', cloudWho: 'admins', cloudMinSyncMin: 60, cloudQuotaGb: 100, membersSeeShoots: true, aiMonthlyLimit: 500, aiMembersOwn: false });
  });
  it('a cache over its limit loses the previews opened longest ago, and keeps thumbnails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-cache-'));
    const mk = (id: number, ageDays: number) => {
      const d = path.join(dir, 'derivatives', String(id)); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'thumb.jpg'), Buffer.alloc(100)); fs.writeFileSync(path.join(d, 'preview.jpg'), Buffer.alloc(1000));
      const at = new Date(Date.now() - ageDays * 86_400_000); fs.utimesSync(path.join(d, 'preview.jpg'), at, at);
    };
    mk(1, 30); mk(2, 10); mk(3, 1);
    expect(trimCache([{ dataDir: dir } as never], 0)).toBe(0); // no limit
    expect(trimCache([{ dataDir: dir } as never], 2500)).toBe(1); // 3300 in total: the oldest preview goes
    expect(fs.existsSync(path.join(dir, 'derivatives', '1', 'preview.jpg'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'derivatives', '1', 'thumb.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'derivatives', '3', 'preview.jpg'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('the log keeps only what the level allows, and can be read back by age', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-log-'));
    startLogger(dir, 'warnings');
    console.log('chatter'); console.warn('careful'); console.error('broken');
    const t = readLog(7).text;
    expect(t).not.toContain('chatter');
    expect(t).toContain('WARN careful');
    expect(t).toContain('ERROR broken');
    fs.appendFileSync(path.join(dir, 'logs', 'frames.log'), '2020-01-01T00:00:00.000Z WARN ancient\n');
    expect(readLog(7).text).not.toContain('ancient');
    expect(readLog(100000).text).toContain('ancient');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('other members’ shoots are listed only when allowed', async () => {
    await A.put('/api/admin/instance', { membersSeeShoots: false });
    expect((await A.get('/api/shoots/others')).body).toEqual({ enabled: false, shoots: [] });
    await A.put('/api/admin/instance', { membersSeeShoots: true });
    expect((await A.get('/api/shoots/others')).body).toMatchObject({ enabled: true });
  });
  it('counts shared AI use against the monthly limit', async () => {
    await A.put('/api/admin/instance', { aiMonthlyLimit: 100 });
    expect(sharedUsage(env.db)).toMatchObject({ used: 0, limit: 100 });
  });
  it('lets an administrator download the log', async () => {
    const r = await A.get('/api/admin/logs/info');
    expect(typeof (r.body as { bytes: number }).bytes).toBe('number');
  });
});

describe('crash reports, idle jobs and shared AI first', () => {
  it('a report is cut down to what is safe, sent only when on and given a place, and not repeated', async () => {
    const { buildReport, crashUrl, reportCrash, scrub } = await import('./crash.js');
    expect(scrub('failed for mia@example.com at /home/mia/photos/secret/x.js:10:5')).toBe('failed for [email] at x.js:10:5');
    expect(scrub('key ' + 'a'.repeat(30))).toBe('key [token]');
    const r = buildReport(new Error('boom in /srv/frames/data/library/a.jpg'), 'uncaughtException', '1.2.3');
    expect(r).toMatchObject({ app: 'frames', version: '1.2.3', kind: 'uncaughtException', message: 'boom in a.jpg' });
    expect(JSON.stringify(r)).not.toContain('/srv/');
    expect(crashUrl({})).toBe('');
    expect(crashUrl({ CRASH_REPORT_URL: 'ftp://x' })).toBe('');
    const env = { CRASH_REPORT_URL: 'https://reports.example.test/in' };
    const calls: { url: string; body: string }[] = [];
    const fetcher = (async (url: string, init: { body: string }) => { calls.push({ url, body: init.body }); return { ok: true }; }) as never;
    expect(await reportCrash(new Error('one'), 'k', { enabled: false, version: 'v', env, fetcher })).toBe(false); // off
    expect(await reportCrash(new Error('one'), 'k', { enabled: true, version: 'v', env: {}, fetcher })).toBe(false); // nowhere to send
    expect(await reportCrash(new Error('one'), 'k', { enabled: true, version: 'v', env, fetcher, now: 1000 })).toBe(true);
    expect(await reportCrash(new Error('one'), 'k', { enabled: true, version: 'v', env, fetcher, now: 2000 })).toBe(false); // the same one
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://reports.example.test/in');
  });
  it('cannot be switched on without a place to send to', async () => {
    delete process.env.CRASH_REPORT_URL;
    expect((await A.put('/api/admin/instance', { crashReports: true })).status).toBe(400);
    process.env.CRASH_REPORT_URL = 'https://reports.example.test/in';
    expect((await A.put('/api/admin/instance', { crashReports: true })).body).toMatchObject({ crashReports: true, crashHost: 'reports.example.test' });
    await A.put('/api/admin/instance', { crashReports: false });
    delete process.env.CRASH_REPORT_URL;
  });
  it('heavy jobs wait for quiet only when set to idle', async () => {
    const { waitIdle, noteUse } = await import('./activity.js');
    await A.put('/api/admin/instance', { heavyJobs: 'always' });
    await waitIdle(env.db, { idleMs: 60_000, pollMs: 5 }); // returns at once
    await A.put('/api/admin/instance', { heavyJobs: 'idle' });
    noteUse('/api/photos');
    let done = false;
    const w = waitIdle(env.db, { idleMs: 80, pollMs: 10 }).then(() => { done = true; });
    await new Promise((r) => setTimeout(r, 30));
    expect(done).toBe(false); // somebody just used it
    noteUse('/api/ai/status'); // a progress poll does not count
    await w;
    expect(done).toBe(true);
    await A.put('/api/admin/instance', { heavyJobs: 'always' });
  });
  it('puts shared AIs first for a person with no order of their own, when asked', async () => {
    const { loadJobs } = await import('./aiJobs.js');
    const { saveSources } = await import('./aisources.js');
    const sys = (env.db as unknown as { sys: import('./db.js').DB }).sys;
    saveSources(env.db, [{ id: 'mine', type: 'ollama', name: 'Mine', endpoint: 'http://x', model: 'm', embedModel: '', ack: false } as never]);
    saveSources(sys, [{ id: 'shared', type: 'ollama', name: 'Shared', endpoint: 'http://y', model: 'm', embedModel: '', ack: false } as never]);
    env.db.prepare("DELETE FROM settings WHERE key = 'aiJobs'").run();
    await A.put('/api/admin/instance', { aiSharedFirst: false });
    expect(loadJobs(env.db).describe.order).toEqual(['mine', 'shared']);
    await A.put('/api/admin/instance', { aiSharedFirst: true });
    expect(loadJobs(env.db).describe.order).toEqual(['shared', 'mine']);
    await A.put('/api/admin/instance', { aiSharedFirst: false });
    saveSources(env.db, []); saveSources(sys, []);
  });
});
