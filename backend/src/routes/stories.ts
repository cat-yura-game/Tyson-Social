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

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

export const storyRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

storyRoutes.get('/', async (c) => {
  const viewerId = c.get('authUser')?.id ?? '';
  const now = new Date().toISOString();
  const rows = await c.env.DB.prepare(`SELECT s.id, s.storage_key AS storageKey, s.media_type AS mediaType,
    s.content_type AS contentType, s.created_at AS createdAt, s.expires_at AS expiresAt,
    u.id AS authorId, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey, u.is_verified AS verified
    FROM stories s JOIN users u ON u.id = s.author_user_id
    WHERE s.expires_at > ? AND u.status IN ('active', 'pending_email')
      AND (u.id = ? OR EXISTS (
        SELECT 1 FROM user_follows f WHERE f.follower_user_id = ? AND f.followed_user_id = u.id
      ))
    ORDER BY CASE WHEN u.id = ? THEN 0 ELSE 1 END, s.created_at ASC LIMIT 200`)
    .bind(now, viewerId, viewerId, viewerId).all();
  return ok(c, { stories: rows.results });
});

storyRoutes.post('/', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const activeCount = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM stories WHERE author_user_id = ? AND expires_at > ?')
    .bind(user.id, new Date().toISOString()).first<{ count: number }>();
  if ((activeCount?.count ?? 0) >= 20) return fail(c, 429, 'STORY_LIMIT_REACHED', 'You can have up to 20 active stories.');
  const contentType = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  const declaredLength = Number(c.req.header('content-length') ?? 0);
  if (declaredLength > 5 * 1024 * 1024) return fail(c, 413, 'STORY_TOO_LARGE', 'Story media must not exceed 5 MiB.');
  const body = await c.req.arrayBuffer();
  try {
    assertValidStoryMedia(contentType, body.byteLength);
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
