import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { saveSources, type AiSource } from './aisources.js';
import { loadJobs, orderFor } from './aiJobs.js';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>;
const src = (id: string, name: string): AiSource => ({ id, type: 'ollama', name, endpoint: 'http://localhost:11434', model: 'm', embedModel: '', ack: true });
beforeAll(() => { env = makeEnv(); A = api(env); saveSources(env.db, [src('a', 'One'), src('b', 'Two')]); });
afterAll(() => { env.app.close(); cleanup(env); });

describe('which AI does what', () => {
  it('lists every job in provider order, with new providers at the end', () => {
    expect(loadJobs(env.db).search).toEqual({ on: true, order: ['a', 'b'], skip: [] });
    saveSources(env.db, [src('a', 'One'), src('b', 'Two'), src('c', 'Three')]);
    expect(loadJobs(env.db).describe.order).toEqual(['a', 'b', 'c']);
    saveSources(env.db, [src('a', 'One'), src('b', 'Two')]);
  });
  it('reorders, skips, and refuses to skip them all or use a provider that does not exist', async () => {
    expect((await A.put('/api/ai/jobs/search', { order: ['b', 'a'] })).body.jobs.search.order).toEqual(['b', 'a']);
    expect(orderFor(env.db, 'search')[0]).toBe('b');
    expect((await A.put('/api/ai/jobs/search', { skip: ['b'] })).body.jobs.search.skip).toEqual(['b']);
    expect(orderFor(env.db, 'search')).toEqual(['a']); // b is skipped
    expect((await A.put('/api/ai/jobs/search', { skip: ['a', 'b'] })).status).toBe(400);
    expect((await A.put('/api/ai/jobs/search', { order: ['zzz'] })).status).toBe(400);
    expect((await A.put('/api/ai/jobs/nonsense', { on: false })).status).toBe(400);
    await A.put('/api/ai/jobs/ideas', { on: false });
    expect(orderFor(env.db, 'ideas')).toEqual([]); // off means none
  });
  it('tries the next provider when the first one errors, and throws only when all do', async () => {
    const { tryEach } = await import('./ai.js');
    await A.put('/api/ai/jobs/search', { order: ['a', 'b'], skip: [], on: true });
    const used: string[] = [];
    expect(await tryEach(env.db, 'search', async (c) => { used.push(c.name); if (c.name === 'One') throw new Error('offline'); return c.name; })).toBe('Two');
    expect(used).toEqual(['One', 'Two']);
    await expect(tryEach(env.db, 'search', async () => { throw new Error('down'); })).rejects.toThrow('down');
    await A.put('/api/ai/jobs/search', { on: false });
    expect(await tryEach(env.db, 'search', async (c) => c.name)).toBeNull(); // off: no AI
  });
});
