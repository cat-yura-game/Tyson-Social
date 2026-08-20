import { Hono } from 'hono';
import { fail, ok } from '../lib/responses';
import type { AppVariables, AuthUser, Env } from '../types';
import { selectCollectibleVariant } from '../services/gift-variants';

type App = { Bindings: Env; Variables: AppVariables };
export const giftRoutes = new Hono<App>();

type GiftType = { id: string; slug: string; title: string; basePrice: number; upgradePrice: number; maxSupply: number; soldCount: number; baseImage: string; collectibleVariantsJson: string; active: number };
type UserGift = { id: string; giftTypeId: string; serialNumber: number; variant: string | null; isCollectible: number; purchasedAt: string; upgradedAt: string | null; title: string; maxSupply: number; baseImage: string; collectibleVariantsJson: string; upgradePrice: number };

function requireUser(c: Parameters<typeof fail>[0]): AuthUser | Response { return c.get('authUser') ?? fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.'); }
function variants(raw: string): string[] { try { const parsed = JSON.parse(raw); return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : []; } catch { return []; } }
function typeDto(row: GiftType) { return { id: row.id, slug: row.slug, title: row.title, basePrice: row.basePrice, upgradePrice: row.upgradePrice, maxSupply: row.maxSupply, soldCount: row.soldCount, remaining: Math.max(0, row.maxSupply - row.soldCount), baseImage: row.baseImage, active: row.active === 1 }; }
function giftDto(row: UserGift) { const collectibleVariants = variants(row.collectibleVariantsJson); return { id: row.id, giftTypeId: row.giftTypeId, title: row.title, serialNumber: row.serialNumber, maxSupply: row.maxSupply, isCollectible: row.isCollectible === 1, variant: row.variant, image: row.variant ?? row.baseImage, purchasedAt: row.purchasedAt, upgradedAt: row.upgradedAt, upgradePrice: row.upgradePrice, collectibleVariantNumber: row.variant ? collectibleVariants.indexOf(row.variant) + 1 : null }; }

giftRoutes.get('/diamonds/balance', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const row = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(user.id).first<{ balance: number }>();
  return ok(c, { balance: row?.balance ?? 0 });
});

giftRoutes.get('/gifts', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT id, slug, title, base_price AS basePrice, upgrade_price AS upgradePrice, max_supply AS maxSupply,
    sold_count AS soldCount, base_image AS baseImage, collectible_variants_json AS collectibleVariantsJson, active FROM gift_types WHERE active = 1 ORDER BY title`).all<GiftType>();
  return ok(c, { gifts: rows.results.map(typeDto) });
});

giftRoutes.get('/users/me/gifts', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const rows = await c.env.DB.prepare(`SELECT ug.id, ug.gift_type_id AS giftTypeId, ug.serial_number AS serialNumber, ug.variant,
    ug.is_collectible AS isCollectible, ug.purchased_at AS purchasedAt, ug.upgraded_at AS upgradedAt, gt.title, gt.max_supply AS maxSupply,
    gt.base_image AS baseImage, gt.collectible_variants_json AS collectibleVariantsJson, gt.upgrade_price AS upgradePrice
    FROM user_gifts ug JOIN gift_types gt ON gt.id = ug.gift_type_id WHERE ug.owner_user_id = ? ORDER BY ug.purchased_at DESC`).bind(user.id).all<UserGift>();
  return ok(c, { gifts: rows.results.map(giftDto) });
});

giftRoutes.post('/gifts/:giftId/buy', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const giftTypeId = c.req.param('giftId');
  const type = await c.env.DB.prepare(`SELECT id, slug, title, base_price AS basePrice, upgrade_price AS upgradePrice, max_supply AS maxSupply,
    sold_count AS soldCount, base_image AS baseImage, collectible_variants_json AS collectibleVariantsJson, active FROM gift_types WHERE id = ?`).bind(giftTypeId).first<GiftType>();
  if (!type || type.active !== 1) return fail(c, 404, 'GIFT_NOT_FOUND', 'Gift not found.');
  if (type.soldCount >= type.maxSupply) return fail(c, 409, 'SOLD_OUT', 'This gift is sold out.');
  const giftId = crypto.randomUUID(); const now = new Date().toISOString();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO user_gifts (id, owner_user_id, gift_type_id, serial_number, purchased_at, created_at)
      SELECT ?, ?, g.id, g.sold_count + 1, ?, ? FROM gift_types g JOIN users u ON u.id = ?
      WHERE g.id = ? AND g.active = 1 AND g.sold_count < g.max_supply AND u.diamond_balance >= g.base_price`).bind(giftId, user.id, now, now, user.id, giftTypeId),
    c.env.DB.prepare(`UPDATE gift_types SET sold_count = sold_count + 1 WHERE id = ? AND EXISTS (SELECT 1 FROM user_gifts WHERE id = ?)`).bind(giftTypeId, giftId),
    c.env.DB.prepare(`UPDATE users SET diamond_balance = diamond_balance - (SELECT base_price FROM gift_types WHERE id = ?)
      WHERE id = ? AND EXISTS (SELECT 1 FROM user_gifts WHERE id = ?)`).bind(giftTypeId, user.id, giftId),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, -base_price, 'debit', 'gift_purchase', ?, ? FROM gift_types WHERE id = ? AND EXISTS (SELECT 1 FROM user_gifts WHERE id = ?)`)
      .bind(crypto.randomUUID(), user.id, giftId, now, giftTypeId, giftId),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) {
    const state = await c.env.DB.prepare('SELECT sold_count AS soldCount, max_supply AS maxSupply FROM gift_types WHERE id = ?').bind(giftTypeId).first<{ soldCount: number; maxSupply: number }>();
    if (state && state.soldCount >= state.maxSupply) return fail(c, 409, 'SOLD_OUT', 'This gift is sold out.');
    return fail(c, 409, 'INSUFFICIENT_DIAMONDS', 'Not enough diamonds.');
  }
  const gift = await c.env.DB.prepare(`SELECT ug.id, ug.gift_type_id AS giftTypeId, ug.serial_number AS serialNumber, ug.variant,
    ug.is_collectible AS isCollectible, ug.purchased_at AS purchasedAt, ug.upgraded_at AS upgradedAt, gt.title, gt.max_supply AS maxSupply,
    gt.base_image AS baseImage, gt.collectible_variants_json AS collectibleVariantsJson, gt.upgrade_price AS upgradePrice FROM user_gifts ug JOIN gift_types gt ON gt.id = ug.gift_type_id WHERE ug.id = ?`).bind(giftId).first<UserGift>();
  const balance = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(user.id).first<{ balance: number }>();
  return ok(c, { gift: gift ? giftDto(gift) : null, balance: balance?.balance ?? 0 }, 201);
});

giftRoutes.post('/user-gifts/:id/upgrade', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const id = c.req.param('id');
  const gift = await c.env.DB.prepare(`SELECT ug.id, ug.gift_type_id AS giftTypeId, ug.serial_number AS serialNumber, ug.variant, ug.is_collectible AS isCollectible,
    ug.purchased_at AS purchasedAt, ug.upgraded_at AS upgradedAt, gt.title, gt.max_supply AS maxSupply, gt.base_image AS baseImage, gt.collectible_variants_json AS collectibleVariantsJson,
    gt.upgrade_price AS upgradePrice FROM user_gifts ug JOIN gift_types gt ON gt.id = ug.gift_type_id WHERE ug.id = ? AND ug.owner_user_id = ?`).bind(id, user.id).first<UserGift & { upgradePrice: number }>();
  if (!gift) return fail(c, 404, 'GIFT_NOT_FOUND', 'Gift not found.');
  if (gift.isCollectible === 1) return fail(c, 409, 'ALREADY_COLLECTIBLE', 'Gift is already collectible.');
  const options = variants(gift.collectibleVariantsJson); if (!options.length) return fail(c, 500, 'GIFT_VARIANTS_UNAVAILABLE', 'Collectible variants are unavailable.');
  const variant = selectCollectibleVariant(options); const now = new Date().toISOString();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE user_gifts SET is_collectible = 1, variant = ?, upgraded_at = ? WHERE id = ? AND owner_user_id = ? AND is_collectible = 0
      AND EXISTS (SELECT 1 FROM users WHERE id = ? AND diamond_balance >= ? )`).bind(variant, now, id, user.id, user.id, gift.upgradePrice),
    c.env.DB.prepare(`UPDATE users SET diamond_balance = diamond_balance - ? WHERE id = ? AND EXISTS (SELECT 1 FROM user_gifts WHERE id = ? AND upgraded_at = ?)`)
      .bind(gift.upgradePrice, user.id, id, now),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, ?, 'debit', 'gift_upgrade', ?, ? WHERE EXISTS (SELECT 1 FROM user_gifts WHERE id = ? AND upgraded_at = ?)`)
      .bind(crypto.randomUUID(), user.id, -gift.upgradePrice, id, now, id, now),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'INSUFFICIENT_DIAMONDS', 'Not enough diamonds or gift is already upgraded.');
  const balance = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(user.id).first<{ balance: number }>();
  return ok(c, { gift: giftDto({ ...gift, isCollectible: 1, variant, upgradedAt: now }), balance: balance?.balance ?? 0 });
});
