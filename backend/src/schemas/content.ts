import { z } from 'zod';

export const postBodySchema = z.object({
  title: z.string().trim().max(200).optional().default(''),
  body: z.string().trim().min(1).max(10_000),
}).strict();
export const commentBodySchema = z.object({ body: z.string().trim().min(1).max(2_000) }).strict();
export const reactionSchema = z.object({ reaction: z.enum(['like', 'dislike']).nullable() }).strict();
export const pollSchema = z.object({
  question: z.string().trim().min(1).max(200),
  options: z.array(z.string().trim().min(1).max(100)).min(2).max(4),
  endsAt: z.string().datetime().optional(),
}).strict();

export function extractLinks(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>()]+/giu)].map((match) => match[0]).slice(0, 20);
}
