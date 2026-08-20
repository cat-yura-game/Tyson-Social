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
      c.executionCtx.waitUntil(c.env.DB.prepare(`UPDATE users SET last_seen_at = ?
        WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)`)
        .bind(new Date().toISOString(), user.id, new Date(Date.now() - 2 * 60_000).toISOString()).run());
    }
  }

  await next();
});
