import { Hono } from 'hono';
import { fail, ok } from '../lib/responses';
import type { AppVariables, Env } from '../types';
import { z } from 'zod';
import { createB2UploadUrl, createShortVideoKey, ensureShortsUploadCors, mediaStorage } from '../services/media-storage';
import type { ALLOWED_VIDEO_TYPES } from '../services/media-storage';
import { moderatePublicContent, saveModerationResult } from '../services/moderation-service';

const FEED_SIZE = 12;

export type ShortFeedItem = {
  id: string;
  storageKey: string;
  contentType: string;
  caption: string;
  likeCount: number;
  viewCount: number;
  publishedAt: string;
  authorId: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  verified: number;
  viewerReaction: '' | 'like' | 'dislike';
  repeated?: boolean;
};

/** Keeps an early beta feed watchable while the catalogue is still small. */
export function fillBetaFeed<T>(items: T[], size = FEED_SIZE): T[] {
  if (items.length < 2 || items.length >= size) return items;
  return Array.from({ length: size }, (_, index) => items[index % items.length]!);
}

export const shortRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

shortRoutes.get('/feed', async (c) => {
  const viewerId = c.get('authUser')?.id ?? '';
  const rows = await c.env.DB.prepare(`SELECT v.id, v.storage_key AS storageKey, v.content_type AS contentType, v.caption,
      v.like_count AS likeCount, v.view_count AS viewCount, v.published_at AS publishedAt,
      u.id AS authorId, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey, u.is_verified AS verified,
      COALESCE((SELECT reaction FROM short_video_reactions r WHERE r.video_id = v.id AND r.user_id = ?), '') AS viewerReaction
    FROM short_videos v JOIN users u ON u.id = v.author_user_id
    WHERE v.status = 'published' AND u.status IN ('active', 'pending_email')
    ORDER BY v.published_at DESC LIMIT ?`).bind(viewerId, FEED_SIZE).all<ShortFeedItem>();
  const source = rows.results;
  const videos = fillBetaFeed(source).map((item, index) => ({ ...item, repeated: index >= source.length }));
  return ok(c, { videos, beta: true });
});

shortRoutes.post('/upload-intents', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const input = z.object({ contentType: z.enum(['video/mp4', 'video/webm', 'video/quicktime']), byteSize: z.number().int().positive().max(120 * 1024 * 1024) }).strict().safeParse(await c.req.json().catch(() => null));
  if (!input.success) return fail(c, 422, 'INVALID_SHORT_VIDEO', 'Choose an MP4, WebM, or MOV video up to 120 MiB.');
  await ensureShortsUploadCors(c.env);
  const storageKey = createShortVideoKey(user.id, input.data.contentType);
  const uploadUrl = await createB2UploadUrl(c.env, storageKey);
  if (!uploadUrl) return fail(c, 502, 'SHORTS_UPLOAD_UNAVAILABLE', 'Shorts storage is being configured. Try again shortly.');
  const id = crypto.randomUUID(); const now = new Date(); const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  await c.env.DB.prepare(`INSERT INTO short_video_uploads (id, uploader_user_id, storage_key, content_type, byte_size, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, user.id, storageKey, input.data.contentType, input.data.byteSize, now.toISOString(), expiresAt.toISOString()).run();
  return ok(c, { uploadId: id, uploadUrl, expiresAt: expiresAt.toISOString() }, 201);
});

shortRoutes.post('/', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const input = z.object({ uploadId: z.string().uuid(), caption: z.string().trim().max(500).default('') }).strict().safeParse(await c.req.json().catch(() => null));
  if (!input.success) return fail(c, 422, 'INVALID_SHORT_VIDEO', 'Invalid short video details.');
  const upload = await c.env.DB.prepare(`SELECT id, storage_key AS storageKey, content_type AS contentType, byte_size AS byteSize FROM short_video_uploads WHERE id = ? AND uploader_user_id = ? AND consumed_at IS NULL AND expires_at > ?`)
    .bind(input.data.uploadId, user.id, new Date().toISOString()).first<{ id: string; storageKey: string; contentType: keyof typeof ALLOWED_VIDEO_TYPES; byteSize: number }>();
  if (!upload) return fail(c, 404, 'SHORT_UPLOAD_NOT_FOUND', 'The upload has expired. Select the video again.');
  const stored = await mediaStorage(c.env).get(upload.storageKey);
  if (!stored || stored.metadata.contentType !== upload.contentType || stored.metadata.byteSize !== upload.byteSize) return fail(c, 422, 'SHORT_UPLOAD_INCOMPLETE', 'The video did not finish uploading.');
  await stored.body.cancel();
  const moderation = await moderatePublicContent(c.env, input.data.caption);
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await saveModerationResult(c.env.DB, 'post', id, moderation, input.data.caption);
  if (moderation.decision === 'block') { await mediaStorage(c.env).delete(upload.storageKey); return fail(c, 422, 'SHORT_REJECTED', 'The caption could not pass safety checks.'); }
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO short_videos (id, author_user_id, storage_key, content_type, byte_size, caption, status, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, user.id, upload.storageKey, upload.contentType, upload.byteSize, input.data.caption, moderation.decision === 'review' ? 'review' : 'published', now, now, now),
    c.env.DB.prepare('UPDATE short_video_uploads SET consumed_at = ? WHERE id = ?').bind(now, upload.id),
  ]);
  return ok(c, { id, status: moderation.decision === 'review' ? 'review' : 'published' }, 201);
});

shortRoutes.post('/:id/view', async (c) => {
  const user = c.get('authUser');
  if (!user) return ok(c, { counted: false });
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/iu.test(id)) return fail(c, 404, 'SHORT_NOT_FOUND', 'Short video not found.');
  const today = new Date().toISOString().slice(0, 10);
  const result = await c.env.DB.prepare(`INSERT OR IGNORE INTO short_video_daily_views (video_id, viewer_user_id, viewed_on)
    SELECT id, ?, ? FROM short_videos WHERE id = ? AND status = 'published'`).bind(user.id, today, id).run();
  const counted = (result.meta.changes ?? 0) === 1;
  if (counted) await c.env.DB.prepare('UPDATE short_videos SET view_count = view_count + 1, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
  return ok(c, { counted });
});

shortRoutes.put('/:id/reaction', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const input = z.object({ reaction: z.enum(['like', 'dislike']).nullable() }).strict().safeParse(await c.req.json().catch(() => null));
  if (!input.success) return fail(c, 422, 'INVALID_REACTION', 'Choose a valid reaction.');
  const id = c.req.param('id'); const current = await c.env.DB.prepare('SELECT reaction FROM short_video_reactions WHERE video_id = ? AND user_id = ?').bind(id, user.id).first<{ reaction: 'like' | 'dislike' }>();
  const next = current?.reaction === input.data.reaction ? null : input.data.reaction; const now = new Date().toISOString();
  if (next) await c.env.DB.prepare(`INSERT INTO short_video_reactions (video_id, user_id, reaction, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(video_id, user_id) DO UPDATE SET reaction = excluded.reaction, updated_at = excluded.updated_at`).bind(id, user.id, next, now, now).run();
  else await c.env.DB.prepare('DELETE FROM short_video_reactions WHERE video_id = ? AND user_id = ?').bind(id, user.id).run();
  const likes = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM short_video_reactions WHERE video_id = ? AND reaction = 'like'").bind(id).first<{ count: number }>();
  await c.env.DB.prepare('UPDATE short_videos SET like_count = ?, updated_at = ? WHERE id = ?').bind(likes?.count ?? 0, now, id).run();
  return ok(c, { reaction: next, likeCount: likes?.count ?? 0 });
});
