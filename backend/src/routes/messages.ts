import { Hono } from 'hono';
import { mediaStorage } from '../services/media-storage';
import { ZodError } from 'zod';
import { fail, ok } from '../lib/responses';
import { cloneAttachmentSchema, cloudMessageSchema, conversationSchema, deleteMessageSchema, deviceSchema, editCloudMessageSchema, groupConversationSchema, groupMemberRoleSchema, groupMembersSchema, messageBatchSchema } from '../schemas/messages';
import type { AppVariables, AuthUser, Env } from '../types';
import { decryptCloudMessage, encryptCloudMessage } from '../services/cloud-message-crypto';
import { uploadLimitForUser } from '../services/upload-limits';
import { canDeleteMessage, canEditMessage } from '../services/message-permissions';
import { sendPushToUser } from '../services/web-push';

type App = { Bindings: Env; Variables: AppVariables };
export const messageRoutes = new Hono<App>();
const ENCRYPTED_ATTACHMENT_OVERHEAD = 64;

function requireUser(c: Parameters<typeof fail>[0]): AuthUser | Response {
  return c.get('authUser') ?? fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
}

async function parse<T>(c: Parameters<typeof fail>[0], schema: { parse(value: unknown): T }): Promise<T | Response> {
  try {
    if (!c.req.header('content-type')?.includes('application/json')) return fail(c, 400, 'JSON_REQUIRED', 'JSON is required.');
    return schema.parse(await c.req.json());
  } catch (error) {
    return fail(c, 422, 'VALIDATION_ERROR', 'Invalid messaging request.', error instanceof ZodError ? error.flatten() : undefined);
  }
}

async function isMember(db: D1Database, conversationId: string, userId: string): Promise<boolean> {
  return Boolean(await db.prepare(`SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL`).bind(conversationId, userId).first());
}

async function groupRole(db: D1Database, conversationId: string, userId: string): Promise<'owner' | 'admin' | 'member' | null> {
  const row = await db.prepare(`SELECT m.role FROM conversation_members m JOIN conversations c ON c.id = m.conversation_id
    WHERE m.conversation_id = ? AND m.user_id = ? AND m.left_at IS NULL AND c.kind = 'group'`).bind(conversationId, userId).first<{ role: 'owner' | 'admin' | 'member' }>();
  return row?.role ?? null;
}

async function pushNewMessage(c: Parameters<typeof fail>[0], conversationId: string, sender: AuthUser): Promise<void> {
  const recipients = await c.env.DB.prepare(`SELECT user_id AS userId FROM conversation_members
    WHERE conversation_id = ? AND user_id != ? AND left_at IS NULL`).bind(conversationId, sender.id).all<{ userId: string }>();
  await Promise.all(recipients.results.map((recipient) => sendPushToUser(c.env, recipient.userId, {
    title: 'Tyson Messenger', body: `Новое сообщение от ${sender.displayName}`, url: `/messages?conversation=${encodeURIComponent(conversationId)}`, tag: `message-${conversationId}`,
  })));
}

function attachmentIdFromContent(content: unknown): string | undefined {
  if (!content || typeof content !== 'object') return undefined;
  const value = content as Record<string, unknown>;
  if ((value.type === 'image' || value.type === 'audio' || value.type === 'video' || value.type === 'file') && typeof value.attachmentId === 'string') return value.attachmentId;
  if (value.type === 'forwarded') return attachmentIdFromContent(value.content);
  return undefined;
}

async function ensureSavedConversation(db: D1Database, user: AuthUser): Promise<string> {
  const existing = await db.prepare('SELECT conversation_id AS conversationId FROM saved_conversations WHERE user_id = ?')
    .bind(user.id).first<{ conversationId: string }>();
  if (existing) return existing.conversationId;
  const conversationId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(`INSERT INTO conversations (id, kind, created_by_user_id, created_at, updated_at) VALUES (?, 'direct', ?, ?, ?)`)
        .bind(conversationId, user.id, now, now),
      db.prepare(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`)
        .bind(conversationId, user.id, now),
      db.prepare(`INSERT INTO saved_conversations (user_id, conversation_id, created_at) VALUES (?, ?, ?)`)
        .bind(user.id, conversationId, now),
    ]);
    return conversationId;
  } catch {
    const raced = await db.prepare('SELECT conversation_id AS conversationId FROM saved_conversations WHERE user_id = ?')
      .bind(user.id).first<{ conversationId: string }>();
    if (!raced) throw new Error('Unable to create Saved Messages conversation.');
    return raced.conversationId;
  }
}

messageRoutes.post('/devices', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const input = await parse(c, deviceSchema); if (input instanceof Response) return input;
  const existing = await c.env.DB.prepare('SELECT user_id AS userId FROM devices WHERE id = ?').bind(input.deviceId).first<{ userId: string }>();
  if (existing && existing.userId !== user.id) return fail(c, 409, 'DEVICE_ID_TAKEN', 'Device identifier is already registered.');
  const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO devices (id, user_id, name, identity_public_key, key_algorithm, key_version, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, 'libsodium-sealed-box-v1', 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, identity_public_key = excluded.identity_public_key,
      last_seen_at = excluded.last_seen_at, revoked_at = NULL`)
    .bind(input.deviceId, user.id, input.name, input.publicKey, now, now).run();
  return ok(c, { deviceId: input.deviceId }, 201);
});

messageRoutes.get('/users/:username/devices', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const username = c.req.param('username').trim().toLowerCase();
  const rows = await c.env.DB.prepare(`SELECT d.id AS deviceId, d.name, d.identity_public_key AS publicKey
    FROM devices d JOIN users u ON u.id = d.user_id
    WHERE u.username = ? COLLATE NOCASE AND d.revoked_at IS NULL ORDER BY d.created_at`)
    .bind(username).all();
  return ok(c, { devices: rows.results });
});

messageRoutes.get('/upload-limit', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  return ok(c, { maxBytes: await uploadLimitForUser(c.env.DB, user.id) });
});

messageRoutes.put('/conversations/:id/activity', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  if (!await isMember(c.env.DB, c.req.param('id'), user.id)) return fail(c, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  const input = await parse(c, { parse: (value) => {
    if (!value || typeof value !== 'object' || !('activity' in value)) throw new Error('Invalid activity.');
    const activity = (value as { activity?: unknown }).activity;
    if (activity !== null && activity !== 'typing' && activity !== 'recording_audio' && activity !== 'recording_video') throw new Error('Invalid activity.');
    return { activity };
  } }); if (input instanceof Response) return input;
  if (input.activity === null) await c.env.DB.prepare('DELETE FROM conversation_activity WHERE conversation_id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
  else await c.env.DB.prepare(`INSERT INTO conversation_activity (conversation_id, user_id, activity, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(conversation_id, user_id) DO UPDATE SET activity = excluded.activity, updated_at = excluded.updated_at`).bind(c.req.param('id'), user.id, input.activity, new Date().toISOString()).run();
  return ok(c, { activity: input.activity });
});

messageRoutes.get('/conversations/:id/activity', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  if (!await isMember(c.env.DB, c.req.param('id'), user.id)) return fail(c, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  const row = await c.env.DB.prepare(`SELECT activity FROM conversation_activity WHERE conversation_id = ? AND user_id != ?
    AND updated_at > ? ORDER BY updated_at DESC LIMIT 1`).bind(c.req.param('id'), user.id, new Date(Date.now() - 15_000).toISOString()).first<{ activity: 'typing' | 'recording_audio' | 'recording_video' }>();
  return ok(c, { activity: row?.activity ?? null });
});

messageRoutes.get('/following', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const query = c.req.query('q')?.trim().slice(0, 80) ?? '';
  const like = `%${query.replace(/[\\%_]/gu, '\\$&')}%`;
  const rows = await c.env.DB.prepare(`SELECT u.id, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey, u.is_verified AS verified
    FROM user_follows f JOIN users u ON u.id = f.followed_user_id
    WHERE f.follower_user_id = ? AND u.status IN ('active', 'pending_email') AND (? = '' OR u.display_name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')
    ORDER BY u.display_name COLLATE NOCASE LIMIT 20`).bind(user.id, query, like, like).all();
  return ok(c, { people: rows.results });
});

messageRoutes.get('/search', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const query = c.req.query('q')?.trim().replaceAll(/\s+/gu, ' ').slice(0, 80) ?? '';
  if (query.length < 2) return ok(c, { messages: [] });
  const rows = await c.env.DB.prepare(`SELECT cm.id, cm.conversation_id AS conversationId, cm.sender_user_id AS senderUserId, cm.ciphertext, cm.nonce, cm.sent_at AS sentAt
    FROM cloud_messages cm JOIN conversation_members m ON m.conversation_id = cm.conversation_id
    WHERE m.user_id = ? AND m.left_at IS NULL ORDER BY cm.created_at DESC LIMIT 500`).bind(user.id).all<{ id: string; conversationId: string; senderUserId: string; ciphertext: string; nonce: string; sentAt: string }>();
  const needle = query.toLocaleLowerCase('ru'); const messages: Array<{ id: string; conversationId: string; senderUserId: string; sentAt: string; excerpt: string }> = [];
  for (const row of rows.results) {
    try {
      const content = await decryptCloudMessage<Record<string, unknown>>(c.env, row.ciphertext, row.nonce);
      const text = content.type === 'text' && typeof content.text === 'string' ? content.text : '';
      if (text.toLocaleLowerCase('ru').includes(needle)) messages.push({ id: row.id, conversationId: row.conversationId, senderUserId: row.senderUserId, sentAt: row.sentAt, excerpt: text.slice(0, 240) });
      if (messages.length >= 20) break;
    } catch { /* Ignore corrupted entries while searching. */ }
  }
  return ok(c, { messages });
});

messageRoutes.post('/conversations', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const input = await parse(c, conversationSchema); if (input instanceof Response) return input;
  const recipient = await c.env.DB.prepare(`SELECT u.id, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey,
    COALESCE(s.messaging_visibility, 'everyone') AS messagingVisibility
    FROM users u LEFT JOIN user_settings s ON s.user_id = u.id
    WHERE u.username = ? COLLATE NOCASE AND u.status NOT IN ('suspended','deleted')`).bind(input.recipientUsername)
    .first<{ id: string; username: string; displayName: string; avatarKey: string | null; messagingVisibility: 'everyone' | 'friends' | 'nobody' }>();
  if (!recipient) return fail(c, 404, 'USER_NOT_FOUND', 'Recipient not found.');
  if (recipient.id === user.id) return fail(c, 422, 'SELF_CONVERSATION', 'You cannot start a conversation with yourself.');
  if (recipient.messagingVisibility !== 'everyone') {
    const mutual = recipient.messagingVisibility === 'friends' && Boolean(await c.env.DB.prepare(`SELECT 1 FROM user_follows a
      JOIN user_follows b ON b.follower_user_id = a.followed_user_id AND b.followed_user_id = a.follower_user_id
      WHERE a.follower_user_id = ? AND a.followed_user_id = ?`).bind(user.id, recipient.id).first());
    if (!mutual) return fail(c, 403, 'MESSAGES_RESTRICTED', 'This user only accepts messages from permitted people.');
  }
  if (input.securityMode === 'secret') {
    const enabled = await c.env.DB.prepare('SELECT secret_chat_enabled AS enabled FROM user_settings WHERE user_id = ?')
      .bind(user.id).first<{ enabled: number }>();
    if (enabled?.enabled !== 1) return fail(c, 422, 'SECRET_CHATS_DISABLED', 'Enable Secret Chats in settings before starting one.');
  }
  const existing = await c.env.DB.prepare(`SELECT c.id FROM conversations c
    JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ? AND a.left_at IS NULL
    JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ? AND b.left_at IS NULL
    WHERE c.kind = 'direct' AND c.security_mode = ? AND (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id AND m.left_at IS NULL) = 2
    LIMIT 1`).bind(user.id, recipient.id, input.securityMode).first<{ id: string }>();
  const conversationId = existing?.id ?? crypto.randomUUID();
  if (!existing) {
    const now = new Date().toISOString();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO conversations (id, kind, security_mode, created_by_user_id, created_at, updated_at) VALUES (?, 'direct', ?, ?, ?, ?)`).bind(conversationId, input.securityMode, user.id, now, now),
      c.env.DB.prepare(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`).bind(conversationId, user.id, now),
      c.env.DB.prepare(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`).bind(conversationId, recipient.id, now),
    ]);
  }
  return ok(c, { conversation: { id: conversationId, otherUser: { id: recipient.id, username: recipient.username,
    displayName: recipient.displayName, avatarKey: recipient.avatarKey }, securityMode: input.securityMode } }, existing ? 200 : 201);
});

messageRoutes.post('/groups', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const input = await parse(c, groupConversationSchema); if (input instanceof Response) return input;
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO conversations (id, kind, title, username, security_mode, created_by_user_id, created_at, updated_at) VALUES (?, 'group', ?, ?, 'cloud', ?, ?, ?)`).bind(id, input.title, input.username, user.id, now, now),
      c.env.DB.prepare(`INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`).bind(id, user.id, now),
    ]);
  } catch { return fail(c, 409, 'GROUP_USERNAME_TAKEN', 'This group username is already taken.'); }
  return ok(c, { conversation: { id, kind: 'group', title: input.title, username: input.username, memberCount: 1, securityMode: 'cloud' } }, 201);
});

messageRoutes.get('/groups/:id', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const role = await groupRole(c.env.DB, c.req.param('id'), user.id); if (!role) return fail(c, 404, 'GROUP_NOT_FOUND', 'Group not found.');
  const group = await c.env.DB.prepare('SELECT title, username FROM conversations WHERE id = ? AND kind = \'group\'').bind(c.req.param('id')).first<{ title: string; username: string }>();
  const members = await c.env.DB.prepare(`SELECT u.id, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey, m.role
    FROM conversation_members m JOIN users u ON u.id = m.user_id WHERE m.conversation_id = ? AND m.left_at IS NULL ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.display_name`).bind(c.req.param('id')).all();
  return ok(c, { group: { ...group, role }, members: members.results });
});

messageRoutes.post('/groups/:id/members', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const role = await groupRole(c.env.DB, c.req.param('id'), user.id); if (role !== 'owner' && role !== 'admin') return fail(c, 403, 'GROUP_ADMIN_REQUIRED', 'Only group administrators can add members.');
  const input = await parse(c, groupMembersSchema); if (input instanceof Response) return input;
  const usernames = [...new Set(input.usernames.filter((username) => username !== user.username.toLowerCase()))];
  const placeholders = usernames.map(() => '?').join(',');
  const people = await c.env.DB.prepare(`SELECT id FROM users WHERE lower(username) IN (${placeholders}) AND status IN ('active', 'pending_email')`).bind(...usernames).all<{ id: string }>();
  if (people.results.length !== usernames.length) return fail(c, 404, 'USER_NOT_FOUND', 'One or more users were not found.');
  const now = new Date().toISOString();
  await c.env.DB.batch([...people.results.map((person) => c.env.DB.prepare(`INSERT INTO conversation_members (conversation_id, user_id, role, joined_at, left_at) VALUES (?, ?, ?, ?, NULL)
    ON CONFLICT(conversation_id, user_id) DO UPDATE SET role = excluded.role, joined_at = excluded.joined_at, left_at = NULL`).bind(c.req.param('id'), person.id, input.role, now)), c.env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, c.req.param('id'))]);
  return ok(c, { added: people.results.length });
});

messageRoutes.patch('/groups/:id/members/:userId', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  if (await groupRole(c.env.DB, c.req.param('id'), user.id) !== 'owner') return fail(c, 403, 'GROUP_OWNER_REQUIRED', 'Only the owner can manage administrators.');
  const input = await parse(c, groupMemberRoleSchema); if (input instanceof Response) return input;
  const changed = await c.env.DB.prepare(`UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL AND role != 'owner'`).bind(input.role, c.req.param('id'), c.req.param('userId')).run();
  if (!changed.meta.changes) return fail(c, 404, 'GROUP_MEMBER_NOT_FOUND', 'Group member not found.');
  return ok(c, { role: input.role });
});

messageRoutes.get('/conversations', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const savedId = await ensureSavedConversation(c.env.DB, user);
  const rows = await c.env.DB.prepare(`SELECT c.id, c.updated_at AS updatedAt, c.security_mode AS securityMode, u.id AS otherUserId,
    u.username AS otherUsername, u.display_name AS otherDisplayName, u.avatar_key AS otherAvatarKey,
    u.is_verified AS otherVerified
    FROM conversations c
    JOIN conversation_members mine ON mine.conversation_id = c.id AND mine.user_id = ? AND mine.left_at IS NULL
    JOIN conversation_members theirs ON theirs.conversation_id = c.id AND theirs.user_id != ? AND theirs.left_at IS NULL
    JOIN users u ON u.id = theirs.user_id
    WHERE c.kind = 'direct' ORDER BY c.updated_at DESC LIMIT 100`).bind(user.id, user.id).all();
  const groups = await c.env.DB.prepare(`SELECT c.id, c.updated_at AS updatedAt, c.security_mode AS securityMode, c.title, c.username,
    COUNT(m.user_id) AS memberCount FROM conversations c JOIN conversation_members mine ON mine.conversation_id = c.id AND mine.user_id = ? AND mine.left_at IS NULL
    JOIN conversation_members m ON m.conversation_id = c.id AND m.left_at IS NULL WHERE c.kind = 'group' GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 100`).bind(user.id).all();
  return ok(c, { conversations: [{
    id: savedId,
    updatedAt: new Date().toISOString(),
    otherUserId: user.id,
    otherUsername: user.username,
    otherDisplayName: 'Избранное',
    otherAvatarKey: null,
    otherVerified: false,
    isSaved: true,
    securityMode: 'cloud',
  }, ...rows.results.map((row) => ({ ...row, kind: 'direct', isSaved: false })), ...groups.results.map((group) => ({ ...group, kind: 'group', otherUserId: '', otherUsername: group.username, otherDisplayName: group.title, otherAvatarKey: null, otherVerified: false, isSaved: false }))] });
});

messageRoutes.post('/conversations/:id/attachments', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const conversationId = c.req.param('id');
  if (!await isMember(c.env.DB, conversationId, user.id)) return fail(c, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  const maxAttachmentBytes = await uploadLimitForUser(c.env.DB, user.id) + ENCRYPTED_ATTACHMENT_OVERHEAD;
  if (c.req.header('content-type')?.split(';')[0]?.trim() !== 'application/octet-stream') {
    return fail(c, 400, 'BINARY_REQUIRED', 'Encrypted attachment bytes are required.');
  }
  const declaredLength = Number(c.req.header('content-length') ?? 0);
  if (declaredLength > maxAttachmentBytes) return fail(c, 413, 'ATTACHMENT_TOO_LARGE', 'Encrypted attachment is too large.');
  const bytes = await c.req.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > maxAttachmentBytes) return fail(c, 413, 'ATTACHMENT_TOO_LARGE', 'Encrypted attachment is too large.');
  const recent = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM encrypted_message_attachments
    WHERE uploader_user_id = ? AND created_at > datetime('now', '-1 hour')`).bind(user.id).first<{ count: number }>();
  if ((recent?.count ?? 0) >= 30) return fail(c, 429, 'ATTACHMENT_RATE_LIMITED', 'Too many attachments. Try again later.');
  const id = crypto.randomUUID();
  const storageKey = `encrypted-attachments/${user.id}/${id}.bin`;
  const now = new Date().toISOString();
  await mediaStorage(c.env).put(storageKey, bytes, { contentType: 'application/octet-stream', ownerUserId: user.id, byteSize: bytes.byteLength });
  try {
    await c.env.DB.prepare(`INSERT INTO encrypted_message_attachments
      (id, conversation_id, uploader_user_id, storage_key, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, conversationId, user.id, storageKey, bytes.byteLength, now).run();
  } catch (error) {
    await mediaStorage(c.env).delete(storageKey);
    throw error;
  }
  return ok(c, { attachmentId: id }, 201);
});

messageRoutes.get('/attachments/:id', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const attachment = await c.env.DB.prepare(`SELECT a.storage_key AS storageKey, a.conversation_id AS conversationId
    FROM encrypted_message_attachments a JOIN conversation_members m ON m.conversation_id = a.conversation_id
    WHERE a.id = ? AND m.user_id = ? AND m.left_at IS NULL`).bind(c.req.param('id'), user.id)
    .first<{ storageKey: string; conversationId: string }>();
  if (!attachment) return fail(c, 404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.');
  const stored = await mediaStorage(c.env).get(attachment.storageKey);
  if (!stored) return fail(c, 404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.');
  return new Response(stored.body, {
    headers: {
      'content-type': 'application/octet-stream',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});

messageRoutes.post('/attachments/:id/clone', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const sourceAttachmentId = c.req.param('id');
  const input = await parse(c, cloneAttachmentSchema); if (input instanceof Response) return input;
  if (!await isMember(c.env.DB, input.targetConversationId, user.id)) {
    return fail(c, 404, 'CONVERSATION_NOT_FOUND', 'Target conversation not found.');
  }
  const source = await c.env.DB.prepare(`SELECT a.storage_key AS storageKey, a.byte_size AS byteSize
    FROM encrypted_message_attachments a JOIN conversation_members m ON m.conversation_id = a.conversation_id
    WHERE a.id = ? AND m.user_id = ? AND m.left_at IS NULL`).bind(sourceAttachmentId, user.id)
    .first<{ storageKey: string; byteSize: number }>();
  if (!source) return fail(c, 404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.');
  const maxAttachmentBytes = await uploadLimitForUser(c.env.DB, user.id) + ENCRYPTED_ATTACHMENT_OVERHEAD;
  if (source.byteSize > maxAttachmentBytes) return fail(c, 413, 'ATTACHMENT_TOO_LARGE', 'Encrypted attachment is too large.');
  const recent = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM encrypted_message_attachments
    WHERE uploader_user_id = ? AND created_at > datetime('now', '-1 hour')`).bind(user.id).first<{ count: number }>();
  if ((recent?.count ?? 0) >= 30) return fail(c, 429, 'ATTACHMENT_RATE_LIMITED', 'Too many attachments. Try again later.');
  const sourceMedia = await mediaStorage(c.env).get(source.storageKey);
  if (sourceMedia) { /* stream is consumed below */ }
  const bytes = sourceMedia ? await new Response(sourceMedia.body).arrayBuffer() : null;
  if (!bytes) return fail(c, 404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.');
  const id = crypto.randomUUID();
  const storageKey = `encrypted-attachments/${user.id}/${id}.bin`;
  const now = new Date().toISOString();
  await mediaStorage(c.env).put(storageKey, bytes, { contentType: 'application/octet-stream', ownerUserId: user.id, byteSize: source.byteSize });
  try {
    await c.env.DB.prepare(`INSERT INTO encrypted_message_attachments
      (id, conversation_id, uploader_user_id, storage_key, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, input.targetConversationId, user.id, storageKey, source.byteSize, now).run();
  } catch (error) {
    await mediaStorage(c.env).delete(storageKey);
    throw error;
  }
  return ok(c, { attachmentId: id }, 201);
});

messageRoutes.get('/conversations/:id/messages', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const conversationId = c.req.param('id');
  if (!await isMember(c.env.DB, conversationId, user.id)) return fail(c, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  const conversation = await c.env.DB.prepare('SELECT security_mode AS securityMode FROM conversations WHERE id = ?').bind(conversationId)
    .first<{ securityMode: 'cloud' | 'secret' }>();
  if (!conversation) return fail(c, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  if (conversation.securityMode === 'cloud') {
    const rows = await c.env.DB.prepare(`SELECT id, sender_user_id AS senderUserId, ciphertext, nonce, sent_at AS sentAt, edited_at AS editedAt
      FROM cloud_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 500`).bind(conversationId)
      .all<{ id: string; senderUserId: string; ciphertext: string; nonce: string; sentAt: string; editedAt: string | null }>();
    const messages = await Promise.all(rows.results.map(async (row) => ({
      id: row.id, senderUserId: row.senderUserId, sentAt: row.sentAt, editedAt: row.editedAt,
      content: await decryptCloudMessage<unknown>(c.env, row.ciphertext, row.nonce),
    })));
    return ok(c, { securityMode: 'cloud', messages });
  }
  const deviceId = c.req.query('deviceId');
  if (!deviceId) return fail(c, 422, 'DEVICE_REQUIRED', 'Device identifier is required.');
  const device = await c.env.DB.prepare(`SELECT 1 FROM devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL`).bind(deviceId, user.id).first();
  if (!device) return fail(c, 403, 'DEVICE_FORBIDDEN', 'Device does not belong to this account.');
  const rows = await c.env.DB.prepare(`SELECT m.id, m.sender_user_id AS senderUserId, m.sender_device_id AS senderDeviceId,
    m.ciphertext, m.sent_at AS sentAt, m.edited_at AS editedAt, m.created_at AS createdAt
    FROM encrypted_messages m WHERE m.conversation_id = ? AND m.recipient_device_id = ?
    ORDER BY m.created_at ASC LIMIT 500`).bind(conversationId, deviceId).all();
  return ok(c, { securityMode: 'secret', messages: rows.results });
});

messageRoutes.post('/conversations/:id/messages', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const conversationId = c.req.param('id');
  if (!await isMember(c.env.DB, conversationId, user.id)) return fail(c, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  const conversation = await c.env.DB.prepare('SELECT security_mode AS securityMode FROM conversations WHERE id = ?').bind(conversationId)
    .first<{ securityMode: 'cloud' | 'secret' }>();
  if (!conversation) return fail(c, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  if (conversation.securityMode === 'cloud') {
    const input = await parse(c, cloudMessageSchema); if (input instanceof Response) return input;
    const now = new Date().toISOString();
    const encrypted = await encryptCloudMessage(c.env, input.content);
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO cloud_messages (id, conversation_id, sender_user_id, ciphertext, nonce, sent_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), conversationId, user.id, encrypted.ciphertext, encrypted.nonce, now, now),
      c.env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId),
    ]);
    c.executionCtx.waitUntil(pushNewMessage(c, conversationId, user));
    return ok(c, { sent: true, sentAt: now }, 201);
  }
  const input = await parse(c, messageBatchSchema); if (input instanceof Response) return input;
  const senderDevice = await c.env.DB.prepare(`SELECT 1 FROM devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL`).bind(input.senderDeviceId, user.id).first();
  if (!senderDevice) return fail(c, 403, 'DEVICE_FORBIDDEN', 'Sender device does not belong to this account.');
  const recent = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM encrypted_messages WHERE sender_user_id = ? AND created_at > datetime('now', '-1 minute')`).bind(user.id).first<{ count: number }>();
  if ((recent?.count ?? 0) + input.envelopes.length > 100) return fail(c, 429, 'MESSAGE_RATE_LIMITED', 'Too many messages. Try again shortly.');
  const recipientIds = [...new Set(input.envelopes.map((envelope) => envelope.recipientDeviceId))];
  const placeholders = recipientIds.map(() => '?').join(',');
  const allowedDevices = await c.env.DB.prepare(`SELECT d.id FROM devices d JOIN conversation_members m ON m.user_id = d.user_id
    WHERE m.conversation_id = ? AND m.left_at IS NULL AND d.revoked_at IS NULL AND d.id IN (${placeholders})`)
    .bind(conversationId, ...recipientIds).all<{ id: string }>();
  if (allowedDevices.results.length !== recipientIds.length) return fail(c, 403, 'RECIPIENT_DEVICE_FORBIDDEN', 'A recipient device is not part of this conversation.');
  const now = new Date().toISOString();
  const statements = input.envelopes.map((envelope) => c.env.DB.prepare(`INSERT INTO encrypted_messages
    (id, conversation_id, sender_user_id, sender_device_id, recipient_device_id, ciphertext, envelope_version, client_message_id, sent_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).bind(crypto.randomUUID(), conversationId, user.id, input.senderDeviceId,
      envelope.recipientDeviceId, envelope.ciphertext, envelope.clientMessageId, now, now));
  statements.push(c.env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId));
  await c.env.DB.batch(statements);
  c.executionCtx.waitUntil(pushNewMessage(c, conversationId, user));
  return ok(c, { sent: true, sentAt: now }, 201);
});

messageRoutes.put('/conversations/:id/messages/:messageId', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const conversationId = c.req.param('id');
  const messageId = c.req.param('messageId');
  if (!await isMember(c.env.DB, conversationId, user.id)) return fail(c, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(messageId)) return fail(c, 422, 'VALIDATION_ERROR', 'Invalid message identifier.');
  const conversation = await c.env.DB.prepare('SELECT security_mode AS securityMode FROM conversations WHERE id = ?').bind(conversationId)
    .first<{ securityMode: 'cloud' | 'secret' }>();
  if (!conversation) return fail(c, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  const editedAt = new Date().toISOString();

  if (conversation.securityMode === 'cloud') {
    const input = await parse(c, editCloudMessageSchema); if (input instanceof Response) return input;
    const message = await c.env.DB.prepare(`SELECT sender_user_id AS senderUserId FROM cloud_messages
      WHERE id = ? AND conversation_id = ?`).bind(messageId, conversationId).first<{ senderUserId: string }>();
    if (!message) return fail(c, 404, 'MESSAGE_NOT_FOUND', 'Message not found.');
    if (!canEditMessage(user.id, message.senderUserId)) return fail(c, 403, 'MESSAGE_EDIT_FORBIDDEN', 'Only the author can edit this message.');
    const encrypted = await encryptCloudMessage(c.env, input.content);
    await c.env.DB.prepare(`UPDATE cloud_messages SET ciphertext = ?, nonce = ?, edited_at = ?
      WHERE id = ? AND conversation_id = ? AND sender_user_id = ?`)
      .bind(encrypted.ciphertext, encrypted.nonce, editedAt, messageId, conversationId, user.id).run();
    return ok(c, { edited: true, editedAt });
  }

  const input = await parse(c, messageBatchSchema); if (input instanceof Response) return input;
  const message = await c.env.DB.prepare(`SELECT sender_user_id AS senderUserId, client_message_id AS clientMessageId,
    sent_at AS sentAt, created_at AS createdAt
    FROM encrypted_messages WHERE id = ? AND conversation_id = ?`).bind(messageId, conversationId)
    .first<{ senderUserId: string; clientMessageId: string; sentAt: string; createdAt: string }>();
  if (!message) return fail(c, 404, 'MESSAGE_NOT_FOUND', 'Message not found.');
  if (!canEditMessage(user.id, message.senderUserId)) return fail(c, 403, 'MESSAGE_EDIT_FORBIDDEN', 'Only the author can edit this message.');
  const senderDevice = await c.env.DB.prepare(`SELECT 1 FROM devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
    .bind(input.senderDeviceId, user.id).first();
  if (!senderDevice) return fail(c, 403, 'DEVICE_FORBIDDEN', 'Sender device does not belong to this account.');
  const recipientIds = [...new Set(input.envelopes.map((envelope) => envelope.recipientDeviceId))];
  const placeholders = recipientIds.map(() => '?').join(',');
  const allowedDevices = await c.env.DB.prepare(`SELECT d.id FROM devices d JOIN conversation_members m ON m.user_id = d.user_id
    WHERE m.conversation_id = ? AND m.left_at IS NULL AND d.revoked_at IS NULL AND d.id IN (${placeholders})`)
    .bind(conversationId, ...recipientIds).all<{ id: string }>();
  if (allowedDevices.results.length !== recipientIds.length) return fail(c, 403, 'RECIPIENT_DEVICE_FORBIDDEN', 'A recipient device is not part of this conversation.');
  const logicalId = message.clientMessageId.split(':', 1)[0];
  const statements = [c.env.DB.prepare(`DELETE FROM encrypted_messages WHERE conversation_id = ? AND sender_user_id = ?
    AND (client_message_id = ? OR (instr(client_message_id, ':') > 0 AND substr(client_message_id, 1, instr(client_message_id, ':') - 1) = ?))`)
    .bind(conversationId, user.id, message.clientMessageId, logicalId)];
  statements.push(...input.envelopes.map((envelope) => c.env.DB.prepare(`INSERT INTO encrypted_messages
    (id, conversation_id, sender_user_id, sender_device_id, recipient_device_id, ciphertext, envelope_version, client_message_id, sent_at, edited_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), conversationId, user.id, input.senderDeviceId, envelope.recipientDeviceId,
      envelope.ciphertext, envelope.clientMessageId, message.sentAt, editedAt, message.createdAt)));
  await c.env.DB.batch(statements);
  return ok(c, { edited: true, editedAt });
});

messageRoutes.delete('/conversations/:id/messages/:messageId', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const conversationId = c.req.param('id');
  const messageId = c.req.param('messageId');
  if (!await isMember(c.env.DB, conversationId, user.id)) return fail(c, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(messageId)) return fail(c, 422, 'VALIDATION_ERROR', 'Invalid message identifier.');
  const input = await parse(c, deleteMessageSchema); if (input instanceof Response) return input;
  const conversation = await c.env.DB.prepare('SELECT security_mode AS securityMode FROM conversations WHERE id = ?').bind(conversationId)
    .first<{ securityMode: 'cloud' | 'secret' }>();
  if (!conversation) return fail(c, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');

  let attachmentId = input.attachmentId;
  let deleteMessageStatement: D1PreparedStatement;
  if (conversation.securityMode === 'cloud') {
    const message = await c.env.DB.prepare(`SELECT sender_user_id AS senderUserId, ciphertext, nonce
      FROM cloud_messages WHERE id = ? AND conversation_id = ?`).bind(messageId, conversationId)
      .first<{ senderUserId: string; ciphertext: string; nonce: string }>();
    if (!message) return fail(c, 404, 'MESSAGE_NOT_FOUND', 'Message not found.');
    if (!canDeleteMessage(user.id, message.senderUserId)) return fail(c, 403, 'MESSAGE_DELETE_FORBIDDEN', 'Only the author can delete this message.');
    const content = await decryptCloudMessage<unknown>(c.env, message.ciphertext, message.nonce);
    attachmentId = attachmentIdFromContent(content) ?? attachmentId;
    deleteMessageStatement = c.env.DB.prepare('DELETE FROM cloud_messages WHERE id = ? AND conversation_id = ? AND sender_user_id = ?')
      .bind(messageId, conversationId, user.id);
  } else {
    const message = await c.env.DB.prepare(`SELECT sender_user_id AS senderUserId, client_message_id AS clientMessageId
      FROM encrypted_messages WHERE id = ? AND conversation_id = ?`).bind(messageId, conversationId)
      .first<{ senderUserId: string; clientMessageId: string }>();
    if (!message) return fail(c, 404, 'MESSAGE_NOT_FOUND', 'Message not found.');
    if (!canDeleteMessage(user.id, message.senderUserId)) return fail(c, 403, 'MESSAGE_DELETE_FORBIDDEN', 'Only the author can delete this message.');
    const logicalId = message.clientMessageId.split(':', 1)[0];
    deleteMessageStatement = c.env.DB.prepare(`DELETE FROM encrypted_messages WHERE conversation_id = ? AND sender_user_id = ?
      AND (client_message_id = ? OR (instr(client_message_id, ':') > 0 AND substr(client_message_id, 1, instr(client_message_id, ':') - 1) = ?))`)
      .bind(conversationId, user.id, message.clientMessageId, logicalId);
  }

  const attachment = attachmentId ? await c.env.DB.prepare(`SELECT storage_key AS storageKey FROM encrypted_message_attachments
    WHERE id = ? AND conversation_id = ? AND uploader_user_id = ?`).bind(attachmentId, conversationId, user.id)
    .first<{ storageKey: string }>() : null;
  const statements = [deleteMessageStatement];
  if (attachmentId && attachment) {
    statements.push(c.env.DB.prepare(`DELETE FROM encrypted_message_attachments
      WHERE id = ? AND conversation_id = ? AND uploader_user_id = ?`).bind(attachmentId, conversationId, user.id));
  }
  await c.env.DB.batch(statements);
  if (attachment) await mediaStorage(c.env).delete(attachment.storageKey);
  return ok(c, { deleted: true });
});
