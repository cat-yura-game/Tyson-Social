import { createMiddleware } from 'hono/factory';
import type { AppVariables, Env } from '../types';
import { fail } from '../lib/responses';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowedOrigins(value: string): Set<string> {
  return new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean));
}

export const secureCors = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const origin = c.req.header('origin');
  const allowed = allowedOrigins(c.env.ALLOWED_ORIGINS);

  if (origin && !allowed.has(origin)) {
    return fail(c, 403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed.');
  }

  if (!SAFE_METHODS.has(c.req.method) && !origin) {
    return fail(c, 403, 'ORIGIN_REQUIRED', 'A trusted Origin header is required.');
  }

  if (origin) {
    c.header('access-control-allow-origin', origin);
    c.header('access-control-allow-credentials', 'true');
    c.header('vary', 'Origin');
  }

  if (c.req.method === 'OPTIONS') {
    c.header('access-control-allow-methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    c.header('access-control-allow-headers', 'content-type, x-csrf-token');
    c.header('access-control-max-age', '86400');
    return c.body(null, 204);
  }

  await next();
});
