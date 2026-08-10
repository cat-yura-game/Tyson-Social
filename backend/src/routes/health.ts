import { Hono } from 'hono';
import type { AppVariables, Env } from '../types';
import { ok } from '../lib/responses';

export const healthRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

healthRoutes.get('/', (c) =>
  ok(c, {
    service: 'tyson-api',
    status: 'ok',
    environment: c.env.APP_ENV,
    time: new Date().toISOString(),
  }),
);
