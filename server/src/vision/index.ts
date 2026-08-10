import db from '../db.js';
import type { VisionProvider } from './types.js';
import { OpenAiVisionProvider } from './openai.js';
import { AnthropicVisionProvider } from './anthropic.js';
import { GeminiVisionProvider } from './gemini.js';
import { SelfHostedVisionProvider } from './selfHosted.js';

export interface VisionProviderRow {
  id: number;
  name: string;
  type: 'openai' | 'anthropic' | 'gemini' | 'self_hosted';
  base_url: string | null;
  api_key: string | null;
  model: string | null;
  enabled: number;
  created_at: string;
}

export interface EnabledProvider {
  id: number;
  name: string;
  instance: VisionProvider;
}

function buildProvider(row: VisionProviderRow): VisionProvider | null {
  if (row.type === 'openai') {
    if (!row.api_key) return null;
    return new OpenAiVisionProvider(row.api_key, row.model || undefined);
  }
  if (row.type === 'anthropic') {
    if (!row.api_key) return null;
    return new AnthropicVisionProvider(row.api_key, row.model || undefined);
  }
  if (row.type === 'gemini') {
    if (!row.api_key) return null;
    return new GeminiVisionProvider(row.api_key, row.model || undefined);
  }
  // Any endpoint speaking the OpenAI-compatible /chat/completions shape —
  // Ollama, LM Studio, llama.cpp, OpenRouter, Groq, etc. — is already
  // covered here without needing its own named provider type: point
  // base_url at it (plus an api_key if it requires one).
  if (row.type === 'self_hosted') {
    if (!row.base_url) return null;
    return new SelfHostedVisionProvider(row.base_url, row.api_key || undefined, row.model || undefined);
  }
  return null;
}

// Every enabled profile is used — running a photo through four AIs at once
// is a deliberate choice the app doesn't gate, see plan.md.
export function getEnabledProviders(): EnabledProvider[] {
  const rows = db.prepare('SELECT * FROM vision_providers WHERE enabled = 1').all() as VisionProviderRow[];
  const out: EnabledProvider[] = [];
  for (const row of rows) {
    const instance = buildProvider(row);
    if (instance) out.push({ id: row.id, name: row.name, instance });
  }
  return out;
}

export type { VisionProvider } from './types.js';
