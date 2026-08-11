import { Hono } from 'hono';
import { fail, ok } from '../lib/responses';
import { findUserByUsername, updateProfile } from '../repositories/auth-repository';
import { parseJsonBody, updateProfileSchema } from '../schemas/auth';
import type { AppVariables, AuthUser, Env } from '../types';

export const userRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function publicProfile(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarKey: user.avatarKey,
    bio: user.bio,
    emailVerified: user.emailVerified,
    verified: user.verified,
    createdAt: user.createdAt,
  };
}

userRoutes.get('/me', (c) => {
  const user = c.get('authUser');
  return user ? ok(c, { user }) : fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
});

userRoutes.patch('/me', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');

  try {
    const input = updateProfileSchema.parse(await parseJsonBody(c.req.raw));
    const updated = await updateProfile(c.env.DB, user.id, input);
    return updated ? ok(c, { user: updated }) : fail(c, 404, 'USER_NOT_FOUND', 'The user no longer exists.');
  } catch {
    return fail(c, 422, 'VALIDATION_ERROR', 'The submitted profile data is invalid.');
  }
});

userRoutes.get('/:username', async (c) => {
  const username = c.req.param('username').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/u.test(username)) return fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
  const user = await findUserByUsername(c.env.DB, username);
  return user ? ok(c, { user: publicProfile(user) }) : fail(c, 404, 'USER_NOT_FOUND', 'User not found.');
});
