import { Hono } from 'hono';
import { fail } from '../lib/responses';
import { mediaStorage } from '../services/media-storage';
import type { AppVariables, Env } from '../types';

export const mediaRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

mediaRoutes.get('/*', async (c) => {
  const key = decodeURIComponent(c.req.path.slice('/api/media/'.length));
  if (!/^media\/[0-9a-f-]{36}\/(?:shorts\/)?[0-9a-f-]{36}\.(jpg|png|webp|avif|mp4|webm|mov|pdf|txt|md|csv|json|rtf|doc|docx|xlsx|pptx)$/iu.test(key)) {
    return fail(c, 404, 'MEDIA_NOT_FOUND', 'Media not found.');
  }
  const media = await mediaStorage(c.env).get(key, c.req.header('range'));
  if (!media) return fail(c, 404, 'MEDIA_NOT_FOUND', 'Media not found.');
  const secondsUntilExpiry = media.metadata.expiresAt
    ? Math.max(0, Math.floor((Date.parse(media.metadata.expiresAt) - Date.now()) / 1000))
    : 86_400;
  return new Response(media.body, {
    status: media.partial ? 206 : 200,
    headers: {
      'content-type': media.metadata.contentType,
      'accept-ranges': 'bytes',
      ...(media.contentRange ? { 'content-range': media.contentRange } : {}),
      ...(media.contentLength ? { 'content-length': media.contentLength } : {}),
      'cache-control': `public, max-age=${secondsUntilExpiry}`,
      'x-content-type-options': 'nosniff',
    },
  });
});
