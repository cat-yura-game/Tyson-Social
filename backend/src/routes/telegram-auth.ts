import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';
import { fail, ok } from '../lib/responses';
import { consumeRateLimit, createSession, findUserById } from '../repositories/auth-repository';
import { base64UrlEncode, utf8 } from '../security/encoding';
import { keyedHash, randomToken, sha256 } from '../security/tokens';
import { createTelegramAuthorizationUrl, exchangeTelegramCode } from '../services/telegram-oidc';
import type { AppVariables, Env } from '../types';
import { hashPassword } from '../security/passwords';

const STATE_TTL_MS = 10 * 60_000;
const TICKET_TTL_MS = 2 * 60_000;
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const startSchema = z.object({ action: z.enum(['login', 'link']) }).strict();
const exchangeSchema = z.object({ ticket: z.string().min(20).max(500) }).strict();

interface OAuthStateRow {
  action: 'login' | 'link';
  userId: string | null;
  sessionId: string | null;
  codeVerifier: string;
  nonce: string;
}

export const telegramAuthRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function frontendUrl(env: Env, path: string, parameters: Record<string, string>): string {
  const base = new URL(env.FRONTEND_URL);
  if (base.protocol !== 'https:') throw new Error('FRONTEND_URL must use HTTPS.');
  const target = new URL(path, base);
  for (const [key, value] of Object.entries(parameters)) target.searchParams.set(key, value);
  return target.toString();
}

function clientIp(c: Parameters<typeof fail>[0]): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

async function availableTelegramUsername(db: D1Database, preferred: string | null, subject: string): Promise<string> {
  const cleaned = (preferred ?? '').toLowerCase().replace(/[^a-z0-9_]/gu, '').slice(0, 30);
  const seed = (await sha256(subject)).slice(0, 10);
  const base = cleaned.length >= 3 ? cleaned : `telegram_${seed}`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? '' : `_${seed.slice(0, Math.min(8, 3 + attempt))}`;
    const candidate = `${base.slice(0, 30 - suffix.length)}${suffix}`;
    const exists = await db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').bind(candidate).first();
    if (!exists) return candidate;
  }
  return `tg_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
}

telegramAuthRoutes.post('/start', async (c) => {
  let input: z.infer<typeof startSchema>;
  try {
    input = startSchema.parse(await c.req.json());
  } catch {
    return fail(c, 422, 'VALIDATION_ERROR', 'Invalid Telegram login action.');
  }
  const user = c.get('authUser');
  const sessionId = c.get('sessionId');
  if (input.action === 'link' && (!user || !sessionId)) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  if (!c.env.SESSION_SECRET || c.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET is not configured.');
  const rate = await consumeRateLimit(c.env.DB, {
    scope: 'telegram_start_ip',
    subjectHash: await keyedHash(c.env.SESSION_SECRET, clientIp(c)),
    limit: 20,
    windowSeconds: 15 * 60,
    now: new Date(),
  });
  if (!rate.allowed) {
    c.header('retry-after', String(rate.retryAfter));
    return fail(c, 429, 'RATE_LIMITED', 'Too many Telegram login attempts. Try again later.');
  }

  const state = randomToken();
  const codeVerifier = randomToken(48);
  const nonce = randomToken();
  const now = new Date();
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM telegram_oauth_states WHERE expires_at <= ?`).bind(now.toISOString()),
    c.env.DB.prepare(`INSERT INTO telegram_oauth_states
      (state_hash, action, user_id, session_id, code_verifier, nonce, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      await sha256(state), input.action, user?.id ?? null, sessionId,
      codeVerifier, nonce, new Date(now.getTime() + STATE_TTL_MS).toISOString(), now.toISOString(),
    ),
  ]);
  const codeChallenge = base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(codeVerifier))));
  return ok(c, { authorizationUrl: createTelegramAuthorizationUrl(c.env, { state, nonce, codeChallenge }) });
});

telegramAuthRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state || code.length > 4096 || state.length > 500) {
    return c.redirect(frontendUrl(c.env, '/auth/telegram/callback', { error: 'invalid_callback' }));
  }

  let claimedState: OAuthStateRow | null = null;
  try {
    const now = new Date().toISOString();
    claimedState = await c.env.DB.prepare(`UPDATE telegram_oauth_states SET consumed_at = ?
      WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?
      RETURNING action, user_id AS userId, session_id AS sessionId, code_verifier AS codeVerifier, nonce`)
      .bind(now, await sha256(state), now).first<OAuthStateRow>();
    if (!claimedState) return c.redirect(frontendUrl(c.env, '/auth/telegram/callback', { error: 'expired_state' }));

    if (claimedState.action === 'link') {
      const validSession = await c.env.DB.prepare(`SELECT id FROM sessions
        WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?`).bind(claimedState.sessionId, claimedState.userId, now).first();
      if (!validSession) return c.redirect(frontendUrl(c.env, '/settings', { telegram_error: 'session_expired' }));
    }

    const identity = await exchangeTelegramCode(c.env, {
      code,
      codeVerifier: claimedState.codeVerifier,
      expectedNonce: claimedState.nonce,
    });

    if (claimedState.action === 'link' && claimedState.userId) {
      const subjectOwner = await c.env.DB.prepare(`SELECT user_id AS userId FROM telegram_identities WHERE subject = ?`)
        .bind(identity.subject).first<{ userId: string }>();
      if (subjectOwner && subjectOwner.userId !== claimedState.userId) {
        return c.redirect(frontendUrl(c.env, '/settings', { telegram_error: 'already_used' }));
      }
      const currentIdentity = await c.env.DB.prepare(`SELECT subject FROM telegram_identities WHERE user_id = ?`)
        .bind(claimedState.userId).first<{ subject: string }>();
      if (currentIdentity && currentIdentity.subject !== identity.subject) {
        return c.redirect(frontendUrl(c.env, '/settings', { telegram_error: 'already_linked' }));
      }
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO telegram_identities
          (user_id, subject, telegram_user_id, display_name, username, picture_url, linked_at, last_login_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET telegram_user_id = excluded.telegram_user_id,
            display_name = excluded.display_name, username = excluded.username,
            picture_url = excluded.picture_url, last_login_at = excluded.last_login_at`)
          .bind(claimedState.userId, identity.subject, identity.telegramUserId, identity.displayName,
            identity.username, identity.pictureUrl, now, now),
        c.env.DB.prepare(`UPDATE users SET status = CASE WHEN status = 'pending_email' THEN 'active' ELSE status END,
          updated_at = ? WHERE id = ?`).bind(now, claimedState.userId),
      ]);
      return c.redirect(frontendUrl(c.env, '/settings', { telegram: 'linked' }));
    }

    const linked = await c.env.DB.prepare(`SELECT ti.user_id AS userId FROM telegram_identities ti
      JOIN users u ON u.id = ti.user_id WHERE ti.subject = ? AND u.status NOT IN ('suspended', 'deleted')`)
      .bind(identity.subject).first<{ userId: string }>();
    let userId = linked?.userId;
    if (!userId) {
      userId = crypto.randomUUID();
      const username = await availableTelegramUsername(c.env.DB, identity.username, identity.subject);
      const displayName = identity.displayName?.trim().slice(0, 80) || username;
      const syntheticEmail = `telegram+${(await sha256(identity.subject)).slice(0, 32)}@accounts.tyson.invalid`;
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO users
          (id, email, username, display_name, password_hash, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`).bind(userId, syntheticEmail, username, displayName, await hashPassword(randomToken(48)), now, now),
        c.env.DB.prepare(`INSERT INTO user_settings (user_id) VALUES (?)`).bind(userId),
        c.env.DB.prepare(`INSERT INTO telegram_identities
          (user_id, subject, telegram_user_id, display_name, username, picture_url, linked_at, last_login_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(userId, identity.subject, identity.telegramUserId,
          identity.displayName, identity.username, identity.pictureUrl, now, now),
      ]);
    } else {
      await c.env.DB.prepare(`UPDATE telegram_identities SET display_name = ?, username = ?, picture_url = ?, last_login_at = ?
        WHERE user_id = ?`).bind(identity.displayName, identity.username, identity.pictureUrl, now, userId).run();
    }
    const ticket = randomToken();
    await c.env.DB.prepare(`INSERT INTO telegram_login_tickets (token_hash, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)`).bind(await sha256(ticket), userId, new Date(Date.now() + TICKET_TTL_MS).toISOString(), now).run();
    return c.redirect(frontendUrl(c.env, '/auth/telegram/callback', { ticket }));
  } catch (error) {
    console.error(JSON.stringify({ event: 'telegram_oidc_callback_failed', error: error instanceof Error ? error.message : 'unknown' }));
    const path = claimedState?.action === 'link' ? '/settings' : '/auth/telegram/callback';
    return c.redirect(frontendUrl(c.env, path, { telegram_error: 'provider_failed' }));
  }
});

telegramAuthRoutes.post('/exchange', async (c) => {
  let input: z.infer<typeof exchangeSchema>;
  try {
    input = exchangeSchema.parse(await c.req.json());
  } catch {
    return fail(c, 422, 'VALIDATION_ERROR', 'Invalid Telegram login ticket.');
  }
  const now = new Date();
  const ticket = await c.env.DB.prepare(`UPDATE telegram_login_tickets SET consumed_at = ?
    WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ? RETURNING user_id AS userId`)
    .bind(now.toISOString(), await sha256(input.ticket), now.toISOString()).first<{ userId: string }>();
  if (!ticket) return fail(c, 401, 'TELEGRAM_TICKET_INVALID', 'Telegram login has expired. Please try again.');
  const user = await findUserById(c.env.DB, ticket.userId);
  if (!user || user.status === 'suspended' || user.status === 'deleted') return fail(c, 403, 'ACCOUNT_UNAVAILABLE', 'This account is not available.');
  if (!c.env.SESSION_SECRET || c.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET is not configured.');
  const accessToken = randomToken();
  await createSession(c.env.DB, {
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: await sha256(accessToken),
    userAgent: c.req.header('user-agent')?.slice(0, 512) ?? null,
    ipHash: await keyedHash(c.env.SESSION_SECRET, clientIp(c)),
    expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString(),
    now: now.toISOString(),
  });
  setCookie(c, 'tyson_session', accessToken, {
    httpOnly: true, secure: true, sameSite: 'None', path: '/', maxAge: SESSION_SECONDS,
  });
  return ok(c, { user, accessToken });
});

telegramAuthRoutes.get('/status', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const identity = await c.env.DB.prepare(`SELECT display_name AS displayName, username, linked_at AS linkedAt
    FROM telegram_identities WHERE user_id = ?`).bind(user.id)
    .first<{ displayName: string | null; username: string | null; linkedAt: string }>();
  return ok(c, { linked: Boolean(identity), identity });
});

telegramAuthRoutes.delete('/link', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  await c.env.DB.prepare(`DELETE FROM telegram_identities WHERE user_id = ?`).bind(user.id).run();
  return ok(c, { linked: false });
});
