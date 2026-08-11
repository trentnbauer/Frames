import type { VisionProvider } from './types.js';
import { TAGGING_PROMPT } from './types.js';
import { parseTagsFromText } from './parseTags.js';

const DEFAULT_MODEL = 'gemini-2.0-flash';

export class GeminiVisionProvider implements VisionProvider {
  constructor(private apiKey: string, private model: string = DEFAULT_MODEL) {}

  async tagImage(imageBuffer: Buffer, mimeType: string): Promise<string[]> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: TAGGING_PROMPT },
              { inline_data: { mime_type: mimeType, data: imageBuffer.toString('base64') } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini vision request failed: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return parseTagsFromText(text);
  }
}
