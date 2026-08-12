import { describe, expect, it, vi } from 'vitest';
import { GeminiClient } from '../src/ai/gemini-client';

describe('Gemini thinking configuration', () => {
  it('sends high thinking level when requested', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { generationConfig: { thinkingConfig: { thinkingLevel: string } } };
      expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('high');
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });
    });
    await new GeminiClient('secret', 'gemini-3.5-flash-lite', fetcher as typeof fetch).generate({
      systemInstruction: 'test', parts: [{ text: 'test' }], maxOutputTokens: 4000, thinkingLevel: 'high',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
