import { createMiddleware } from 'hono/factory';
import type { AppVariables, Env } from '../types';

export const requestContext = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const requestId = c.req.header('cf-ray') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  c.set('authUser', null);
  c.set('sessionId', null);
  await next();
  c.header('x-request-id', requestId);
  c.header('x-content-type-options', 'nosniff');
  c.header('referrer-policy', 'strict-origin-when-cross-origin');
  c.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
});
