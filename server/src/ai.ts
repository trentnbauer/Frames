import { waitIdle } from './activity.js';
import fs from 'node:fs';
import sharp from 'sharp';
import { getSetting, setSetting, type DB } from './db.js';
import { derivPath, type Cfg } from './ingest.js';
import { activeConfig, type AiCfg } from './aisources.js';
import { orderFor, type Job } from './aiJobs.js';
import { loadSettings } from './settings.js';
import { policyOf } from './policy.js';
import { aiHiddenFilter, privateShootsLocalOnly } from './privacyPrefs.js';

/**
 * Optional AI analysis, through whichever source is active (see aisources.ts). Three ways of talking to one:
 *  - ollama:    a server on your own network (/api/chat, /api/embed). Photos never leave it.
 *  - openai:    any OpenAI-compatible service (ChatGPT, Gemini, OpenRouter, LM Studio, ...).
 *  - anthropic: Claude's own Messages API.
 * Outside services receive previews (max 1024px), so they need the owner's acknowledgement first.
 * Everything here is only reached when the user has switched AI on.
 */

export type { AiCfg };
export type Analysis = { description: string; tags: string[]; environment: string; composition: string; lighting: string; mood: string };
export type ParsedQuery = { text: string; subjects: string[]; exclude: string[]; colours: string[]; time: { from: string; to: string } | null };

export const getSecret = (db: DB, name: string) => getSetting<string>(db, `secret:${name}`, '');
export const setSecret = (db: DB, name: string, v: string) => setSetting(db, `secret:${name}`, v);

/** The AIs to try for a job, best first. Before anyone sets an order, it is just the one that is switched on. */
/** A person who has set no order and picked no AI of their own starts with the shared AIs first, when the administrator wants that. */
const sharedFirstApplies = (db: DB) => { const s = (db as unknown as { sys?: DB }).sys; return !!s && policyOf(s).aiSharedFirst && !loadSettings(db).aiActive; };
export function aiConfigsFor(db: DB, job: Job): AiCfg[] {
  if (!getSetting<unknown>(db, 'aiJobs', null) && !sharedFirstApplies(db)) { const c = activeConfig(db, loadSettings(db).aiActive); return c ? [c] : []; }
  return orderFor(db, job).map((id) => activeConfig(db, id)).filter((c): c is AiCfg => !!c);
}
const monthOf = () => new Date().toISOString().slice(0, 7);
const usedShared = (db: DB) => { const u = getSetting<{ m: string; n: number }>(db, 'aiUsage', { m: monthOf(), n: 0 }); return u.m === monthOf() ? u.n : 0; };
const countShared = (db: DB) => setSetting(db, 'aiUsage', { m: monthOf(), n: usedShared(db) + 1 });
/** How many requests this person has made to shared paid AIs this month, and the limit (0: none). */
export const sharedUsage = (db: DB) => { const s = (db as unknown as { sys?: DB }).sys; return { used: usedShared(db), limit: s ? policyOf(s).aiMonthlyLimit : 0 }; };
const sharedOverLimit = (db: DB) => { const u = sharedUsage(db); return u.limit > 0 && u.used >= u.limit; };
// Attached to the tenant database so request proxies resolve the correct person's activity.
const ACTIVITY = Symbol('ai activity');
type Activity = { jobs: Partial<Record<Job, number>>; providers: Record<string, { id: string; name: string; color: string; count: number }> };
export function aiActivity(db: DB): Activity {
  const owner = db as DB & { [ACTIVITY]?: Activity };
  return owner[ACTIVITY] ?? (owner[ACTIVITY] = { jobs: {}, providers: {} });
}

/** Runs `fn` with the first AI for the job; if it errors, the next one takes over. Null when no AI is set up for the job; throws the last error if all fail. */
export async function tryEach<T>(db: DB, job: Job, fn: (c: AiCfg) => Promise<T>, allow?: (c: AiCfg) => boolean): Promise<T | null> {
  const list = aiConfigsFor(db, job);
  const activity = aiActivity(db);
  if (list.length) activity.jobs[job] = (activity.jobs[job] ?? 0) + 1;
  try {
    let last: unknown = null;
    for (const c of list) {
      const activityId = c.id ?? c.name;
      const running = activity.providers[activityId];
      activity.providers[activityId] = { id: activityId, name: c.name, color: c.color ?? '', count: (running?.count ?? 0) + 1 };
      try {
      // A photograph from a private shoot is never sent to an AI outside this network; the next (local) one in the order takes over.
      if (allow && !allow(c)) { last = new Error('This photograph is in a private shoot, so only an AI on your own network may look at it. Add a local AI to analyse it.'); continue; }
      // A paid shared AI stops after the monthly number of requests the administrator allows each person; the next AI in the order takes over.
      if (c.shared && !c.local && sharedOverLimit(db)) { last = new Error('The monthly limit for the shared AI has been reached.'); continue; }
      try { const r = await fn(c); if (c.shared && !c.local) countShared(db); return r; } catch (e) { if (c.shared && !c.local) countShared(db); last = e; }
      } finally {
        const count = (activity.providers[activityId]?.count ?? 1) - 1;
        if (count) activity.providers[activityId].count = count;
        else delete activity.providers[activityId];
      }
    }
    if (list.length) throw last;
    return null;
  } finally {
    if (list.length) {
      const remaining = (activity.jobs[job] ?? 1) - 1;
      if (remaining) activity.jobs[job] = remaining;
      else delete activity.jobs[job];
    }
  }
}
export const aiConfig = (db: DB): AiCfg | null => activeConfig(db, (getSetting<unknown>(db, 'aiJobs', null) || sharedFirstApplies(db) ? orderFor(db, 'describe')[0] : undefined) ?? loadSettings(db).aiActive);

/**
 * Tags and subjects from the model: a list, or text separated by commas, semicolons or new lines. Some models run the whole list together
 * ("dog sign signpost forest nature"); a single entry of four or more words is a list, not a name, so it is split into its words.
 * (A name of up to three words, like "golden hour", is kept whole.)
 */
export const splitNames = (v: unknown): string[] => {
  const parts = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/[,;\n]/) : [];
  return parts.flatMap((s) => { const t = s.trim(); return t.split(/\s+/).length >= 4 ? t.split(/\s+/) : [t]; });
};
const clean = (v: unknown, max = 12): string[] => {
  const seen = new Set<string>();
  for (const s of splitNames(v)) { const n = s.toLowerCase().replace(/[^\p{L}\p{N} '-]/gu, '').trim(); if (n && n.length <= 40) seen.add(n); }
  return [...seen].slice(0, max);
};
/**
 * Tidies the model's tags: drops filler ("regular", "mainly a dog"), the lens class (search reads that from the camera details), words that
 * only repeat a longer tag ("wide" and "angle" beside "wide angle"), and near-twins (mist/misty, outdoor/outdoors, fog/foggy: the first stays).
 */
export function tidyTags(tags: string[]): string[] {
  const filler = /^(regular|wide|angle|telephoto|wide angle|photo|photograph|image|picture|shot|scene|good|nice)$|^(a|an|the|mainly|mostly|some|very|just)\s/;
  const stem = (t: string) => t.replace(/s$/, '').replace(/([a-z])\1y$/, '$1').replace(/y$/, '');
  const kept = tags.filter((t) => !filler.test(t));
  const seen = new Set<string>();
  return kept.filter((t) => {
    if (!t.includes(' ') && kept.some((o) => o !== t && o.split(' ').includes(t))) return false;
    const k = stem(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
const text = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** OpenAI-style services keep their API under a path. A bare host means /v1; an address that already has a path is used as given. */
const openaiBase = (c: AiCfg) => { try { return new URL(c.endpoint).pathname.replace(/\/+$/, '') ? c.endpoint : c.endpoint + '/v1'; } catch { return c.endpoint + '/v1'; } };

async function post(c: AiCfg, path: string, body: unknown, ms: number): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (c.key) {
    if (c.protocol === 'anthropic') { headers['x-api-key'] = c.key; headers['anthropic-version'] = '2023-06-01'; } else headers.Authorization = `Bearer ${c.key}`;
  }
  const base = c.protocol === 'openai' ? openaiBase(c) : c.endpoint;
  // No redirects: a service that answers with one could otherwise be sent our key header (only Authorization is dropped across hosts).
  const r = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${c.name} answered ${r.status}`);
  return r.json();
}

function parseJson(s: string): any {
  try { return JSON.parse(s); } catch { /* models sometimes wrap JSON in prose or fences */ }
  const m = /\{[\s\S]*\}/.exec(s);
  if (!m) throw new Error('The model did not return JSON');
  return JSON.parse(m[0]);
}

/** One chat call, with an optional image, that must answer in JSON. */
async function askJson(c: AiCfg, prompt: string, jpeg?: Buffer): Promise<any> {
  if (c.protocol === 'anthropic') {
    const content: unknown = jpeg ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } }, { type: 'text', text: prompt }] : prompt;
    const j = await post(c, '/v1/messages', { model: c.model, max_tokens: 1024, messages: [{ role: 'user', content }] }, 180_000);
    return parseJson(String((j?.content ?? []).find((b: any) => b?.type === 'text')?.text ?? ''));
  }
  if (c.protocol === 'ollama') {
    const j = await post(c, '/api/chat', { model: c.model, stream: false, format: 'json', options: { temperature: 0 }, messages: [{ role: 'user', content: prompt, ...(jpeg ? { images: [jpeg.toString('base64')] } : {}) }] }, 180_000);
    return parseJson(String(j?.message?.content ?? ''));
  }
  const content: unknown = jpeg ? [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` } }, { type: 'text', text: prompt }] : prompt;
  const j = await post(c, '/chat/completions', { model: c.model, response_format: { type: 'json_object' }, messages: [{ role: 'user', content }] }, 180_000);
  return parseJson(String(j?.choices?.[0]?.message?.content ?? ''));
}

const DESCRIBE = 'You are cataloguing a photographer\'s portfolio. Look at the photograph and answer with JSON only, in exactly this shape: {"description": "one or two plain sentences", "subjects": ["main things in the picture, lowercase"], "tags": ["style, mood, setting, lowercase"], "environment": "where/what kind of scene", "composition": "short note on framing and composition", "lighting": "short note on the light", "mood": "one or two words", "light_leak": true or false, "lens_flare": true or false}. light_leak is true only for a light leak: a wash or streak of colour, often red, orange or yellow, coming in from an edge or across the frame, as on film. lens_flare is true only for flare: bright spots, rings, streaks or a washed-out haze from a light shining into the lens. Do not guess names of people. ' +
  // Small vision models embellish ("a black and white photo ... the sky fades from orange to blue"): hold every field to what is in the frame.
  'Be strictly factual: write only what you can clearly see in this photograph, in plain words, with no atmosphere or storytelling. Call it black and white only if it has no colour at all; if it has colour, never call it black and white. Do not state the time of day, weather, season, sky or place unless it is plainly visible. Do not add objects, people or light that are not there, and do not count things you cannot count. If you are unsure of something, leave it out. Every field must agree with the photograph and with the other fields.';
const yes = (v: unknown) => v === true || v === 'true';

export async function describePhoto(c: AiCfg, jpeg: Buffer): Promise<Analysis> {
  const a = await askJson(c, DESCRIBE, jpeg);
  return { description: text(a.description), tags: tidyTags([...new Set([...clean(a.subjects), ...clean(a.tags), ...(yes(a.light_leak) ? ['light leak'] : []), ...(yes(a.lens_flare) ? ['lens flare'] : [])])]), environment: text(a.environment, 200), composition: text(a.composition, 300), lighting: text(a.lighting, 300), mood: text(a.mood, 80) };
}

/** Some sources (Claude, OpenRouter) have no embeddings. Those still describe and tag; search by meaning is just unavailable. */
export const canEmbed = (c: AiCfg) => !!c.embedModel;

export async function embedText(c: AiCfg, input: string): Promise<Float32Array> {
  if (!canEmbed(c)) throw new Error(`${c.name} has no embedding model`);
  if (c.protocol === 'ollama') {
    const j = await post(c, '/api/embed', { model: c.embedModel, input }, 60_000);
    const v = j?.embeddings?.[0];
    if (!Array.isArray(v) || !v.length) throw new Error('No embedding returned');
    return Float32Array.from(v);
  }
  const j = await post(c, '/embeddings', { model: c.embedModel, input }, 60_000);
  const v = j?.data?.[0]?.embedding;
  if (!Array.isArray(v) || !v.length) throw new Error('No embedding returned');
  return Float32Array.from(v);
}

/** Turns "fog over water, early morning, no people" into filters. Null if the model can't or AI is off. */
export async function parseQuery(c: AiCfg, q: string): Promise<ParsedQuery | null> {
  try {
    const a = await askJson(c, `Convert this photo-library search into JSON only: {"text": "key words to match", "subjects": ["things wanted, lowercase"], "exclude": ["things NOT wanted, lowercase"], "colours": ["colour names wanted"], "time": null or {"from": "HH:MM", "to": "HH:MM"} for a time of day}. Search: ${JSON.stringify(q.slice(0, 300))}`);
    const t = a.time && /^\d{1,2}:\d{2}$/.test(a.time.from) && /^\d{1,2}:\d{2}$/.test(a.time.to) ? { from: a.time.from, to: a.time.to } : null;
    return { text: text(a.text, 200), subjects: clean(a.subjects), exclude: clean(a.exclude), colours: clean(a.colours), time: t };
  } catch { return null; }
}

export type FilterPicks = { tags: string[]; colours: string[] };
/**
 * Which of the library's own tags and colours fit a composition's name? The model is shown the names that exist and may
 * only pick from them: anything it makes up is dropped. Null if it cannot answer or AI is off.
 */
export async function suggestFilters(c: AiCfg, title: string, known: { tags: string[]; colours: string[] }): Promise<FilterPicks | null> {
  try {
    const a = await askJson(c, `A photographer is making a composition (a set of prints) called "${title.replace(/"/g, "'").slice(0, 120)}". Choose which of the photographer's existing tags and colours describe the photographs it should contain. Answer with JSON only, in exactly this shape: {"tags": [], "colours": []}. Choose only from these lists, copying names exactly, and choose nothing that does not clearly fit.\nTags: ${JSON.stringify(known.tags)}\nColours: ${JSON.stringify(known.colours)}`);
    const only = (v: unknown, allowed: string[]) => {
      const set = new Map(allowed.map((n) => [n.toLowerCase(), n]));
      return [...new Set((Array.isArray(v) ? v : []).map((n) => set.get(String(n).trim().toLowerCase())).filter((n): n is string => !!n))].slice(0, 12);
    };
    return { tags: only(a?.tags, known.tags), colours: only(a?.colours, known.colours) };
  } catch { return null; }
}

export async function ping(c: AiCfg): Promise<{ ok: boolean; detail: string }> {
  try {
    const a = await askJson(c, 'Answer with JSON only: {"ok": true}');
    return { ok: !!a, detail: `Connected to ${c.name} (${c.model}).` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'Could not connect' };
  }
}

export const toBlob = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
export const fromBlob = (b: Buffer | null | undefined): Float32Array | null => (b && b.length >= 4 ? new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) : null);

// ---------- background analysis ----------
export type AiState = { running: boolean; done: number; total: number; failed: number; lastError: string | null };
const MAX_ATTEMPTS = 3;

export function aiCounts(db: DB) {
  const n = (sql: string, ...args: string[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  const hide = aiHiddenFilter(db);
  return {
    pending: n(`SELECT COUNT(*) n FROM photos WHERE has_derivs = 1 AND missing = 0 AND (ai_status IS NULL OR (ai_status = 'error' AND ai_attempts < ${MAX_ATTEMPTS}))${hide.sql}`, ...hide.args),
    done: n("SELECT COUNT(*) n FROM photos WHERE ai_status = 'done'"),
    failed: n(`SELECT COUNT(*) n FROM photos WHERE ai_status = 'error' AND ai_attempts >= ${MAX_ATTEMPTS}`),
  };
}

export function createAiWorker(db: DB, cfg: Cfg) {
  const state: AiState = { running: false, done: 0, total: 0, failed: 0, lastError: null };

  async function one(c: AiCfg, id: number) {
    const f = derivPath(cfg, id, 'preview');
    if (!fs.existsSync(f)) throw new Error('No preview to analyse');
    // Small enough to send quickly, big enough to see what is in it.
    const jpeg = await sharp(f).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    const a = await describePhoto(c, jpeg);
    let emb: Float32Array | null = null;
    if (canEmbed(c)) try { emb = await embedText(c, [a.description, ...a.tags].join('. ')); } catch (e) { state.lastError = `Embeddings unavailable: ${(e as Error).message}`; }
    db.transaction(() => {
      // Suggestions only: INSERT OR IGNORE keeps anything the user already accepted or rejected.
      for (const t of a.tags) db.prepare("INSERT OR IGNORE INTO tags(photo_id, name, source, accepted, kind, ai_source_id) VALUES(?, ?, 'ai', 0, 'tag', ?)").run(id, t, c.id ?? '');
      db.prepare("UPDATE photos SET ai_json = ?, ai_status = 'done', ai_attempts = 0, embedding = ? WHERE id = ?")
        .run(JSON.stringify({ ...a, model: c.model, sourceId: c.id ?? '', at: new Date().toISOString() }), emb ? toBlob(emb) : null, id);
    })();
  }

  // Asking for a run while one is going returns that same run, so callers that wait really wait for it.
  let current: Promise<AiState> | null = null;
  let automatic = false;
  function run(options: { automatic?: boolean } = {}): Promise<AiState> {
    if (options.automatic && !loadSettings(db).aiAutoAnalyse) return current ?? Promise.resolve(state);
    if (!current) {
      automatic = options.automatic === true;
      current = go().finally(() => { current = null; });
    } else if (!options.automatic) automatic = false; // An explicit request promotes an automatic run to manual.
    return current;
  }
  async function go(): Promise<AiState> {
    const c = aiConfig(db);
    if (!c) return state;
    state.running = true; state.done = 0; state.failed = 0; state.lastError = null;
    try {
      const hide = aiHiddenFilter(db); // photographs with a hidden tag are never sent
      const ids = (db.prepare(`SELECT id FROM photos WHERE has_derivs = 1 AND missing = 0 AND (ai_status IS NULL OR (ai_status = 'error' AND ai_attempts < ${MAX_ATTEMPTS}))${hide.sql} ORDER BY id`).all(...hide.args) as { id: number }[]).map((r) => r.id);
      state.total = ids.length;
      for (const id of ids) {
        await waitIdle(db); // "Heavy jobs run: when idle"
        if (!aiConfig(db) || (automatic && !loadSettings(db).aiAutoAnalyse)) break; // Finish the in-flight request, then honour an automatic-analysis opt-out.
        try { if ((await tryEach(db, 'describe', (cc) => one(cc, id), allowFor(id))) === null) break; } catch (e) {
          state.failed++;
          state.lastError = e instanceof Error ? e.message : String(e);
          db.prepare("UPDATE photos SET ai_status = 'error', ai_attempts = ai_attempts + 1 WHERE id = ?").run(id);
        }
        state.done++;
      }
    } finally { state.running = false; }
    return state;
  }
  /** Only local AIs for a photograph in a private shoot, when the person keeps those local. */
  const allowFor = (id: number) => privateShootsLocalOnly(db) && db.prepare('SELECT 1 FROM photos p JOIN shoots s ON s.id = p.shoot_id WHERE p.id = ? AND s.private = 1').get(id) ? (cc: AiCfg) => cc.local : undefined;
  /** Looks at one photograph now (not in the background) and says which suggestions are new. */
  async function analyse(id: number): Promise<{ ai: boolean; added: string[]; descriptionChanged: boolean; error?: string }> {
    const c = aiConfig(db);
    if (!c) return { ai: false, added: [], descriptionChanged: false };
    const hide = aiHiddenFilter(db);
    if (hide.sql && !db.prepare(`SELECT 1 FROM photos WHERE id = ?${hide.sql}`).get(id, ...hide.args)) return { ai: true, added: [], descriptionChanged: false, error: 'This photograph has a hidden tag, so it is never sent to an AI.' };
    const sugg = () => new Set((db.prepare("SELECT name FROM tags WHERE photo_id = ? AND accepted = 0 AND source = 'ai'").all(id) as { name: string }[]).map((r) => r.name));
    const desc = () => { try { return String(JSON.parse((db.prepare('SELECT ai_json FROM photos WHERE id = ?').get(id) as { ai_json: string | null }).ai_json ?? '{}').description ?? ''); } catch { return ''; } };
    const before = sugg(), was = desc();
    try { await tryEach(db, 'describe', (cc) => one(cc, id), allowFor(id)); } catch (e) { return { ai: true, added: [], descriptionChanged: false, error: e instanceof Error ? e.message : 'The AI could not look at this photograph' }; }
    return { ai: true, added: [...sugg()].filter((n) => !before.has(n)), descriptionChanged: desc() !== was };
  }
  return { state, run, analyse };
}
