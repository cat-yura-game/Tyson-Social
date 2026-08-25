import { Hono } from 'hono';
import { z } from 'zod';
import { fail, ok } from '../lib/responses';
import type { AppVariables, AuthUser, Env } from '../types';
import { recordTelegramBotStart, referralStats, TELEGRAM_BOT_URL } from '../services/telegram-referrals';

type App = { Bindings: Env; Variables: AppVariables };
export const telegramStarRoutes = new Hono<App>();

const PACKAGES = [
  { id: 'stars_5', stars: 5, diamonds: 50 },
  { id: 'stars_10', stars: 10, diamonds: 110 },
  { id: 'stars_15', stars: 15, diamonds: 170 },
  { id: 'stars_25', stars: 25, diamonds: 300 },
  { id: 'stars_50', stars: 50, diamonds: 650 },
  { id: 'stars_100', stars: 100, diamonds: 1400 },
  { id: 'stars_250', stars: 250, diamonds: 3750 },
  { id: 'stars_500', stars: 500, diamonds: 8000 },
] as const;
const invoiceSchema = z.object({ packageId: z.enum(PACKAGES.map((item) => item.id) as [string, ...string[]]) });
const telegramNotificationSchema = z.object({ enabled: z.boolean(), messagesEnabled: z.boolean(), interactionsEnabled: z.boolean(), postsEnabled: z.boolean(), securityEnabled: z.boolean() }).strict();
type Order = { id: string; userId: string; starsAmount: number; diamondAmount: number; status: 'pending' | 'paid' | 'refunded' | 'cancelled' };
type TelegramResponse<T> = { ok: boolean; result?: T };

function requireUser(c: Parameters<typeof fail>[0]): AuthUser | Response { return c.get('authUser') ?? fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.'); }
function packageDto(item: typeof PACKAGES[number]) { return { ...item, label: `${item.diamonds.toLocaleString('ru-RU')} алмазов` }; }

async function telegramCall<T>(env: Env, method: string, body: unknown): Promise<T> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Telegram bot is not configured.');
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as TelegramResponse<T> | null;
  if (!response.ok || !payload?.ok || payload.result === undefined) throw new Error(`Telegram ${method} failed.`);
  return payload.result;
}

telegramStarRoutes.get('/diamonds/stars/packages', (c) => ok(c, { packages: PACKAGES.map(packageDto) }));

telegramStarRoutes.get('/telegram/referral', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  return ok(c, await referralStats(c.env.DB, user.id));
});

telegramStarRoutes.get('/telegram/notifications/settings', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const [identity, settings] = await Promise.all([
    c.env.DB.prepare('SELECT telegram_user_id AS telegramUserId FROM telegram_identities WHERE user_id = ?').bind(user.id).first<{ telegramUserId: string | null }>(),
    c.env.DB.prepare(`SELECT enabled, messages_enabled AS messagesEnabled, interactions_enabled AS interactionsEnabled,
      posts_enabled AS postsEnabled, security_enabled AS securityEnabled FROM telegram_notification_settings WHERE user_id = ?`).bind(user.id).first<{ enabled: number; messagesEnabled: number; interactionsEnabled: number; postsEnabled: number; securityEnabled: number }>(),
  ]);
  return ok(c, { telegramLinked: Boolean(identity?.telegramUserId), connected: Boolean(settings), connectUrl: 'https://t.me/TysonSocialBot?start=notifications', settings: settings ? { enabled: settings.enabled === 1, messagesEnabled: settings.messagesEnabled === 1, interactionsEnabled: settings.interactionsEnabled === 1, postsEnabled: settings.postsEnabled === 1, securityEnabled: settings.securityEnabled === 1 } : null });
});

telegramStarRoutes.put('/telegram/notifications/settings', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const parsed = telegramNotificationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, 'INVALID_NOTIFICATION_SETTINGS', 'Некорректные настройки уведомлений.');
  const result = await c.env.DB.prepare(`UPDATE telegram_notification_settings SET enabled = ?, messages_enabled = ?, interactions_enabled = ?, posts_enabled = ?, security_enabled = ?, updated_at = ? WHERE user_id = ?`)
    .bind(parsed.data.enabled ? 1 : 0, parsed.data.messagesEnabled ? 1 : 0, parsed.data.interactionsEnabled ? 1 : 0, parsed.data.postsEnabled ? 1 : 0, parsed.data.securityEnabled ? 1 : 0, new Date().toISOString(), user.id).run();
  if ((result.meta.changes ?? 0) !== 1) return fail(c, 409, 'TELEGRAM_NOT_CONNECTED', 'Сначала подключите Telegram-уведомления.');
  return ok(c, parsed.data);
});

telegramStarRoutes.post('/diamonds/stars/invoice', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const parsed = invoiceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, 'INVALID_PACKAGE', 'Выберите пакет алмазов.');
  if (!c.env.TELEGRAM_BOT_TOKEN) return fail(c, 500, 'TELEGRAM_BOT_UNAVAILABLE', 'Оплата через Telegram пока недоступна.');
  const pack = PACKAGES.find((item) => item.id === parsed.data.packageId);
  if (!pack) return fail(c, 422, 'INVALID_PACKAGE', 'Выберите пакет алмазов.');
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO telegram_star_orders (id, user_id, package_id, stars_amount, diamond_amount, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`).bind(id, user.id, pack.id, pack.stars, pack.diamonds, now, now).run();
  try {
    const url = await telegramCall<string>(c.env, 'createInvoiceLink', {
      title: 'Алмазы Tyson', description: `${pack.diamonds.toLocaleString('ru-RU')} алмазов для Tyson Social`,
      payload: `tyson-stars:${id}`, currency: 'XTR', prices: [{ label: packageDto(pack).label, amount: pack.stars }],
    });
    return ok(c, { url });
  } catch {
    return fail(c, 502, 'TELEGRAM_INVOICE_FAILED', 'Не удалось создать счёт в Telegram. Попробуйте ещё раз.');
  }
});

telegramStarRoutes.post('/telegram/bot/webhook', async (c) => {
  if (!c.env.TELEGRAM_BOT_WEBHOOK_SECRET || c.req.header('X-Telegram-Bot-Api-Secret-Token') !== c.env.TELEGRAM_BOT_WEBHOOK_SECRET) return c.text('Not found', 404);
  const update = await c.req.json().catch(() => null) as {
    pre_checkout_query?: { id: string; invoice_payload: string; currency: string; total_amount: number };
    message?: { text?: string; chat: { id: number }; from?: { id: number }; successful_payment?: { invoice_payload: string; currency: string; total_amount: number; telegram_payment_charge_id: string } };
  } | null;
  if (!update) return c.json({ ok: true });
  if (update.pre_checkout_query) {
    const query = update.pre_checkout_query; const id = query.invoice_payload.replace(/^tyson-stars:/u, '');
    const order = await c.env.DB.prepare(`SELECT id, user_id AS userId, stars_amount AS starsAmount, diamond_amount AS diamondAmount, status
      FROM telegram_star_orders WHERE id = ?`).bind(id).first<Order>();
    const valid = query.invoice_payload === `tyson-stars:${id}` && query.currency === 'XTR' && order?.status === 'pending' && order.starsAmount === query.total_amount;
    await telegramCall<boolean>(c.env, 'answerPreCheckoutQuery', valid ? { pre_checkout_query_id: query.id, ok: true } : { pre_checkout_query_id: query.id, ok: false, error_message: 'Счёт больше недоступен. Создайте новый в Tyson.' });
    return c.json({ ok: true });
  }
  const payment = update.message?.successful_payment;
  if (payment) {
    const id = payment.invoice_payload.replace(/^tyson-stars:/u, '');
    const order = await c.env.DB.prepare(`SELECT id, user_id AS userId, stars_amount AS starsAmount, diamond_amount AS diamondAmount, status
      FROM telegram_star_orders WHERE id = ?`).bind(id).first<Order>();
    if (payment.invoice_payload === `tyson-stars:${id}` && payment.currency === 'XTR' && order?.status === 'pending' && order.starsAmount === payment.total_amount) {
      const marker = crypto.randomUUID(); const now = new Date().toISOString();
      await c.env.DB.batch([
        c.env.DB.prepare(`UPDATE telegram_star_orders SET status = 'paid', telegram_payment_charge_id = ?, credit_marker = ?, paid_at = ?, updated_at = ?
          WHERE id = ? AND status = 'pending'`).bind(payment.telegram_payment_charge_id, marker, now, now, order.id),
        c.env.DB.prepare(`UPDATE users SET diamond_balance = diamond_balance + (SELECT diamond_amount FROM telegram_star_orders WHERE id = ?)
          WHERE id = ? AND EXISTS (SELECT 1 FROM telegram_star_orders WHERE id = ? AND credit_marker = ?)`)
          .bind(order.id, order.userId, order.id, marker),
        c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
          SELECT ?, ?, diamond_amount, 'credit', 'telegram_stars_purchase', ?, ? FROM telegram_star_orders WHERE id = ? AND credit_marker = ?`)
          .bind(crypto.randomUUID(), order.userId, order.id, now, order.id, marker),
      ]);
    }
    return c.json({ ok: true });
  }
  const message = update.message;
  const command = message?.text?.trim().split(/\s+/u)[0]?.split('@')[0];
  const startParameter = message?.text?.trim().split(/\s+/u)[1];
  if (message?.from && command === '/start') {
    const referralCode = startParameter?.startsWith('ref_') ? startParameter.slice(4) : undefined;
    await recordTelegramBotStart(c.env.DB, String(message.from.id), String(message.chat.id), referralCode);
  }
  if (message && command === '/start' && startParameter === 'notifications' && message.from) {
    const identity = await c.env.DB.prepare('SELECT user_id AS userId FROM telegram_identities WHERE telegram_user_id = ?').bind(String(message.from.id)).first<{ userId: string }>();
    if (identity) {
      const now = new Date().toISOString();
      await c.env.DB.prepare(`INSERT INTO telegram_notification_settings (user_id, chat_id, created_at, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, enabled = 1, updated_at = excluded.updated_at`).bind(identity.userId, String(message.chat.id), now, now).run();
      await telegramCall<number>(c.env, 'sendMessage', { chat_id: message.chat.id, text: 'Уведомления Tyson в Telegram подключены. Настроить категории можно в Tyson → Настройки → Уведомления.' });
      return c.json({ ok: true });
    }
    await telegramCall<number>(c.env, 'sendMessage', { chat_id: message.chat.id, text: 'Сначала подключите этот Telegram к аккаунту Tyson в настройках сайта, затем повторите попытку.' });
    return c.json({ ok: true });
  }
  if (message && command === '/referrals' && message.from) {
    const identity = await c.env.DB.prepare('SELECT user_id AS userId FROM telegram_identities WHERE telegram_user_id = ?').bind(String(message.from.id)).first<{ userId: string }>();
    if (!identity) await telegramCall<number>(c.env, 'sendMessage', { chat_id: message.chat.id, text: `Сначала привяжите Tyson-аккаунт: ${TELEGRAM_BOT_URL}?start=link` });
    else {
      const stats = await referralStats(c.env.DB, identity.userId);
      await telegramCall<number>(c.env, 'sendMessage', { chat_id: message.chat.id, text: `Ваша реферальная ссылка:\n${stats.link}\n\nПерешли в бота: ${stats.started}\nЗарегистрировались: ${stats.registered}\n\nЗа каждую регистрацию по ссылке — 50 💎.` });
    }
    return c.json({ ok: true });
  }
  if (message && (command === '/start' || command === '/help')) await telegramCall<number>(c.env, 'sendMessage', { chat_id: message.chat.id, text: `Добро пожаловать в Tyson Social!\n\nПривяжите аккаунт в Tyson → Настройки → Telegram, чтобы получать уведомления и участвовать в рефералах.\n\nПриглашайте друзей: за регистрацию по вашей ссылке — 50 💎. После привязки используйте /referrals.\n\nОткрыть Tyson: https://tysonsocial.eu.cc` });
  if (message && (command === '/paysupport' || command === '/support')) await telegramCall<number>(c.env, 'sendMessage', { chat_id: message.chat.id, text: 'По вопросам оплаты напишите нам через Tyson Social: https://tysonsocial.eu.cc' });
  if (message && command === '/terms') await telegramCall<number>(c.env, 'sendMessage', { chat_id: message.chat.id, text: 'Оплачивая алмазы, вы получаете их на баланс Tyson сразу после подтверждения Telegram. Возврат и поддержка: https://tysonsocial.eu.cc' });
  return c.json({ ok: true });
});
