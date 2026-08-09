import type { VisionProvider } from './types.js';
import { OpenAiVisionProvider } from './openai.js';
import { AnthropicVisionProvider } from './anthropic.js';
import { getSetting } from '../lib/settings.js';

export function getVisionProvider(): VisionProvider | null {
  const provider = getSetting('vision_provider');
  const apiKey = getSetting('vision_api_key');
  const model = getSetting('vision_model') || undefined;

  if (!provider || !apiKey) return null;

  if (provider === 'openai') return new OpenAiVisionProvider(apiKey, model);
  if (provider === 'anthropic') return new AnthropicVisionProvider(apiKey, model);
  return null;
}

export type { VisionProvider } from './types.js';
