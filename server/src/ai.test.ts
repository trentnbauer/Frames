import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

/** A stand-in for a model server. It speaks both Ollama's and OpenAI's formats and records what it was sent. */
const DESCRIPTIONS = [
  { description: 'A foggy harbour at dawn with a small boat', subjects: ['harbour', 'boat'], tags: ['fog', 'moody'] },
  { description: 'Sunlit desert dunes with long shadows', subjects: ['desert', 'dunes'], tags: ['warm', 'minimal'] },
  { description: 'Dense green forest after rain', subjects: ['forest'], tags: ['green', 'moody'] },
];
const seen = { chat: 0, embed: 0, auth: [] as string[], xkeys: [] as string[], images: 0, paths: [] as string[], failNext: 0 };
const vec = (text: string) => {
  const v = new Array(24).fill(0);
  for (const w of text.toLowerCase().split(/[^a-z]+/).filter(Boolean)) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 24; v[h] += 1; }
  return v;
};
let server: http.Server, base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      seen.paths.push(req.url ?? '');
      if (req.headers.authorization) seen.auth.push(req.headers.authorization);
      if (req.headers['x-api-key']) seen.xkeys.push(String(req.headers['x-api-key']) + '|' + String(req.headers['anthropic-version']));
      const j = body ? JSON.parse(body) : {};
      const send = (o: unknown, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (seen.failNext > 0) { seen.failNext--; return send({ error: 'boom' }, 500); }
      const chatText = (j.messages?.[0]?.content as string | { text: string }[]) ?? '';
      const prompt = typeof chatText === 'string' ? chatText : (chatText as any[]).find((b) => b.type === 'text').text;
      const hasImage = !!j.messages?.[0]?.images?.length || Array.isArray(chatText);
      if (req.url === '/api/chat' || req.url === '/v1/chat/completions' || req.url === '/v1/messages' || req.url === '/v1beta/openai/chat/completions') {
        seen.chat++;
        if (hasImage) seen.images++;
        let out: unknown;
        if (prompt.startsWith('Convert this photo-library search')) out = { text: 'fog', subjects: ['harbour'], exclude: ['people'], colours: [], time: { from: '05:00', to: '08:00' } };
        else if (prompt.startsWith('A photographer is making a composition')) out = { subjects: ['Harbour', 'made up'], tags: ['moody'], colours: ['blue', 'notacolour'] };
        else if (prompt.includes('"ok": true')) out = { ok: true };
        else out = DESCRIPTIONS[(seen.images - 1) % DESCRIPTIONS.length] && { ...DESCRIPTIONS[(seen.images - 1) % DESCRIPTIONS.length], environment: 'outdoors', composition: 'centred', lighting: 'soft', mood: 'calm' };
        if (req.url === '/v1/messages') return send({ content: [{ type: 'text', text: JSON.stringify(out) }] });
        return send(req.url === '/api/chat' ? { message: { content: JSON.stringify(out) } } : { choices: [{ message: { content: JSON.stringify(out) } }] });
      }
      if (req.url === '/api/embed') { seen.embed++; return send({ embeddings: [vec(j.input)] }); }
      if (req.url === '/v1/embeddings' || req.url === '/v1beta/openai/embeddings') { seen.embed++; return send({ data: [{ embedding: vec(j.input) }] }); }
      send({ error: 'not found' }, 404);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

let env: Env, A: ReturnType<typeof api>;
beforeAll(async () => {
  env = makeEnv();
  A = api(env);
  const w = async (n: string, a: string, b: string, c: [number, number], bars = false) => fs.writeFileSync(path.join(env.lib, n), await jpg(svg(900, 600, a, b, c, bars)));
  await w('harbour.jpg', '#34495e', '#aab7b8', [0.2, 0.3]);
  await w('desert.jpg', '#d35400', '#f5cba7', [0.8, 0.2]);
  await w('forest.jpg', '#145a32', '#58d68d', [0.5, 0.5], true);
  await A.scan();
});
afterAll(() => cleanup(env));

/** Adds an AI source (the way the Settings page does) and, if asked, makes it the active one. */
const addSource = async (type: string, fields: Record<string, unknown>, activate = true) => {
  const r = await A.post('/api/ai/sources', { type, ...fields });
  const src = (r.body.sources as any[]).at(-1);
  if (activate) return { r, src, act: await A.put('/api/ai/active', { id: src.id }) };
  return { r, src, act: null };
};
const photos = async () => (await A.get('/api/photos')).body.photos as any[];

describe('turning AI on', () => {
  it('is off by default and the app works without it', async () => {
    expect((await A.get('/api/ai/status')).body.enabled).toBe(false);
    expect((await A.post('/api/ai/run')).status).toBe(400);
    expect((await photos()).every((p) => p.aiStatus === null)).toBe(true);
  });
  it('needs an address and a model, and a valid URL', async () => {
    expect((await A.post('/api/ai/sources', { type: 'nope' })).status).toBe(400);
    expect((await A.post('/api/ai/sources', { type: 'ollama', endpoint: 'ftp://x' })).status).toBe(400);
    expect((await A.post('/api/ai/sources', { type: 'ollama', endpoint: 'not a url' })).status).toBe(400);
    const { src, act } = await addSource('local-openai', { endpoint: '', model: '' });
    expect(act!.status).toBe(400); // an empty address and model cannot be switched on
    expect((await A.get('/api/ai/status')).body.enabled).toBe(false);
    await A.del(`/api/ai/sources/${src.id}`);
  });
  it('refuses an outside service until the user confirms previews will be sent to a third party', async () => {
    const { src, act } = await addSource('custom', { endpoint: base, model: 'vision', embedModel: 'embed' });
    expect(act!.status).toBe(400);
    expect(act!.body.error).toMatch(/third party/);
    expect((await A.get('/api/ai/status')).body.enabled).toBe(false);
    expect(seen.chat).toBe(0); // nothing was sent anywhere
    await A.del(`/api/ai/sources/${src.id}`);
  });
});

describe('local provider', () => {
  it('analyses photos in the background: descriptions, subjects, tags and embeddings, as suggestions', async () => {
    const { act } = await addSource('ollama', { endpoint: base + '/', model: 'llava', embedModel: 'nomic' });
    expect(act!.status).toBe(200);
    expect((await A.get('/api/settings')).body.settings.ai).toBe('local');
    expect((await A.post('/api/ai/test')).body.ok).toBe(true);
    const r = await A.raw('POST', '/api/ai/run?wait=1', {});
    expect(r.body).toMatchObject({ enabled: true, pending: 0, done: 3, failed: 0 });
    expect(seen.images).toBe(3);
    const p = (await photos())[0];
    const full = (await A.get(`/api/photos/${p.id}`)).body;
    expect(full.aiStatus).toBe('done');
    expect(full.aiSuggestion.description).toMatch(/\w+/);
    // Suggestions are not facts: nothing is accepted yet.
    expect(full.tags.length).toBeGreaterThan(0);
    expect(full.tags.every((t: any) => t.source === 'ai' && t.accepted === false)).toBe(true);
    expect(full.tags.some((t: any) => t.kind === 'subject')).toBe(true);
    expect(full.description).toBe('');
    // Not searchable as a tag until accepted.
    expect((await A.get('/api/photos?tag=fog')).body.photos).toHaveLength(0);
  });
  it('lets the user accept, edit and reject what the AI said, and does not suggest rejected tags again', async () => {
    const p = (await photos()).find((x) => x.file === 'harbour.jpg' || true);
    const full = (await A.get(`/api/photos/${p.id}`)).body;
    const tag = full.tags.find((t: any) => t.kind === 'tag');
    await A.put(`/api/photos/${p.id}/tags`, { name: tag.name, action: 'add' }); // accept
    expect((await A.get(`/api/photos?tag=${tag.name}`)).body.photos.map((x: any) => x.id)).toContain(p.id);
    const other = full.tags.find((t: any) => t.kind === 'subject');
    await A.put(`/api/photos/${p.id}/tags`, { name: other.name, kind: 'subject', action: 'reject' });
    expect(((await A.get(`/api/photos/${p.id}`)).body.tags as any[]).some((t) => t.name === other.name)).toBe(false);
    await A.patch(`/api/photos/${p.id}`, { acceptAiDescription: true });
    const after = (await A.get(`/api/photos/${p.id}`)).body;
    expect(after.description).toBe(full.aiSuggestion.description);
    expect(after.descSource).toBe('user');
    await A.patch(`/api/photos/${p.id}`, { rejectAiDescription: true, description: '' });
    expect((await A.get(`/api/photos/${p.id}`)).body.aiSuggestion.description).toBe('');
    // Re-analysing keeps the rejection.
    await A.patch(`/api/photos/${p.id}`, { reanalyse: true });
    await A.raw('POST', '/api/ai/run?wait=1', {});
    expect(((await A.get(`/api/photos/${p.id}`)).body.tags as any[]).some((t) => t.name === other.name)).toBe(false);
  });
  it('searches by meaning, ranking the best match first', async () => {
    const r = (await A.get('/api/photos?q=foggy%20harbour%20boat&semantic=1')).body;
    expect(r.semantic).toBe(true);
    expect(r.photos[0].file).toBe('harbour.jpg');
    expect(r.photos[0].similarity).toBeGreaterThanOrEqual(r.photos[1].similarity);
  });
  it('with words found in what names a photograph (file, camera, tag), shows those photographs and not every other one ranked below them', async () => {
    const found = (await A.get('/api/photos?q=harbour&semantic=1')).body;
    expect(found.photos.map((p: any) => p.file)).toContain('harbour.jpg');
    expect(found.count).toBeLessThan(found.total);
    expect(found.semantic).toBe(false); // an exact answer, not a ranking
    for (const p of found.photos) expect(`${p.file} ${p.camera} ${p.lens} ${p.place} ${p.title}`.toLowerCase()).toContain('harbour');
    expect((await A.get('/api/photos?q=foggy%20harbour%20boat&semantic=1')).body.semantic).toBe(true); // meaning only (the AI's words): ranked as before
  });
  it('turns a natural-language query into chips', async () => {
    const r = (await A.post('/api/search/parse', { q: 'fog over the harbour, early morning, no people' })).body;
    expect(r.ai).toBe(true);
    expect(r.parsed).toEqual({ text: 'fog', subjects: ['harbour'], exclude: ['people'], colours: [], time: { from: '05:00', to: '08:00' } });
  });
  it('finds subjects, tags and colours for a composition name, only from names the library already has', async () => {
    const h = (await photos()).find((p) => p.file === 'harbour.jpg');
    await A.put(`/api/photos/${h.id}/tags`, { name: 'harbour', kind: 'subject' });
    expect((await A.post('/api/ai/suggest-filters', { name: '   ' })).status).toBe(400);
    const r = (await A.post('/api/ai/suggest-filters', { name: 'Harbour mornings' })).body;
    expect(r.ai).toBe(true);
    // 'Harbour' matches the existing 'harbour' (any case); 'made up', a tag nobody has and a colour that is not one are dropped.
    expect(r.picks).toEqual({ subjects: ['harbour'], tags: [], colours: ['blue'] });
  });
  it('re-checks one photograph now and says what is new', async () => {
    const h = (await photos()).find((p) => p.file === 'harbour.jpg');
    env.db.prepare("DELETE FROM tags WHERE photo_id = ? AND source = 'ai'").run(h.id);
    env.db.prepare('UPDATE photos SET ai_json = NULL, ai_status = NULL WHERE id = ?').run(h.id);
    const r = (await A.post(`/api/photos/${h.id}/recheck`)).body;
    expect(r.ai).toBe(true);
    expect(r.added.length).toBeGreaterThan(0); // suggestions that were not there before
    expect(r.descriptionChanged).toBe(true);
    expect(((await A.get(`/api/photos/${h.id}`)).body.tags as any[]).some((t) => !t.accepted && t.source === 'ai')).toBe(true); // they wait for a yes
  });
  it('uses AI embeddings for "similar photos" when they exist', async () => {
    const h = (await photos()).find((p) => p.file === 'harbour.jpg');
    expect((await A.get(`/api/photos/${h.id}/similar`)).body).toHaveLength(2);
  });
  it('retries failures a limited number of times, and keeps going with the rest', async () => {
    env.db.prepare("UPDATE photos SET ai_status = NULL, ai_json = NULL, ai_attempts = 0 WHERE id IN (1, 2)").run();
    seen.failNext = 2;
    const r = (await A.raw('POST', '/api/ai/run?wait=1', {})).body;
    expect(r.failed).toBe(2);
    expect(r.lastError).toMatch(/500/);
    expect((await photos()).filter((p) => p.aiStatus === 'error')).toHaveLength(2);
    expect(r.pending).toBe(2); // still eligible for another try
    const again = (await A.raw('POST', '/api/ai/run?wait=1', {})).body;
    expect(again.done).toBe(2);
    expect((await photos()).every((p) => p.aiStatus === 'done')).toBe(true);
  });
  it('can be asked to look at the whole library again, which keeps what was accepted', async () => {
    const all = (await photos()) as any[];
    expect(all.every((p) => p.aiStatus === 'done')).toBe(true);
    const first = all[0];
    env.db.prepare("UPDATE tags SET accepted = 1 WHERE photo_id = ? AND source = 'ai' AND kind = 'tag'").run(first.id); // the person accepted these
    const accepted = (env.db.prepare("SELECT name FROM tags WHERE photo_id = ? AND accepted = 1 AND source = 'ai'").all(first.id) as any[]).map((r) => r.name);
    expect(accepted.length).toBeGreaterThan(0);
    const chats = seen.chat;
    const r = (await A.raw('POST', '/api/ai/run?all=1&wait=1', {})).body;
    expect(seen.chat - chats).toBe(all.length); // one look per photograph, not only the waiting ones
    expect(r.done).toBe(all.length);
    expect((await photos()).every((p: any) => p.aiStatus === 'done')).toBe(true);
    const still = (env.db.prepare("SELECT name FROM tags WHERE photo_id = ? AND accepted = 1 AND source = 'ai'").all(first.id) as any[]).map((r) => r.name);
    expect(still).toEqual(expect.arrayContaining(accepted));
    // an ordinary run afterwards has nothing left to do
    const none = seen.chat;
    await A.raw('POST', '/api/ai/run?wait=1', {});
    expect(seen.chat).toBe(none);
  });
  it('switching AI off stops all calls and hides suggestions from search', async () => {
    await A.put('/api/ai/active', { id: '' });
    const before = seen.chat + seen.embed;
    expect((await A.get('/api/photos?q=foggy&semantic=1')).body.semantic).toBe(false);
    expect((await A.post('/api/search/parse', { q: 'x' })).body).toEqual({ ai: false, parsed: null });
    expect((await A.post('/api/ai/suggest-filters', { name: 'Birds' })).body).toEqual({ ai: false, picks: null });
    expect(seen.chat + seen.embed).toBe(before);
  });
});

describe('outside services', () => {
  it('ChatGPT-style: works once acknowledged, sends the key as a bearer token, and never returns the key', async () => {
    const { src, act } = await addSource('openai', { endpoint: base, model: 'gpt-vision', embedModel: 'text-embed', ack: true, key: 'sk-test-123' });
    expect(act!.status).toBe(200);
    expect((await A.get('/api/settings')).body.settings.ai).toBe('external');
    expect((await A.post('/api/ai/test')).body.ok).toBe(true);
    expect(seen.auth).toContain('Bearer sk-test-123');
    expect(seen.paths).toContain('/v1/chat/completions');
    env.db.prepare("UPDATE photos SET ai_status = NULL, ai_json = NULL WHERE id = 1").run();
    await A.raw('POST', '/api/ai/run?wait=1', {});
    expect(seen.paths).toContain('/v1/embeddings');
    const shown = JSON.stringify([(await A.get('/api/settings')).body, (await A.get('/api/ai/sources')).body]);
    expect(shown).not.toContain('sk-test-123');
    expect((await A.get('/api/ai/sources')).body.sources.find((x: any) => x.id === src.id)).toMatchObject({ hasKey: true, ready: true });
  });
  it('Gemini-style: an address that already has a path is used as given', async () => {
    const { act } = await addSource('gemini', { endpoint: base + '/v1beta/openai', key: 'g-key', ack: true });
    expect(act!.status).toBe(200);
    expect((await A.post('/api/ai/test')).body.ok).toBe(true);
    expect(seen.paths).toContain('/v1beta/openai/chat/completions');
    expect(seen.auth).toContain('Bearer g-key');
  });
  it('Claude: uses its own API, key header and version, sends the photo as an image block, and skips embeddings', async () => {
    const { act } = await addSource('anthropic', { endpoint: base, key: 'ant-key', ack: true });
    expect(act!.status).toBe(200);
    expect((await A.post('/api/ai/test')).body.ok).toBe(true);
    expect(seen.xkeys).toContain('ant-key|2023-06-01');
    expect(seen.auth).not.toContain('Bearer ant-key');
    env.db.prepare("UPDATE photos SET ai_status = NULL, ai_json = NULL WHERE id = 1").run();
    const embeds = seen.embed, images = seen.images;
    const r = await A.raw('POST', '/api/ai/run?wait=1', {});
    expect(r.body).toMatchObject({ pending: 0, failed: 0 });
    expect(seen.images).toBe(images + 1);
    expect(seen.embed).toBe(embeds); // Claude has no embeddings
    expect(r.body.lastError ?? null).toBeNull();
    expect((await A.get('/api/photos?q=foggy&semantic=1')).body.semantic).toBe(false);
  });
  it('can hold several at once, switch between them, and remove one', async () => {
    const list = (await A.get('/api/ai/sources')).body;
    expect(list.sources.map((s: any) => s.type)).toEqual(expect.arrayContaining(['ollama', 'openai', 'gemini', 'anthropic']));
    expect(list.types.map((t: any) => t.id)).toEqual(expect.arrayContaining(['anthropic', 'gemini', 'openai', 'ollama', 'local-openai', 'openrouter', 'custom']));
    const ollama = list.sources.find((s: any) => s.type === 'ollama');
    expect((await A.put('/api/ai/active', { id: ollama.id })).body.active).toBe(ollama.id);
    expect((await A.get('/api/settings')).body.settings.ai).toBe('local');
    expect((await A.put('/api/ai/active', { id: 'nonsense' })).status).toBe(400);
    const gem = list.sources.find((s: any) => s.type === 'gemini');
    await A.put('/api/ai/active', { id: gem.id });
    expect((await A.del(`/api/ai/sources/${gem.id}`)).body.active).toBe(''); // removing the one in use turns AI off
    expect((await A.get('/api/ai/status')).body.enabled).toBe(false);
    expect(env.db.prepare('SELECT COUNT(*) n FROM settings WHERE key = ?').get(`secret:ai:${gem.id}:key`)).toEqual({ n: 0 }); // the key goes with the AI: not even an empty one is left
  });
  it('stops sending photos if the acknowledgement is withdrawn from the active one', async () => {
    const oa = (await A.get('/api/ai/sources')).body.sources.find((s: any) => s.type === 'openai');
    await A.put('/api/ai/active', { id: oa.id });
    expect((await A.get('/api/settings')).body.settings.ai).toBe('external');
    await A.put(`/api/ai/sources/${oa.id}`, { ack: false });
    const s = (await A.get('/api/settings')).body.settings;
    expect(s.ai).toBe('off');
    expect(s.aiActive).toBe('');
    expect((await A.put('/api/ai/active', { id: oa.id })).status).toBe(400);
  });
  it('lets the key be replaced or cleared, and testing needs no acknowledgement (no photo is sent)', async () => {
    const { src } = await addSource('openai', { endpoint: base, model: 'm' }, false);
    expect((await A.post(`/api/ai/sources/${src.id}/test`)).body.ok).toBe(true);
    await A.put(`/api/ai/sources/${src.id}`, { key: 'k-new' });
    expect((await A.get('/api/ai/sources')).body.sources.find((x: any) => x.id === src.id).hasKey).toBe(true);
    await A.put(`/api/ai/sources/${src.id}`, { clearKey: true });
    expect((await A.get('/api/ai/sources')).body.sources.find((x: any) => x.id === src.id).hasKey).toBe(false);
  });
});

describe('a service that redirects', () => {
  it('never receives the key: redirects are not followed', async () => {
    const got: string[] = [];
    const sink = http.createServer((req, res) => { got.push(String(req.headers['x-api-key'] ?? '') + String(req.headers.authorization ?? '')); res.end('{}'); });
    await new Promise<void>((r) => sink.listen(0, '127.0.0.1', r));
    const hop = http.createServer((_req, res) => { res.writeHead(302, { Location: `http://127.0.0.1:${(sink.address() as AddressInfo).port}/steal` }); res.end(); });
    await new Promise<void>((r) => hop.listen(0, '127.0.0.1', r));
    try {
      const { src } = await addSource('anthropic', { endpoint: `http://127.0.0.1:${(hop.address() as AddressInfo).port}`, key: 'ant-secret', ack: true }, false);
      const r = (await A.post(`/api/ai/sources/${src.id}/test`)).body;
      expect(r.ok).toBe(false);
      expect(got).toEqual([]);
    } finally { hop.close(); sink.close(); }
  });
});

describe('moving from the old single setup', () => {
  it('keeps an existing configuration as the first source, still active, with its key', async () => {
    const e = makeEnv();
    try {
      e.db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('settings', ?)").run(JSON.stringify({ ai: 'external', aiEndpoint: 'https://old.example.com', aiModel: 'm1', aiEmbedModel: 'e1', aiExternalAck: true }));
      e.db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('secret:aiKey', ?)").run(JSON.stringify('old-key'));
      e.db.pragma('user_version = 5');
      const { migrate } = await import('./db.js');
      migrate(e.db);
      const st = JSON.parse((e.db.prepare("SELECT value FROM settings WHERE key = 'settings'").get() as any).value);
      expect(st).toMatchObject({ aiActive: 'first' });
      expect(st.ai).toBeUndefined();
      const src = JSON.parse((e.db.prepare("SELECT value FROM settings WHERE key = 'aiSources'").get() as any).value)[0];
      expect(src).toMatchObject({ id: 'first', endpoint: 'https://old.example.com', model: 'm1', embedModel: 'e1', ack: true });
      expect(JSON.parse((e.db.prepare("SELECT value FROM settings WHERE key = 'secret:ai:first:key'").get() as any).value)).toBe('old-key');
      expect(e.db.prepare("SELECT 1 FROM settings WHERE key = 'secret:aiKey'").get()).toBeUndefined();
    } finally { cleanup(e); }
  });
});
