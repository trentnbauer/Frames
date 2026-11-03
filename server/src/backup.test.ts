import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dailyBackup, integrity } from './backup.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>;
beforeAll(async () => {
  env = makeEnv();
  A = api(env);
  fs.writeFileSync(path.join(env.lib, 'a.jpg'), await jpg(svg(400, 300, '#336699', '#99ccff', [0.3, 0.3])));
  fs.writeFileSync(path.join(env.lib, 'b.jpg'), await jpg(svg(300, 400, '#993333', '#ffcccc', [0.6, 0.6])));
  await A.scan();
});
afterAll(() => cleanup(env));

describe('automatic backups', () => {
  it('reports a healthy database', () => expect(integrity(env.db)).toBe('ok'));
  it('writes one restorable snapshot a day and does not repeat itself', async () => {
    const d = new Date('2026-11-01T10:00:00Z');
    expect(await dailyBackup(env.db, env.data, d)).toBe('auto-2026-11-01.db');
    expect(await dailyBackup(env.db, env.data, d)).toBeNull();
    const copy = new Database(path.join(env.data, 'backups', 'auto-2026-11-01.db'), { readonly: true });
    expect((copy.prepare('SELECT COUNT(*) n FROM photos').get() as { n: number }).n).toBe(2);
    copy.close();
  });
  it('keeps the last seven and lists them newest first', async () => {
    for (let i = 2; i <= 10; i++) await dailyBackup(env.db, env.data, new Date(`2026-11-${String(i).padStart(2, '0')}T10:00:00Z`));
    const list = (await A.get('/api/backup/list')).body as { name: string }[];
    expect(list).toHaveLength(7);
    expect(list[0].name).toBe('auto-2026-11-10.db');
    expect(list.some((b) => b.name === 'auto-2026-11-01.db')).toBe(false);
  });
});

describe('comparing two photos', () => {
  it('returns both and how alike they are', async () => {
    const r = (await A.get('/api/compare?a=1&b=2')).body;
    expect(r.a.id).toBe(1);
    expect(r.b.id).toBe(2);
    expect(r.similarity).toBeGreaterThanOrEqual(0);
    expect(r.similarity).toBeLessThanOrEqual(1);
    expect((await A.get('/api/compare?a=1&b=99')).status).toBe(404);
  });
});
