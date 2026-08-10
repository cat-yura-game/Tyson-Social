import type { Env } from '../types';
import { DevelopmentModerationProvider, type ModerationProvider } from './moderation';
import { DevelopmentSummaryProvider, type SummaryProvider } from './summary';
import { GeminiClient } from './gemini-client';
import { GeminiModerationProvider } from './gemini-moderation';
import { GeminiSummaryProvider } from './gemini-summary';

export interface AiProviders {
  moderation: ModerationProvider;
  summary: SummaryProvider;
}

export const ALLOWED_GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
] as const;

export type AllowedGeminiModel = typeof ALLOWED_GEMINI_MODELS[number];

function parseModel(value: string): AllowedGeminiModel {
  if (!ALLOWED_GEMINI_MODELS.includes(value as AllowedGeminiModel)) {
    throw new Error(`Unsupported Gemini model: ${value}`);
  }
  return value as AllowedGeminiModel;
}

export function resolveGeminiModels(env: Pick<Env, 'GEMINI_MODERATION_MODEL' | 'GEMINI_SUMMARY_MODEL'>) {
  return {
    moderation: parseModel(env.GEMINI_MODERATION_MODEL),
    summary: parseModel(env.GEMINI_SUMMARY_MODEL),
  };
}

export function createAiProviders(env: Env): AiProviders {
  if (!env.GEMINI_API_KEY) {
    if (env.APP_ENV === 'production') throw new Error('GEMINI_API_KEY is required in production.');
    return { moderation: new DevelopmentModerationProvider(), summary: new DevelopmentSummaryProvider() };
  }

  const models = resolveGeminiModels(env);
  return {
    moderation: new GeminiModerationProvider(new GeminiClient(env.GEMINI_API_KEY, models.moderation)),
    summary: new GeminiSummaryProvider(new GeminiClient(env.GEMINI_API_KEY, models.summary)),
  };
}
