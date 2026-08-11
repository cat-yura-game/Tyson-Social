import { describe, expect, it, vi } from 'vitest';
import { GeminiClient } from '../src/ai/gemini-client';
import { GeminiRecommendationProvider } from '../src/recommendations/gemini-recommendation';

describe('Gemini recommendation provider', () => {
  it('drops invented IDs, removes duplicates and keeps every candidate', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ orderedPostIds: ['post-b', 'invented', 'post-b'] }) }] } }],
      modelVersion: 'gemini-test',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const provider = new GeminiRecommendationProvider(new GeminiClient('secret', 'gemini-test', fetcher as typeof fetch));
    const result = await provider.rank({
      candidates: [{ id: 'post-a', text: 'A' }, { id: 'post-b', text: 'B' }],
      signals: [{ type: 'like', text: 'B' }],
    });
    expect(result.orderedPostIds).toEqual(['post-b', 'post-a']);
  });
});
