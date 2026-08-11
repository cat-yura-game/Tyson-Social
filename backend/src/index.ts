import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { fail } from './lib/responses';
import { secureCors } from './middleware/cors';
import { requestContext } from './middleware/request-context';
import { sessionContext } from './middleware/auth';
import { api } from './routes';
import type { AppVariables, Env } from './types';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use('*', requestContext);
app.use('*', secureHeaders());
app.use('/api/*', secureCors);
app.use('/api/*', sessionContext);
app.route('/api', api);

app.notFound((c) => fail(c, 404, 'NOT_FOUND', 'The requested endpoint does not exist.'));
app.onError((error, c) => {
  console.error(JSON.stringify({ requestId: c.get('requestId'), error: error.message }));
  return fail(c, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
});

export default app;
