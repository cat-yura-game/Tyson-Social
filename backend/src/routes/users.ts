import { Hono } from 'hono';
import { fail, ok } from '../lib/responses';
import { findUserByUsername, updateProfile } from '../repositories/auth-repository';
import { parseJsonBody, registerSchema, updateProfileSchema } from '../schemas/auth';
import type { AppVariables, AuthUser, Env } from '../types';
import { assertImageSignature, assertValidMedia, createMediaKey, KvMediaStorage } from '../services/media-storage';
import { feedPreferencesSchema } from '../schemas/preferences';
import { FEED_TOPICS, type FeedTopicId } from '../recommendations/topics';
import { base64Encode } from '../security/encoding';
import { moderatePublicContent, saveModerationResult } from '../services/moderation-service';
import { hashPassword } from '../security/passwords';
import { randomToken, sha256 } from '../security/tokens';

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

userRoutes.get('/me/verified-accounts', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const isLinkedChild = Boolean(await c.env.DB.prepare('SELECT 1 FROM verified_account_links WHERE child_user_id = ?').bind(user.id).first());
  const rows = await c.env.DB.prepare(`SELECT u.id, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey, u.created_at AS createdAt
    FROM verified_account_links l JOIN users u ON u.id = l.child_user_id WHERE l.parent_user_id = ? ORDER BY l.created_at DESC`)
    .bind(user.id).all();
  return ok(c, { canCreate: user.verified && !isLinkedChild, accounts: rows.results });
});

userRoutes.post('/me/verified-accounts', async (c) => {
  const parent = c.get('authUser');
  if (!parent) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  if (!parent.verified) return fail(c, 403, 'VERIFICATION_REQUIRED', 'Only verified accounts can create linked accounts.');
  if (await c.env.DB.prepare('SELECT 1 FROM verified_account_links WHERE child_user_id = ?').bind(parent.id).first()) {
    return fail(c, 403, 'LINKED_ACCOUNT_RESTRICTED', 'Linked verified accounts cannot create more linked accounts.');
  }
  try {
    const input = registerSchema.parse(await parseJsonBody(c.req.raw));
    const existingCount = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM verified_account_links WHERE parent_user_id = ?')
      .bind(parent.id).first<{ count: number }>();
    if ((existingCount?.count ?? 0) >= 10) return fail(c, 429, 'LINKED_ACCOUNT_LIMIT', 'A verified account can have at most 10 linked accounts.');
    const userId = crypto.randomUUID();
    const moderation = await moderatePublicContent(c.env, input.displayName);
    await saveModerationResult(c.env.DB, 'display_name', userId, moderation, input.displayName);
    if (moderation.decision !== 'allow') return fail(c, 422, 'DISPLAY_NAME_REJECTED', 'This display name could not be approved by safety checks.');
    const now = new Date().toISOString();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO users (id, email, username, display_name, password_hash, status, is_verified, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?)`)
        .bind(userId, input.email, input.username, input.displayName, await hashPassword(input.password), now, now),
      c.env.DB.prepare('INSERT INTO user_settings (user_id) VALUES (?)').bind(userId),
      c.env.DB.prepare('INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), userId, await sha256(randomToken()), new Date(Date.now() + 86_400_000).toISOString()),
      c.env.DB.prepare('INSERT INTO verified_account_links (parent_user_id, child_user_id, created_at) VALUES (?, ?, ?)')
        .bind(parent.id, userId, now),
    ]);
    return ok(c, { account: { id: userId, username: input.username, displayName: input.displayName, verified: true } }, 201);
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) return fail(c, 409, 'ACCOUNT_EXISTS', 'An account with this email or username already exists.');
    return fail(c, 422, 'VALIDATION_ERROR', 'The linked account details are invalid.');
  }
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
    if (input.displayName && input.displayName !== user.displayName) {
      const moderation = await moderatePublicContent(c.env, input.displayName);
      await saveModerationResult(c.env.DB, 'display_name', user.id, moderation, input.displayName);
      if (moderation.decision !== 'allow') {
        return fail(c, 422, 'DISPLAY_NAME_REJECTED', 'This display name could not be approved by safety checks.');
      }
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
  const encoded = base64Encode(new Uint8Array(body));
  const moderation = await moderatePublicContent(c.env, '', [{ mimeType: contentType, objectKey: 'pending-avatar', base64Data: encoded }]);
  await saveModerationResult(c.env.DB, 'avatar', user.id, moderation, encoded);
  if (moderation.decision !== 'allow') {
    return fail(c, 422, 'AVATAR_REJECTED', 'This avatar could not be approved by safety checks.');
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

userRoutes.put('/:username/follow', async (c) => {
  const viewer = c.get('authUser');
  if (!viewer) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const username = c.req.param('username').trim().toLowerCase();
  const target = await findUserByUsername(c.env.DB, username);
  if (!target) return fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
  if (target.id === viewer.id) return fail(c, 422, 'SELF_FOLLOW', 'You cannot follow yourself.');
  await c.env.DB.prepare(`INSERT INTO user_follows (follower_user_id, followed_user_id, created_at)
    VALUES (?, ?, ?) ON CONFLICT(follower_user_id, followed_user_id) DO NOTHING`)
    .bind(viewer.id, target.id, new Date().toISOString()).run();
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS followerCount FROM user_follows WHERE followed_user_id = ?')
    .bind(target.id).first<{ followerCount: number }>();
  return ok(c, { following: true, followerCount: count?.followerCount ?? 0 });
});

userRoutes.delete('/:username/follow', async (c) => {
  const viewer = c.get('authUser');
  if (!viewer) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const username = c.req.param('username').trim().toLowerCase();
  const target = await findUserByUsername(c.env.DB, username);
  if (!target) return fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
  if (target.id === viewer.id) return fail(c, 422, 'SELF_FOLLOW', 'You cannot follow yourself.');
  await c.env.DB.prepare('DELETE FROM user_follows WHERE follower_user_id = ? AND followed_user_id = ?')
    .bind(viewer.id, target.id).run();
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS followerCount FROM user_follows WHERE followed_user_id = ?')
    .bind(target.id).first<{ followerCount: number }>();
  return ok(c, { following: false, followerCount: count?.followerCount ?? 0 });
});

userRoutes.get('/:username', async (c) => {
  const username = c.req.param('username').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/u.test(username)) return fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
  const user = await findUserByUsername(c.env.DB, username);
  if (!user) return fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
  const viewerId = c.get('authUser')?.id ?? '';
  const stats = await c.env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM user_follows WHERE followed_user_id = ?) AS followerCount,
    (SELECT COUNT(*) FROM user_follows WHERE follower_user_id = ?) AS followingCount,
    EXISTS(SELECT 1 FROM user_follows WHERE follower_user_id = ? AND followed_user_id = ?) AS viewerFollowing`)
    .bind(user.id, user.id, viewerId, user.id).first<{ followerCount: number; followingCount: number; viewerFollowing: number }>();
  return ok(c, { user: { ...publicProfile(user), followerCount: stats?.followerCount ?? 0,
    followingCount: stats?.followingCount ?? 0, viewerFollowing: stats?.viewerFollowing === 1 } });
});
