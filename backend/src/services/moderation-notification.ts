import type { Env } from '../types';
import { encryptCloudMessage } from './cloud-message-crypto';
import { sendPushToUser } from './web-push';

type ModeratedContentKind = 'пост' | 'комментарий';

function notificationText(kind: ModeratedContentKind, reason: string, content?: { title?: string; body?: string }): string {
  const title = content?.title?.trim();
  const firstLine = content?.body?.split(/\r?\n/u).map((line) => line.trim()).find(Boolean);
  const subject = (title || firstLine || '').slice(0, 180);
  return [
    '🛡️ Публикация не прошла проверку',
    '',
    `Мы не смогли опубликовать ваш ${kind}, потому что система безопасности Tyson обнаружила возможное нарушение правил.`,
    '',
    'Причина:',
    reason.trim() || 'Материал требует дополнительной проверки службой безопасности.',
    ...(subject ? ['', 'Публикация:', `«${subject}${subject.length === 180 ? '…' : ''}»`] : []),
    '',
    'Если нужна повторная проверка, нажмите «Написать в поддержку» ниже.',
    '',
    'Если вы считаете, что это ошибка, вы сможете отправить публикацию на повторную проверку.',
    '',
    '— Защитник Tyson',
  ].join('\n');
}

export async function sendModerationMessage(
  env: Env,
  recipientUserId: string,
  kind: ModeratedContentKind,
  reason: string,
  content?: { title?: string; body?: string },
): Promise<void> {
  try {
    const safety = await env.DB.prepare(`SELECT id, display_name AS displayName FROM users
      WHERE status NOT IN ('suspended', 'deleted') AND (
        lower(display_name) IN ('безопасность тайсон', 'безопасность tyson', 'защитник тайсон', 'защитник tyson') OR
        lower(display_name) LIKE '%защитник tyson%' OR
        lower(display_name) LIKE '%безопасность tyson%' OR
        lower(username) IN ('tyson_safety', 'tyson_security', 'safety_tyson', 'securetyson')
      ) ORDER BY is_verified DESC, created_at ASC LIMIT 1`)
      .first<{ id: string; displayName: string }>();
    if (!safety || safety.id === recipientUserId) {
      console.error(JSON.stringify({ event: 'moderation_message_sender_missing', recipientUserId }));
      return;
    }

    const existing = await env.DB.prepare(`SELECT c.id FROM conversations c
      JOIN conversation_members sender ON sender.conversation_id = c.id AND sender.user_id = ? AND sender.left_at IS NULL
      JOIN conversation_members recipient ON recipient.conversation_id = c.id AND recipient.user_id = ? AND recipient.left_at IS NULL
      WHERE c.kind = 'direct' AND c.security_mode = 'cloud'
        AND (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id AND m.left_at IS NULL) = 2
      LIMIT 1`).bind(safety.id, recipientUserId).first<{ id: string }>();

    const conversationId = existing?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const encrypted = await encryptCloudMessage(env, { type: 'support_notice', text: notificationText(kind, reason, content) });
    const statements = [];
    if (!existing) {
      statements.push(
        env.DB.prepare(`INSERT INTO conversations (id, kind, security_mode, created_by_user_id, created_at, updated_at)
          VALUES (?, 'direct', 'cloud', ?, ?, ?)`).bind(conversationId, safety.id, now, now),
        env.DB.prepare(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`)
          .bind(conversationId, safety.id, now),
        env.DB.prepare(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`)
          .bind(conversationId, recipientUserId, now),
      );
    }
    statements.push(
      env.DB.prepare(`INSERT INTO cloud_messages (id, conversation_id, sender_user_id, ciphertext, nonce, sent_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), conversationId, safety.id, encrypted.ciphertext, encrypted.nonce, now, now),
      env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId),
    );
    await env.DB.batch(statements);
    await sendPushToUser(env, recipientUserId, {
      title: safety.displayName,
      body: 'Публикация не прошла проверку',
      url: `/messages?conversation=${encodeURIComponent(conversationId)}`,
      tag: `moderation-${conversationId}`,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'moderation_message_failed', recipientUserId,
      error: error instanceof Error ? error.message : 'unknown',
    }));
  }
}
