import { Hono } from 'hono';
import { fail, ok } from '../lib/responses';
import { findUserByUsername, updateProfile } from '../repositories/auth-repository';
import { parseJsonBody, updateProfileSchema } from '../schemas/auth';
import type { AppVariables, AuthUser, Env } from '../types';
import { assertImageSignature, assertValidMedia, createMediaKey, KvMediaStorage } from '../services/media-storage';
import { feedPreferencesSchema } from '../schemas/preferences';
import { FEED_TOPICS, type FeedTopicId } from '../recommendations/topics';

export const userRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function publicProfile(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarKey: user.avatarKey,
    bio: user.bio,
    emailVerified: user.emailVerified,
    verified: user.verified,
    createdAt: user.createdAt,
  };
}

userRoutes.get('/me', (c) => {
  const user = c.get('authUser');
  return user ? ok(c, { user }) : fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
});

userRoutes.get('/me/feed-preferences', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const row = await c.env.DB.prepare(`SELECT preferred_topics_json AS preferredTopicsJson
    FROM user_settings WHERE user_id = ?`).bind(user.id).first<{ preferredTopicsJson: string }>();
  let selectedTopics: FeedTopicId[] = [];
  try {
    selectedTopics = feedPreferencesSchema.parse({ topics: JSON.parse(row?.preferredTopicsJson ?? '[]') }).topics;
  } catch {
    selectedTopics = [];
  }
  return ok(c, {
    selectedTopics,
    availableTopics: FEED_TOPICS.map(({ id, label }) => ({ id, label })),
    maximumSelectedTopics: 6,
  });
});

userRoutes.put('/me/feed-preferences', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  try {
    const input = feedPreferencesSchema.parse(await parseJsonBody(c.req.raw));
    await c.env.DB.prepare(`UPDATE user_settings SET preferred_topics_json = ?, updated_at = ? WHERE user_id = ?`)
      .bind(JSON.stringify(input.topics), new Date().toISOString(), user.id).run();
    return ok(c, { selectedTopics: input.topics });
  } catch {
    return fail(c, 422, 'VALIDATION_ERROR', 'Choose no more than six available topics.');
  }
});

userRoutes.patch('/me', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');

  try {
    const input = updateProfileSchema.parse(await parseJsonBody(c.req.raw));
    if (input.username && !user.usernameChangeAvailable) {
      return fail(c, 409, 'USERNAME_CHANGE_USED', 'Username can only be changed once after registration.');
    }
    const updated = await updateProfile(c.env.DB, user.id, input);
    return updated ? ok(c, { user: updated }) : fail(c, 409, 'USERNAME_CHANGE_USED', 'Username can only be changed once after registration.');
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      return fail(c, 409, 'USERNAME_TAKEN', 'This username is already taken.');
    }
    return fail(c, 422, 'VALIDATION_ERROR', 'The submitted profile data is invalid.');
  }
});

userRoutes.post('/me/avatar', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const contentType = c.req.header('content-type')?.split(';')[0]?.trim() ?? '';
  const declaredLength = Number(c.req.header('content-length') ?? 0);
  if (declaredLength > 5 * 1024 * 1024) return fail(c, 413, 'IMAGE_TOO_LARGE', 'Avatar must not exceed 5 MiB.');
  const body = await c.req.arrayBuffer();
  try {
    assertValidMedia(contentType, body.byteLength);
    assertImageSignature(contentType, new Uint8Array(body));
  } catch (error) {
    return fail(c, 422, 'INVALID_IMAGE', error instanceof Error ? error.message : 'Invalid image.');
  }
  const storage = new KvMediaStorage(c.env.MEDIA);
  const key = createMediaKey(user.id, contentType);
  await storage.put(key, body, { contentType, byteSize: body.byteLength, ownerUserId: user.id });
  await c.env.DB.prepare('UPDATE users SET avatar_key = ?, updated_at = ? WHERE id = ?')
    .bind(key, new Date().toISOString(), user.id).run();
  if (user.avatarKey) await storage.delete(user.avatarKey);
  return ok(c, { avatarKey: key }, 201);
});

userRoutes.delete('/me/avatar', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  await c.env.DB.prepare('UPDATE users SET avatar_key = NULL, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), user.id).run();
  if (user.avatarKey) await new KvMediaStorage(c.env.MEDIA).delete(user.avatarKey);
  return ok(c, { avatarKey: null });
});

userRoutes.get('/:username/posts', async (c) => {
  const username = c.req.param('username').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/u.test(username)) return fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
  const viewerId = c.get('authUser')?.id ?? '';
  const rows = await c.env.DB.prepare(`SELECT p.id, p.title, p.body, p.like_count AS likeCount, p.comment_count AS commentCount,
    p.published_at AS publishedAt, p.updated_at AS updatedAt, u.id AS authorId, u.username,
    u.display_name AS displayName, u.avatar_key AS avatarKey, u.is_verified AS verified,
    (SELECT pm.storage_key FROM post_media pm WHERE pm.post_id = p.id ORDER BY pm.sort_order LIMIT 1) AS mediaKey,
    COALESCE((SELECT reaction FROM post_reactions r WHERE r.post_id = p.id AND r.user_id = ?), '') AS viewerReaction
    FROM posts p JOIN users u ON u.id = p.author_user_id
    WHERE u.username = ? COLLATE NOCASE AND p.status = 'published'
    ORDER BY p.published_at DESC LIMIT 100`).bind(viewerId, username).all();
  return ok(c, { posts: rows.results });
});

userRoutes.get('/:username', async (c) => {
  const username = c.req.param('username').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/u.test(username)) return fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
  const user = await findUserByUsername(c.env.DB, username);
  return user ? ok(c, { user: publicProfile(user) }) : fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
});
