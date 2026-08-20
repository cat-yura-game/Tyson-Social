export async function grantDiamonds(db: D1Database, userId: string, amount: number, reason: string, relatedEntityId?: string): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Diamond grant amount must be a positive integer.');
  const now = new Date().toISOString();
  const result = await db.batch([
    db.prepare('UPDATE users SET diamond_balance = diamond_balance + ? WHERE id = ?').bind(amount, userId),
    db.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, ?, 'credit', ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)`)
      .bind(crypto.randomUUID(), userId, amount, reason, relatedEntityId ?? null, now, userId),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) throw new Error('User not found.');
}

export async function awardTaskReward(db: D1Database, userId: string, taskId: string, amount: number): Promise<void> {
  if (!taskId.trim()) throw new Error('Task identifier is required.');
  await grantDiamonds(db, userId, amount, 'task_reward', taskId);
}
