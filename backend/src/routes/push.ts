import { Hono } from 'hono';
import { z, ZodError } from 'zod';
import { fail, ok } from '../lib/responses';
import { sendPushToUser } from '../services/web-push';
import type { AppVariables, Env } from '../types';

export const pushRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
const subscriptionSchema = z.object({ endpoint: z.string().url().max(2048).refine((value) => value.startsWith('https://')), keys: z.object({ p256dh: z.string().min(20).max(512), auth: z.string().min(8).max(256) }).strict() }).strict();

pushRoutes.get('/config', (c) => ok(c, { publicKey: c.env.VAPID_PUBLIC_KEY ?? null }));

pushRoutes.put('/subscription', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  let input: z.infer<typeof subscriptionSchema>;
  try { input = subscriptionSchema.parse(await c.req.json()); }
  catch (error) { return fail(c, 422, 'VALIDATION_ERROR', 'Invalid push subscription.', error instanceof ZodError ? error.flatten() : undefined); }
  const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO web_push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id,
    p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, updated_at = excluded.updated_at`)
    .bind(crypto.randomUUID(), user.id, input.endpoint, input.keys.p256dh, input.keys.auth, c.req.header('user-agent')?.slice(0, 500) ?? null, now, now).run();
  return ok(c, { subscribed: true });
});

pushRoutes.delete('/subscription', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  let endpoint = '';
  try { endpoint = z.object({ endpoint: z.string().url().max(2048) }).parse(await c.req.json()).endpoint; }
  catch { return fail(c, 422, 'VALIDATION_ERROR', 'Invalid push subscription.'); }
  await c.env.DB.prepare('DELETE FROM web_push_subscriptions WHERE user_id = ? AND endpoint = ?').bind(user.id, endpoint).run();
  return ok(c, { subscribed: false });
});

pushRoutes.post('/test', async (c) => {
  const user = c.get('authUser'); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  await sendPushToUser(c.env, user.id, { title: 'Tyson', body: 'Уведомления работают 🎉', url: '/notifications', tag: 'tyson-test' });
  return ok(c, { sent: true });
});
