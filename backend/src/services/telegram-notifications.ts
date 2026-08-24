import type { Env } from '../types';
import type { TysonPushMessage } from './web-push';

type Category = 'messages' | 'interactions' | 'posts' | 'security';
type TelegramSettings = { chatId: string; enabled: number; messagesEnabled: number; interactionsEnabled: number; postsEnabled: number; securityEnabled: number };

function categoryFor(message: TysonPushMessage): Category {
  if (message.tag?.startsWith('message-')) return 'messages';
  if (message.tag?.startsWith('post-')) return 'posts';
  if (message.tag?.startsWith('login-')) return 'security';
  return 'interactions';
}

export async function sendTelegramNotification(env: Env, userId: string, message: TysonPushMessage): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const settings = await env.DB.prepare(`SELECT chat_id AS chatId, enabled, messages_enabled AS messagesEnabled,
    interactions_enabled AS interactionsEnabled, posts_enabled AS postsEnabled, security_enabled AS securityEnabled
    FROM telegram_notification_settings WHERE user_id = ?`).bind(userId).first<TelegramSettings>();
  if (!settings?.enabled || !settings[`${categoryFor(message)}Enabled`]) return;
  try {
    const url = new URL(message.url, env.FRONTEND_URL).toString();
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: settings.chatId, text: `${message.title}\n${message.body}`, reply_markup: { inline_keyboard: [[{ text: 'Открыть Tyson', url }]] } }),
    });
  } catch (error) { console.error(JSON.stringify({ event: 'telegram_notification_failed', userId, error: error instanceof Error ? error.message : 'unknown' })); }
}
