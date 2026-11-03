import fs from 'node:fs';
import sharp from 'sharp';
import { getSetting, setSetting, type DB } from './db.js';
import { derivPath, type Cfg } from './ingest.js';
import { loadSettings } from './settings.js';

/**
 * Optional AI analysis. Two kinds of provider:
 *  - local:    an Ollama server on your own network (/api/chat, /api/embed). Photos never leave it.
 *  - external: any OpenAI-compatible service. Previews (max 1024px) are sent to a third party.
 * Everything here is only reached when the user has switched AI on.
 */

export type AiCfg = { mode: 'local' | 'external'; endpoint: string; model: string; embedModel: string; key: string };
export type Analysis = { description: string; subjects: string[]; tags: string[]; environment: string; composition: string; lighting: string; mood: string };
export type ParsedQuery = { text: string; subjects: string[]; exclude: string[]; colours: string[]; time: { from: string; to: string } | null };

export const getSecret = (db: DB, name: string) => getSetting<string>(db, `secret:${name}`, '');
export const setSecret = (db: DB, name: string, v: string) => setSetting(db, `secret:${name}`, v);

export function aiConfig(db: DB): AiCfg | null {
  const s = loadSettings(db);
  if (s.ai === 'off') return null;
  if (!s.aiEndpoint || !s.aiModel) return null;
  if (s.ai === 'external' && !s.aiExternalAck) return null; // never send photos out without the explicit acknowledgement
  return { mode: s.ai, endpoint: s.aiEndpoint.replace(/\/+$/, ''), model: s.aiModel, embedModel: s.aiEmbedModel, key: getSecret(db, 'aiKey') };
}

const clean = (v: unknown, max = 12): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((s) => String(s).toLowerCase().replace(/[^\p{L}\p{N} '-]/gu, '').trim()).filter((s) => s && s.length <= 40).slice(0, max);
const text = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function post(c: AiCfg, path: string, body: unknown, ms: number): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (c.key) headers.Authorization = `Bearer ${c.key}`;
  const r = await fetch(c.endpoint + path, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`AI provider answered ${r.status}`);
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
  if (c.mode === 'local') {
    const j = await post(c, '/api/chat', { model: c.model, stream: false, format: 'json', messages: [{ role: 'user', content: prompt, ...(jpeg ? { images: [jpeg.toString('base64')] } : {}) }] }, 180_000);
    return parseJson(String(j?.message?.content ?? ''));
  }
  const content: unknown = jpeg ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` } }] : prompt;
  const j = await post(c, '/v1/chat/completions', { model: c.model, response_format: { type: 'json_object' }, messages: [{ role: 'user', content }] }, 180_000);
  return parseJson(String(j?.choices?.[0]?.message?.content ?? ''));
}

const DESCRIBE = 'You are cataloguing a photographer\'s portfolio. Look at the photograph and answer with JSON only, in exactly this shape: {"description": "one or two plain sentences", "subjects": ["main things in the picture, lowercase"], "tags": ["style, mood, setting, lowercase"], "environment": "where/what kind of scene", "composition": "short note on framing and composition", "lighting": "short note on the light", "mood": "one or two words"}. Do not guess names of people.';

export async function describePhoto(c: AiCfg, jpeg: Buffer): Promise<Analysis> {
  const a = await askJson(c, DESCRIBE, jpeg);
  return { description: text(a.description), subjects: clean(a.subjects), tags: clean(a.tags), environment: text(a.environment, 200), composition: text(a.composition, 300), lighting: text(a.lighting, 300), mood: text(a.mood, 80) };
}

export async function embedText(c: AiCfg, input: string): Promise<Float32Array> {
  if (c.mode === 'local') {
    const j = await post(c, '/api/embed', { model: c.embedModel, input }, 60_000);
    const v = j?.embeddings?.[0];
    if (!Array.isArray(v) || !v.length) throw new Error('No embedding returned');
    return Float32Array.from(v);
  }
  const j = await post(c, '/v1/embeddings', { model: c.embedModel, input }, 60_000);
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

export async function ping(c: AiCfg): Promise<{ ok: boolean; detail: string }> {
  try {
    const a = await askJson(c, 'Answer with JSON only: {"ok": true}');
    return { ok: !!a, detail: `Connected to ${c.mode === 'local' ? 'local model' : 'external provider'} (${c.model}).` };
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
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    pending: n(`SELECT COUNT(*) n FROM photos WHERE has_derivs = 1 AND missing = 0 AND (ai_status IS NULL OR (ai_status = 'error' AND ai_attempts < ${MAX_ATTEMPTS}))`),
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
    try { emb = await embedText(c, [a.description, ...a.subjects, ...a.tags].join('. ')); } catch (e) { state.lastError = `Embeddings unavailable: ${(e as Error).message}`; }
    db.transaction(() => {
      // Suggestions only: INSERT OR IGNORE keeps anything the user already accepted or rejected.
      for (const s of a.subjects) db.prepare("INSERT OR IGNORE INTO tags(photo_id, name, source, accepted, kind) VALUES(?, ?, 'ai', 0, 'subject')").run(id, s);
      for (const t of a.tags) db.prepare("INSERT OR IGNORE INTO tags(photo_id, name, source, accepted, kind) VALUES(?, ?, 'ai', 0, 'tag')").run(id, t);
      db.prepare("UPDATE photos SET ai_json = ?, ai_status = 'done', ai_attempts = 0, embedding = ? WHERE id = ?")
        .run(JSON.stringify({ ...a, model: c.model, at: new Date().toISOString() }), emb ? toBlob(emb) : null, id);
    })();
  }

  async function run() {
    if (state.running) return state;
    const c = aiConfig(db);
    if (!c) return state;
    state.running = true; state.done = 0; state.failed = 0; state.lastError = null;
    try {
      const ids = (db.prepare(`SELECT id FROM photos WHERE has_derivs = 1 AND missing = 0 AND (ai_status IS NULL OR (ai_status = 'error' AND ai_attempts < ${MAX_ATTEMPTS})) ORDER BY id`).all() as { id: number }[]).map((r) => r.id);
      state.total = ids.length;
      for (const id of ids) {
        if (!aiConfig(db)) break; // switched off mid-run
        try { await one(c, id); } catch (e) {
          state.failed++;
          state.lastError = e instanceof Error ? e.message : String(e);
          db.prepare("UPDATE photos SET ai_status = 'error', ai_attempts = ai_attempts + 1 WHERE id = ?").run(id);
        }
        state.done++;
      }
    } finally { state.running = false; }
    return state;
  }
  return { state, run };
}
