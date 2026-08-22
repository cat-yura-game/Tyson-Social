import { Hono } from 'hono';
import { fail } from '../lib/responses';
import type { AppVariables, Env } from '../types';

export const secureRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

secureRoutes.get('/test-config/:token', (c) => {
  if (!c.env.SECURE_TEST_TOKEN || !c.env.SECURE_TEST_CONFIG || c.req.param('token') !== c.env.SECURE_TEST_TOKEN) {
    return fail(c, 404, 'CONFIG_NOT_FOUND', 'Test configuration not found.');
  }
  return new Response(c.env.SECURE_TEST_CONFIG, { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="tyson-secure-auto-test.json"', 'cache-control': 'no-store' } });
});
