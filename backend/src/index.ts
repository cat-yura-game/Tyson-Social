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

const defaultSecurityHeaders = secureHeaders();
const publicMediaSecurityHeaders = secureHeaders({ crossOriginResourcePolicy: 'cross-origin' });

app.use('*', requestContext);
app.use('*', (c, next) => (
  c.req.path.startsWith('/api/media/')
    ? publicMediaSecurityHeaders(c, next)
    : defaultSecurityHeaders(c, next)
));
app.use('/api/*', secureCors);
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
