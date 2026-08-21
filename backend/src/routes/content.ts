import { Hono } from 'hono';
import { z, ZodError } from 'zod';
import { createAiProviders } from '../ai/providers';
import { fail, ok } from '../lib/responses';
import { commentBodySchema, extractLinks, pollSchema, postBodySchema, reactionSchema } from '../schemas/content';
import { sha256 } from '../security/tokens';
import type { AppVariables, Env } from '../types';
import { interleaveAuthors, rankFeed, type FeedCandidate } from '../recommendations/feed-ranking';
import { extractTrends, type TrendSourcePost } from '../trends/extract-trends';
import { assertImageSignature, assertValidMedia, createMediaKey, KvMediaStorage, type AllowedImageType } from '../services/media-storage';
import { base64Encode } from '../security/encoding';
import { moderatePublicContent } from '../services/moderation-service';
import { uploadLimitForUser } from '../services/upload-limits';
import { completeDailyTask } from '../services/daily-tasks';
import { sendPushToUser } from '../services/web-push';

type App = { Bindings: Env; Variables: AppVariables };
export const contentRoutes = new Hono<App>();

function requireUser(c: Parameters<typeof fail>[0]) {
  const user = c.get('authUser');
  if (!user) return { error: fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.') };
  if (user.status === 'limited') return { error: fail(c, 403, 'ACCOUNT_LIMITED', 'This account is currently limited.') };
  return { user };
}

interface CreatePostImage {
  bytes: ArrayBuffer;
  contentType: AllowedImageType;
}

async function createPostInput(c: Parameters<typeof fail>[0], maxUploadBytes: number): Promise<{ title: string; body: string; image: CreatePostImage | null; poll: z.infer<typeof pollSchema> | null; coauthorUsernames: string[] } | Response> {
  const contentType = c.req.header('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('multipart/form-data')) {
    const raw = await c.req.json().catch(() => null);
    const input = postBodySchema.safeParse(raw);
    if (!input.success) return fail(c, 422, 'VALIDATION_ERROR', 'The submitted post is invalid.', input.error.flatten());
    const poll = raw && typeof raw === 'object' && 'poll' in raw && (raw as { poll?: unknown }).poll ? pollSchema.safeParse((raw as { poll: unknown }).poll) : null;
    if (poll && !poll.success) return fail(c, 422, 'VALIDATION_ERROR', 'The poll is invalid.', poll.error.flatten());
    const coauthorUsernames = raw && typeof raw === 'object' && Array.isArray((raw as { coauthorUsernames?: unknown }).coauthorUsernames) ? (raw as { coauthorUsernames: unknown[] }).coauthorUsernames.filter((item): item is string => typeof item === 'string').map((item) => item.trim().replace(/^@/u, '').toLowerCase()).filter(Boolean).slice(0, 3) : [];
    return { title: input.data.title, body: input.data.body, image: null, poll: poll?.data ?? null, coauthorUsernames };
  }

  const declaredLength = Number(c.req.header('content-length') ?? 0);
  if (declaredLength > maxUploadBytes + 256 * 1024) {
    return fail(c, 413, 'IMAGE_TOO_LARGE', `Post image must not exceed ${Math.round(maxUploadBytes / 1024 / 1024)} MiB.`);
  }
  try {
    const form = await c.req.formData();
    const input = postBodySchema.parse({ title: form.get('title') ?? '', body: form.get('body') });
    const uploaded = form.get('image');
    const rawPoll = form.get('poll'); const poll = rawPoll ? pollSchema.parse(JSON.parse(String(rawPoll))) : null;
    const coauthorUsernames = String(form.get('coauthorUsernames') ?? '').split(/[\s,]+/u).map((item) => item.trim().replace(/^@/u, '').toLowerCase()).filter(Boolean).slice(0, 3);
    if (uploaded === null) return { title: input.title, body: input.body, image: null, poll, coauthorUsernames };
    if (!(uploaded instanceof File)) return fail(c, 422, 'INVALID_IMAGE', 'A valid image file is required.');
    const imageContentType = uploaded.type.toLowerCase();
    const bytes = await uploaded.arrayBuffer();
    assertValidMedia(imageContentType, bytes.byteLength, maxUploadBytes);
    if (imageContentType === 'image/avif') throw new Error('Post images must be JPEG, PNG or WebP.');
    assertImageSignature(imageContentType, new Uint8Array(bytes));
    return { title: input.title, body: input.body, image: { bytes, contentType: imageContentType }, poll, coauthorUsernames };
  } catch (error) {
    if (error instanceof Response) return error;
    return fail(c, 422, 'INVALID_POST', error instanceof ZodError ? 'The submitted post is invalid.' : error instanceof Error ? error.message : 'Invalid post data.', error instanceof ZodError ? error.flatten() : undefined);
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

const POST_SELECT = `SELECT p.id, p.title, p.body, p.like_count AS likeCount, p.comment_count AS commentCount,
  p.published_at AS publishedAt, p.updated_at AS updatedAt,
  u.id AS authorId, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey, u.is_verified AS verified,
  u.worn_gift_id AS wornGiftId,
  (SELECT COALESCE(ug.variant, gt.base_image) FROM user_gifts ug JOIN gift_types gt ON gt.id = ug.gift_type_id WHERE ug.id = u.worn_gift_id) AS wornGiftImage,
  (SELECT pm.storage_key FROM post_media pm WHERE pm.post_id = p.id ORDER BY pm.sort_order LIMIT 1) AS mediaKey,
  COALESCE((SELECT reaction FROM post_reactions r WHERE r.post_id = p.id AND r.user_id = ?), '') AS viewerReaction,
  COALESCE((SELECT SUM(amount) FROM post_diamond_reactions dr WHERE dr.post_id = p.id), 0) AS diamondCount,
  EXISTS(SELECT 1 FROM post_diamond_reactions dr WHERE dr.post_id = p.id AND dr.sender_user_id = ?) AS viewerDiamondGiven,
  EXISTS(SELECT 1 FROM post_promotions pp WHERE pp.post_id = p.id AND pp.delivered_views < pp.purchased_views) AS promoted
  ,(SELECT id FROM post_polls pp WHERE pp.post_id = p.id) AS pollId
  ,(SELECT question FROM post_polls pp WHERE pp.post_id = p.id) AS pollQuestion
  ,(SELECT ends_at FROM post_polls pp WHERE pp.post_id = p.id) AS pollEndsAt
  ,p.pinned_at AS pinnedAt
  ,COALESCE((SELECT json_group_array(json_object('username', cu.username, 'displayName', cu.display_name)) FROM post_coauthors pc JOIN users cu ON cu.id = pc.user_id WHERE pc.post_id = p.id), '[]') AS coauthorsJson
  FROM posts p JOIN users u ON u.id = p.author_user_id`;
const diamondAmountSchema = z.object({ amount: z.number().int().min(1).max(1_000_000) }).strict();

contentRoutes.get('/feed', async (c) => {
  const viewerId = c.get('authUser')?.id ?? '';
  const requestedView = c.req.query('view');
  const view: 'for-you' | 'fresh' | 'following' = requestedView === 'fresh' || requestedView === 'following' ? requestedView : 'for-you';
  if (view === 'following' && !viewerId) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const topic = c.req.query('topic')?.trim().slice(0, 40);
  const topicFilter = topic ? ' AND instr(lower(p.body), lower(?)) > 0' : '';
  const followingFilter = view === 'following' ? ` AND EXISTS (SELECT 1 FROM user_follows f
    WHERE f.follower_user_id = ? AND f.followed_user_id = p.author_user_id)` : '';
  const statement = c.env.DB.prepare(`${POST_SELECT} WHERE p.status = 'published'${followingFilter}${topicFilter} ORDER BY p.published_at DESC LIMIT 50`);
  const bindings = [viewerId, viewerId, ...(view === 'following' ? [viewerId] : []), ...(topic ? [topic] : [])];
  const rows = await statement.bind(...bindings).all();
  let posts = rows.results as unknown as FeedCandidate[];
  let strategy: 'recent' | 'scoring' | 'gemini' = 'recent';
  if (viewerId && view === 'for-you') {
    try {
      const ranked = await rankFeed(c.env, viewerId, posts);
      posts = ranked.posts;
      strategy = ranked.strategy;
    } catch (error) {
      console.error(JSON.stringify({ event: 'recommendation_provider_failed', error: error instanceof Error ? error.message : 'unknown' }));
      strategy = 'scoring';
    }
  }
  if (view === 'for-you') posts = interleaveAuthors([...posts].sort((left, right) => Number(right.promoted ?? 0) - Number(left.promoted ?? 0)));
  if (viewerId) {
    const now = new Date().toISOString();
    const statements = posts.slice(0, 20).map((post) => c.env.DB.prepare(`INSERT INTO recommendation_events
      (id, user_id, post_id, event_type, context_json, created_at) VALUES (?, ?, ?, 'impression', ?, ?)`)
      .bind(crypto.randomUUID(), viewerId, post.id, JSON.stringify({ strategy, view }), now));
    if (view === 'for-you') for (const post of posts.slice(0, 10).filter((item) => Number(item.promoted ?? 0) === 1 && item.authorId !== viewerId)) {
      const viewId = crypto.randomUUID();
      statements.push(
        c.env.DB.prepare(`INSERT OR IGNORE INTO post_promotion_views (id, post_id, viewer_user_id, view_date, created_at)
          SELECT ?, pp.post_id, ?, ?, ? FROM post_promotions pp
          WHERE pp.post_id = ? AND pp.owner_user_id != ? AND pp.delivered_views < pp.purchased_views`)
          .bind(viewId, viewerId, now.slice(0, 10), now, post.id, viewerId),
        c.env.DB.prepare(`UPDATE post_promotions SET delivered_views = delivered_views + 1, updated_at = ?
          WHERE post_id = ? AND EXISTS (SELECT 1 FROM post_promotion_views WHERE id = ?)`)
          .bind(now, post.id, viewId),
      );
    }
    if (statements.length) await c.env.DB.batch(statements);
  }
  return ok(c, { posts, recommendation: { strategy } });
});

contentRoutes.get('/trends', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT id, body, like_count AS likeCount, comment_count AS commentCount
    FROM posts WHERE status = 'published'
      AND published_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
    ORDER BY published_at DESC LIMIT 200`).all<TrendSourcePost>();
  return ok(c, { topics: extractTrends(rows.results) });
});

contentRoutes.get('/search', async (c) => {
  const query = c.req.query('q')?.trim().replaceAll(/\s+/gu, ' ').slice(0, 80) ?? '';
  if (query.length < 2) return ok(c, { query, users: [], posts: [] });
  const escaped = query.replace(/[\\%_]/gu, '\\$&');
  const like = `%${escaped}%`;
  const prefix = `${escaped}%`;
  const [users, posts] = await Promise.all([
    c.env.DB.prepare(`SELECT id, username, display_name AS displayName, avatar_key AS avatarKey,
      bio, is_verified AS verified FROM users
      WHERE status IN ('active', 'limited') AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\')
      ORDER BY CASE WHEN username LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, is_verified DESC, created_at DESC LIMIT 8`)
      .bind(like, like, prefix).all(),
    c.env.DB.prepare(`SELECT p.id, p.title, substr(p.body, 1, 220) AS excerpt, p.published_at AS publishedAt,
      u.username, u.display_name AS displayName, u.avatar_key AS avatarKey, u.is_verified AS verified
      FROM posts p JOIN users u ON u.id = p.author_user_id
      WHERE p.status = 'published' AND (p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')
      ORDER BY p.like_count DESC, p.published_at DESC LIMIT 12`).bind(like, like, like).all(),
  ]);
  return ok(c, { query, users: users.results, posts: posts.results });
});

contentRoutes.get('/posts/:id', async (c) => {
  const viewerId = c.get('authUser')?.id ?? '';
  const row = await c.env.DB.prepare(`${POST_SELECT} WHERE p.id = ? AND p.status = 'published'`).bind(viewerId, viewerId, c.req.param('id')).first();
  if (!row) return fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
  if (viewerId) {
    await c.env.DB.prepare(`INSERT INTO recommendation_events (id, user_id, post_id, event_type, created_at)
      VALUES (?, ?, ?, 'open', ?)`).bind(crypto.randomUUID(), viewerId, c.req.param('id'), new Date().toISOString()).run();
  }
  return ok(c, { post: row });
});

contentRoutes.post('/posts', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const input = await createPostInput(c, await uploadLimitForUser(c.env.DB, auth.user.id)); if (input instanceof Response) return input;
  const imageBase64 = input.image ? base64Encode(new Uint8Array(input.image.bytes)) : null;
  const moderationText = input.title ? `${input.title}\n\n${input.body}` : input.body;
  const result = await moderatePublicContent(c.env, moderationText, input.image && imageBase64 ? [{ mimeType: input.image.contentType, objectKey: 'pending-upload', base64Data: imageBase64 }] : [], extractLinks(moderationText));
  const postId = crypto.randomUUID();
  const now = new Date().toISOString();
  const status = result.decision === 'allow' ? 'published' : result.decision === 'block' ? 'blocked' : 'review';
  const storage = new KvMediaStorage(c.env.MEDIA);
  const mediaKey = input.image && result.decision !== 'block' ? createMediaKey(auth.user.id, input.image.contentType) : null;
  const statements = [
    c.env.DB.prepare(`INSERT INTO posts (id, author_user_id, title, body, status, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(postId, auth.user.id, input.title, input.body, status, status === 'published' ? now : null, now, now),
    c.env.DB.prepare(`INSERT INTO moderation_results (id, subject_type, subject_id, decision, risk_score, categories_json, reason, provider, model_version, input_hash, created_at) VALUES (?, 'post', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), postId, result.decision, result.riskScore, JSON.stringify(result.categories), result.reason, result.provider, result.modelVersion, await sha256(`${moderationText}:${imageBase64 ? await sha256(imageBase64) : ''}`), now),
  ];
  if (input.poll) {
    const pollId = crypto.randomUUID();
    statements.push(c.env.DB.prepare('INSERT INTO post_polls (id, post_id, question, ends_at, created_at) VALUES (?, ?, ?, ?, ?)').bind(pollId, postId, input.poll.question, input.poll.endsAt ?? null, now));
    input.poll.options.forEach((label, sortOrder) => statements.push(c.env.DB.prepare('INSERT INTO post_poll_options (id, poll_id, label, sort_order) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), pollId, label, sortOrder)));
  }
  const coauthorUsernames = [...new Set(input.coauthorUsernames.filter((username) => username !== auth.user.username.toLowerCase()))];
  if (coauthorUsernames.length) {
    const placeholders = coauthorUsernames.map(() => '?').join(',');
    const people = await c.env.DB.prepare(`SELECT id, username FROM users WHERE lower(username) IN (${placeholders}) AND status IN ('active', 'pending_email')`).bind(...coauthorUsernames).all<{ id: string; username: string }>();
    if (people.results.length !== coauthorUsernames.length) return fail(c, 404, 'COAUTHOR_NOT_FOUND', 'One or more coauthors were not found.');
    statements.push(...people.results.map((person) => c.env.DB.prepare('INSERT INTO post_coauthors (post_id, user_id, created_at) VALUES (?, ?, ?)').bind(postId, person.id, now)));
  }
  if (input.image && mediaKey) {
    statements.push(c.env.DB.prepare(`INSERT INTO post_media (id, post_id, storage_key, media_type, mime_type, byte_size, sort_order, created_at)
      VALUES (?, ?, ?, 'image', ?, ?, 0, ?)`).bind(crypto.randomUUID(), postId, mediaKey, input.image.contentType, input.image.bytes.byteLength, now));
    await storage.put(mediaKey, input.image.bytes, { contentType: input.image.contentType, byteSize: input.image.bytes.byteLength, ownerUserId: auth.user.id });
  }
  try {
    await c.env.DB.batch(statements);
  } catch (error) {
    if (mediaKey) await storage.delete(mediaKey);
    throw error;
  }
  if (result.decision === 'block') return fail(c, 422, 'CONTENT_BLOCKED', 'Publication was blocked by safety checks.');
  if (status === 'published') {
    await completeDailyTask(c.env, auth.user.id, 'post');
    c.executionCtx.waitUntil((async () => {
      const subscribers = await c.env.DB.prepare('SELECT user_id AS userId FROM author_push_preferences WHERE author_user_id = ?').bind(auth.user.id).all<{ userId: string }>();
      await Promise.all(subscribers.results.map((subscriber) => sendPushToUser(c.env, subscriber.userId, { title: auth.user.displayName, body: 'Опубликовал новую запись', url: `/post/${postId}`, tag: `post-${postId}` })));
    })());
  }
  return ok(c, { id: postId, status }, 201);
});

contentRoutes.put('/posts/:id/pin', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const input = await json(c, z.object({ pinned: z.boolean() }).strict()); if (input instanceof Response) return input;
  const post = await c.env.DB.prepare("SELECT id FROM posts WHERE id = ? AND author_user_id = ? AND status = 'published'").bind(c.req.param('id'), auth.user.id).first();
  if (!post) return fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
  if (input.pinned) {
    const existing = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM posts WHERE author_user_id = ? AND pinned_at IS NOT NULL AND id != ?').bind(auth.user.id, c.req.param('id')).first<{ count: number }>();
    if ((existing?.count ?? 0) >= 3) return fail(c, 422, 'PIN_LIMIT_REACHED', 'You can pin up to three posts.');
  }
  const now = new Date().toISOString();
  await c.env.DB.prepare('UPDATE posts SET pinned_at = ?, updated_at = ? WHERE id = ?').bind(input.pinned ? now : null, now, c.req.param('id')).run();
  return ok(c, { pinned: input.pinned });
});

contentRoutes.get('/posts/:id/poll', async (c) => {
  const viewerId = c.get('authUser')?.id ?? '';
  const poll = await c.env.DB.prepare(`SELECT pp.id, pp.question, pp.ends_at AS endsAt,
    (SELECT COUNT(*) FROM post_poll_votes v WHERE v.poll_id = pp.id) AS totalVotes,
    (SELECT option_id FROM post_poll_votes v WHERE v.poll_id = pp.id AND v.user_id = ?) AS viewerOptionId
    FROM post_polls pp JOIN posts p ON p.id = pp.post_id WHERE pp.post_id = ? AND p.status = 'published'`).bind(viewerId, c.req.param('id')).first();
  if (!poll) return fail(c, 404, 'POLL_NOT_FOUND', 'Poll not found.');
  const options = await c.env.DB.prepare('SELECT o.id, o.label, (SELECT COUNT(*) FROM post_poll_votes v WHERE v.option_id = o.id) AS votes FROM post_poll_options o WHERE o.poll_id = ? ORDER BY o.sort_order').bind(poll.id).all();
  return ok(c, { poll: { ...poll, options: options.results } });
});

contentRoutes.put('/posts/:id/poll', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const input = await json(c, z.object({ optionId: z.string().uuid() }).strict()); if (input instanceof Response) return input;
  const poll = await c.env.DB.prepare(`SELECT pp.id, pp.ends_at AS endsAt FROM post_polls pp JOIN posts p ON p.id = pp.post_id WHERE pp.post_id = ? AND p.status = 'published'`).bind(c.req.param('id')).first<{ id: string; endsAt: string | null }>();
  if (!poll) return fail(c, 404, 'POLL_NOT_FOUND', 'Poll not found.');
  if (poll.endsAt && new Date(poll.endsAt) <= new Date()) return fail(c, 422, 'POLL_CLOSED', 'This poll has ended.');
  const option = await c.env.DB.prepare('SELECT id FROM post_poll_options WHERE id = ? AND poll_id = ?').bind(input.optionId, poll.id).first();
  if (!option) return fail(c, 422, 'INVALID_OPTION', 'This option does not belong to the poll.');
  await c.env.DB.prepare('INSERT INTO post_poll_votes (poll_id, option_id, user_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(poll_id, user_id) DO UPDATE SET option_id = excluded.option_id, created_at = excluded.created_at').bind(poll.id, input.optionId, auth.user.id, new Date().toISOString()).run();
  return ok(c, { voted: true });
});

const promotionSchema = z.object({ views: z.number().int().min(1).max(500) }).strict();

contentRoutes.post('/posts/:id/promote', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const input = await json(c, promotionSchema); if (input instanceof Response) return input;
  const post = await c.env.DB.prepare(`SELECT id FROM posts WHERE id = ? AND author_user_id = ? AND status = 'published'`)
    .bind(c.req.param('id'), auth.user.id).first();
  if (!post) return fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
  const cost = input.views * 2; const now = new Date().toISOString(); const transactionId = crypto.randomUUID();
  const results = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, id, ?, 'debit', 'post_promotion', ?, ? FROM users WHERE id = ? AND diamond_balance >= ?`)
      .bind(transactionId, -cost, c.req.param('id'), now, auth.user.id, cost),
    c.env.DB.prepare(`UPDATE users SET diamond_balance = diamond_balance - ? WHERE id = ?
      AND EXISTS (SELECT 1 FROM diamond_transactions WHERE id = ?)`)
      .bind(cost, auth.user.id, transactionId),
    c.env.DB.prepare(`INSERT INTO post_promotions (post_id, owner_user_id, purchased_views, delivered_views, created_at, updated_at)
      SELECT ?, ?, ?, 0, ?, ? WHERE EXISTS (SELECT 1 FROM diamond_transactions WHERE id = ?)
      ON CONFLICT(post_id) DO UPDATE SET purchased_views = purchased_views + excluded.purchased_views, updated_at = excluded.updated_at`)
      .bind(c.req.param('id'), auth.user.id, input.views, now, now, transactionId),
  ]);
  if ((results[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'INSUFFICIENT_DIAMONDS', 'Not enough diamonds.');
  const campaign = await c.env.DB.prepare(`SELECT purchased_views AS purchasedViews, delivered_views AS deliveredViews
    FROM post_promotions WHERE post_id = ?`).bind(c.req.param('id')).first();
  const balance = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(auth.user.id).first<{ balance: number }>();
  return ok(c, { cost, balance: balance?.balance ?? 0, campaign });
});

contentRoutes.delete('/posts/:id/promote', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const deleted = await c.env.DB.prepare('DELETE FROM post_promotions WHERE post_id = ? AND owner_user_id = ?')
    .bind(c.req.param('id'), auth.user.id).run();
  if (!deleted.meta.changes) return fail(c, 404, 'POST_PROMOTION_NOT_FOUND', 'Active post promotion not found.');
  // The original diamond transaction is deliberately retained: cancellation only stops future impressions.
  return ok(c, { cancelled: true, refunded: 0 });
});

contentRoutes.patch('/posts/:id', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const input = await json(c, postBodySchema); if (input instanceof Response) return input;
  const owned = await c.env.DB.prepare(`SELECT id FROM posts WHERE id = ? AND author_user_id = ? AND status != 'deleted'`).bind(c.req.param('id'), auth.user.id).first();
  if (!owned) return fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
  const moderationText = input.title ? `${input.title}\n\n${input.body}` : input.body;
  const result = await moderatePublicContent(c.env, moderationText, [], extractLinks(moderationText));
  if (result.decision === 'block') return fail(c, 422, 'CONTENT_BLOCKED', 'Publication was blocked by safety checks.');
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE posts SET title = ?, body = ?, status = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END, updated_at = ? WHERE id = ?`).bind(input.title, input.body, result.decision === 'allow' ? 'published' : 'review', result.decision === 'allow' ? 'published' : 'review', now, now, c.req.param('id')),
    c.env.DB.prepare(`DELETE FROM ai_summaries WHERE post_id = ?`).bind(c.req.param('id')),
  ]);
  return ok(c, { updated: true, status: result.decision === 'allow' ? 'published' : 'review' });
});

contentRoutes.delete('/posts/:id', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const post = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ? AND author_user_id = ?')
    .bind(c.req.param('id'), auth.user.id).first();
  if (!post) return fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
  const media = await c.env.DB.prepare('SELECT storage_key AS storageKey FROM post_media WHERE post_id = ?')
    .bind(c.req.param('id')).all<{ storageKey: string }>();
  await c.env.DB.prepare('DELETE FROM posts WHERE id = ? AND author_user_id = ?')
    .bind(c.req.param('id'), auth.user.id).run();
  const storage = new KvMediaStorage(c.env.MEDIA);
  await Promise.all(media.results.map((item) => storage.delete(item.storageKey)));
  return ok(c, { deleted: true });
});

contentRoutes.post('/posts/:id/summary', async (c) => {
  const post = await c.env.DB.prepare(`SELECT title, body FROM posts WHERE id = ? AND status = 'published'`)
    .bind(c.req.param('id')).first<{ title: string | null; body: string }>();
  if (!post) return fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
  if (post.body.length <= 500) return fail(c, 422, 'POST_TOO_SHORT', 'This post is already short enough.');
  const source = post.title ? `${post.title}\n\n${post.body}` : post.body;
  const contentHash = await sha256(source);
  const cached = await c.env.DB.prepare(`SELECT summary, provider, model_version AS modelVersion, created_at AS createdAt
    FROM ai_summaries WHERE post_id = ? AND content_hash = ?`).bind(c.req.param('id'), contentHash)
    .first<{ summary: string; provider: string; modelVersion: string; createdAt: string }>();
  if (cached) return ok(c, { ...cached, cached: true });

  const requestedLocale = c.req.header('accept-language')?.split(',')[0]?.trim() ?? 'ru-RU';
  const locale = /^[a-z]{2,3}(?:-[a-z]{2})?$/iu.test(requestedLocale) ? requestedLocale : 'ru-RU';
  try {
    const result = await createAiProviders(c.env).summary.summarize(source, locale);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await c.env.DB.prepare(`INSERT INTO ai_summaries
      (id, post_id, content_hash, summary, provider, model_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(post_id, content_hash) DO NOTHING`)
      .bind(id, c.req.param('id'), contentHash, result.summary, result.provider, result.modelVersion, createdAt).run();
    const stored = await c.env.DB.prepare(`SELECT summary, provider, model_version AS modelVersion, created_at AS createdAt
      FROM ai_summaries WHERE post_id = ? AND content_hash = ?`).bind(c.req.param('id'), contentHash)
      .first<{ summary: string; provider: string; modelVersion: string; createdAt: string }>();
    return ok(c, { ...(stored ?? { ...result, createdAt }), cached: false });
  } catch (error) {
    console.error(JSON.stringify({ event: 'post_summary_failed', postId: c.req.param('id'), error: error instanceof Error ? error.message : 'unknown' }));
    return fail(c, 502, 'AI_PROVIDER_UNAVAILABLE', 'AI summary is temporarily unavailable. Try again later.');
  }
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
  if (input.reaction === 'like' && previous?.reaction !== 'like') await completeDailyTask(c.env, auth.user.id, 'like');
  const counts = await c.env.DB.prepare(`SELECT like_count AS likeCount FROM posts WHERE id = ?`).bind(c.req.param('id')).first();
  return ok(c, { reaction: input.reaction, ...counts });
});

contentRoutes.post('/posts/:id/diamond', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const input = await json(c, diamondAmountSchema); if (input instanceof Response) return input;
  const postId = c.req.param('id');
  const post = await c.env.DB.prepare("SELECT author_user_id AS authorId FROM posts WHERE id = ? AND status = 'published'").bind(postId).first<{ authorId: string }>();
  if (!post) return fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
  if (post.authorId === auth.user.id) return fail(c, 422, 'SELF_DIAMOND', 'You cannot give diamonds to your own post.');
  const now = new Date().toISOString(); const operationId = crypto.randomUUID();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO post_diamond_reactions (id, post_id, sender_user_id, recipient_user_id, amount, created_at)
      SELECT ?, p.id, ?, p.author_user_id, ?, ? FROM posts p JOIN users s ON s.id = ?
      WHERE p.id = ? AND p.status = 'published' AND p.author_user_id != ? AND s.diamond_balance >= ?`)
      .bind(operationId, auth.user.id, input.amount, now, auth.user.id, postId, auth.user.id, input.amount),
    c.env.DB.prepare(`UPDATE users SET diamond_balance = diamond_balance - ? WHERE id = ? AND EXISTS
      (SELECT 1 FROM post_diamond_reactions WHERE post_id = ? AND sender_user_id = ? AND created_at = ? AND amount = ?)`)
      .bind(input.amount, auth.user.id, postId, auth.user.id, now, input.amount),
    c.env.DB.prepare(`UPDATE users SET diamond_balance = diamond_balance + ? WHERE id = ? AND EXISTS
      (SELECT 1 FROM post_diamond_reactions WHERE post_id = ? AND sender_user_id = ? AND created_at = ? AND amount = ?)`)
      .bind(input.amount, post.authorId, postId, auth.user.id, now, input.amount),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, ?, 'debit', 'post_diamond_sent', ?, ? WHERE EXISTS
      (SELECT 1 FROM post_diamond_reactions WHERE post_id = ? AND sender_user_id = ? AND created_at = ? AND amount = ?)`)
      .bind(crypto.randomUUID(), auth.user.id, -input.amount, postId, now, postId, auth.user.id, now, input.amount),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, ?, 'credit', 'post_diamond_received', ?, ? WHERE EXISTS
      (SELECT 1 FROM post_diamond_reactions WHERE post_id = ? AND sender_user_id = ? AND created_at = ? AND amount = ?)`)
      .bind(crypto.randomUUID(), post.authorId, input.amount, postId, now, postId, auth.user.id, now, input.amount),
    c.env.DB.prepare(`INSERT INTO notifications (id, user_id, actor_user_id, type, entity_id, message, dedupe_key, created_at)
      SELECT ?, ?, ?, 'diamond', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM post_diamond_reactions WHERE id = ?)`)
      .bind(crypto.randomUUID(), post.authorId, auth.user.id, postId, `отправил вам ${input.amount} 💎 за публикацию`, `diamond:${operationId}`, now, operationId),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'INSUFFICIENT_DIAMONDS', 'Not enough diamonds.');
  c.executionCtx.waitUntil(sendPushToUser(c.env, post.authorId, { title: 'Алмазная реакция', body: `${auth.user.displayName} отправил вам ${input.amount} 💎`, url: `/post/${postId}`, tag: `diamond-${operationId}` }));
  const [count, balance] = await Promise.all([
    c.env.DB.prepare('SELECT COALESCE(SUM(amount), 0) AS diamondCount FROM post_diamond_reactions WHERE post_id = ?').bind(postId).first<{ diamondCount: number }>(),
    c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(auth.user.id).first<{ balance: number }>(),
  ]);
  return ok(c, { diamondCount: count?.diamondCount ?? 0, balance: balance?.balance ?? 0, given: true });
});

contentRoutes.get('/posts/:id/comments', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT c.id, c.body, c.created_at AS createdAt, u.id AS authorId, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey,
    u.worn_gift_id AS wornGiftId,
    (SELECT COALESCE(ug.variant, gt.base_image) FROM user_gifts ug JOIN gift_types gt ON gt.id = ug.gift_type_id WHERE ug.id = u.worn_gift_id) AS wornGiftImage,
    COALESCE((SELECT SUM(amount) FROM comment_diamond_reactions d WHERE d.comment_id = c.id), 0) AS diamondCount
    FROM comments c JOIN users u ON u.id = c.author_user_id WHERE c.post_id = ? AND c.status = 'published' ORDER BY c.created_at ASC LIMIT 200`).bind(c.req.param('id')).all();
  return ok(c, { comments: rows.results });
});

contentRoutes.post('/comments/:id/diamond', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const input = await json(c, diamondAmountSchema); if (input instanceof Response) return input;
  const comment = await c.env.DB.prepare("SELECT author_user_id AS authorId FROM comments WHERE id = ? AND status = 'published'").bind(c.req.param('id')).first<{ authorId: string }>();
  if (!comment) return fail(c, 404, 'COMMENT_NOT_FOUND', 'Comment not found.');
  if (comment.authorId === auth.user.id) return fail(c, 422, 'SELF_DIAMOND', 'You cannot give diamonds to your own comment.');
  const now = new Date().toISOString(); const operationId = crypto.randomUUID();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO comment_diamond_reactions (id, comment_id, sender_user_id, recipient_user_id, amount, created_at)
      SELECT ?, c.id, ?, c.author_user_id, ?, ? FROM comments c JOIN users s ON s.id = ? WHERE c.id = ? AND c.status = 'published' AND s.diamond_balance >= ?`)
      .bind(operationId, auth.user.id, input.amount, now, auth.user.id, c.req.param('id'), input.amount),
    c.env.DB.prepare('UPDATE users SET diamond_balance = diamond_balance - ? WHERE id = ? AND EXISTS (SELECT 1 FROM comment_diamond_reactions WHERE id = ?)').bind(input.amount, auth.user.id, operationId),
    c.env.DB.prepare('UPDATE users SET diamond_balance = diamond_balance + ? WHERE id = ? AND EXISTS (SELECT 1 FROM comment_diamond_reactions WHERE id = ?)').bind(input.amount, comment.authorId, operationId),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, ?, 'debit', 'comment_diamond_sent', ?, ? WHERE EXISTS (SELECT 1 FROM comment_diamond_reactions WHERE id = ?)`)
      .bind(crypto.randomUUID(), auth.user.id, -input.amount, c.req.param('id'), now, operationId),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, ?, 'credit', 'comment_diamond_received', ?, ? WHERE EXISTS (SELECT 1 FROM comment_diamond_reactions WHERE id = ?)`)
      .bind(crypto.randomUUID(), comment.authorId, input.amount, c.req.param('id'), now, operationId),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'INSUFFICIENT_DIAMONDS', 'Not enough diamonds.');
  const count = await c.env.DB.prepare('SELECT COALESCE(SUM(amount), 0) AS diamondCount FROM comment_diamond_reactions WHERE comment_id = ?').bind(c.req.param('id')).first<{ diamondCount: number }>();
  return ok(c, { diamondCount: count?.diamondCount ?? 0 });
});

contentRoutes.post('/posts/:id/comments', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const input = await json(c, commentBodySchema); if (input instanceof Response) return input;
  const post = await c.env.DB.prepare(`SELECT id, author_user_id AS authorId FROM posts WHERE id = ? AND status = 'published'`).bind(c.req.param('id')).first<{ id: string; authorId: string }>();
  if (!post) return fail(c, 404, 'POST_NOT_FOUND', 'Post not found.');
  const result = await moderatePublicContent(c.env, input.body, [], extractLinks(input.body));
  if (result.decision === 'block') return fail(c, 422, 'CONTENT_BLOCKED', 'Comment was blocked by safety checks.');
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const status = result.decision === 'allow' ? 'published' : 'review';
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO comments (id, post_id, author_user_id, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, c.req.param('id'), auth.user.id, input.body, status, now, now),
    c.env.DB.prepare(`UPDATE posts SET comment_count = comment_count + ? WHERE id = ?`).bind(status === 'published' ? 1 : 0, c.req.param('id')),
    c.env.DB.prepare(`INSERT INTO recommendation_events (id, user_id, post_id, event_type, created_at) VALUES (?, ?, ?, 'comment', ?)`).bind(crypto.randomUUID(), auth.user.id, c.req.param('id'), now),
    c.env.DB.prepare(`INSERT INTO notifications (id, user_id, actor_user_id, type, entity_id, message, dedupe_key, created_at)
      SELECT ?, ?, ?, 'comment', ?, 'прокомментировал вашу публикацию', ?, ? WHERE ? = 'published' AND ? != ?`)
      .bind(crypto.randomUUID(), post.authorId, auth.user.id, c.req.param('id'), `comment:${id}`, now, status, post.authorId, auth.user.id),
  ]);
  if (status === 'published' && post.authorId !== auth.user.id) c.executionCtx.waitUntil(sendPushToUser(c.env, post.authorId, { title: 'Новый комментарий', body: `${auth.user.displayName} прокомментировал вашу публикацию`, url: `/post/${c.req.param('id')}`, tag: `comment-${id}` }));
  if (status === 'published') await completeDailyTask(c.env, auth.user.id, 'comment');
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
