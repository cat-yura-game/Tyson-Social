import type { Context } from 'hono';
import type { AppVariables, Env } from '../types';

type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

export function ok<T>(c: AppContext, data: T, status: 200 | 201 = 200) {
  return c.json({ data }, status);
}

export function fail(
  c: AppContext,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json(
    {
      error: {
        code,
        message,
        requestId: c.get('requestId'),
        ...(details === undefined ? {} : { details }),
      },
    },
    status,
  );
}
