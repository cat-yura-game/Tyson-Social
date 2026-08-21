import { Hono } from 'hono';
import { fail, ok } from '../lib/responses';
import {
  ALLOWED_IMAGE_TYPES,
  assertStoryMediaSignature,
  assertValidStoryMedia,
  createStoryMediaKey,
  KvMediaStorage,
} from '../services/media-storage';
import type { AppVariables, Env } from '../types';
import { base64Encode } from '../security/encoding';
import { moderatePublicContent, saveModerationResult } from '../services/moderation-service';
import { uploadLimitForUser } from '../services/upload-limits';
import { completeDailyTask } from '../services/daily-tasks';
import { z } from 'zod';
import { sendPushToUser } from '../services/web-push';

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

export const storyRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

storyRoutes.get('/', async (c) => {
  const viewerId = c.get('authUser')?.id ?? '';
  const now = new Date().toISOString();
  const rows = await c.env.DB.prepare(`SELECT s.id, s.storage_key AS storageKey, s.media_type AS mediaType,
    s.content_type AS contentType, s.created_at AS createdAt, s.expires_at AS expiresAt,
    u.id AS authorId, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey, u.is_verified AS verified,
    (SELECT COUNT(*) FROM story_reactions r WHERE r.story_id = s.id) AS reactionCount,
    COALESCE((SELECT reaction FROM story_reactions r WHERE r.story_id = s.id AND r.user_id = ?), '') AS viewerReaction
    FROM stories s JOIN users u ON u.id = s.author_user_id LEFT JOIN user_settings us ON us.user_id = u.id
    WHERE s.expires_at > ? AND u.status IN ('active', 'pending_email')
      AND (u.id = ? OR COALESCE(us.stories_visibility, 'everyone') = 'everyone' OR (COALESCE(us.stories_visibility, 'everyone') = 'friends' AND EXISTS (
        SELECT 1 FROM user_follows a JOIN user_follows b ON b.follower_user_id = a.followed_user_id AND b.followed_user_id = a.follower_user_id WHERE a.follower_user_id = ? AND a.followed_user_id = u.id
      )))
    ORDER BY CASE WHEN u.id = ? THEN 0 ELSE 1 END, s.created_at ASC LIMIT 200`)
    .bind(viewerId, now, viewerId, viewerId, viewerId).all();
  return ok(c, { stories: rows.results });
});

storyRoutes.put('/:id/reaction', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const input = z.object({ reaction: z.enum(['❤️', '🔥', '😂', '😮', '👏']).nullable() }).strict().safeParse(await c.req.json().catch(() => null));
  if (!input.success) return fail(c, 422, 'VALIDATION_ERROR', 'Choose a valid reaction.');
  const story = await c.env.DB.prepare('SELECT author_user_id AS authorId FROM stories WHERE id = ? AND expires_at > ?').bind(c.req.param('id'), new Date().toISOString()).first<{ authorId: string }>();
  if (!story) return fail(c, 404, 'STORY_NOT_FOUND', 'Story not found.');
  const now = new Date().toISOString();
  if (input.data.reaction) await c.env.DB.prepare('INSERT INTO story_reactions (story_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(story_id, user_id) DO UPDATE SET reaction = excluded.reaction, created_at = excluded.created_at').bind(c.req.param('id'), user.id, input.data.reaction, now).run();
  else await c.env.DB.prepare('DELETE FROM story_reactions WHERE story_id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
  if (input.data.reaction && story.authorId !== user.id) c.executionCtx.waitUntil(sendPushToUser(c.env, story.authorId, { title: 'Реакция на сторис', body: `${user.displayName} отреагировал ${input.data.reaction}`, url: '/', tag: `story-reaction-${c.req.param('id')}-${user.id}` }));
  const reactionCount = await c.env.DB.prepare('SELECT COUNT(*) AS reactionCount FROM story_reactions WHERE story_id = ?').bind(c.req.param('id')).first<{ reactionCount: number }>();
  return ok(c, { reaction: input.data.reaction, reactionCount: reactionCount?.reactionCount ?? 0 });
});

storyRoutes.post('/:id/reply', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const input = z.object({ body: z.string().trim().min(1).max(500) }).strict().safeParse(await c.req.json().catch(() => null));
  if (!input.success) return fail(c, 422, 'VALIDATION_ERROR', 'Reply must contain up to 500 characters.');
  const story = await c.env.DB.prepare('SELECT author_user_id AS authorId FROM stories WHERE id = ? AND expires_at > ?').bind(c.req.param('id'), new Date().toISOString()).first<{ authorId: string }>();
  if (!story) return fail(c, 404, 'STORY_NOT_FOUND', 'Story not found.');
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await c.env.DB.batch([c.env.DB.prepare('INSERT INTO story_replies (id, story_id, author_user_id, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, c.req.param('id'), user.id, input.data.body, now), c.env.DB.prepare(`INSERT INTO notifications (id, user_id, actor_user_id, type, entity_id, message, dedupe_key, created_at) SELECT ?, ?, ?, 'comment', ?, 'ответил на вашу сторис', ?, ? WHERE ? != ?`).bind(crypto.randomUUID(), story.authorId, user.id, c.req.param('id'), `story-reply:${id}`, now, story.authorId, user.id)]);
  if (story.authorId !== user.id) c.executionCtx.waitUntil(sendPushToUser(c.env, story.authorId, { title: 'Ответ на сторис', body: `${user.displayName}: ${input.data.body}`, url: '/', tag: `story-reply-${id}` }));
  return ok(c, { id }, 201);
});

storyRoutes.post('/', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const activeCount = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM stories WHERE author_user_id = ? AND expires_at > ?')
    .bind(user.id, new Date().toISOString()).first<{ count: number }>();
  if ((activeCount?.count ?? 0) >= 20) return fail(c, 429, 'STORY_LIMIT_REACHED', 'You can have up to 20 active stories.');
  const contentType = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  const declaredLength = Number(c.req.header('content-length') ?? 0);
  const maxUploadBytes = await uploadLimitForUser(c.env.DB, user.id);
  if (declaredLength > maxUploadBytes) return fail(c, 413, 'STORY_TOO_LARGE', `Story media must not exceed ${Math.round(maxUploadBytes / 1024 / 1024)} MiB.`);
  const body = await c.req.arrayBuffer();
  try {
    assertValidStoryMedia(contentType, body.byteLength, maxUploadBytes);
    assertStoryMediaSignature(contentType, new Uint8Array(body));
  } catch (error) {
    return fail(c, 422, 'INVALID_STORY_MEDIA', error instanceof Error ? error.message : 'Invalid story media.');
  }

  const id = crypto.randomUUID();
  const encoded = base64Encode(new Uint8Array(body));
  const moderation = await moderatePublicContent(c.env, '', [{ mimeType: contentType, objectKey: 'pending-story', base64Data: encoded }]);
  await saveModerationResult(c.env.DB, 'story', id, moderation, encoded);
  if (moderation.decision !== 'allow') {
    return fail(c, 422, 'STORY_REJECTED', 'This story could not be approved by safety checks.');
  }
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + STORY_LIFETIME_MS);
  const storageKey = createStoryMediaKey(user.id, contentType);
  const mediaType = contentType in ALLOWED_IMAGE_TYPES ? 'image' : 'video';
  const storage = new KvMediaStorage(c.env.MEDIA);
  await storage.put(storageKey, body, {
    contentType,
    byteSize: body.byteLength,
    ownerUserId: user.id,
    expiresAt: expiresAt.toISOString(),
  }, Math.floor(expiresAt.getTime() / 1000));
  try {
    await c.env.DB.prepare(`INSERT INTO stories (id, author_user_id, storage_key, media_type, content_type, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, user.id, storageKey, mediaType, contentType, createdAt.toISOString(), expiresAt.toISOString()).run();
  } catch (error) {
    await storage.delete(storageKey);
    throw error;
  }
  await completeDailyTask(c.env, user.id, 'story');
  return ok(c, { story: { id, storageKey, mediaType, contentType, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() } }, 201);
});

storyRoutes.delete('/:id', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/iu.test(id)) return fail(c, 404, 'STORY_NOT_FOUND', 'Story not found.');
  const story = await c.env.DB.prepare('SELECT storage_key AS storageKey, author_user_id AS authorId FROM stories WHERE id = ?')
    .bind(id).first<{ storageKey: string; authorId: string }>();
  if (!story) return fail(c, 404, 'STORY_NOT_FOUND', 'Story not found.');
  if (story.authorId !== user.id) return fail(c, 403, 'FORBIDDEN', 'You can only delete your own story.');
  await c.env.DB.prepare('DELETE FROM stories WHERE id = ? AND author_user_id = ?').bind(id, user.id).run();
  await new KvMediaStorage(c.env.MEDIA).delete(story.storageKey);
  return ok(c, { deleted: true });
});

export async function deleteExpiredStories(env: Env): Promise<number> {
  const now = new Date().toISOString();
  const rows = await env.DB.prepare('SELECT id, storage_key AS storageKey FROM stories WHERE expires_at <= ? LIMIT 500')
    .bind(now).all<{ id: string; storageKey: string }>();
  if (!rows.results.length) return 0;
  const storage = new KvMediaStorage(env.MEDIA);
  await Promise.all(rows.results.map((story) => storage.delete(story.storageKey)));
  const placeholders = rows.results.map(() => '?').join(',');
  await env.DB.prepare(`DELETE FROM stories WHERE id IN (${placeholders})`).bind(...rows.results.map((story) => story.id)).run();
  return rows.results.length;
}
