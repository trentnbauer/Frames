import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { aiCounts } from './ai.js';
import { saveSources } from './aisources.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

// Photographs only ever go to an AI the person's privacy settings allow: none with a hidden tag, and only a local one for a private shoot.
let env: Env, A: ReturnType<typeof api>;
const ids: Record<string, number> = {};
let shootId = 0;
const sent = vi.fn(async () => new Response('{}', { status: 500 }));
beforeAll(async () => {
  env = makeEnv(); A = api(env);
  fs.writeFileSync(path.join(env.lib, 'beach.jpg'), await jpg(svg(600, 400, '#1b4f9c', '#5dade2', [0.3, 0.3])));
  fs.writeFileSync(path.join(env.lib, 'home.jpg'), await jpg(svg(600, 400, '#7e5109', '#f5cba7', [0.6, 0.6])));
  await A.scan();
  for (const p of (await A.get('/api/photos')).body.photos as any[]) { ids[p.file] = p.id; shootId = p.shootId; }
  // Only an AI outside this network is set up.
  saveSources(env.db, [{ id: 'cloud', type: 'custom', name: 'Cloud AI', endpoint: 'https://ai.example.test/v1', model: 'm', embedModel: '', ack: true }]);
  expect((await A.put('/api/ai/active', { id: 'cloud' })).status).toBe(200);
  vi.stubGlobal('fetch', sent);
});
afterEach(() => sent.mockClear());
afterAll(() => { vi.unstubAllGlobals(); env.app.close(); cleanup(env); });

describe('hidden tags', () => {
  it('keep a photograph from every AI while "Skip photos with hidden tags" is on (the default), and not once it is off', async () => {
    const before = aiCounts(env.db).pending;
    env.db.prepare("INSERT INTO tags(photo_id, name, source, accepted, kind) VALUES(?, 'Family', 'user', 1, 'tag')").run(ids['home.jpg']);
    await A.put('/api/prefs', { hidden: ['family'] });
    expect(aiCounts(env.db).pending).toBe(before - 1);
    const r = await A.post(`/api/photos/${ids['home.jpg']}/recheck`, {});
    expect(r.body.error).toMatch(/hidden tag/);
    expect(sent).not.toHaveBeenCalled();
    await A.put('/api/prefs', { aiPrivate: false });
    expect(aiCounts(env.db).pending).toBe(before);
    await A.put('/api/prefs', { aiPrivate: true, hidden: [] });
  });
});

describe('a private shoot', () => {
  it('is set from its menu, true or false only', async () => {
    expect((await A.patch(`/api/shoots/${shootId}`, { private: 'yes' })).status).toBe(400);
    expect((await A.patch(`/api/shoots/${shootId}`, { private: true })).status).toBe(200);
    expect((await A.get('/api/shoots')).body.find((s: any) => s.id === shootId).private).toBe(true);
  });
  it('never goes to an AI outside this network while "Keep private shoots on local AI only" is on (the default)', async () => {
    const r = await A.post(`/api/photos/${ids['beach.jpg']}/recheck`, {});
    expect(r.body.error).toMatch(/private shoot/);
    expect(sent).not.toHaveBeenCalled();
    // With the switch off, the same photograph is sent.
    await A.put('/api/prefs', { aiLocalOnly: false });
    await A.post(`/api/photos/${ids['beach.jpg']}/recheck`, {});
    expect(sent).toHaveBeenCalled();
    await A.put('/api/prefs', { aiLocalOnly: true });
    await A.patch(`/api/shoots/${shootId}`, { private: false });
  });
  it('still goes to a local AI', async () => {
    await A.patch(`/api/shoots/${shootId}`, { private: true });
    saveSources(env.db, [{ id: 'home', type: 'ollama', name: 'Home AI', endpoint: 'http://localhost:11434', model: 'm', embedModel: '', ack: true }]);
    await A.put('/api/ai/active', { id: 'home' });
    await A.post(`/api/photos/${ids['beach.jpg']}/recheck`, {});
    expect(sent).toHaveBeenCalled();
    expect(String((sent.mock.calls[0] as unknown[])[0])).toContain('localhost');
  });
});
