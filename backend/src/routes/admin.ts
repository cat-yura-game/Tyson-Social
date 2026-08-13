import { Hono } from 'hono';
import { z } from 'zod';
import { fail, ok } from '../lib/responses';
import { canAccessAdminApi } from '../security/authorization';
import type { AppVariables, Env } from '../types';

export const adminRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

adminRoutes.use('*', async (c, next) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  if (!canAccessAdminApi({ userId: user.id, role: user.role, status: user.status })) {
    return fail(c, 403, 'ADMIN_REQUIRED', 'Administrator access is required.');
  }
  await next();
});

adminRoutes.get('/overview', async (c) => {
  const stats = await c.env.DB.prepare(`SELECT
    COUNT(*) AS totalUsers,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeUsers,
    SUM(CASE WHEN status IN ('limited', 'suspended') THEN 1 ELSE 0 END) AS restrictedUsers,
    SUM(CASE WHEN created_at >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS joinedLast24Hours,
    SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) AS verifiedUsers,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM telegram_identities ti WHERE ti.user_id = users.id) THEN 1 ELSE 0 END) AS telegramUsers
    FROM users`).first();
  const content = await c.env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM posts WHERE status = 'published') AS publishedPosts,
    (SELECT COUNT(*) FROM comments WHERE status = 'published') AS publishedComments,
    (SELECT COUNT(*) FROM moderation_results WHERE decision = 'review' AND reviewed_at IS NULL) AS moderationReviewCount,
    (SELECT COUNT(*) FROM security_events WHERE resolved_at IS NULL) AS openSecurityEvents`).first();
  return ok(c, { stats: { ...stats, ...content } });
});

adminRoutes.get('/users', async (c) => {
  const query = c.req.query('q')?.trim().slice(0, 80) ?? '';
  const status = c.req.query('status')?.trim() ?? '';
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50) || 50, 1), 100);
  const statusFilter = ['pending_email', 'active', 'limited', 'suspended'].includes(status) ? status : '';
  const like = `%${query.replace(/[\\%_]/gu, '\\$&')}%`;
  const rows = await c.env.DB.prepare(`SELECT u.id, u.username, u.display_name AS displayName,
    u.email, u.avatar_key AS avatarKey, u.role, u.status, u.is_verified AS verified,
    u.created_at AS createdAt, EXISTS(SELECT 1 FROM telegram_identities ti WHERE ti.user_id = u.id) AS telegramLinked,
    (SELECT COUNT(*) FROM posts p WHERE p.author_user_id = u.id AND p.status = 'published') AS postCount
    FROM users u WHERE (? = '' OR u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
      AND (? = '' OR u.status = ?) ORDER BY u.created_at DESC LIMIT ?`)
    .bind(query, like, like, like, statusFilter, statusFilter, limit).all();
  return ok(c, { users: rows.results });
});

const statusSchema = z.object({ status: z.enum(['active', 'limited', 'suspended']) }).strict();

adminRoutes.patch('/users/:id/status', async (c) => {
  const admin = c.get('authUser')!;
  const targetId = c.req.param('id');
  if (targetId === admin.id) return fail(c, 409, 'SELF_STATUS_CHANGE', 'You cannot restrict your own administrator account.');
  let input: z.infer<typeof statusSchema>;
  try { input = statusSchema.parse(await c.req.json()); }
  catch { return fail(c, 422, 'VALIDATION_ERROR', 'The account status is invalid.'); }
  const target = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(targetId).first<{ role: string }>();
  if (!target) return fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
  if (target.role === 'admin') return fail(c, 403, 'ADMIN_TARGET_FORBIDDEN', 'Another administrator cannot be restricted here.');
  await c.env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
    .bind(input.status, new Date().toISOString(), targetId).run();
  if (input.status === 'suspended') {
    await c.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .bind(new Date().toISOString(), targetId).run();
  }
  return ok(c, { id: targetId, status: input.status });
});

