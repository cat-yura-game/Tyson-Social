import { Hono } from 'hono';
import { z } from 'zod';
import { GeminiClient } from '../ai/gemini-client';
import { fail, ok } from '../lib/responses';
import { parseJsonBody } from '../schemas/auth';
import type { AppVariables, Env } from '../types';

type App = { Bindings: Env; Variables: AppVariables };
export const supportRoutes = new Hono<App>();
const categories = [
  { id: 'account', title: 'Аккаунт и вход', answer: 'Проверьте email, пароль и подключённый Telegram. Для входа с нового устройства может потребоваться подтверждение.' },
  { id: 'telegram', title: 'Telegram и уведомления', answer: 'Откройте настройки Tyson → Telegram и заново подключите уведомления бота.' },
  { id: 'posts', title: 'Публикации и модерация', answer: 'Публикации проходят проверку Tyson. При отклонении причина приходит от аккаунта «Защитник Tyson».' },
  { id: 'messages', title: 'Messenger', answer: 'Проверьте подключение к сети и обновите страницу. Зашифрованные сообщения доступны только участникам диалога.' },
  { id: 'diamonds', title: 'Алмазы и подарки', answer: 'Баланс и операции с подарками доступны в разделе «Алмазы». Для спорной операции сохраните время и скриншот.' },
  { id: 'visual', title: 'Визуальный баг', answer: null },
  { id: 'other', title: 'Другое', answer: null },
] as const;
const ticketSchema = z.object({ category: z.enum(categories.map((item) => item.id) as [string, ...string[]]), question: z.string().trim().min(1).max(4000), screenshotKey: z.string().max(500).optional() }).strict();
const askSchema = z.object({ question: z.string().trim().min(1).max(4000) }).strict();
function userOf(c: Parameters<typeof fail>[0]) { const user = c.get('authUser'); return user && user.status !== 'limited' ? user : null; }
async function notifyOwner(env: Env, db: D1Database, ticketId: string, category: string, question: string, screenshotKey?: string) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const owner = await db.prepare(`SELECT ns.chat_id AS chatId FROM users u JOIN telegram_notification_settings ns ON ns.user_id = u.id WHERE lower(u.username) = 'cat_tyson' AND ns.chat_id IS NOT NULL LIMIT 1`).first<{ chatId: string }>();
  if (!owner?.chatId) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: owner.chatId, text: `🛟 Новое обращение Tyson\n\nКатегория: ${category}\nID: ${ticketId}\n\n${question}${screenshotKey ? '\n\n📎 Прикреплён скриншот.' : ''}\n\nОтветьте командой:\n/support_reply ${ticketId} ваш ответ` }) });
}
supportRoutes.get('/categories', (c) => ok(c, { categories }));
supportRoutes.get('/tickets/:id', async (c) => { const user = userOf(c); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.'); const ticket = await c.env.DB.prepare('SELECT id, status, ai_answer AS aiAnswer FROM support_tickets WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).first<{id:string;status:string;aiAnswer:string|null}>(); if (!ticket) return fail(c, 404, 'TICKET_NOT_FOUND', 'Обращение не найдено.'); const messages = await c.env.DB.prepare('SELECT sender_type AS senderType, body, created_at AS createdAt FROM support_messages WHERE ticket_id = ? ORDER BY created_at').bind(ticket.id).all<{senderType:string;body:string;createdAt:string}>(); return ok(c, { ticket, messages: messages.results }); });
supportRoutes.post('/tickets', async (c) => {
  const user = userOf(c); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  let input; try { input = ticketSchema.parse(await parseJsonBody(c.req.raw)); } catch { return fail(c, 422, 'VALIDATION_ERROR', 'Заполните категорию и описание проблемы.'); }
  const category = categories.find((item) => item.id === input.category)!; const now = new Date().toISOString(); const id = crypto.randomUUID(); const direct = input.category === 'visual';
  await c.env.DB.batch([c.env.DB.prepare(`INSERT INTO support_tickets (id,user_id,category,status,question,screenshot_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`).bind(id, user.id, input.category, direct ? 'open' : 'ai', input.question, input.screenshotKey ?? null, now, now), c.env.DB.prepare(`INSERT INTO support_messages (id,ticket_id,sender_type,body,created_at) VALUES (?,?,?,?,?)`).bind(crypto.randomUUID(), id, 'user', input.question, now)]);
  if (direct) c.executionCtx.waitUntil(notifyOwner(c.env, c.env.DB, id, category.title, input.question, input.screenshotKey));
  return ok(c, { ticket: { id, category: input.category, status: direct ? 'open' : 'ai', cannedAnswer: category.answer, visualHint: direct ? 'Желательно приложить скриншот проблемы.' : null } }, 201);
});
supportRoutes.post('/tickets/:id/ask', async (c) => {
  const user = userOf(c); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.');
  let input; try { input = askSchema.parse(await parseJsonBody(c.req.raw)); } catch { return fail(c, 422, 'VALIDATION_ERROR', 'Введите вопрос.'); }
  const ticket = await c.env.DB.prepare('SELECT id, category, ai_attempts AS aiAttempts, status FROM support_tickets WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).first<{ id:string; category:string; aiAttempts:number; status:string }>();
  if (!ticket) return fail(c, 404, 'TICKET_NOT_FOUND', 'Обращение не найдено.');
  if (ticket.category === 'visual') return fail(c, 422, 'DIRECT_SUPPORT', 'Визуальные баги сразу передаются в поддержку.');
  if (ticket.aiAttempts >= 1) return fail(c, 422, 'AI_QUESTION_LIMIT', 'Для этого обращения уже был задан вопрос нейросети.');
  if (!c.env.GEMINI_API_KEY) return fail(c, 502, 'AI_PROVIDER_UNAVAILABLE', 'Tyson AI временно недоступна.');
  try {
    const result = await new GeminiClient(c.env.GEMINI_API_KEY, c.env.GEMINI_CHAT_MODEL).generate({ systemInstruction: 'Ты Tyson AI в службе поддержки. Ответь на вопрос пользователя по работе социальной сети Tyson. Используй только подтверждённые сведения из вопроса, не обещай действий, которых не можешь выполнить. Отвечай по-русски, кратко и по делу.', parts: [{ text: input.question }], maxOutputTokens: 700, thinkingLevel: 'minimal' });
    const now = new Date().toISOString(); await c.env.DB.batch([c.env.DB.prepare('UPDATE support_tickets SET question = ?, ai_answer = ?, ai_attempts = 1, updated_at = ? WHERE id = ?').bind(input.question, result.text, now, ticket.id), c.env.DB.prepare('INSERT INTO support_messages (id,ticket_id,sender_type,body,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(), ticket.id, 'ai', result.text, now)]);
    return ok(c, { answer: result.text, model: result.modelVersion, buttons: ['ai_solved', 'ai_unsolved', 'ask_again'] });
  } catch { return fail(c, 502, 'AI_PROVIDER_UNAVAILABLE', 'Tyson AI временно недоступна.'); }
});
supportRoutes.post('/tickets/:id/escalate', async (c) => { const user = userOf(c); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.'); const ticket = await c.env.DB.prepare('SELECT id, category, question, screenshot_key AS screenshotKey FROM support_tickets WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).first<{id:string;category:string;question:string;screenshotKey?:string}>(); if (!ticket) return fail(c, 404, 'TICKET_NOT_FOUND', 'Обращение не найдено.'); await c.env.DB.prepare("UPDATE support_tickets SET status = 'open', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), ticket.id).run(); await notifyOwner(c.env, c.env.DB, ticket.id, ticket.category, ticket.question ?? '', ticket.screenshotKey); return ok(c, { escalated: true }); });
supportRoutes.post('/tickets/:id/close', async (c) => { const user = userOf(c); if (!user) return fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.'); const result = await c.env.DB.prepare("UPDATE support_tickets SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status != 'closed'").bind(new Date().toISOString(), new Date().toISOString(), c.req.param('id'), user.id).run(); if (!result.meta.changes) return fail(c, 404, 'TICKET_NOT_FOUND', 'Обращение не найдено.'); return ok(c, { closed: true }); });
