import type { VisionProvider } from './types.js';
import { TAGGING_PROMPT } from './types.js';
import { parseTagsFromText } from './parseTags.js';

const DEFAULT_MODEL = 'llava';

// Any endpoint speaking the OpenAI-compatible /chat/completions shape:
// Ollama, LM Studio, llama.cpp server, etc. baseUrl is the root before
// "/chat/completions" (e.g. "http://localhost:11434/v1").
export class SelfHostedVisionProvider implements VisionProvider {
  constructor(private baseUrl: string, private apiKey?: string, private model: string = DEFAULT_MODEL) {}

  async tagImage(imageBuffer: Buffer, mimeType: string): Promise<string[]> {
    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    const endpoint = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
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
      throw new Error(`Self-hosted vision request failed: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content ?? '';
    return parseTagsFromText(text);
  }
}
