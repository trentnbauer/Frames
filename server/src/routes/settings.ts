import { Router } from 'express';
import { getSetting, setSetting } from '../lib/settings.js';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  res.json({
    provider: getSetting('vision_provider'),
    model: getSetting('vision_model'),
    hasApiKey: Boolean(getSetting('vision_api_key')),
  });
});

settingsRouter.put('/', (req, res) => {
  const { provider, apiKey, model } = req.body as { provider?: string; apiKey?: string; model?: string };

  if (provider) setSetting('vision_provider', provider);
  if (apiKey) setSetting('vision_api_key', apiKey);
  if (model !== undefined) setSetting('vision_model', model);

  res.json({ ok: true });
});
