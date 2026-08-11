import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { findUserBySessionHash } from '../repositories/auth-repository';
import { sha256 } from '../security/tokens';
import type { AppVariables, Env } from '../types';

export const SESSION_COOKIE = 'tyson_session';

export const sessionContext = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  c.set('authUser', null);
  c.set('sessionId', null);

  const authorization = c.req.header('authorization');
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null;
  const token = bearerToken || getCookie(c, SESSION_COOKIE);
  if (token) {
    const session = await findUserBySessionHash(c.env.DB, await sha256(token), new Date().toISOString());
    if (session) {
      const { sessionId, ...user } = session;
      c.set('authUser', user);
      c.set('sessionId', sessionId);
    }
  }

  await next();
});
