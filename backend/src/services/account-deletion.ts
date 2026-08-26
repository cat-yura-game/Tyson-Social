import { mediaStorage } from './media-storage';

interface MediaKeyRow { storageKey: string | null }

async function collectMediaKeys(db: D1Database, userId: string): Promise<string[]> {
  const rows = await db.prepare(`
    SELECT avatar_key AS storageKey FROM users WHERE id = ?
    UNION SELECT pm.storage_key FROM post_media pm JOIN posts p ON p.id = pm.post_id WHERE p.author_user_id = ?
    UNION SELECT pm.storage_key FROM post_media pm JOIN posts p ON p.id = pm.post_id
      JOIN companies co ON co.id = p.author_company_id WHERE co.owner_user_id = ?
    UNION SELECT avatar_key FROM companies WHERE owner_user_id = ?
    UNION SELECT storage_key FROM stories WHERE author_user_id = ?
    UNION SELECT image_storage_key FROM ai_chat_messages WHERE conversation_id IN
      (SELECT id FROM ai_conversations WHERE user_id = ?) AND image_storage_key IS NOT NULL
    UNION SELECT storage_key FROM encrypted_message_attachments WHERE uploader_user_id = ? OR conversation_id IN
      (SELECT id FROM conversations WHERE created_by_user_id = ?) OR conversation_id IN
      (SELECT conversation_id FROM conversation_members WHERE user_id = ?)
  `).bind(userId, userId, userId, userId, userId, userId, userId, userId, userId).all<MediaKeyRow>();
  return [...new Set(rows.results.map((row) => row.storageKey).filter((key): key is string => Boolean(key)))];
}

export async function deleteUserAccount(env: { DB: D1Database; MEDIA: KVNamespace; B2_KEY_ID?: string; B2_APPLICATION_KEY?: string; B2_BUCKET_NAME?: string }, userId: string): Promise<void> {
  const mediaKeys = await collectMediaKeys(env.DB, userId);

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM moderation_results WHERE subject_id = ? OR subject_id IN
      (SELECT id FROM posts WHERE author_user_id = ?) OR subject_id IN
      (SELECT id FROM comments WHERE author_user_id = ?) OR subject_id IN
      (SELECT id FROM stories WHERE author_user_id = ?)`)
      .bind(userId, userId, userId, userId),
    env.DB.prepare(`DELETE FROM conversations WHERE created_by_user_id = ? OR id IN
      (SELECT conversation_id FROM conversation_members WHERE user_id = ?)`)
      .bind(userId, userId),
    env.DB.prepare('DELETE FROM comments WHERE author_user_id = ?').bind(userId),
    env.DB.prepare(`DELETE FROM posts WHERE author_company_id IN
      (SELECT id FROM companies WHERE owner_user_id = ?)`).bind(userId),
    env.DB.prepare('DELETE FROM posts WHERE author_user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM companies WHERE owner_user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM security_events WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);

  const storage = mediaStorage(env);
  const cleanup = await Promise.allSettled(mediaKeys.map((key) => storage.delete(key)));
  const failed = cleanup.filter((result) => result.status === 'rejected').length;
  if (failed > 0) console.error(JSON.stringify({ event: 'account_media_cleanup_incomplete', userId, failed }));
}
