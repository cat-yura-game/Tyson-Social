import { describe, expect, it, vi } from 'vitest';
import { GeminiBlockedError, GeminiClient } from '../src/ai/gemini-client';

describe('Gemini Worker client', () => {
  it('keeps the API key in a request header and validates a response', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'secret-key' });
      expect(String(_input)).not.toContain('secret-key');
      const requestBody = JSON.parse(String(init?.body)) as { generationConfig: Record<string, unknown> };
      expect(requestBody.generationConfig).not.toHaveProperty('thinkingConfig');
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"decision":"allow"}' }] }, finishReason: 'STOP' }],
        modelVersion: 'gemini-test',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const client = new GeminiClient('secret-key', 'gemini-test', fetcher as typeof fetch);
    const result = await client.generate({
      systemInstruction: 'Classify.',
      parts: [{ text: 'hello' }],
      maxOutputTokens: 100,
    });
    expect(result).toEqual({ text: '{"decision":"allow"}', modelVersion: 'gemini-test' });
  });

  it('turns provider safety feedback into a typed blocked result', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      promptFeedback: { blockReason: 'SAFETY' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new GeminiClient('secret-key', 'gemini-test', fetcher as typeof fetch);
    await expect(client.generate({ systemInstruction: 'Classify.', parts: [{ text: 'input' }], maxOutputTokens: 100 }))
      .rejects.toBeInstanceOf(GeminiBlockedError);
  });

  it('sends a bounded multi-turn conversation when contents are provided', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { contents: Array<{ role: string }> };
      expect(body.contents.map((item) => item.role)).toEqual(['user', 'model', 'user']);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const client = new GeminiClient('secret-key', 'gemini-test', fetcher as typeof fetch);
    await client.generate({
      systemInstruction: 'Assist.',
      parts: [{ text: 'latest' }],
      contents: [
        { role: 'user', parts: [{ text: 'first' }] },
        { role: 'model', parts: [{ text: 'reply' }] },
        { role: 'user', parts: [{ text: 'latest' }] },
      ],
      maxOutputTokens: 100,
    });
  });
});
