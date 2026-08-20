import type { AuthUser } from '../types';

export interface UserWithPassword extends AuthUser {
  passwordHash: string;
}

interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string;
  password_hash?: string;
  avatar_key: string | null;
  bio: string;
  role: AuthUser['role'];
  status: AuthUser['status'];
  email_verified_at: string | null;
  is_verified: number;
  username_changed_at: string | null;
  last_seen_at: string | null;
  birthday_month_day: string | null;
  birthday_year: number | null;
  created_at: string;
}

function projectUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    avatarKey: row.avatar_key,
    bio: row.bio,
    role: row.role,
    status: row.status,
    emailVerified: row.email_verified_at !== null,
    verified: row.is_verified === 1,
    usernameChangeAvailable: row.username_changed_at === null,
    lastSeenAt: row.last_seen_at,
    birthdayMonthDay: row.birthday_month_day,
    birthdayYear: row.birthday_year,
    createdAt: row.created_at,
  };
}

const USER_COLUMNS = `id, email, username, display_name, avatar_key, bio, role, status,
  email_verified_at, is_verified, username_changed_at, last_seen_at, birthday_month_day, birthday_year, created_at`;

export async function findUserByEmail(db: D1Database, email: string): Promise<UserWithPassword | null> {
  const row = await db.prepare(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ? LIMIT 1`)
    .bind(email).first<UserRow>();
  return row ? { ...projectUser(row), passwordHash: row.password_hash! } : null;
}

export async function findUserByUsername(db: D1Database, username: string): Promise<AuthUser | null> {
  const row = await db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ? LIMIT 1`)
    .bind(username).first<UserRow>();
  return row ? projectUser(row) : null;
}

export async function findUserById(db: D1Database, userId: string): Promise<AuthUser | null> {
  const row = await db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`).bind(userId).first<UserRow>();
  return row ? projectUser(row) : null;
}

export async function findUserBySessionHash(db: D1Database, tokenHash: string, now: string): Promise<(AuthUser & { sessionId: string }) | null> {
  const row = await db.prepare(`SELECT ${USER_COLUMNS.replaceAll(/\b(id|email|username|display_name|avatar_key|bio|role|status|email_verified_at|last_seen_at|birthday_month_day|birthday_year|created_at)\b/g, 'u.$1')}, s.id AS session_id
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status NOT IN ('suspended', 'deleted')
    LIMIT 1`).bind(tokenHash, now).first<UserRow & { session_id: string }>();
  return row ? { ...projectUser(row), sessionId: row.session_id } : null;
}

export async function createUserWithSession(db: D1Database, input: {
  user: { id: string; email: string; username: string; displayName: string; passwordHash: string };
  session: { id: string; tokenHash: string; userAgent: string | null; ipHash: string; expiresAt: string; now: string };
  verification: { id: string; tokenHash: string; expiresAt: string };
}): Promise<void> {
  await db.batch([
    db.prepare(`INSERT INTO users (id, email, username, display_name, password_hash)
      VALUES (?, ?, ?, ?, ?)`).bind(input.user.id, input.user.email, input.user.username, input.user.displayName, input.user.passwordHash),
    db.prepare(`INSERT INTO user_settings (user_id) VALUES (?)`).bind(input.user.id),
    db.prepare(`INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`)
      .bind(input.verification.id, input.user.id, input.verification.tokenHash, input.verification.expiresAt),
    db.prepare(`INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_hash, expires_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(input.session.id, input.user.id, input.session.tokenHash, input.session.userAgent, input.session.ipHash, input.session.expiresAt, input.session.now),
  ]);
}

export async function createSession(db: D1Database, input: {
  id: string; userId: string; tokenHash: string; userAgent: string | null; ipHash: string; expiresAt: string; now: string;
}): Promise<void> {
  await db.prepare(`INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_hash, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(input.id, input.userId, input.tokenHash, input.userAgent, input.ipHash, input.expiresAt, input.now).run();
}

export async function revokeSession(db: D1Database, tokenHash: string, now: string): Promise<void> {
  await db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').bind(now, tokenHash).run();
}

export async function updateProfile(db: D1Database, userId: string, input: {
  displayName?: string | undefined;
  bio?: string | undefined;
  username?: string | undefined;
  birthdayMonthDay?: string | null | undefined;
  birthdayYear?: number | null | undefined;
}): Promise<AuthUser | null> {
  const now = new Date().toISOString();
  const result = await db.prepare(`UPDATE users SET
    display_name = COALESCE(?, display_name),
    bio = COALESCE(?, bio),
    username = CASE WHEN ? IS NOT NULL AND username_changed_at IS NULL THEN ? ELSE username END,
    username_changed_at = CASE WHEN ? IS NOT NULL AND username_changed_at IS NULL THEN ? ELSE username_changed_at END,
    birthday_month_day = CASE WHEN ? THEN ? ELSE birthday_month_day END,
    birthday_year = CASE WHEN ? THEN ? ELSE birthday_year END,
    updated_at = ?
    WHERE id = ? AND (? IS NULL OR username_changed_at IS NULL)`)
    .bind(input.displayName ?? null, input.bio ?? null, input.username ?? null, input.username ?? null,
      Object.hasOwn(input, 'birthdayMonthDay') ? 1 : 0, input.birthdayMonthDay ?? null,
      Object.hasOwn(input, 'birthdayYear') ? 1 : 0, input.birthdayYear ?? null,
      now, userId, input.username ?? null).run();
  if (!result.meta.changes) return null;
  const row = await db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(userId).first<UserRow>();
  return row ? projectUser(row) : null;
}

export async function consumeRateLimit(db: D1Database, input: {
  scope: string; subjectHash: string; limit: number; windowSeconds: number; now: Date;
}): Promise<{ allowed: boolean; retryAfter: number }> {
  const now = input.now.toISOString();
  const expires = new Date(input.now.getTime() + input.windowSeconds * 1000).toISOString();
  const row = await db.prepare(`INSERT INTO auth_rate_limits
    (scope, subject_hash, request_count, window_started_at, expires_at) VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(scope, subject_hash) DO UPDATE SET
      request_count = CASE WHEN expires_at <= excluded.window_started_at THEN 1 ELSE request_count + 1 END,
      window_started_at = CASE WHEN expires_at <= excluded.window_started_at THEN excluded.window_started_at ELSE window_started_at END,
      expires_at = CASE WHEN expires_at <= excluded.window_started_at THEN excluded.expires_at ELSE expires_at END
    RETURNING request_count, expires_at`).bind(input.scope, input.subjectHash, now, expires)
    .first<{ request_count: number; expires_at: string }>();

  if (!row) throw new Error('RATE_LIMIT_STATE');
  return {
    allowed: row.request_count <= input.limit,
    retryAfter: Math.max(1, Math.ceil((Date.parse(row.expires_at) - input.now.getTime()) / 1000)),
  };
}
