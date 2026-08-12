export const STANDARD_UPLOAD_BYTES = 5 * 1024 * 1024;
export const TELEGRAM_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function uploadLimitForUser(db: D1Database, userId: string): Promise<number> {
  const linked = await db.prepare('SELECT 1 FROM telegram_identities WHERE user_id = ? LIMIT 1').bind(userId).first();
  return linked ? TELEGRAM_UPLOAD_BYTES : STANDARD_UPLOAD_BYTES;
}
