import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { fail, ok } from '../lib/responses';
import { createSession, findUserById, findUserByUsername, updateProfile } from '../repositories/auth-repository';
import { parseJsonBody, registerSchema, updateProfileSchema } from '../schemas/auth';
import type { AppVariables, AuthUser, Env } from '../types';
import { assertImageSignature, assertValidMedia, createMediaKey, mediaStorage } from '../services/media-storage';
import { feedPreferencesSchema } from '../schemas/preferences';
import { FEED_TOPICS, type FeedTopicId } from '../recommendations/topics';
import { base64Encode } from '../security/encoding';
import { moderatePublicContent, saveModerationResult } from '../services/moderation-service';
import { hashPassword } from '../security/passwords';
import { uploadLimitForUser } from '../services/upload-limits';
import { keyedHash, randomToken, sha256 } from '../security/tokens';
import { SESSION_COOKIE } from '../middleware/auth';
import { deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { deleteUserAccount } from '../services/account-deletion';
import { sendPushToUser } from '../services/web-push';

export const userRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
const authorPushPreferenceSchema = z.object({ authorUserId: z.string().uuid(), enabled: z.boolean() }).strict();
const visibilitySchema = z.enum(['everyone', 'friends', 'nobody']);
const privacySettingsSchema = z.object({
  lastSeenVisibility: visibilitySchema,
  birthdayVisibility: visibilitySchema,
  messagingVisibility: visibilitySchema,
  storiesVisibility: visibilitySchema,
}).strict();
const notificationSettingsSchema = z.object({ messageSoundsEnabled: z.boolean() }).strict();
const powerSavingSettingsSchema = z.object({ powerSavingEnabled: z.boolean(), blockImagesEnabled: z.boolean() }).strict();
const aliasSchema = z.object({ username: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_]+$/u).transform((value) => value.toLowerCase()) }).strict();

/** Accepts older cached clients without letting an obsolete optional field block an entire profile save. */
export function normalizeProfileUpdate(raw: unknown): z.infer<typeof updateProfileSchema> {
  const parsed = updateProfileSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid profile payload.');
  const value = raw as Record<string, unknown>; const normalized: Record<string, unknown> = {};
  if (typeof value.displayName === 'string' && value.displayName.trim().length >= 1 && value.displayName.trim().length <= 80) normalized.displayName = value.displayName.trim();
  if (typeof value.bio === 'string' && value.bio.trim().length <= 500) normalized.bio = value.bio.trim();
  if (typeof value.username === 'string' && /^[A-Za-z0-9_]{3,30}$/u.test(value.username.trim())) normalized.username = value.username.trim().toLowerCase();
  const birthday = typeof value.birthdayMonthDay === 'string' ? value.birthdayMonthDay.trim() : value.birthdayMonthDay;
  const birthdayValid = birthday === null || (typeof birthday === 'string' && /^\d{2}-\d{2}$/u.test(birthday) && (() => { const parts = birthday.split('-'); const day = Number(parts[0]); const month = Number(parts[1]); return month >= 1 && month <= 12 && day >= 1 && day <= new Date(2000, month, 0).getDate(); })());
  if (Object.hasOwn(value, 'birthdayMonthDay') && birthdayValid) {
    normalized.birthdayMonthDay = birthday;
    const year = value.birthdayYear;
    if (year === null || (typeof year === 'number' && Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear())) normalized.birthdayYear = year;
  } else if (Object.hasOwn(value, 'birthdayMonthDay')) { normalized.birthdayMonthDay = null; normalized.birthdayYear = null; }
  if (typeof value.profileColor === 'string') normalized.profileColor = ['forest', 'ocean', 'sunset', 'violet', 'rose', 'graphite'].includes(value.profileColor) ? value.profileColor : 'forest';
  const repaired = updateProfileSchema.safeParse(normalized);
  if (!repaired.success) throw new Error('Invalid profile payload.');
  console.warn(JSON.stringify({ event: 'profile_payload_normalized', droppedFields: parsed.error.issues.map((issue) => issue.path.join('.')) }));
  return repaired.data;
}

function publicProfile(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarKey: user.avatarKey,
    bio: user.bio,
    emailVerified: user.emailVerified,
    verified: user.verified,
    lastSeenAt: user.lastSeenAt,
    birthdayMonthDay: user.birthdayMonthDay,
    birthdayYear: user.birthdayYear,
    profileColor: user.profileColor,
    createdAt: user.createdAt,
  };
}

userRoutes.get('/me/post-notification-authors', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const rows = await c.env.DB.prepare(`SELECT u.id, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey,
    EXISTS(SELECT 1 FROM author_push_preferences p WHERE p.user_id = ? AND p.author_user_id = u.id) AS enabled
    FROM user_follows f JOIN users u ON u.id = f.followed_user_id WHERE f.follower_user_id = ?
    ORDER BY u.display_name COLLATE NOCASE LIMIT 200`).bind(user.id, user.id).all();
  return ok(c, { authors: rows.results });
});

userRoutes.put('/me/post-notification-authors', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  let input: z.infer<typeof authorPushPreferenceSchema>;
  try { input = authorPushPreferenceSchema.parse(await c.req.json()); }
  catch (error) { return fail(c, 422, 'VALIDATION_ERROR', 'Invalid notification preference.', error instanceof z.ZodError ? error.flatten() : undefined); }
  if (input.enabled) {
    const following = await c.env.DB.prepare('SELECT 1 FROM user_follows WHERE follower_user_id = ? AND followed_user_id = ?').bind(user.id, input.authorUserId).first();
    if (!following) return fail(c, 422, 'FOLLOW_REQUIRED', 'Follow this author first.');
    await c.env.DB.prepare('INSERT OR IGNORE INTO author_push_preferences (user_id, author_user_id, created_at) VALUES (?, ?, ?)').bind(user.id, input.authorUserId, new Date().toISOString()).run();
  } else await c.env.DB.prepare('DELETE FROM author_push_preferences WHERE user_id = ? AND author_user_id = ?').bind(user.id, input.authorUserId).run();
  return ok(c, { enabled: input.enabled });
});

userRoutes.get('/me', (c) => {
  const user = c.get('authUser');
  return user ? ok(c, { user }) : fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
});

userRoutes.get('/me/analytics', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [reach, impressions, likes, comments, reposts, followers, posts] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(DISTINCT e.user_id) AS value FROM recommendation_events e JOIN posts p ON p.id = e.post_id WHERE p.author_user_id = ? AND p.status = 'published' AND e.event_type = 'impression' AND e.created_at >= ?`).bind(user.id, since).first<{ value: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS value FROM recommendation_events e JOIN posts p ON p.id = e.post_id WHERE p.author_user_id = ? AND p.status = 'published' AND e.event_type = 'impression' AND e.created_at >= ?`).bind(user.id, since).first<{ value: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS value FROM recommendation_events e JOIN posts p ON p.id = e.post_id WHERE p.author_user_id = ? AND p.status = 'published' AND e.event_type = 'like' AND e.created_at >= ?`).bind(user.id, since).first<{ value: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS value FROM comments cm JOIN posts p ON p.id = cm.post_id WHERE p.author_user_id = ? AND p.status = 'published' AND cm.status = 'published' AND cm.created_at >= ?`).bind(user.id, since).first<{ value: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS value FROM posts r JOIN posts p ON p.id = r.repost_of_post_id WHERE p.author_user_id = ? AND p.status = 'published' AND r.status = 'published' AND r.published_at >= ?`).bind(user.id, since).first<{ value: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS value FROM user_follows WHERE followed_user_id = ? AND created_at >= ?').bind(user.id, since).first<{ value: number }>(),
    c.env.DB.prepare(`SELECT p.id, p.title, p.body, p.published_at AS publishedAt, p.like_count AS likeCount, p.comment_count AS commentCount,
      (SELECT COUNT(*) FROM recommendation_events e WHERE e.post_id = p.id AND e.event_type = 'impression' AND e.created_at >= ?) AS impressions,
      (SELECT COUNT(DISTINCT e.user_id) FROM recommendation_events e WHERE e.post_id = p.id AND e.event_type = 'impression' AND e.created_at >= ?) AS reach,
      (SELECT COUNT(*) FROM posts r WHERE r.repost_of_post_id = p.id AND r.status = 'published') AS repostCount
      FROM posts p WHERE p.author_user_id = ? AND p.status = 'published' AND p.repost_of_post_id IS NULL ORDER BY impressions DESC, p.published_at DESC LIMIT 5`).bind(since, since, user.id).all(),
  ]);
  return ok(c, {
    periodDays: 30, reach: reach?.value ?? 0, impressions: impressions?.value ?? 0,
    interactions: (likes?.value ?? 0) + (comments?.value ?? 0) + (reposts?.value ?? 0), followers: followers?.value ?? 0,
    topPosts: posts.results,
  });
});

userRoutes.get('/me/aliases', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const rows = await c.env.DB.prepare('SELECT id, username, created_at AS createdAt, purchase_price AS purchasePrice FROM username_aliases WHERE user_id = ? ORDER BY created_at').bind(user.id).all();
  return ok(c, { aliases: rows.results, price: 50 });
});

userRoutes.post('/me/aliases', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  let input: z.infer<typeof aliasSchema>; try { input = aliasSchema.parse(await parseJsonBody(c.req.raw)); } catch { return fail(c, 422, 'VALIDATION_ERROR', 'Invalid username.'); }
  if (input.username === user.username.toLowerCase()) return fail(c, 422, 'MAIN_USERNAME', 'This is already your main username.');
  const [takenUser, takenAlias, count] = await Promise.all([
    c.env.DB.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').bind(input.username).first(),
    c.env.DB.prepare('SELECT 1 FROM username_aliases WHERE username = ? COLLATE NOCASE').bind(input.username).first(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM username_aliases WHERE user_id = ?').bind(user.id).first<{ count: number }>(),
  ]);
  if (takenUser || takenAlias) return fail(c, 409, 'USERNAME_TAKEN', 'This username is already taken.');
  if ((count?.count ?? 0) >= 20) return fail(c, 422, 'ALIAS_LIMIT_REACHED', 'You can have up to 20 additional usernames.');
  const now = new Date().toISOString(); const aliasId = crypto.randomUUID(); const transactionId = crypto.randomUUID();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at) SELECT ?, ?, -50, 'debit', 'username_alias', ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND diamond_balance >= 50)`).bind(transactionId, user.id, input.username, now, user.id),
    c.env.DB.prepare('UPDATE users SET diamond_balance = diamond_balance - 50 WHERE id = ? AND EXISTS (SELECT 1 FROM diamond_transactions WHERE id = ?)').bind(user.id, transactionId),
    c.env.DB.prepare('INSERT INTO username_aliases (id, user_id, username, purchase_price, created_at) SELECT ?, ?, ?, 50, ? WHERE EXISTS (SELECT 1 FROM diamond_transactions WHERE id = ?)').bind(aliasId, user.id, input.username, now, transactionId),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'INSUFFICIENT_DIAMONDS', 'Not enough diamonds.');
  return ok(c, { alias: { id: aliasId, username: input.username, createdAt: now }, balance: (await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(user.id).first<{ balance: number }>())?.balance ?? 0 }, 201);
});

userRoutes.delete('/me/aliases/:id', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const result = await c.env.DB.prepare('DELETE FROM username_aliases WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
  if (!result.meta.changes) return fail(c, 404, 'ALIAS_NOT_FOUND', 'Username not found.');
  return ok(c, { deleted: true });
});

function setSwitchedSessionCookie(c: Parameters<typeof ok>[0], token: string): void {
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: secure ? 'None' : 'Lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
}

userRoutes.get('/me/verified-accounts', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const parentLink = await c.env.DB.prepare('SELECT parent_user_id AS parentUserId FROM verified_account_links WHERE child_user_id = ?').bind(user.id)
    .first<{ parentUserId: string }>();
  if (parentLink) {
    const parent = await findUserById(c.env.DB, parentLink.parentUserId);
    return ok(c, { canCreate: false, isLinkedAccount: true, accounts: parent ? [{ id: parent.id, username: parent.username, displayName: parent.displayName, avatarKey: parent.avatarKey, createdAt: parent.createdAt }] : [] });
  }
  const rows = await c.env.DB.prepare(`SELECT u.id, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey, u.created_at AS createdAt
    FROM verified_account_links l JOIN users u ON u.id = l.child_user_id WHERE l.parent_user_id = ? ORDER BY l.created_at DESC`)
    .bind(user.id).all();
  return ok(c, { canCreate: user.verified, isLinkedAccount: false, accounts: rows.results });
});

/** A linked account may hide or restore its inherited verification badge without losing account switching. */
userRoutes.put('/me/verified-badge', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const input = z.object({ visible: z.boolean() }).strict().safeParse(await c.req.json().catch(() => null));
  if (!input.success) return fail(c, 422, 'INVALID_VERIFICATION_BADGE', 'Choose whether to show the verification badge.');
  const linked = await c.env.DB.prepare('SELECT 1 FROM verified_account_links WHERE child_user_id = ?').bind(user.id).first();
  if (!linked) return fail(c, 403, 'VERIFICATION_BADGE_FORBIDDEN', 'Only linked accounts can change this badge.');
  await c.env.DB.prepare('UPDATE users SET is_verified = ?, updated_at = ? WHERE id = ?').bind(input.data.visible ? 1 : 0, new Date().toISOString(), user.id).run();
  return ok(c, { verified: input.data.visible });
});

userRoutes.post('/me/verified-accounts/:id/switch', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const targetId = c.req.param('id');
  const parentLink = await c.env.DB.prepare('SELECT parent_user_id AS parentUserId FROM verified_account_links WHERE child_user_id = ?').bind(user.id)
    .first<{ parentUserId: string }>();
  const allowed = parentLink
    ? targetId === parentLink.parentUserId
    : Boolean(await c.env.DB.prepare('SELECT 1 FROM verified_account_links WHERE parent_user_id = ? AND child_user_id = ?').bind(user.id, targetId).first());
  if (!allowed) return fail(c, 403, 'ACCOUNT_SWITCH_FORBIDDEN', 'This account is not linked to the current profile.');
  const target = await findUserById(c.env.DB, targetId);
  if (!target || target.status === 'suspended' || target.status === 'deleted') return fail(c, 404, 'ACCOUNT_NOT_AVAILABLE', 'This account is not available.');
  const token = randomToken();
  const now = new Date();
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ipHash = c.env.SESSION_SECRET ? await keyedHash(c.env.SESSION_SECRET, ip) : await sha256(ip);
  await createSession(c.env.DB, { id: crypto.randomUUID(), userId: target.id, tokenHash: await sha256(token),
    userAgent: c.req.header('user-agent')?.slice(0, 512) ?? null, ipHash, expiresAt: new Date(now.getTime() + 2_592_000_000).toISOString(), now: now.toISOString() });
  setSwitchedSessionCookie(c, token);
  return ok(c, { user: target, accessToken: token });
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

userRoutes.get('/me/messaging-settings', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const row = await c.env.DB.prepare('SELECT secret_chat_enabled AS secretChatEnabled FROM user_settings WHERE user_id = ?')
    .bind(user.id).first<{ secretChatEnabled: number }>();
  return ok(c, { secretChatEnabled: row?.secretChatEnabled === 1 });
});

userRoutes.get('/me/privacy-settings', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const row = await c.env.DB.prepare(`SELECT last_seen_visibility AS lastSeenVisibility, birthday_visibility AS birthdayVisibility,
    messaging_visibility AS messagingVisibility, stories_visibility AS storiesVisibility FROM user_settings WHERE user_id = ?`).bind(user.id)
    .first<{ lastSeenVisibility: 'everyone' | 'friends' | 'nobody'; birthdayVisibility: 'everyone' | 'friends' | 'nobody'; messagingVisibility: 'everyone' | 'friends' | 'nobody'; storiesVisibility: 'everyone' | 'friends' | 'nobody' }>();
  return ok(c, row ?? { lastSeenVisibility: 'everyone', birthdayVisibility: 'everyone', messagingVisibility: 'everyone', storiesVisibility: 'everyone' });
});

userRoutes.put('/me/privacy-settings', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  try {
    const input = privacySettingsSchema.parse(await parseJsonBody(c.req.raw));
    await c.env.DB.prepare(`UPDATE user_settings SET last_seen_visibility = ?, birthday_visibility = ?, messaging_visibility = ?, stories_visibility = ?, updated_at = ? WHERE user_id = ?`)
      .bind(input.lastSeenVisibility, input.birthdayVisibility, input.messagingVisibility, input.storiesVisibility, new Date().toISOString(), user.id).run();
    return ok(c, input);
  } catch { return fail(c, 422, 'VALIDATION_ERROR', 'Invalid privacy settings.'); }
});

userRoutes.get('/me/notification-settings', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const row = await c.env.DB.prepare('SELECT message_sounds_enabled AS messageSoundsEnabled FROM user_settings WHERE user_id = ?')
    .bind(user.id).first<{ messageSoundsEnabled: number }>();
  return ok(c, { messageSoundsEnabled: row?.messageSoundsEnabled !== 0 });
});

userRoutes.get('/me/login-approval-settings', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const row = await c.env.DB.prepare(`SELECT login_approval_enabled AS enabled, login_approval_method AS method FROM user_settings WHERE user_id = ?`).bind(user.id).first<{ enabled: number; method: 'telegram' | 'email' | 'both' }>();
  return ok(c, { enabled: row?.enabled === 1, method: row?.method ?? 'email' });
});

userRoutes.put('/me/login-approval-settings', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  try {
    const value = await parseJsonBody(c.req.raw) as { enabled?: unknown; method?: unknown };
    if (typeof value.enabled !== 'boolean' || !['telegram', 'email', 'both'].includes(String(value.method))) throw new Error('Invalid setting.');
    const method = value.method as 'telegram' | 'email' | 'both';
    if (value.enabled && (method === 'telegram' || method === 'both')) {
      const linked = await c.env.DB.prepare('SELECT 1 FROM telegram_identities WHERE user_id = ? AND telegram_user_id IS NOT NULL').bind(user.id).first();
      if (!linked) return fail(c, 422, 'TELEGRAM_REQUIRED', 'Сначала подключите Telegram к аккаунту.');
    }
    await c.env.DB.prepare(`UPDATE user_settings SET login_approval_enabled = ?, login_approval_method = ?, updated_at = ? WHERE user_id = ?`).bind(value.enabled ? 1 : 0, method, new Date().toISOString(), user.id).run();
    return ok(c, { enabled: value.enabled, method });
  } catch { return fail(c, 422, 'VALIDATION_ERROR', 'Invalid login approval settings.'); }
});

userRoutes.put('/me/notification-settings', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  try {
    const input = notificationSettingsSchema.parse(await parseJsonBody(c.req.raw));
    await c.env.DB.prepare('UPDATE user_settings SET message_sounds_enabled = ?, updated_at = ? WHERE user_id = ?')
      .bind(input.messageSoundsEnabled ? 1 : 0, new Date().toISOString(), user.id).run();
    return ok(c, input);
  } catch { return fail(c, 422, 'VALIDATION_ERROR', 'Invalid notification settings.'); }
});

userRoutes.get('/me/power-saving-settings', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const row = await c.env.DB.prepare(`SELECT power_saving_enabled AS powerSavingEnabled, block_images_enabled AS blockImagesEnabled
    FROM user_settings WHERE user_id = ?`).bind(user.id).first<{ powerSavingEnabled: number; blockImagesEnabled: number }>();
  return ok(c, { powerSavingEnabled: row?.powerSavingEnabled === 1, blockImagesEnabled: row?.blockImagesEnabled === 1 });
});

userRoutes.put('/me/power-saving-settings', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  try {
    const input = powerSavingSettingsSchema.parse(await parseJsonBody(c.req.raw));
    await c.env.DB.prepare(`UPDATE user_settings SET power_saving_enabled = ?, block_images_enabled = ?, updated_at = ? WHERE user_id = ?`)
      .bind(input.powerSavingEnabled ? 1 : 0, input.blockImagesEnabled ? 1 : 0, new Date().toISOString(), user.id).run();
    return ok(c, input);
  } catch { return fail(c, 422, 'VALIDATION_ERROR', 'Invalid power saving settings.'); }
});

userRoutes.put('/me/messaging-settings', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  try {
    const value = await parseJsonBody(c.req.raw) as { secretChatEnabled?: unknown };
    if (typeof value.secretChatEnabled !== 'boolean') throw new Error('Invalid setting.');
    await c.env.DB.prepare('UPDATE user_settings SET secret_chat_enabled = ?, updated_at = ? WHERE user_id = ?')
      .bind(value.secretChatEnabled ? 1 : 0, new Date().toISOString(), user.id).run();
    return ok(c, { secretChatEnabled: value.secretChatEnabled });
  } catch {
    return fail(c, 422, 'VALIDATION_ERROR', 'The messaging setting is invalid.');
  }
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
    const input = normalizeProfileUpdate(await parseJsonBody(c.req.raw));
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
    return fail(c, 422, 'VALIDATION_ERROR', 'Проверьте имя, username, дату рождения и цвет профиля.');
  }
});

userRoutes.post('/me/avatar', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const contentType = c.req.header('content-type')?.split(';')[0]?.trim() ?? '';
  const declaredLength = Number(c.req.header('content-length') ?? 0);
  const maxUploadBytes = await uploadLimitForUser(c.env.DB, user.id);
  if (declaredLength > maxUploadBytes) return fail(c, 413, 'IMAGE_TOO_LARGE', `Avatar must not exceed ${Math.round(maxUploadBytes / 1024 / 1024)} MiB.`);
  const body = await c.req.arrayBuffer();
  try {
    assertValidMedia(contentType, body.byteLength, maxUploadBytes);
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
  const storage = mediaStorage(c.env);
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
  if (user.avatarKey) await mediaStorage(c.env).delete(user.avatarKey);
  return ok(c, { avatarKey: null });
});

const deleteAccountSchema = z.object({
  username: z.string().min(3).max(30),
  confirmation: z.literal('DELETE'),
}).strict();

userRoutes.delete('/me', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  let input: z.infer<typeof deleteAccountSchema>;
  try { input = deleteAccountSchema.parse(await parseJsonBody(c.req.raw)); }
  catch { return fail(c, 422, 'VALIDATION_ERROR', 'Type your username and the deletion confirmation exactly.'); }
  if (input.username.toLowerCase() !== user.username.toLowerCase()) {
    return fail(c, 422, 'USERNAME_CONFIRMATION_MISMATCH', 'The username confirmation does not match this account.');
  }
  await deleteUserAccount(c.env, user.id);
  const secure = new URL(c.req.url).protocol === 'https:';
  deleteCookie(c, SESSION_COOKIE, { secure, sameSite: secure ? 'None' : 'Lax', path: '/' });
  return ok(c, { deleted: true });
});

userRoutes.get('/:username/posts', async (c) => {
  const username = c.req.param('username').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/u.test(username)) return fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
  const viewerId = c.get('authUser')?.id ?? '';
  const rows = await c.env.DB.prepare(`SELECT p.id, p.title, p.body, p.like_count AS likeCount, p.comment_count AS commentCount, p.pinned_at AS pinnedAt,
    p.published_at AS publishedAt, p.updated_at AS updatedAt, p.edited_at AS editedAt, p.repost_of_post_id AS repostOfPostId, u.id AS authorId, u.username,
    u.display_name AS displayName, u.avatar_key AS avatarKey, u.is_verified AS verified,
    u.worn_gift_id AS wornGiftId,
    (SELECT COALESCE(ug.variant, gt.base_image) FROM user_gifts ug JOIN gift_types gt ON gt.id = ug.gift_type_id WHERE ug.id = u.worn_gift_id) AS wornGiftImage,
    (SELECT pm.storage_key FROM post_media pm WHERE pm.post_id = p.id ORDER BY pm.sort_order LIMIT 1) AS mediaKey,
    COALESCE((SELECT reaction FROM post_reactions r WHERE r.post_id = p.id AND r.user_id = ?), '') AS viewerReaction,
    COALESCE((SELECT SUM(amount) FROM post_diamond_reactions d WHERE d.post_id = p.id), 0) AS diamondCount,
    EXISTS(SELECT 1 FROM post_diamond_reactions d WHERE d.post_id = p.id AND d.sender_user_id = ?) AS viewerDiamondGiven
    FROM posts p JOIN users u ON u.id = p.author_user_id
    WHERE (u.username = ? COLLATE NOCASE OR EXISTS (SELECT 1 FROM username_aliases a WHERE a.user_id = u.id AND a.username = ? COLLATE NOCASE)) AND p.status = 'published'
    ORDER BY p.pinned_at DESC, p.published_at DESC LIMIT 100`).bind(viewerId, viewerId, username, username).all();
  return ok(c, { posts: rows.results });
});

userRoutes.get('/:username/reposts', async (c) => {
  const username = c.req.param('username').trim().toLowerCase();
  const viewerId = c.get('authUser')?.id ?? '';
  const rows = await c.env.DB.prepare(`SELECT p.id, p.title, p.body, p.like_count AS likeCount, p.comment_count AS commentCount, p.pinned_at AS pinnedAt,
    p.published_at AS publishedAt, p.updated_at AS updatedAt, p.edited_at AS editedAt, p.repost_of_post_id AS repostOfPostId, u.id AS authorId, u.username,
    u.display_name AS displayName, u.avatar_key AS avatarKey, u.is_verified AS verified,
    NULL AS wornGiftId, NULL AS wornGiftImage, NULL AS mediaKey, '' AS viewerReaction, 0 AS diamondCount, 0 AS viewerDiamondGiven
    FROM posts p JOIN users u ON u.id = p.author_user_id
    WHERE (u.username = ? COLLATE NOCASE OR EXISTS (SELECT 1 FROM username_aliases a WHERE a.user_id = u.id AND a.username = ? COLLATE NOCASE))
      AND p.status = 'published' AND p.repost_of_post_id IS NOT NULL ORDER BY p.published_at DESC LIMIT 100`).bind(username, username).all();
  return ok(c, { posts: rows.results, viewerId });
});

userRoutes.put('/:username/follow', async (c) => {
  const viewer = c.get('authUser');
  if (!viewer) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const username = c.req.param('username').trim().toLowerCase();
  const target = await findUserByUsername(c.env.DB, username);
  if (!target) return fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
  if (target.id === viewer.id) return fail(c, 422, 'SELF_FOLLOW', 'You cannot follow yourself.');
  const follow = await c.env.DB.prepare(`INSERT INTO user_follows (follower_user_id, followed_user_id, created_at)
    VALUES (?, ?, ?) ON CONFLICT(follower_user_id, followed_user_id) DO NOTHING`)
    .bind(viewer.id, target.id, new Date().toISOString()).run();
  const rewardId = crypto.randomUUID(); const now = new Date().toISOString();
  if ((follow.meta.changes ?? 0) === 1) {
    await c.env.DB.prepare(`INSERT OR IGNORE INTO notifications
      (id, user_id, actor_user_id, type, entity_id, message, dedupe_key, created_at)
      VALUES (?, ?, ?, 'follow', ?, 'подписался на вас', ?, ?)`).bind(crypto.randomUUID(), target.id, viewer.id, viewer.id, `follow:${viewer.id}:${target.id}`, now).run();
    c.executionCtx.waitUntil(sendPushToUser(c.env, target.id, { title: 'Новая подписка', body: `${viewer.displayName} подписался на вас`, url: `/profile/${viewer.username}`, tag: `follow-${viewer.id}` }));
  }
  const reward = (follow.meta.changes ?? 0) === 1 ? await c.env.DB.prepare(`INSERT OR IGNORE INTO follow_reward_claims (follower_user_id, followed_user_id, rewarded_at) VALUES (?, ?, ?)`)
    .bind(viewer.id, target.id, now).run() : null;
  if ((reward?.meta.changes ?? 0) === 1) await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET diamond_balance = diamond_balance + 2 WHERE id = ?').bind(target.id),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at) VALUES (?, ?, 2, 'credit', 'first_follow_reward', ?, ?)`).bind(rewardId, target.id, viewer.id, now),
  ]);
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
  await c.env.DB.prepare('DELETE FROM author_push_preferences WHERE user_id = ? AND author_user_id = ?')
    .bind(viewer.id, target.id).run();
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS followerCount FROM user_follows WHERE followed_user_id = ?')
    .bind(target.id).first<{ followerCount: number }>();
  return ok(c, { following: false, followerCount: count?.followerCount ?? 0 });
});

userRoutes.get('/:username/followers', async (c) => {
  const target = await findUserByUsername(c.env.DB, c.req.param('username'));
  if (!target) return fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
  const rows = await c.env.DB.prepare(`SELECT u.id, u.username, u.display_name AS displayName,
    u.avatar_key AS avatarKey, u.is_verified AS verified
    FROM user_follows f JOIN users u ON u.id = f.follower_user_id
    WHERE f.followed_user_id = ? ORDER BY f.created_at DESC LIMIT 200`)
    .bind(target.id).all();
  return ok(c, { people: rows.results });
});

userRoutes.get('/:username/following', async (c) => {
  const target = await findUserByUsername(c.env.DB, c.req.param('username'));
  if (!target) return fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
  const rows = await c.env.DB.prepare(`SELECT u.id, u.username, u.display_name AS displayName,
    u.avatar_key AS avatarKey, u.is_verified AS verified
    FROM user_follows f JOIN users u ON u.id = f.followed_user_id
    WHERE f.follower_user_id = ? ORDER BY f.created_at DESC LIMIT 200`)
    .bind(target.id).all();
  return ok(c, { people: rows.results });
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
    EXISTS(SELECT 1 FROM user_follows WHERE follower_user_id = ? AND followed_user_id = ?) AS viewerFollowing,
    EXISTS(SELECT 1 FROM user_follows a JOIN user_follows b ON b.follower_user_id = a.followed_user_id AND b.followed_user_id = a.follower_user_id
      WHERE a.follower_user_id = ? AND a.followed_user_id = ?) AS viewerIsFriend`)
    .bind(user.id, user.id, viewerId, user.id, viewerId, user.id).first<{ followerCount: number; followingCount: number; viewerFollowing: number; viewerIsFriend: number }>();
  const privacy = await c.env.DB.prepare(`SELECT last_seen_visibility AS lastSeenVisibility, birthday_visibility AS birthdayVisibility
    FROM user_settings WHERE user_id = ?`).bind(user.id).first<{ lastSeenVisibility: string; birthdayVisibility: string }>();
  const canSee = (visibility: string | undefined) => viewerId === user.id || visibility === 'everyone' || (visibility === 'friends' && stats?.viewerIsFriend === 1);
  const profile = publicProfile(user);
  if (!canSee(privacy?.lastSeenVisibility)) profile.lastSeenAt = null;
  if (!canSee(privacy?.birthdayVisibility)) { profile.birthdayMonthDay = null; profile.birthdayYear = null; }
  const aliases = await c.env.DB.prepare('SELECT id, username, created_at AS createdAt, purchase_price AS purchasePrice FROM username_aliases WHERE user_id = ? ORDER BY created_at').bind(user.id).all();
  return ok(c, { user: { ...profile, followerCount: stats?.followerCount ?? 0,
    followingCount: stats?.followingCount ?? 0, viewerFollowing: stats?.viewerFollowing === 1, aliases: aliases.results } });
});
