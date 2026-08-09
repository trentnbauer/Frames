export interface VisionProvider {
  tagImage(imageBuffer: Buffer, mimeType: string): Promise<string[]>;
}

export interface VisionSettings {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model?: string;
}

export const TAGGING_PROMPT =
  'Look at this film photograph. Return 3-8 short lowercase tags describing ' +
  'its visible subjects, mood, light, and setting (e.g. "signage", "neon", ' +
  '"wet-pavement", "portrait", "backlit"). Respond with ONLY a JSON array of ' +
  'strings, no prose, no markdown fences.';
