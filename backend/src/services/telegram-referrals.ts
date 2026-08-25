import { randomToken } from '../security/tokens';

export const TELEGRAM_BOT_URL = 'https://t.me/TysonSocialBot';
const REWARD = 50;

export async function recordTelegramBotStart(db: D1Database, telegramUserId: string, chatId: string, referralCode?: string): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO telegram_bot_visits (telegram_user_id, chat_id, first_started_at, last_started_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id = excluded.chat_id, last_started_at = excluded.last_started_at, start_count = start_count + 1`).bind(telegramUserId, chatId, now, now).run();
  if (!referralCode || !/^[A-Za-z0-9_-]{8,40}$/u.test(referralCode)) return;
  const referrer = await db.prepare('SELECT user_id AS userId FROM telegram_referral_codes WHERE code = ?').bind(referralCode).first<{ userId: string }>();
  if (!referrer) return;
  const owner = await db.prepare('SELECT user_id AS userId FROM telegram_identities WHERE telegram_user_id = ?').bind(telegramUserId).first<{ userId: string }>();
  if (owner?.userId === referrer.userId) return;
  await db.prepare(`INSERT OR IGNORE INTO telegram_bot_referrals (invited_telegram_user_id, referrer_user_id, bot_started_at)
    VALUES (?, ?, ?)`).bind(telegramUserId, referrer.userId, now).run();
}

export async function referralLink(db: D1Database, userId: string): Promise<string> {
  let row = await db.prepare('SELECT code FROM telegram_referral_codes WHERE user_id = ?').bind(userId).first<{ code: string }>();
  while (!row) {
    const code = randomToken(9);
    try { await db.prepare('INSERT INTO telegram_referral_codes (user_id, code, created_at) VALUES (?, ?, ?)').bind(userId, code, new Date().toISOString()).run(); row = { code }; }
    catch { row = await db.prepare('SELECT code FROM telegram_referral_codes WHERE user_id = ?').bind(userId).first<{ code: string }>(); }
  }
  return `${TELEGRAM_BOT_URL}?start=ref_${row.code}`;
}

export async function referralStats(db: D1Database, userId: string): Promise<{ started: number; registered: number; link: string }> {
  const [counts, link] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS started, COALESCE(SUM(CASE WHEN registered_user_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS registered
      FROM telegram_bot_referrals WHERE referrer_user_id = ?`).bind(userId).first<{ started: number; registered: number }>(),
    referralLink(db, userId),
  ]);
  return { started: counts?.started ?? 0, registered: counts?.registered ?? 0, link };
}

export async function completeTelegramReferral(db: D1Database, telegramUserId: string | null, registeredUserId: string): Promise<boolean> {
  if (!telegramUserId) return false;
  const now = new Date().toISOString();
  const referral = await db.prepare(`UPDATE telegram_bot_referrals SET registered_user_id = ?, registered_at = ?
    WHERE invited_telegram_user_id = ? AND registered_user_id IS NULL AND referrer_user_id != ?
    RETURNING referrer_user_id AS referrerUserId`).bind(registeredUserId, now, telegramUserId, registeredUserId).first<{ referrerUserId: string }>();
  if (!referral) return false;
  const transactionId = crypto.randomUUID();
  await db.batch([
    db.prepare('UPDATE users SET diamond_balance = diamond_balance + ? WHERE id = ?').bind(REWARD, referral.referrerUserId),
    db.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      VALUES (?, ?, ?, 'credit', 'telegram_referral', ?, ?)`)
      .bind(transactionId, referral.referrerUserId, REWARD, registeredUserId, now),
    db.prepare('UPDATE telegram_bot_referrals SET reward_transaction_id = ? WHERE invited_telegram_user_id = ? AND registered_user_id = ?')
      .bind(transactionId, telegramUserId, registeredUserId),
  ]);
  return true;
}
