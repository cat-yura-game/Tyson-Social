import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { fail } from './lib/responses';
import { secureCors } from './middleware/cors';
import { requestContext } from './middleware/request-context';
import { sessionContext } from './middleware/auth';
import { api } from './routes';
import type { AppVariables, Env } from './types';
import { deleteExpiredStories } from './routes/stories';
import { deleteExpiredAiChatImages } from './routes/ai-chat';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
const OFFICIAL_SITE_ORIGIN = 'https://tysonsocial.eu.cc';

function publicRedirect(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  const host = url.hostname.toLowerCase();
  if (host === '368240.lol' || host === 'www.368240.lol') return `${OFFICIAL_SITE_ORIGIN}${url.pathname}${url.search}`;
  if (host !== 'tyso.eu.cc' && host !== 'www.tyso.eu.cc') return null;
  const destination = url.searchParams.get('to');
  const profile = destination && /^\/profile\/([a-z0-9_]{3,30})$/iu.exec(destination);
  if (profile) return `${OFFICIAL_SITE_ORIGIN}/profile/${profile[1]}`;
  const post = destination && /^\/post\/([0-9a-f-]{36})$/iu.exec(destination);
  if (post) return `${OFFICIAL_SITE_ORIGIN}/post/${post[1]}`;
  const gift = destination && /^\/gift\/([0-9a-f-]{36})$/iu.exec(destination);
  if (gift) return `${OFFICIAL_SITE_ORIGIN}/gift/${gift[1]}`;
  // Previously issued compact links keep working, but new links use ?to=/….
  const legacyPost = /^\/p\/([0-9a-f-]{36})$/iu.exec(url.pathname);
  if (legacyPost) return `${OFFICIAL_SITE_ORIGIN}/post/${legacyPost[1]}${url.search}`;
  const legacyProfile = /^\/u\/([a-z0-9_]{3,30})$/iu.exec(url.pathname);
  if (legacyProfile) return `${OFFICIAL_SITE_ORIGIN}/profile/${legacyProfile[1]}${url.search}`;
  return '';
}

const defaultSecurityHeaders = secureHeaders();
const publicMediaSecurityHeaders = secureHeaders({ crossOriginResourcePolicy: 'cross-origin' });

app.use('*', requestContext);
app.use('*', (c, next) => (
  c.req.path.startsWith('/api/media/')
    ? publicMediaSecurityHeaders(c, next)
    : defaultSecurityHeaders(c, next)
));
app.use('*', async (c, next) => {
  const destination = publicRedirect(c.req.url);
  if (destination === '') return c.text('Short link not found.', 404);
  if (destination) return c.redirect(destination, 308);
  return next();
});
app.use('/api/*', (c, next) => (
  c.req.path === '/api/telegram/bot/webhook' ? next() : secureCors(c, next)
));
app.use('/api/*', sessionContext);
app.route('/api', api);

app.notFound((c) => fail(c, 404, 'NOT_FOUND', 'The requested endpoint does not exist.'));
app.onError((error, c) => {
  console.error(JSON.stringify({ requestId: c.get('requestId'), error: error.message }));
  return fail(c, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([deleteExpiredStories(env), deleteExpiredAiChatImages(env)]));
  },
};
