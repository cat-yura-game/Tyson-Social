import { Hono } from 'hono';
import { ZodError } from 'zod';
import { createAiProviders } from '../ai/providers';
import { fail, ok } from '../lib/responses';
import { commentBodySchema, extractLinks, postBodySchema, reactionSchema } from '../schemas/content';
import { sha256 } from '../security/tokens';
import type { AppVariables, Env } from '../types';
import type { ModerationResult } from '../ai/moderation';

type App = { Bindings: Env; Variables: AppVariables };
export const contentRoutes = new Hono<App>();

function requireUser(c: Parameters<typeof fail>[0]) {
  const user = c.get('authUser');
  if (!user) return { error: fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.') };
  if (user.status === 'limited') return { error: fail(c, 403, 'ACCOUNT_LIMITED', 'This account is currently limited.') };
  return { user };
}

async function moderate(env: Env, body: string): Promise<ModerationResult> {
  if (env.MODERATION_MODE === 'bypass') {
    return {
      decision: 'allow',
      riskScore: 0,
      categories: ['temporary_test_bypass'],
      reason: 'AI moderation is temporarily bypassed for MVP testing.',
      provider: 'tyson-test-bypass',
      modelVersion: 'bypass-v1',
    };
  }
  try {
    return await createAiProviders(env).moderation.moderate({ text: body, links: extractLinks(body), media: [] });
  } catch (error) {
    console.error(JSON.stringify({ event: 'moderation_provider_failed', error: error instanceof Error ? error.message : 'unknown' }));
    return { decision: 'review', riskScore: 0.5, categories: ['provider_unavailable'], reason: 'Moderation provider was unavailable; queued for human review.', provider: 'tyson-fallback', modelVersion: 'fallback-v1' };
  }
}

async function json<T>(c: Parameters<typeof fail>[0], schema: { parse(value: unknown): T }): Promise<T | Response> {
  try {
    if (!c.req.header('content-type')?.toLowerCase().includes('application/json')) return fail(c, 400, 'JSON_REQUIRED', 'Content-Type application/json is required.');
    return schema.parse(await c.req.json());
  } catch (error) {
    return fail(c, 422, 'VALIDATION_ERROR', 'The submitted data is invalid.', error instanceof ZodError ? error.flatten() : undefined);
  }
}

const POST_SELECT = `SELECT p.id, p.body, p.like_count AS likeCount, p.comment_count AS commentCount,
  p.published_at AS publishedAt, p.updated_at AS updatedAt,
  u.id AS authorId, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey,
  COALESCE((SELECT reaction FROM post_reactions r WHERE r.post_id = p.id AND r.user_id = ?), '') AS viewerReaction
  FROM posts p JOIN users u ON u.id = p.author_user_id`;

contentRoutes.get('/feed', async (c) => {
  const viewerId = c.get('authUser')?.id ?? '';
  const rows = await c.env.DB.prepare(`${POST_SELECT} WHERE p.status = 'published' ORDER BY p.published_at DESC LIMIT 50`).bind(viewerId).all();
  return ok(c, { posts: rows.results });
});

contentRoutes.get('/posts/:id', async (c) => {
  const row = await c.env.DB.prepare(`${POST_SELECT} WHERE p.id = ? AND p.status = 'published'`).bind(c.get('authUser')?.id ?? '', c.req.param('id')).first();
  return row ? ok(c, { post: row }) : fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
});

contentRoutes.post('/posts', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const input = await json(c, postBodySchema); if (input instanceof Response) return input;
  const result = await moderate(c.env, input.body);
  const postId = crypto.randomUUID();
  const now = new Date().toISOString();
  const status = result.decision === 'allow' ? 'published' : result.decision;
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO posts (id, author_user_id, body, status, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(postId, auth.user.id, input.body, status, status === 'published' ? now : null, now, now),
    c.env.DB.prepare(`INSERT INTO moderation_results (id, subject_type, subject_id, decision, risk_score, categories_json, reason, provider, model_version, input_hash, created_at) VALUES (?, 'post', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), postId, result.decision, result.riskScore, JSON.stringify(result.categories), result.reason, result.provider, result.modelVersion, await sha256(input.body), now),
  ]);
  if (result.decision === 'block') return fail(c, 422, 'CONTENT_BLOCKED', 'Publication was blocked by safety checks.');
  return ok(c, { id: postId, status }, 201);
});

contentRoutes.patch('/posts/:id', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const input = await json(c, postBodySchema); if (input instanceof Response) return input;
  const owned = await c.env.DB.prepare(`SELECT id FROM posts WHERE id = ? AND author_user_id = ? AND status != 'deleted'`).bind(c.req.param('id'), auth.user.id).first();
  if (!owned) return fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
  const result = await moderate(c.env, input.body);
  if (result.decision === 'block') return fail(c, 422, 'CONTENT_BLOCKED', 'Publication was blocked by safety checks.');
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE posts SET body = ?, status = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END, updated_at = ? WHERE id = ?`).bind(input.body, result.decision === 'allow' ? 'published' : 'review', result.decision === 'allow' ? 'published' : 'review', now, now, c.req.param('id')),
    c.env.DB.prepare(`DELETE FROM ai_summaries WHERE post_id = ?`).bind(c.req.param('id')),
  ]);
  return ok(c, { updated: true, status: result.decision === 'allow' ? 'published' : 'review' });
});

contentRoutes.delete('/posts/:id', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const changed = await c.env.DB.prepare(`UPDATE posts SET status = 'deleted', updated_at = ? WHERE id = ? AND author_user_id = ? AND status != 'deleted'`).bind(new Date().toISOString(), c.req.param('id'), auth.user.id).run();
  return changed.meta.changes ? ok(c, { deleted: true }) : fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
});

contentRoutes.put('/posts/:id/reaction', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const input = await json(c, reactionSchema); if (input instanceof Response) return input;
  const post = await c.env.DB.prepare(`SELECT id FROM posts WHERE id = ? AND status = 'published'`).bind(c.req.param('id')).first();
  if (!post) return fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
  const previous = await c.env.DB.prepare(`SELECT reaction FROM post_reactions WHERE post_id = ? AND user_id = ?`).bind(c.req.param('id'), auth.user.id).first<{ reaction: string }>();
  const now = new Date().toISOString();
  const statements = [];
  if (input.reaction) statements.push(c.env.DB.prepare(`INSERT INTO post_reactions (post_id, user_id, reaction, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(post_id, user_id) DO UPDATE SET reaction = excluded.reaction, updated_at = excluded.updated_at`).bind(c.req.param('id'), auth.user.id, input.reaction, now, now));
  else statements.push(c.env.DB.prepare(`DELETE FROM post_reactions WHERE post_id = ? AND user_id = ?`).bind(c.req.param('id'), auth.user.id));
  const delta = (input.reaction === 'like' ? 1 : 0) - (previous?.reaction === 'like' ? 1 : 0);
  statements.push(c.env.DB.prepare(`UPDATE posts SET like_count = MAX(0, like_count + ?) WHERE id = ?`).bind(delta, c.req.param('id')));
  if (input.reaction) statements.push(c.env.DB.prepare(`INSERT INTO recommendation_events (id, user_id, post_id, event_type, created_at) VALUES (?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), auth.user.id, c.req.param('id'), input.reaction, now));
  await c.env.DB.batch(statements);
  const counts = await c.env.DB.prepare(`SELECT like_count AS likeCount FROM posts WHERE id = ?`).bind(c.req.param('id')).first();
  return ok(c, { reaction: input.reaction, ...counts });
});

contentRoutes.get('/posts/:id/comments', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT c.id, c.body, c.created_at AS createdAt, u.id AS authorId, u.username, u.display_name AS displayName FROM comments c JOIN users u ON u.id = c.author_user_id WHERE c.post_id = ? AND c.status = 'published' ORDER BY c.created_at ASC LIMIT 200`).bind(c.req.param('id')).all();
  return ok(c, { comments: rows.results });
});

contentRoutes.post('/posts/:id/comments', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const input = await json(c, commentBodySchema); if (input instanceof Response) return input;
  const post = await c.env.DB.prepare(`SELECT id FROM posts WHERE id = ? AND status = 'published'`).bind(c.req.param('id')).first();
  if (!post) return fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
  const result = await moderate(c.env, input.body);
  if (result.decision === 'block') return fail(c, 422, 'CONTENT_BLOCKED', 'Comment was blocked by safety checks.');
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const status = result.decision === 'allow' ? 'published' : 'review';
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO comments (id, post_id, author_user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, c.req.param('id'), auth.user.id, input.body, status, now, now),
    c.env.DB.prepare(`UPDATE posts SET comment_count = comment_count + ? WHERE id = ?`).bind(status === 'published' ? 1 : 0, c.req.param('id')),
  ]);
  return ok(c, { id, status }, 201);
});

contentRoutes.delete('/comments/:id', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const comment = await c.env.DB.prepare(`SELECT post_id AS postId, status FROM comments WHERE id = ? AND author_user_id = ?`).bind(c.req.param('id'), auth.user.id).first<{ postId: string; status: string }>();
  if (!comment) return fail(c, 404, 'COMMENT_NOT_FOUND', 'Comment not found.');
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE comments SET status = 'deleted', body = '', updated_at = ? WHERE id = ?`).bind(new Date().toISOString(), c.req.param('id')),
    c.env.DB.prepare(`UPDATE posts SET comment_count = MAX(0, comment_count - ?) WHERE id = ?`).bind(comment.status === 'published' ? 1 : 0, comment.postId),
  ]);
  return ok(c, { deleted: true });
});
