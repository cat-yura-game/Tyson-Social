import { Hono } from 'hono';
import { fail, ok } from '../lib/responses';
import type { AppVariables, Env } from '../types';

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
