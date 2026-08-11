import { Hono } from 'hono';
import { fail } from '../lib/responses';
import { KvMediaStorage } from '../services/media-storage';
import type { AppVariables, Env } from '../types';

export const mediaRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

mediaRoutes.get('/*', async (c) => {
  const key = decodeURIComponent(c.req.path.slice('/api/media/'.length));
  if (!/^media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/iu.test(key)) {
    return fail(c, 404, 'MEDIA_NOT_FOUND', 'Media not found.');
  }
  const media = await new KvMediaStorage(c.env.MEDIA).get(key);
  if (!media) return fail(c, 404, 'MEDIA_NOT_FOUND', 'Media not found.');
  return new Response(media.body, {
    headers: {
      'content-type': media.metadata.contentType,
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
      'x-content-type-options': 'nosniff',
    },
  });
});
