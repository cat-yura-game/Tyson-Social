import { z } from 'zod';

const responseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional(),
    finishReason: z.string().optional(),
    safetyRatings: z.array(z.object({ category: z.string(), probability: z.string() })).optional(),
  })).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  modelVersion: z.string().optional(),
});

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface GeminiGenerateOptions {
  systemInstruction: string;
  parts: GeminiPart[];
  contents?: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }>;
  responseJsonSchema?: Record<string, unknown>;
  maxOutputTokens: number;
}

export interface GeminiTextResult {
  text: string;
  modelVersion: string;
}

export class GeminiBlockedError extends Error {
  constructor(readonly reason: string) {
    super(`Gemini blocked the request: ${reason}`);
    this.name = 'GeminiBlockedError';
  }
}

export class GeminiApiError extends Error {
  constructor(readonly status: number, readonly providerMessage?: string) {
    super(`Gemini API returned HTTP ${status}${providerMessage ? `: ${providerMessage}` : ''}`);
    this.name = 'GeminiApiError';
  }
}

export class GeminiClient {
  private readonly endpoint: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Invalid Gemini model name.');
    this.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  }

  async generate(options: GeminiGenerateOptions): Promise<GeminiTextResult> {
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: options.maxOutputTokens,
    };
    if (options.responseJsonSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseJsonSchema = options.responseJsonSchema;
    }

    const fetcher = this.fetcher;
    const response = await fetcher(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.systemInstruction }] },
        contents: options.contents ?? [{ role: 'user', parts: options.parts }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new GeminiApiError(response.status, errorPayload?.error?.message?.slice(0, 500));
    }
    const parsed = responseSchema.parse(await response.json());
    const blockReason = parsed.promptFeedback?.blockReason;
    const candidate = parsed.candidates?.[0];
    if (blockReason || candidate?.finishReason === 'SAFETY') {
      throw new GeminiBlockedError(blockReason ?? 'SAFETY');
    }

    const text = candidate?.content?.parts.map((part) => part.text ?? '').join('').trim();
    if (!text) throw new Error('Gemini returned no text.');
    return { text, modelVersion: parsed.modelVersion ?? this.model };
  }
}
