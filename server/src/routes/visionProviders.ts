import { Router } from 'express';
import db from '../db.js';
import type { VisionProviderRow } from '../vision/index.js';

export const visionProvidersRouter = Router();

const VALID_TYPES = ['openai', 'anthropic', 'gemini', 'self_hosted'];

function toClient(row: VisionProviderRow) {
  const { api_key, ...rest } = row;
  return { ...rest, enabled: Boolean(rest.enabled), hasApiKey: Boolean(api_key) };
}

visionProvidersRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM vision_providers ORDER BY created_at ASC').all() as VisionProviderRow[];
  res.json({ providers: rows.map(toClient) });
});

visionProvidersRouter.post('/', (req, res) => {
  const { name, type, base_url, api_key, model, enabled } = req.body as {
    name?: string;
    type?: string;
    base_url?: string;
    api_key?: string;
    model?: string;
    enabled?: boolean;
  };

  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'invalid type' });
  if (type === 'self_hosted' && !base_url) {
    return res.status(400).json({ error: 'base_url is required for self-hosted providers' });
  }

  const info = db
    .prepare(
      'INSERT INTO vision_providers (name, type, base_url, api_key, model, enabled) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(name, type, base_url || null, api_key || null, model || null, enabled ? 1 : 0);

  const row = db.prepare('SELECT * FROM vision_providers WHERE id = ?').get(info.lastInsertRowid) as VisionProviderRow;
  res.status(201).json({ provider: toClient(row) });
});

visionProvidersRouter.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM vision_providers WHERE id = ?').get(req.params.id) as
    | VisionProviderRow
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Provider not found' });

  const { name, type, base_url, api_key, model, enabled } = req.body as {
    name?: string;
    type?: string;
    base_url?: string;
    api_key?: string;
    model?: string;
    enabled?: boolean;
  };

  if (type && !VALID_TYPES.includes(type)) return res.status(400).json({ error: 'invalid type' });

  db.prepare(
    'UPDATE vision_providers SET name = ?, type = ?, base_url = ?, api_key = ?, model = ?, enabled = ? WHERE id = ?'
  ).run(
    name ?? existing.name,
    type ?? existing.type,
    base_url !== undefined ? base_url || null : existing.base_url,
    // Blank api_key means "leave the stored key alone" (matches the upload-form pattern elsewhere).
    api_key ? api_key : existing.api_key,
    model !== undefined ? model || null : existing.model,
    enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
    req.params.id
  );

  const row = db.prepare('SELECT * FROM vision_providers WHERE id = ?').get(req.params.id) as VisionProviderRow;
  res.json({ provider: toClient(row) });
});

visionProvidersRouter.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM vision_providers WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Provider not found' });
  res.status(204).end();
});
