import type { VisionProvider } from './types.js';
import { TAGGING_PROMPT } from './types.js';
import { parseTagsFromText } from './parseTags.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export class AnthropicVisionProvider implements VisionProvider {
  constructor(private apiKey: string, private model: string = DEFAULT_MODEL) {}

  async tagImage(imageBuffer: Buffer, mimeType: string): Promise<string[]> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: imageBuffer.toString('base64'),
                },
              },
              { type: 'text', text: TAGGING_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic vision request failed: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    const text = json.content?.[0]?.text ?? '';
    return parseTagsFromText(text);
  }
}
