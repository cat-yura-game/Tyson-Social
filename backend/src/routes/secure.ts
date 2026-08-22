import { Hono } from 'hono';
import { fail } from '../lib/responses';
import type { AppVariables, Env } from '../types';

export const secureRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

secureRoutes.get('/test-config/:token', (c) => {
  if (!c.env.SECURE_TEST_TOKEN || !c.env.SECURE_TEST_CONFIG || c.req.param('token') !== c.env.SECURE_TEST_TOKEN) {
    return fail(c, 404, 'CONFIG_NOT_FOUND', 'Test configuration not found.');
  }
  return new Response(c.env.SECURE_TEST_CONFIG, { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="tyson-secure-auto-test.json"', 'cache-control': 'no-store' } });
});

secureRoutes.get('/test-config/:token/:profile', (c) => {
  if (!c.env.SECURE_TEST_TOKEN || c.req.param('token') !== c.env.SECURE_TEST_TOKEN) return fail(c, 404, 'CONFIG_NOT_FOUND', 'Test configuration not found.');
  const configs: Record<string, string | undefined> = { auto: c.env.SECURE_TEST_CONFIG_AUTO, nl: c.env.SECURE_TEST_CONFIG_NL, de: c.env.SECURE_TEST_CONFIG_DE, 'white-nl': c.env.SECURE_TEST_CONFIG_WHITE_NL, 'white-ru': c.env.SECURE_TEST_CONFIG_WHITE_RU };
  const config = configs[c.req.param('profile')];
  if (!config) return fail(c, 404, 'CONFIG_NOT_FOUND', 'Test configuration not found.');
  return new Response(config, { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="tyson-secure-${c.req.param('profile')}-test.json"`, 'cache-control': 'no-store' } });
});

secureRoutes.get('/test/:token', (c) => {
  if (!c.env.SECURE_TEST_TOKEN || c.req.param('token') !== c.env.SECURE_TEST_TOKEN) return fail(c, 404, 'CONFIG_NOT_FOUND', 'Test configuration not found.');
  const base = new URL(c.req.url).origin; const token = encodeURIComponent(c.req.param('token'));
  const cards = [
    ['⚡', 'Автоподбор', 'Обычный VPN · Нидерланды + Германия', 'auto'],
    ['🇳🇱', 'Нидерланды', 'Обычный VPN', 'nl'],
    ['🇩🇪', 'Германия', 'Обычный VPN', 'de'],
    ['🇳🇱', 'Нидерланды', 'Белый список · автоподбор серверов', 'white-nl'],
    ['🇷🇺', 'Россия', 'Белый список · автоподбор серверов', 'white-ru'],
  ].map(([flag, title, description, profile]) => `<a class="card" href="${base}/api/secure/test-config/${token}/${profile}"><b>${flag}</b><span><strong>${title}</strong><small>${description}</small></span><em>Скачать JSON →</em></a>`).join('');
  return c.html(`<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tyson Secure — тест</title><style>body{margin:0;background:#f3f7f9;color:#142b38;font:16px system-ui;padding:28px}.shell{max-width:560px;margin:auto}.tag{color:#078fdc;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.12em}h1{margin:7px 0}p{color:#607887;line-height:1.5}.card{display:flex;align-items:center;gap:14px;margin:10px 0;padding:16px;border:1px solid #d8e5eb;border-radius:18px;background:white;color:inherit;text-decoration:none;box-shadow:0 4px 18px #18384a0b}.card>b{font-size:27px}.card span{display:grid;gap:3px;flex:1}.card small{color:#607887;font-size:12px}.card em{color:#0878d1;font-size:12px;font-style:normal;font-weight:800}.note{margin-top:20px;padding:13px;border-radius:13px;background:#e4f5ff;color:#27627f;font-size:12px;line-height:1.45}</style><main class="shell"><span class="tag">Tyson Secure · тест</span><h1>Выберите конфигурацию</h1><p>Откройте JSON в Happ или INCY. Белые списки вынесены отдельно и не входят в обычный автоподбор.</p>${cards}<p class="note">Тестовые конфигурации. Не пересылайте страницу или файлы другим людям.</p></main></html>`);
});
