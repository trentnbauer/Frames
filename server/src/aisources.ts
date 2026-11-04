import crypto from 'node:crypto';
import { getSetting, setSetting, type DB } from './db.js';

/**
 * AI sources. You can configure as many as you like (Claude, Gemini, ChatGPT, Ollama, ...) and pick which one is
 * active. A source is a "type" (which knows the right address, default models and how to talk to it) plus your own
 * address, models, key and, for anything that is not on your network, the acknowledgement that previews are sent out.
 */

export class BadSetting extends Error { statusCode = 400; }

export type AiProtocol = 'ollama' | 'openai' | 'anthropic';
export type AiType = {
  id: string; label: string; group: 'Local' | 'Cloud' | 'Other'; protocol: AiProtocol;
  /** Runs on your own network: photos never leave it. */
  local: boolean;
  endpoint: string; model: string; embedModel: string;
  needsKey: boolean;
  /** False when the service has no embeddings (so search by meaning and "similar" use colour and shape instead). */
  canEmbed: boolean;
  note: string;
};

export const AI_TYPES: AiType[] = [
  { id: 'ollama', label: 'Ollama', group: 'Local', protocol: 'ollama', local: true, endpoint: 'http://localhost:11434', model: 'llava', embedModel: 'nomic-embed-text', needsKey: false, canEmbed: true, note: 'A model running on your own network. Photos never leave it.' },
  { id: 'local-openai', label: 'Local, OpenAI-compatible', group: 'Local', protocol: 'openai', local: true, endpoint: 'http://localhost:1234/v1', model: '', embedModel: '', needsKey: false, canEmbed: true, note: 'LM Studio, llama.cpp, vLLM, LocalAI and similar, on your own network.' },
  { id: 'anthropic', label: 'Claude (Anthropic)', group: 'Cloud', protocol: 'anthropic', local: false, endpoint: 'https://api.anthropic.com', model: 'claude-haiku-5-5', embedModel: '', needsKey: true, canEmbed: false, note: 'Describes photos very well. Claude has no embeddings, so search by meaning is not available from this source.' },
  { id: 'gemini', label: 'Gemini (Google)', group: 'Cloud', protocol: 'openai', local: false, endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', embedModel: 'gemini-embedding-001', needsKey: true, canEmbed: true, note: 'Google’s Gemini, through its OpenAI-compatible address.' },
  { id: 'openai', label: 'ChatGPT (OpenAI)', group: 'Cloud', protocol: 'openai', local: false, endpoint: 'https://api.openai.com', model: 'gpt-4o-mini', embedModel: 'text-embedding-3-small', needsKey: true, canEmbed: true, note: 'OpenAI’s API.' },
  { id: 'openrouter', label: 'OpenRouter', group: 'Cloud', protocol: 'openai', local: false, endpoint: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', embedModel: '', needsKey: true, canEmbed: false, note: 'One key for many hosted models. Pick any vision model it offers.' },
  { id: 'custom', label: 'Other OpenAI-compatible service', group: 'Other', protocol: 'openai', local: false, endpoint: '', model: '', embedModel: '', needsKey: false, canEmbed: true, note: 'Any service that speaks the OpenAI API. Treated as outside your network.' },
];
export const aiType = (id: string) => AI_TYPES.find((t) => t.id === id);

export type AiSource = { id: string; type: string; name: string; endpoint: string; model: string; embedModel: string; ack: boolean };

export const loadSources = (db: DB): AiSource[] => getSetting<AiSource[]>(db, 'aiSources', []);
export const saveSources = (db: DB, list: AiSource[]) => setSetting(db, 'aiSources', list);
/** The AIs the administrator set up for everyone (kept in the server's own database). A person's own come first. */
const serverDb = (db: DB): DB | undefined => (db as unknown as { sys?: DB }).sys;
export const loadShared = (db: DB): AiSource[] => { const s = serverDb(db); return s ? getSetting<AiSource[]>(s, 'aiSources', []) : []; };
export const getSource = (db: DB, id: string) => loadSources(db).find((s) => s.id === id) ?? loadShared(db).find((s) => s.id === id);

export const sourceKey = (db: DB, id: string) => getSetting<string>(db, `secret:ai:${id}:key`, '') || (loadShared(db).some((s) => s.id === id) ? getSetting<string>(serverDb(db)!, `secret:ai:${id}:key`, '') : '');
export const setSourceKey = (db: DB, id: string, key: string) => setSetting(db, `secret:ai:${id}:key`, key);
/** A removed AI leaves nothing behind, not even an empty key. */
export const removeSourceKey = (db: DB, id: string) => { db.prepare('DELETE FROM settings WHERE key = ?').run(`secret:ai:${id}:key`); };

/** Ready to analyse photos: an address and a model, and, if it is outside your network, the acknowledgement. */
export function isReady(s: AiSource): boolean {
  const t = aiType(s.type);
  return !!t && !!s.endpoint && !!s.model && (t.local || s.ack);
}
export function whyNotReady(s: AiSource): string {
  const t = aiType(s.type);
  if (!t) return 'Unknown kind of AI';
  if (!s.endpoint) return 'Enter an address';
  if (!s.model) return 'Enter a model';
  if (!t.local && !s.ack) return 'Confirm that previews will be sent to this third party';
  return '';
}

const short = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

function cleanEndpoint(v: unknown): string {
  const e = short(v, 300);
  if (!e) return '';
  let u: URL;
  try { u = new URL(e); } catch { throw new BadSetting('The address is not a valid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BadSetting('The address must start with http:// or https://');
  return e.replace(/\/+$/, '');
}

export function newSource(typeId: string, input: Record<string, unknown> = {}): AiSource {
  const t = aiType(typeId);
  if (!t) throw new BadSetting('Unknown kind of AI');
  return applySource({ id: crypto.randomBytes(4).toString('hex'), type: t.id, name: t.label, endpoint: t.endpoint, model: t.model, embedModel: t.embedModel, ack: false }, input);
}

/** Validates untrusted input over a source. Unknown keys are dropped. */
export function applySource(cur: AiSource, input: Record<string, unknown>): AiSource {
  const next = { ...cur };
  if (input.name !== undefined) next.name = short(input.name, 60) || aiType(cur.type)!.label;
  if (input.endpoint !== undefined) next.endpoint = cleanEndpoint(input.endpoint);
  if (input.model !== undefined) next.model = short(input.model, 100);
  if (input.embedModel !== undefined) next.embedModel = short(input.embedModel, 100);
  if (input.ack !== undefined) next.ack = input.ack === true;
  return next;
}

/** What the rest of the app uses: the active source, or null when AI is off or not fully set up. */
export type AiCfg = { protocol: AiProtocol; local: boolean; name: string; endpoint: string; model: string; embedModel: string; key: string };
export function activeConfig(db: DB, activeId: string): AiCfg | null {
  if (!activeId) return null;
  const s = getSource(db, activeId);
  if (!s || !isReady(s)) return null; // never send photos out without the explicit acknowledgement
  const t = aiType(s.type)!;
  return { protocol: t.protocol, local: t.local, name: s.name, endpoint: s.endpoint, model: s.model, embedModel: t.canEmbed ? s.embedModel : '', key: sourceKey(db, s.id) };
}
