import { Hono } from 'hono';
import { fail } from '../lib/responses';
import type { AppVariables, Env } from '../types';

export const secureRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
const PROFILE_TITLES: Record<string, string> = { auto: '⚡ Автоподбор', nl: '🇳🇱 Нидерланды', de: '🇩🇪 Германия', 'white-nl': '🇳🇱 Белый список', 'white-ru': '🇷🇺 Белый список' };
const TEST_SUBSCRIPTION_TITLE = 'Tyson Secure Test';
const TEST_SUBSCRIPTION_EXPIRES_AT = '1798761600'; // 1 January 2027, 00:00 UTC

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
