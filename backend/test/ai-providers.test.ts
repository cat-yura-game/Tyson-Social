import { describe, expect, it } from 'vitest';
import { resolveGeminiModels } from '../src/ai/providers';

describe('Gemini model selection', () => {
  it('allows stable free-tier models selected per task', () => {
    expect(resolveGeminiModels({
      GEMINI_MODERATION_MODEL: 'gemini-3.5-flash-lite',
      GEMINI_SUMMARY_MODEL: 'gemini-3.5-flash-lite',
      GEMINI_RECOMMENDATION_MODEL: 'gemini-3.5-flash-lite',
    })).toEqual({
      moderation: 'gemini-3.5-flash-lite',
      summary: 'gemini-3.5-flash-lite',
      recommendation: 'gemini-3.5-flash-lite',
    });
  });

  it('rejects arbitrary client-controlled model names', () => {
    expect(() => resolveGeminiModels({
      GEMINI_MODERATION_MODEL: 'gemini-unknown',
      GEMINI_SUMMARY_MODEL: 'gemini-3.6-flash',
      GEMINI_RECOMMENDATION_MODEL: 'gemini-3.5-flash-lite',
    })).toThrow('Unsupported Gemini model');
  });
});
