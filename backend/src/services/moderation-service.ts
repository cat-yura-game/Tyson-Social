import { createAiProviders } from '../ai/providers';
import type { ModerationResult } from '../ai/moderation';
import { sha256 } from '../security/tokens';
import type { Env } from '../types';

export type ModerationSubjectType = 'post' | 'comment' | 'post_media' | 'profile' | 'avatar' | 'story' | 'display_name';
export interface PendingModerationMedia { mimeType: string; objectKey: string; base64Data: string }

export async function moderatePublicContent(
  env: Env,
  text: string,
  media: PendingModerationMedia[] = [],
  links: string[] = [],
): Promise<ModerationResult> {
  if (env.MODERATION_MODE === 'bypass') {
    return {
      decision: 'allow', riskScore: 0, categories: ['temporary_test_bypass'],
      reason: 'AI moderation is temporarily bypassed for MVP testing.',
      provider: 'tyson-test-bypass', modelVersion: 'bypass-v1',
    };
  }
  try {
    return await createAiProviders(env).moderation.moderate({ text, links, media });
  } catch (error) {
    const providerError = error instanceof Error ? error.message.slice(0, 500) : 'unknown';
    console.error(JSON.stringify({ event: 'moderation_provider_failed', error: providerError }));
    return {
      decision: 'review', riskScore: 0.5, categories: ['provider_unavailable'],
      reason: `Moderation provider was unavailable; queued for human review. ${providerError}`,
      provider: 'tyson-fallback', modelVersion: 'fallback-v1',
    };
  }
}

export async function saveModerationResult(
  db: D1Database,
  subjectType: ModerationSubjectType,
  subjectId: string,
  result: ModerationResult,
  input: string,
): Promise<void> {
  await db.prepare(`INSERT INTO moderation_results
    (id, subject_type, subject_id, decision, risk_score, categories_json, reason, provider, model_version, input_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), subjectType, subjectId, result.decision, result.riskScore,
      JSON.stringify(result.categories), result.reason, result.provider, result.modelVersion,
      await sha256(input), new Date().toISOString()).run();
}
