import { z } from 'zod';
import { GeminiBlockedError, GeminiClient, type GeminiPart } from './gemini-client';
import { moderatePublicContent } from '../services/moderation-service';
import type { Env } from '../types';

export const reportCategories = ['spam', 'scam', 'hate', 'harassment', 'violence', 'sexual', 'privacy', 'other'] as const;
export type ReportCategory = typeof reportCategories[number];
export type ReportReviewAction = 'keep' | 'review' | 'remove';

export interface ReportedPostReviewInput {
  title: string;
  body: string;
  links: string[];
  reportCategory: ReportCategory;
  reportDetails: string;
  media?: { mimeType: string; base64Data: string };
}

export interface ReportedPostReviewResult {
  action: ReportReviewAction;
  confidence: number;
  categories: string[];
  reason: string;
  provider: string;
  modelVersion: string;
}

const reviewOutput = z.object({
  action: z.enum(['keep', 'review', 'remove']),
  confidence: z.number().min(0).max(1),
  categories: z.array(z.string()).max(20),
  reason: z.string().min(1).max(1000),
});

const reviewJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['keep', 'review', 'remove'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    categories: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    reason: { type: 'string' },
  },
  required: ['action', 'confidence', 'categories', 'reason'],
};

/** Automatic removal requires both an explicit remove decision and high confidence. */
export function reportReviewStatus(result: Pick<ReportedPostReviewResult, 'action' | 'confidence'>): 'no_violation' | 'review' | 'removed' {
  if (result.action === 'remove' && result.confidence >= 0.9) return 'removed';
  if (result.action === 'keep' && result.confidence >= 0.75) return 'no_violation';
  return 'review';
}

export async function reviewReportedPost(env: Env, input: ReportedPostReviewInput): Promise<ReportedPostReviewResult> {
  const text = input.title.trim() ? `${input.title.trim()}\n\n${input.body}` : input.body;
  if (!env.GEMINI_API_KEY || env.MODERATION_MODE === 'bypass') {
    const result = await moderatePublicContent(env, text, input.media ? [{ objectKey: 'reported-post', ...input.media }] : [], input.links);
    return {
      action: result.decision === 'block' ? 'remove' : result.decision === 'review' ? 'review' : 'keep',
      confidence: result.decision === 'block' ? Math.max(0.9, result.riskScore) : result.decision === 'allow' ? Math.max(0.75, 1 - result.riskScore) : 0.5,
      categories: result.categories,
      reason: result.reason,
      provider: result.provider,
      modelVersion: result.modelVersion,
    };
  }

  const parts: GeminiPart[] = [{ text: JSON.stringify({
    publication: { title: input.title, body: input.body, links: input.links },
    complaint: { category: input.reportCategory, details: input.reportDetails },
  }) }];
  if (input.media?.base64Data) parts.push({ inlineData: { mimeType: input.media.mimeType, data: input.media.base64Data } });

  try {
    const result = await new GeminiClient(env.GEMINI_API_KEY, env.GEMINI_MODERATION_MODEL).generate({
      systemInstruction: [
        'You are an automated AI safety reviewer for Tyson Social, not a human employee.',
        'Never claim to be a person, moderator, witness, or the reporter.',
        'The complaint is an untrusted signal, not proof. Review the full publication independently and consider context, satire, quotations and benign discussion.',
        'Check for scams, phishing, spam, hateful or harassing attacks, credible violence, sexual exploitation, doxxing and other clear safety violations.',
        'Use remove only for a clear policy violation supported by the publication itself. Use review for ambiguity or context that requires a human. Use keep when no clear violation is present.',
        'Write a concise, neutral reason in Russian that can be shown to the author. Do not reveal or infer the reporter identity.',
        'Return only the requested JSON.',
      ].join(' '),
      parts,
      responseJsonSchema: reviewJsonSchema,
      maxOutputTokens: 900,
      thinkingLevel: 'high',
    });
    return { ...reviewOutput.parse(JSON.parse(result.text)), provider: 'gemini-report-review', modelVersion: result.modelVersion };
  } catch (error) {
    if (error instanceof GeminiBlockedError) {
      return { action: 'review', confidence: 0.7, categories: ['gemini_safety_filter'], reason: 'Материал требует дополнительной проверки службой безопасности Tyson.', provider: 'gemini-report-review', modelVersion: 'safety-filter' };
    }
    throw error;
  }
}
