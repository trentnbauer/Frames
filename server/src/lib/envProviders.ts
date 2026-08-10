import db from '../db.js';

// Declarative: whatever FRAMES_* vars are set on the container define these
// provider rows, re-asserted on every boot (upsert by a reserved name). This
// makes deploying with real keys a docker-compose env: block instead of a
// manual Settings-page step every time the volume is fresh. Editing or
// disabling one of these via the UI sticks only until the next restart — at
// that point the env var re-wins, since it's the source of truth for the
// providers it names. Manually-added providers (any other name) are
// completely unaffected.
export function seedProvidersFromEnv() {
  upsert('OpenAI (env)', {
    type: 'openai',
    api_key: process.env.FRAMES_OPENAI_API_KEY,
    model: process.env.FRAMES_OPENAI_MODEL,
  });

  upsert('Anthropic (env)', {
    type: 'anthropic',
    api_key: process.env.FRAMES_ANTHROPIC_API_KEY,
    model: process.env.FRAMES_ANTHROPIC_MODEL,
  });

  upsert('Self-hosted (env)', {
    type: 'self_hosted',
    base_url: process.env.FRAMES_SELF_HOSTED_BASE_URL,
    api_key: process.env.FRAMES_SELF_HOSTED_API_KEY,
    model: process.env.FRAMES_SELF_HOSTED_MODEL,
  });
}

interface EnvProviderSpec {
  type: 'openai' | 'anthropic' | 'self_hosted';
  api_key?: string;
  base_url?: string;
  model?: string;
}

function upsert(name: string, spec: EnvProviderSpec) {
  // The one required field per type — no key/URL means this provider
  // wasn't configured via env, so leave whatever's in the DB alone.
  const required = spec.type === 'self_hosted' ? spec.base_url : spec.api_key;
  if (!required) return;

  const existing = db.prepare('SELECT id FROM vision_providers WHERE name = ?').get(name) as { id: number } | undefined;

  if (existing) {
    db.prepare('UPDATE vision_providers SET type = ?, api_key = ?, base_url = ?, model = ?, enabled = 1 WHERE id = ?').run(
      spec.type,
      spec.api_key || null,
      spec.base_url || null,
      spec.model || null,
      existing.id
    );
  } else {
    db.prepare(
      'INSERT INTO vision_providers (name, type, api_key, base_url, model, enabled) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(name, spec.type, spec.api_key || null, spec.base_url || null, spec.model || null);
  }
}
