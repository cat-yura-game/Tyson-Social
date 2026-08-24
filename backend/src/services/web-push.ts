import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';
import type { Env } from '../types';
import { sendTelegramNotification } from './telegram-notifications';

export interface TysonPushMessage { title: string; body: string; url: string; tag?: string }

export async function sendPushToUser(env: Env, userId: string, message: TysonPushMessage): Promise<void> {
  const telegram = sendTelegramNotification(env, userId, message);
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) { await telegram; return; }
  const rows = await env.DB.prepare(`SELECT endpoint, p256dh, auth FROM web_push_subscriptions WHERE user_id = ?`)
    .bind(userId).all<{ endpoint: string; p256dh: string; auth: string }>();
  await Promise.all([telegram, ...rows.results.map(async (row) => {
    const subscription: PushSubscription = { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } };
    try {
      const request = await buildPushPayload({ data: { title: message.title, body: message.body, url: message.url, tag: message.tag ?? 'tyson-notification' }, options: { ttl: 3600, urgency: 'normal' } }, subscription, {
        subject: env.VAPID_SUBJECT!, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY!,
      });
      const body = request.body.buffer.slice(request.body.byteOffset, request.body.byteOffset + request.body.byteLength) as ArrayBuffer;
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(name, value);
      const response = await fetch(row.endpoint, { method: 'POST', headers, body });
      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare('DELETE FROM web_push_subscriptions WHERE endpoint = ?').bind(row.endpoint).run();
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'web_push_failed', userId, error: error instanceof Error ? error.message : 'unknown' }));
    }
  })]);
}
