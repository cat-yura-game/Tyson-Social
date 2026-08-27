import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { ZodError, z } from 'zod';
import { fail, ok } from '../lib/responses';
import { SESSION_COOKIE } from '../middleware/auth';
import {
  consumeRateLimit,
  createSession,
  createUserWithSession,
  findUserByEmail,
  revokeSession,
} from '../repositories/auth-repository';
import { changeEmailSchema, emailVerificationSchema, loginSchema, parseJsonBody, registerSchema } from '../schemas/auth';
import { hashPassword, verifyPassword } from '../security/passwords';
import { keyedHash, randomToken, sha256 } from '../security/tokens';
import type { AppVariables, AuthUser, Env } from '../types';
import { moderatePublicContent, saveModerationResult } from '../services/moderation-service';
import { sendPushToUser } from '../services/web-push';
import { createEmailVerificationCode, sendLoginApprovalEmail, sendVerificationEmail } from '../services/email';

const SESSION_SECONDS = 60 * 60 * 24 * 30;
const VERIFICATION_SECONDS = 10 * 60;
const MAX_AUTH_BODY_BYTES = 16 * 1024;
const LOGIN_CHALLENGE_SECONDS = 10 * 60;

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function secret(env: Env): string {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET is not configured.');
  return env.SESSION_SECRET;
}

function clientIp(c: Parameters<typeof fail>[0]): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

function setSessionCookie(c: Parameters<typeof ok>[0], token: string): void {
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? 'None' : 'Lax',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

function clearSessionCookie(c: Parameters<typeof ok>[0]): void {
  const secure = new URL(c.req.url).protocol === 'https:';
  deleteCookie(c, SESSION_COOKIE, { secure, sameSite: secure ? 'None' : 'Lax', path: '/' });
}

function describeSession(userAgent: string | null): { device: string; browser: string } {
  const value = userAgent ?? '';
  const device = /iPhone/iu.test(value) ? 'iPhone' : /iPad/iu.test(value) ? 'iPad' : /Android/iu.test(value) ? 'Android' : /Windows/iu.test(value) ? 'Windows' : /Macintosh|Mac OS/iu.test(value) ? 'Mac' : /Linux/iu.test(value) ? 'Linux' : 'Неизвестное устройство';
  const browser = /Edg\//u.test(value) ? 'Microsoft Edge' : /Firefox\//u.test(value) ? 'Firefox' : /CriOS\//u.test(value) ? 'Chrome для iOS' : /Chrome\//u.test(value) ? 'Chrome' : /Safari\//u.test(value) ? 'Safari' : 'Браузер';
  return { device, browser };
}

function ensureBodySize(c: Parameters<typeof fail>[0]): Response | null {
  const length = Number(c.req.header('content-length') ?? 0);
  return Number.isFinite(length) && length > MAX_AUTH_BODY_BYTES
    ? fail(c, 413, 'BODY_TOO_LARGE', 'The request body is too large.')
    : null;
}

function validationFailure(c: Parameters<typeof fail>[0], error: unknown): Response {
  if (error instanceof ZodError) {
    return fail(c, 422, 'VALIDATION_ERROR', 'The submitted data is invalid.', error.flatten());
  }
  if (error instanceof Error && error.message === 'CONTENT_TYPE') {
    return fail(c, 400, 'JSON_REQUIRED', 'Content-Type application/json is required.');
  }
  return fail(c, 400, 'INVALID_JSON', 'The request body must be valid JSON.');
}

function sessionPayload(user: AuthUser, accessToken: string) {
  return { user, accessToken };
}

async function createApprovedSession(c: Parameters<typeof ok>[0], user: AuthUser, ipHash: string): Promise<{ user: AuthUser; accessToken: string }> {
  const token = randomToken(); const now = new Date();
  await createSession(c.env.DB, { id: crypto.randomUUID(), userId: user.id, tokenHash: await sha256(token), userAgent: c.req.header('user-agent')?.slice(0, 512) ?? null, ipHash, expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString(), now: now.toISOString() });
  await c.env.DB.prepare(`INSERT INTO security_events (id, user_id, event_type, severity, action, risk_score, ip_hash, metadata_json, created_at) VALUES (?, ?, 'account_login', 'info', 'observe', 0, ?, ?, ?)`).bind(crypto.randomUUID(), user.id, ipHash, JSON.stringify({ userAgent: c.req.header('user-agent')?.slice(0, 200) ?? null, approved: true }), now.toISOString()).run();
  c.executionCtx.waitUntil(sendPushToUser(c.env, user.id, { title: 'Безопасность Tyson', body: `Выполнен новый вход в @${user.username}`, url: '/settings', tag: `login-${now.toISOString()}` }));
  setSessionCookie(c, token); return sessionPayload(user, token);
}

async function maybeCreateLoginChallenge(c: Parameters<typeof ok>[0], user: AuthUser, ipHash: string): Promise<Response | null> {
  const settings = await c.env.DB.prepare('SELECT login_approval_enabled AS enabled, login_approval_method AS method FROM user_settings WHERE user_id = ?').bind(user.id).first<{ enabled: number; method: 'telegram' | 'email' | 'both' }>();
  if (!settings?.enabled) return null;
  const method = settings.method;
  const telegram = await c.env.DB.prepare(`SELECT ti.telegram_user_id AS telegramUserId, ns.chat_id AS chatId FROM telegram_identities ti LEFT JOIN telegram_notification_settings ns ON ns.user_id = ti.user_id WHERE ti.user_id = ? LIMIT 1`).bind(user.id).first<{ telegramUserId: string; chatId: string | null }>();
  if ((method === 'telegram' || method === 'both') && (!c.env.TELEGRAM_BOT_TOKEN || !telegram?.chatId)) return fail(c, 409, 'LOGIN_APPROVAL_UNAVAILABLE', 'Подтверждение через Telegram пока не подключено.');
  if ((method === 'email' || method === 'both') && c.env.EMAIL_DELIVERY_MODE !== 'provider') return fail(c, 409, 'LOGIN_APPROVAL_UNAVAILABLE', 'Подтверждение по email пока недоступно.');
  const challengeId = crypto.randomUUID(); const approvalToken = randomToken(); const now = new Date(); const expiresAt = new Date(now.getTime() + LOGIN_CHALLENGE_SECONDS * 1000).toISOString();
  const code = method === 'telegram' ? null : createEmailVerificationCode();
  await c.env.DB.prepare(`INSERT INTO login_challenges (id,user_id,email,method,code_hash,telegram_token_hash,user_agent,ip_hash,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(challengeId, user.id, user.email, method, code ? await sha256(code) : null, await sha256(approvalToken), c.req.header('user-agent')?.slice(0,512) ?? null, ipHash, expiresAt, now.toISOString()).run();
  if (code) c.executionCtx.waitUntil(sendLoginApprovalEmail(c.env, { to: user.email, code }).catch((error) => console.error('Login approval email failed', error)));
  if (method === 'telegram' || method === 'both') c.executionCtx.waitUntil(fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: telegram?.chatId, text: `🔐 Вход в Tyson\n\nАккаунт: @${user.username}\nУстройство: ${c.req.header('user-agent')?.slice(0,80) ?? 'неизвестно'}\n\nРазрешить вход?`, reply_markup: { inline_keyboard: [[{ text: '✅ Разрешить', callback_data: `login:approve:${challengeId}` }, { text: '⛔ Отклонить', callback_data: `login:deny:${challengeId}` }]] } }) }).catch((error) => console.error('Login approval Telegram failed', error)));
  return ok(c, { requiresApproval: true, challengeId, approvalToken, method, expiresAt });
}

authRoutes.post('/register', async (c) => {
  const oversized = ensureBodySize(c);
  if (oversized) return oversized;

  let input;
  try {
    input = registerSchema.parse(await parseJsonBody(c.req.raw));
  } catch (error) {
    return validationFailure(c, error);
  }

  const envSecret = secret(c.env);
  const ipHash = await keyedHash(envSecret, clientIp(c));
  const rate = await consumeRateLimit(c.env.DB, {
    scope: 'register_ip', subjectHash: ipHash, limit: 5, windowSeconds: 15 * 60, now: new Date(),
  });
  if (!rate.allowed) {
    c.header('retry-after', String(rate.retryAfter));
    return fail(c, 429, 'RATE_LIMITED', 'Too many registration attempts. Try again later.');
  }

  const now = new Date();
  const userId = crypto.randomUUID();
  const sessionToken = randomToken();
  const verificationCode = createEmailVerificationCode();
  const user: AuthUser = {
    id: userId,
    email: input.email,
    username: input.username,
    displayName: input.displayName,
    avatarKey: null,
    bio: '',
    role: 'user',
    status: 'pending_email',
    emailVerified: false,
    verified: false,
    usernameChangeAvailable: true,
    lastSeenAt: now.toISOString(),
    birthdayMonthDay: null,
    birthdayYear: null,
    profileColor: 'forest',
    createdAt: now.toISOString(),
  };

  const nameModeration = await moderatePublicContent(c.env, input.displayName);
  await saveModerationResult(c.env.DB, 'display_name', userId, nameModeration, input.displayName);
  if (nameModeration.decision !== 'allow') {
    return fail(c, 422, 'DISPLAY_NAME_REJECTED', 'This display name could not be approved by safety checks.');
  }

  try {
    await createUserWithSession(c.env.DB, {
      user: { ...user, passwordHash: await hashPassword(input.password) },
      session: {
        id: crypto.randomUUID(),
        tokenHash: await sha256(sessionToken),
        userAgent: c.req.header('user-agent')?.slice(0, 512) ?? null,
        ipHash,
        expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString(),
        now: now.toISOString(),
      },
      verification: {
        id: crypto.randomUUID(),
        tokenHash: await sha256(verificationCode),
        expiresAt: new Date(now.getTime() + VERIFICATION_SECONDS * 1000).toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/unique|constraint/i.test(message)) {
      return fail(c, 409, 'ACCOUNT_EXISTS', 'An account with this email or username already exists.');
    }
    throw error;
  }

  c.executionCtx.waitUntil(sendVerificationEmail(c.env, { to: user.email, code: verificationCode }).catch((error) => {
    console.error('Email verification delivery failed', error);
  }));
  setSessionCookie(c, sessionToken);
  return ok(c, sessionPayload(user, sessionToken), 201);
});

authRoutes.post('/email/verify', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  let input;
  try {
    input = emailVerificationSchema.parse(await parseJsonBody(c.req.raw));
  } catch (error) {
    return validationFailure(c, error);
  }

  const verification = await c.env.DB.prepare(`SELECT id, token_hash AS tokenHash, expires_at AS expiresAt, pending_email AS pendingEmail
    FROM email_verifications WHERE user_id = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`)
    .bind(user.id).first<{ id: string; tokenHash: string; expiresAt: string; pendingEmail: string | null }>();
  if (!verification || Date.parse(verification.expiresAt) <= Date.now() || verification.tokenHash !== await sha256(input.code)) {
    return fail(c, 422, 'INVALID_VERIFICATION_CODE', 'Код неверный или уже истёк.');
  }

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE email_verifications SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(now, verification.id),
    c.env.DB.prepare(`UPDATE users SET email = COALESCE(?, email), email_verified_at = ?, status = CASE WHEN status = 'pending_email' THEN 'active' ELSE status END, updated_at = ? WHERE id = ?`)
      .bind(verification.pendingEmail, now, now, user.id),
  ]);
  return ok(c, { verified: true });
});

authRoutes.post('/email/resend', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const latest = await c.env.DB.prepare('SELECT pending_email AS pendingEmail FROM email_verifications WHERE user_id = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1')
    .bind(user.id).first<{ pendingEmail: string | null }>();
  if (user.emailVerified && !latest?.pendingEmail) return ok(c, { sent: false, verified: true });

  const rate = await consumeRateLimit(c.env.DB, {
    scope: 'email_verification_resend', subjectHash: await sha256(user.id), limit: 3, windowSeconds: 60 * 60, now: new Date(),
  });
  if (!rate.allowed) {
    c.header('retry-after', String(rate.retryAfter));
    return fail(c, 429, 'RATE_LIMITED', 'Слишком много попыток. Попробуйте позже.');
  }

  const code = createEmailVerificationCode();
  const now = new Date();
  await c.env.DB.prepare('INSERT INTO email_verifications (id, user_id, token_hash, expires_at, pending_email) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.id, await sha256(code), new Date(now.getTime() + VERIFICATION_SECONDS * 1000).toISOString(), latest?.pendingEmail ?? null).run();
  try { await sendVerificationEmail(c.env, { to: latest?.pendingEmail ?? user.email, code }); }
  catch (error) { console.error('Email verification resend failed', error); return fail(c, 502, 'EMAIL_DELIVERY_FAILED', 'Не удалось отправить письмо. Попробуйте позже.'); }
  return ok(c, { sent: true });
});

authRoutes.post('/email/change', async (c) => {
  const user = c.get('authUser');
  if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  let input;
  try { input = changeEmailSchema.parse(await parseJsonBody(c.req.raw)); }
  catch (error) { return validationFailure(c, error); }
  if (input.email !== user.email) {
    const used = await findUserByEmail(c.env.DB, input.email);
    if (used && used.id !== user.id) return fail(c, 409, 'EMAIL_IN_USE', 'Этот email уже используется.');
  }
  const code = createEmailVerificationCode(); const now = new Date();
  await c.env.DB.prepare('INSERT INTO email_verifications (id, user_id, token_hash, expires_at, pending_email) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.id, await sha256(code), new Date(now.getTime() + VERIFICATION_SECONDS * 1000).toISOString(), input.email).run();
  try { await sendVerificationEmail(c.env, { to: input.email, code }); }
  catch (error) { console.error('Email change delivery failed', error); return fail(c, 502, 'EMAIL_DELIVERY_FAILED', 'Не удалось отправить письмо на этот адрес.'); }
  return ok(c, { email: input.email, sent: true });
});

authRoutes.post('/login', async (c) => {
  const oversized = ensureBodySize(c);
  if (oversized) return oversized;

  let input;
  try {
    input = loginSchema.parse(await parseJsonBody(c.req.raw));
  } catch (error) {
    return validationFailure(c, error);
  }

  const envSecret = secret(c.env);
  const ipHash = await keyedHash(envSecret, clientIp(c));
  const subjectHash = await keyedHash(envSecret, `${clientIp(c)}\n${input.email}`);
  const rate = await consumeRateLimit(c.env.DB, {
    scope: 'login_subject', subjectHash, limit: 10, windowSeconds: 15 * 60, now: new Date(),
  });
  if (!rate.allowed) {
    c.header('retry-after', String(rate.retryAfter));
    return fail(c, 429, 'RATE_LIMITED', 'Too many login attempts. Try again later.');
  }

  const user = await findUserByEmail(c.env.DB, input.email);
  const passwordValid = user
    ? await verifyPassword(input.password, user.passwordHash)
    : (await hashPassword(input.password), false);
  if (!user || !passwordValid) {
    return fail(c, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  if (user.status === 'suspended' || user.status === 'deleted') {
    return fail(c, 403, 'ACCOUNT_UNAVAILABLE', 'This account is not available.');
  }

  const safeUser: AuthUser = {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarKey: user.avatarKey,
    bio: user.bio,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    verified: user.verified,
    usernameChangeAvailable: user.usernameChangeAvailable,
    lastSeenAt: user.lastSeenAt,
    birthdayMonthDay: user.birthdayMonthDay,
    birthdayYear: user.birthdayYear,
    profileColor: user.profileColor,
    createdAt: user.createdAt,
  };
  const challenge = await maybeCreateLoginChallenge(c, safeUser, ipHash);
  if (challenge) return challenge;
  return ok(c, await createApprovedSession(c, safeUser, ipHash));
});

const loginApprovalInput = z.object({ challengeId: z.string().uuid(), approvalToken: z.string().min(32).max(256), code: z.string().regex(/^\d{6}$/u).optional() }).strict();

authRoutes.post('/login/approve', async (c) => {
  let input; try { input = loginApprovalInput.parse(await parseJsonBody(c.req.raw)); } catch (error) { return validationFailure(c, error); }
  const row = await c.env.DB.prepare(`SELECT id, method, code_hash AS codeHash, telegram_token_hash AS approvalTokenHash, expires_at AS expiresAt, email_approved AS emailApproved, telegram_approved AS telegramApproved FROM login_challenges WHERE id = ? AND consumed_at IS NULL`).bind(input.challengeId).first<{ id:string; method:'email'|'telegram'|'both'; codeHash:string|null; approvalTokenHash:string|null; expiresAt:string; emailApproved:number; telegramApproved:number }>();
  if (!row || Date.parse(row.expiresAt) <= Date.now() || row.approvalTokenHash !== await sha256(input.approvalToken)) return fail(c, 422, 'LOGIN_CHALLENGE_EXPIRED', 'Запрос на вход истёк.');
  const attemptRate = await consumeRateLimit(c.env.DB, { scope: 'login_approval_code', subjectHash: await sha256(input.challengeId), limit: 8, windowSeconds: LOGIN_CHALLENGE_SECONDS, now: new Date() });
  if (!attemptRate.allowed) return fail(c, 429, 'RATE_LIMITED', 'Слишком много попыток. Начните вход заново.');
  if (row.method === 'telegram') return fail(c, 422, 'TELEGRAM_APPROVAL_REQUIRED', 'Подтвердите вход в Telegram.');
  if (!input.code || !row.codeHash || row.codeHash !== await sha256(input.code)) return fail(c, 422, 'INVALID_LOGIN_CODE', 'Код неверный или уже истёк.');
  const now = new Date().toISOString();
  await c.env.DB.prepare('UPDATE login_challenges SET email_approved = 1, approved_at = CASE WHEN method = \'email\' OR telegram_approved = 1 THEN ? ELSE approved_at END WHERE id = ? AND consumed_at IS NULL').bind(now, row.id).run();
  return ok(c, { approved: row.method === 'email' || row.telegramApproved === 1 });
});

authRoutes.get('/login/challenges/:id', async (c) => {
  const id = c.req.param('id');
  if (!z.string().uuid().safeParse(id).success) return fail(c, 404, 'NOT_FOUND', 'Запрос не найден.');
  const approvalToken = c.req.header('x-login-approval-token');
  const row = await c.env.DB.prepare(`SELECT lc.*, u.email, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey, u.bio, u.role, u.status, u.email_verified_at AS emailVerifiedAt, u.verified_at AS verifiedAt, u.username_change_available AS usernameChangeAvailable, u.last_seen_at AS lastSeenAt, u.birthday_month_day AS birthdayMonthDay, u.birthday_year AS birthdayYear, u.profile_color AS profileColor, u.created_at AS createdAt FROM login_challenges lc JOIN users u ON u.id = lc.user_id WHERE lc.id = ?`).bind(id).first<any>();
  if (!row || !approvalToken || row.telegram_token_hash !== await sha256(approvalToken) || row.consumed_at || Date.parse(row.expires_at) <= Date.now()) return fail(c, 422, 'LOGIN_CHALLENGE_EXPIRED', 'Запрос на вход истёк.');
  if (row.denied_at) return ok(c, { status: 'denied' });
  const approved = Boolean(row.approved_at) && (row.method !== 'both' || (row.email_approved && row.telegram_approved));
  if (!approved) return ok(c, { status: 'pending', method: row.method, expiresAt: row.expires_at });
  const user: AuthUser = { id: row.user_id, email: row.email, username: row.username, displayName: row.displayName, avatarKey: row.avatarKey, bio: row.bio, role: row.role, status: row.status, emailVerified: Boolean(row.emailVerifiedAt), verified: Boolean(row.verifiedAt), usernameChangeAvailable: Boolean(row.usernameChangeAvailable), lastSeenAt: row.lastSeenAt, birthdayMonthDay: row.birthdayMonthDay, birthdayYear: row.birthdayYear, profileColor: row.profileColor, createdAt: row.createdAt };
  const ipHash = await keyedHash(secret(c.env), clientIp(c));
  await c.env.DB.prepare('UPDATE login_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(new Date().toISOString(), id).run();
  return ok(c, { status: 'approved', ...await createApprovedSession(c, user, ipHash) });
});

authRoutes.post('/logout', async (c) => {
  const authorization = c.req.header('authorization');
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null;
  const token = bearerToken || getCookie(c, SESSION_COOKIE);
  if (token) await revokeSession(c.env.DB, await sha256(token), new Date().toISOString());
  clearSessionCookie(c);
  return ok(c, { loggedOut: true });
});

authRoutes.get('/sessions', async (c) => {
  const user = c.get('authUser'); const currentSessionId = c.get('sessionId');
  if (!user || !currentSessionId) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const rows = await c.env.DB.prepare(`SELECT id, user_agent AS userAgent, created_at AS createdAt, last_seen_at AS lastSeenAt
    FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC LIMIT 50`).bind(user.id, new Date().toISOString())
    .all<{ id: string; userAgent: string | null; createdAt: string; lastSeenAt: string }>();
  return ok(c, { sessions: rows.results.map((session) => ({ ...session, ...describeSession(session.userAgent), current: session.id === currentSessionId })) });
});

authRoutes.delete('/sessions/others', async (c) => {
  const user = c.get('authUser'); const currentSessionId = c.get('sessionId');
  if (!user || !currentSessionId) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  const result = await c.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL').bind(new Date().toISOString(), user.id, currentSessionId).run();
  return ok(c, { revoked: result.meta.changes ?? 0 });
});

authRoutes.delete('/sessions/:id', async (c) => {
  const user = c.get('authUser'); const currentSessionId = c.get('sessionId'); const id = c.req.param('id');
  if (!user || !currentSessionId) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  if (id === currentSessionId) return fail(c, 422, 'CURRENT_SESSION', 'Use logout to end the current session.');
  const result = await c.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL').bind(new Date().toISOString(), id, user.id).run();
  if (!result.meta.changes) return fail(c, 404, 'SESSION_NOT_FOUND', 'Session not found.');
  return ok(c, { revoked: true });
});

authRoutes.get('/session', (c) => ok(c, { user: c.get('authUser') }));
