import type { VisionProvider } from './types.js';
import { TAGGING_PROMPT } from './types.js';
import { parseTagsFromText } from './parseTags.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAiVisionProvider implements VisionProvider {
  constructor(private apiKey: string, private model: string = DEFAULT_MODEL) {}

  async tagImage(imageBuffer: Buffer, mimeType: string): Promise<string[]> {
    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: TAGGING_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI vision request failed: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content ?? '';
    return parseTagsFromText(text);
  }
}
