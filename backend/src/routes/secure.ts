import { Hono } from 'hono';
import { fail, ok } from '../lib/responses';
import type { AppVariables, Env } from '../types';
import { z } from 'zod';

export const secureRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
const PROFILE_TITLES: Record<string, string> = { auto: '⚡ Автоподбор', nl: '🇳🇱 Нидерланды', de: '🇩🇪 Германия', 'white-nl': '🇳🇱 Белый список', 'white-ru': '🇷🇺 Белый список' };
const TEST_SUBSCRIPTION_TITLE = 'Tyson Secure Test';
const TEST_SUBSCRIPTION_EXPIRES_AT = '1798761600'; // 1 January 2027, 00:00 UTC
const SECURE_PLANS = { day: { cost: 5, days: 1, label: 'На 1 день' }, week: { cost: 20, days: 7, label: 'На 7 дней' }, month: { cost: 80, days: 30, label: 'На 30 дней' } } as const;
const securePlanSchema = z.object({ plan: z.enum(['day', 'week', 'month']) }).strict();

function requireUser(c: Parameters<typeof fail>[0]) {
  const user = c.get('authUser');
  if (!user) return { error: fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.') };
  if (user.status === 'limited') return { error: fail(c, 403, 'ACCOUNT_LIMITED', 'This account is currently limited.') };
  return { user };
}

function secureConfigs(env: Env) {
  return [
    env.SECURE_CONFIG_AUTO ?? env.SECURE_TEST_CONFIG_AUTO,
    env.SECURE_CONFIG_NL ?? env.SECURE_TEST_CONFIG_NL,
    env.SECURE_CONFIG_DE ?? env.SECURE_TEST_CONFIG_DE,
    env.SECURE_CONFIG_WHITE_NL ?? env.SECURE_TEST_CONFIG_WHITE_NL,
    env.SECURE_CONFIG_WHITE_RU ?? env.SECURE_TEST_CONFIG_WHITE_RU,
  ];
}

function secureHeaders(expiresAt: string, catalogUrl: string) {
  return {
    'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="tyson-secure-subscription.json"', 'cache-control': 'no-store',
    'profile-title': 'Tyson Secure', 'subscription-name': 'Tyson Secure',
    'subscription-userinfo': `upload=0; download=0; total=0; expire=${Math.floor(new Date(expiresAt).getTime() / 1_000)}`,
    'profile-update-interval': '1', 'sub-info-text': 'If a profile does not work, update the subscription. White-list bypass is not guaranteed.',
    'sub-info-button-text': 'Tyson Secure', 'sub-info-button-link': catalogUrl,
    'color-profile': '{"light":{"primary":"#007AFF","secondary":"#5E5CE6","background":"#F3F7FF"},"dark":{"primary":"#0A84FF","secondary":"#BF5AF2","background":"#101521"}}',
  };
}

function namedConfig(raw: string, profile: string): Record<string, unknown> {
  const config = JSON.parse(raw) as { outbounds?: Array<{ tag?: string; protocol?: string }>; routing?: { balancers?: Array<{ selector?: string[]; fallbackTag?: string }> }; observatory?: { subjectSelector?: string[] }; remarks?: string };
  const title = PROFILE_TITLES[profile] ?? profile;
  const firstProxy = config.outbounds?.find((outbound) => outbound.protocol === 'vless');
  const previousTag = firstProxy?.tag;
  if (firstProxy && previousTag) {
    firstProxy.tag = title;
    for (const balancer of config.routing?.balancers ?? []) {
      if (balancer.selector) balancer.selector = balancer.selector.map((tag) => tag === previousTag ? title : tag);
      if (balancer.fallbackTag === previousTag) balancer.fallbackTag = title;
    }
    if (config.observatory?.subjectSelector) config.observatory.subjectSelector = config.observatory.subjectSelector.map((tag) => tag === previousTag ? title : tag);
  }
  config.remarks = title;
  return config as Record<string, unknown>;
}

secureRoutes.get('/', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const subscription = await c.env.DB.prepare('SELECT expires_at AS expiresAt FROM secure_subscriptions WHERE user_id = ?').bind(auth.user.id).first<{ expiresAt: string }>();
  const active = Boolean(subscription && subscription.expiresAt > new Date().toISOString());
  return ok(c, { active, expiresAt: active ? subscription?.expiresAt ?? null : null, plans: SECURE_PLANS });
});

secureRoutes.post('/purchase', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  let input: z.infer<typeof securePlanSchema>;
  try { input = securePlanSchema.parse(await c.req.json()); } catch { return fail(c, 422, 'VALIDATION_ERROR', 'Invalid Secure plan.'); }
  const plan = SECURE_PLANS[input.plan]; const now = new Date(); const timestamp = now.toISOString();
  const current = await c.env.DB.prepare('SELECT expires_at AS expiresAt FROM secure_subscriptions WHERE user_id = ?').bind(auth.user.id).first<{ expiresAt: string }>();
  const startsAt = current?.expiresAt && current.expiresAt > timestamp ? new Date(current.expiresAt) : now;
  const expiresAt = new Date(startsAt.getTime() + plan.days * 86_400_000).toISOString(); const transactionId = crypto.randomUUID();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at) SELECT ?, ?, ?, 'debit', 'tyson_secure', ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND diamond_balance >= ?)`)
      .bind(transactionId, auth.user.id, -plan.cost, input.plan, timestamp, auth.user.id, plan.cost),
    c.env.DB.prepare('UPDATE users SET diamond_balance = diamond_balance - ? WHERE id = ? AND EXISTS (SELECT 1 FROM diamond_transactions WHERE id = ?)').bind(plan.cost, auth.user.id, transactionId),
    c.env.DB.prepare(`INSERT INTO secure_subscriptions (user_id, expires_at, updated_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM diamond_transactions WHERE id = ?) ON CONFLICT(user_id) DO UPDATE SET expires_at = excluded.expires_at, updated_at = excluded.updated_at`)
      .bind(auth.user.id, expiresAt, timestamp, transactionId),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'INSUFFICIENT_DIAMONDS', 'Not enough diamonds.');
  const balance = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(auth.user.id).first<{ balance: number }>();
  return ok(c, { active: true, expiresAt, balance: balance?.balance ?? 0, plan: input.plan });
});

secureRoutes.post('/access-link', async (c) => {
  const auth = requireUser(c); if ('error' in auth) return auth.error;
  const subscription = await c.env.DB.prepare('SELECT expires_at AS expiresAt FROM secure_subscriptions WHERE user_id = ?').bind(auth.user.id).first<{ expiresAt: string }>();
  if (!subscription || subscription.expiresAt <= new Date().toISOString()) return fail(c, 403, 'SECURE_SUBSCRIPTION_REQUIRED', 'An active Tyson Secure subscription is required.');
  let access = await c.env.DB.prepare('SELECT token FROM secure_access_tokens WHERE user_id = ?').bind(auth.user.id).first<{ token: string }>();
  if (!access) {
    const token = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO secure_access_tokens (user_id, token, created_at) VALUES (?, ?, ?)').bind(auth.user.id, token, new Date().toISOString()).run();
    access = { token };
  }
  const base = new URL(c.req.url).origin;
  return ok(c, { url: `${base}/api/secure/subscription/${access.token}`, expiresAt: subscription.expiresAt });
});

secureRoutes.get('/subscription/:token', async (c) => {
  const access = await c.env.DB.prepare(`SELECT s.expires_at AS expiresAt FROM secure_access_tokens t JOIN secure_subscriptions s ON s.user_id = t.user_id WHERE t.token = ?`)
    .bind(c.req.param('token')).first<{ expiresAt: string }>();
  if (!access || access.expiresAt <= new Date().toISOString()) return fail(c, 404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
  const configs = secureConfigs(c.env); if (configs.some((config) => !config)) return fail(c, 500, 'CONFIG_UNAVAILABLE', 'Secure configuration is unavailable.');
  try {
    const profiles = ['auto', 'nl', 'de', 'white-nl', 'white-ru']; const base = new URL(c.req.url).origin;
    return new Response(JSON.stringify(configs.map((config, index) => namedConfig(config!, profiles[index] ?? 'auto'))), { headers: secureHeaders(access.expiresAt, `${base}/secure`) });
  } catch { return fail(c, 500, 'CONFIG_UNAVAILABLE', 'Secure configuration is unavailable.'); }
});

secureRoutes.get('/test-config/:token', (c) => {
  if (!c.env.SECURE_TEST_TOKEN || !c.env.SECURE_TEST_CONFIG || c.req.param('token') !== c.env.SECURE_TEST_TOKEN) {
    return fail(c, 404, 'CONFIG_NOT_FOUND', 'Test configuration not found.');
  }
  return new Response(c.env.SECURE_TEST_CONFIG, { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="tyson-secure-auto-test.json"', 'cache-control': 'no-store' } });
});

secureRoutes.get('/test-config/:token/:profile', (c) => {
  if (!c.env.SECURE_TEST_TOKEN || c.req.param('token') !== c.env.SECURE_TEST_TOKEN) return fail(c, 404, 'CONFIG_NOT_FOUND', 'Test configuration not found.');
  const configs: Record<string, string | undefined> = { auto: c.env.SECURE_TEST_CONFIG_AUTO, nl: c.env.SECURE_TEST_CONFIG_NL, de: c.env.SECURE_TEST_CONFIG_DE, 'white-nl': c.env.SECURE_TEST_CONFIG_WHITE_NL, 'white-ru': c.env.SECURE_TEST_CONFIG_WHITE_RU };
  const profile = c.req.param('profile'); const config = configs[profile];
  if (!config) return fail(c, 404, 'CONFIG_NOT_FOUND', 'Test configuration not found.');
  return new Response(JSON.stringify(namedConfig(config, profile)), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="tyson-secure-${profile}-test.json"`, 'cache-control': 'no-store' } });
});

secureRoutes.get('/test-subscription/:token', (c) => {
  if (!c.env.SECURE_TEST_TOKEN || c.req.param('token') !== c.env.SECURE_TEST_TOKEN) return fail(c, 404, 'CONFIG_NOT_FOUND', 'Test configuration not found.');
  const configs = [c.env.SECURE_TEST_CONFIG_AUTO, c.env.SECURE_TEST_CONFIG_NL, c.env.SECURE_TEST_CONFIG_DE, c.env.SECURE_TEST_CONFIG_WHITE_NL, c.env.SECURE_TEST_CONFIG_WHITE_RU];
  if (configs.some((config) => !config)) return fail(c, 500, 'CONFIG_UNAVAILABLE', 'Test configuration is unavailable.');
  try {
    const profiles = ['auto', 'nl', 'de', 'white-nl', 'white-ru'];
    const base = new URL(c.req.url).origin; const token = encodeURIComponent(c.req.param('token'));
    return new Response(JSON.stringify(configs.map((config, index) => namedConfig(config!, profiles[index] ?? 'auto'))), { headers: {
      'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="tyson-secure-test-subscription.json"', 'cache-control': 'no-store',
      'profile-title': TEST_SUBSCRIPTION_TITLE, 'subscription-name': TEST_SUBSCRIPTION_TITLE,
      'subscription-userinfo': `upload=0; download=0; total=0; expire=${TEST_SUBSCRIPTION_EXPIRES_AT}`,
      'profile-update-interval': '1', 'sub-info-text': 'If a profile does not work, update the subscription. White-list bypass is not guaranteed.',
      'sub-info-button-text': 'Open catalog', 'sub-info-button-link': `${base}/api/secure/test/${token}`,
      'color-profile': '{"light":{"primary":"#007AFF","secondary":"#5E5CE6","background":"#F3F7FF"},"dark":{"primary":"#0A84FF","secondary":"#BF5AF2","background":"#101521"}}',
    } });
  } catch { return fail(c, 500, 'CONFIG_UNAVAILABLE', 'Test configuration is unavailable.'); }
});

secureRoutes.get('/test/:token', (c) => {
  if (!c.env.SECURE_TEST_TOKEN || c.req.param('token') !== c.env.SECURE_TEST_TOKEN) return fail(c, 404, 'CONFIG_NOT_FOUND', 'Test configuration not found.');
  const base = new URL(c.req.url).origin; const token = encodeURIComponent(c.req.param('token'));
  const subscriptionUrl = `${base}/api/secure/test-subscription/${token}`;
  const cards = [
    ['⚡', 'Автоподбор', 'Обычный VPN · Нидерланды + Германия', 'auto'],
    ['🇳🇱', 'Нидерланды', 'Обычный VPN', 'nl'],
    ['🇩🇪', 'Германия', 'Обычный VPN', 'de'],
    ['🇳🇱', 'Нидерланды', 'Белый список · автоподбор серверов', 'white-nl'],
    ['🇷🇺', 'Россия', 'Белый список · автоподбор серверов', 'white-ru'],
  ].map(([flag, title, description, profile]) => `<a class="card" href="${base}/api/secure/test-config/${token}/${profile}"><b>${flag}</b><span><strong>${title}</strong><small>${description}</small></span><em>Скачать JSON →</em></a>`).join('');
  return c.html(`<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tyson Secure — тест</title><style>body{margin:0;background:linear-gradient(145deg,#edf6ff,#f7f2ff);color:#142b38;font:16px system-ui;padding:28px}.shell{max-width:560px;margin:auto}.tag{color:#0878d1;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.12em}h1{margin:7px 0}p{color:#607887;line-height:1.5}.hero{padding:22px;border-radius:24px;background:linear-gradient(135deg,#087fe8,#6456dc);color:white;box-shadow:0 14px 32px #2358a438}.hero p{margin:8px 0 0;color:#e9f5ff}.expiry{display:inline-block;margin-top:15px;padding:7px 10px;border-radius:999px;background:#ffffff24;font-size:13px;font-weight:700}.subscription{display:block;margin:14px 0 18px;padding:15px 18px;border-radius:18px;background:#fff;color:#0878d1;text-align:center;text-decoration:none;font-weight:800;box-shadow:0 6px 20px #18384a12}.subscription small{display:block;margin-top:3px;color:#607887;font-weight:500}.card{display:flex;align-items:center;gap:14px;margin:10px 0;padding:16px;border:1px solid #d8e5eb;border-radius:18px;background:white;color:inherit;text-decoration:none;box-shadow:0 4px 18px #18384a0b}.card>b{font-size:27px}.card span{display:grid;gap:3px;flex:1}.card small{color:#607887;font-size:12px}.card em{color:#0878d1;font-size:12px;font-style:normal;font-weight:800}.note{margin-top:20px;padding:13px;border-radius:13px;background:#e4f5ff;color:#27627f;font-size:12px;line-height:1.45}</style><main class="shell"><span class="tag">Tyson Secure · тест</span><section class="hero"><h1>Secure Test</h1><p>Пять профилей в одной подписке: обычный VPN, автоподбор и белые списки.</p><span class="expiry">Действует до 1 января 2027</span></section><a class="subscription" href="${subscriptionUrl}">✦ Загрузить всю подписку<small>Название и срок появятся в приложении</small></a><p>Или скачайте отдельную конфигурацию. Белые списки не входят в обычный автоподбор.</p>${cards}<p class="note"><b>Если профиль не работает:</b> обновите подписку в приложении и попробуйте другую локацию.<br><br><b>Важно:</b> обход белых списков не гарантируется — невозможно обеспечить стопроцентный обход ограничений.</p><p class="note">Тестовые конфигурации. Не пересылайте страницу или файлы другим людям.</p></main></html>`);
});
