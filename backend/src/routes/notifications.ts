import { Hono } from 'hono';
import { fail, ok } from '../lib/responses';
import type { AppVariables, Env } from '../types';

export const notificationRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

notificationRoutes.get('/', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const rows = await c.env.DB.prepare(`SELECT n.id, n.type, n.entity_id AS entityId, n.message,
    n.read_at AS readAt, n.created_at AS createdAt, u.username AS actorUsername,
    u.display_name AS actorDisplayName, u.avatar_key AS actorAvatarKey
    FROM notifications n LEFT JOIN users u ON u.id = n.actor_user_id
    WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50`).bind(user.id).all();
  const unread = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .bind(user.id).first<{ count: number }>();
  return ok(c, { notifications: rows.results, unreadCount: unread?.count ?? 0 });
});

notificationRoutes.post('/read-all', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .bind(new Date().toISOString(), user.id).run();
  return ok(c, { unreadCount: 0 });
});

notificationRoutes.post('/:id/read', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  await c.env.DB.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?')
    .bind(new Date().toISOString(), c.req.param('id'), user.id).run();
  return ok(c, { read: true });
});
