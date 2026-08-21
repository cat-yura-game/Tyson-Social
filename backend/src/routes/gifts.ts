import { Hono } from 'hono';
import { fail, ok } from '../lib/responses';
import type { AppVariables, AuthUser, Env } from '../types';
import { selectCollectibleVariant } from '../services/gift-variants';
import { DAILY_TASKS, utcTaskDay, type DailyTaskKey } from '../services/daily-tasks';

type App = { Bindings: Env; Variables: AppVariables };
export const giftRoutes = new Hono<App>();

type GiftType = { id: string; slug: string; title: string; basePrice: number; upgradePrice: number; maxSupply: number; soldCount: number; baseImage: string; collectibleVariantsJson: string; isLimited: number; isUnlimited: number; canUpgrade: number; canTransfer: number; canWear: number; exchangeReward: number; exchangeWindowDays: number | null; active: number };
type UserGift = { id: string; giftTypeId: string; serialNumber: number; variant: string | null; inscription: string | null; isCollectible: number; accentColor: string; isPublic: number; worn: number; activeListingId: string | null; purchasedAt: string; upgradedAt: string | null; title: string; basePrice: number; maxSupply: number; baseImage: string; collectibleVariantsJson: string; upgradePrice: number; isLimited: number; isUnlimited: number; canUpgrade: number; canTransfer: number; canWear: number; exchangeReward: number; exchangeWindowDays: number | null };
type MarketListing = UserGift & { listingId: string; price: number; sellerUsername: string; sellerDisplayName: string; sellerAvatarKey: string | null };
type PublicCollectible = UserGift & { ownerUsername: string; ownerDisplayName: string; ownerAvatarKey: string | null };

function requireUser(c: Parameters<typeof fail>[0]): AuthUser | Response { return c.get('authUser') ?? fail(c, 401, 'AUTH_REQUIRED', 'Authentication is required.'); }
function variants(raw: string): string[] { try { const parsed = JSON.parse(raw); return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : []; } catch { return []; } }
function typeDto(row: GiftType) { return { id: row.id, slug: row.slug, title: row.title, basePrice: row.basePrice, upgradePrice: row.upgradePrice, maxSupply: row.maxSupply, soldCount: row.soldCount, remaining: Math.max(0, row.maxSupply - row.soldCount), baseImage: row.baseImage, isLimited: row.isLimited === 1, isUnlimited: row.isUnlimited === 1, canUpgrade: row.canUpgrade === 1, canTransfer: row.canTransfer === 1, canWear: row.canWear === 1, exchangeReward: row.exchangeReward, exchangeWindowDays: row.exchangeWindowDays, active: row.active === 1 }; }
function giftDto(row: UserGift) { const collectibleVariants = variants(row.collectibleVariantsJson); return { id: row.id, giftTypeId: row.giftTypeId, title: row.title, serialNumber: row.serialNumber, maxSupply: row.maxSupply, basePrice: row.basePrice, inscription: row.inscription ?? null, isCollectible: row.isCollectible === 1, accentColor: row.accentColor ?? '#111111', isPublic: row.isPublic === 1, worn: row.worn === 1, activeListingId: row.activeListingId ?? null, variant: row.variant, image: row.variant ?? row.baseImage, purchasedAt: row.purchasedAt, upgradedAt: row.upgradedAt, upgradePrice: row.upgradePrice, isLimited: row.isLimited === 1, isUnlimited: row.isUnlimited === 1, canUpgrade: row.canUpgrade === 1, canTransfer: row.canTransfer === 1, canWear: row.canWear === 1, exchangeReward: row.exchangeReward, exchangeWindowDays: row.exchangeWindowDays, collectibleVariants, collectibleVariantNumber: row.variant ? collectibleVariants.indexOf(row.variant) + 1 : null }; }
function listingDto(row: MarketListing) { return { id: row.listingId, price: row.price, gift: giftDto(row), seller: { username: row.sellerUsername, displayName: row.sellerDisplayName, avatarKey: row.sellerAvatarKey } }; }
const giftColors = ['#22b8ff', '#9d72ff', '#ff5d91', '#ffad31', '#25c98b'];

giftRoutes.get('/diamonds/balance', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const row = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(user.id).first<{ balance: number }>();
  return ok(c, { balance: row?.balance ?? 0 });
});

giftRoutes.get('/diamonds/tasks', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const day = utcTaskDay();
  const [completed, rewarded, telegram, permanentRewards] = await Promise.all([
    c.env.DB.prepare('SELECT task_key AS taskKey FROM daily_task_completions WHERE user_id = ? AND task_day = ?').bind(user.id, day).all<{ taskKey: DailyTaskKey }>(),
    c.env.DB.prepare('SELECT task_key AS taskKey FROM daily_task_rewards WHERE user_id = ? AND task_day = ?').bind(user.id, day).all<{ taskKey: DailyTaskKey }>(),
    c.env.DB.prepare('SELECT 1 FROM telegram_identities WHERE user_id = ?').bind(user.id).first(),
    c.env.DB.prepare('SELECT task_key AS taskKey FROM permanent_task_rewards WHERE user_id = ?').bind(user.id).all<{ taskKey: string }>(),
  ]);
  const complete = new Set(completed.results.map((row) => row.taskKey)); const claimed = new Set(rewarded.results.map((row) => row.taskKey));
  const permanentClaimed = new Set(permanentRewards.results.map((row) => row.taskKey));
  return ok(c, { day, tasks: DAILY_TASKS.map((key) => ({ key, completed: complete.has(key), claimed: claimed.has(key), reward: 1 })), permanentTasks: [{ key: 'telegram_link', completed: Boolean(telegram), claimed: permanentClaimed.has('telegram_link'), reward: 50 }] });
});

giftRoutes.post('/diamonds/tasks/:taskKey/claim', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const taskKey = c.req.param('taskKey');
  if (taskKey === 'telegram_link') {
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    const result = await c.env.DB.batch([
      c.env.DB.prepare(`INSERT OR IGNORE INTO permanent_task_rewards (id, user_id, task_key, created_at)
        SELECT ?, ?, 'telegram_link', ? WHERE EXISTS (SELECT 1 FROM telegram_identities WHERE user_id = ?)`)
        .bind(id, user.id, now, user.id),
      c.env.DB.prepare('UPDATE users SET diamond_balance = diamond_balance + 50 WHERE id = ? AND EXISTS (SELECT 1 FROM permanent_task_rewards WHERE id = ?)').bind(user.id, id),
      c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
        SELECT ?, ?, 50, 'credit', 'permanent_task_reward', 'telegram_link', ? WHERE EXISTS (SELECT 1 FROM permanent_task_rewards WHERE id = ?)`)
        .bind(crypto.randomUUID(), user.id, now, id),
    ]);
    if ((result[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'TASK_NOT_READY', 'Telegram is not linked or reward was already claimed.');
    const balance = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(user.id).first<{ balance: number }>();
    return ok(c, { taskKey, reward: 50, balance: balance?.balance ?? 0 });
  }
  if (!DAILY_TASKS.includes(taskKey as DailyTaskKey)) return fail(c, 404, 'TASK_NOT_FOUND', 'Task not found.');
  const dailyTaskKey = taskKey as DailyTaskKey;
  const day = utcTaskDay(); const id = crypto.randomUUID(); const now = new Date().toISOString();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT OR IGNORE INTO daily_task_rewards (id, user_id, task_key, task_day, created_at)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM daily_task_completions WHERE user_id = ? AND task_key = ? AND task_day = ?)`)
      .bind(id, user.id, dailyTaskKey, day, now, user.id, dailyTaskKey, day),
    c.env.DB.prepare('UPDATE users SET diamond_balance = diamond_balance + 1 WHERE id = ? AND EXISTS (SELECT 1 FROM daily_task_rewards WHERE id = ?)').bind(user.id, id),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, 1, 'credit', 'daily_task_reward', ?, ? WHERE EXISTS (SELECT 1 FROM daily_task_rewards WHERE id = ?)`)
      .bind(crypto.randomUUID(), user.id, dailyTaskKey, now, id),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'TASK_NOT_READY', 'Task is not completed or reward was already claimed.');
  const balance = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(user.id).first<{ balance: number }>();
  return ok(c, { taskKey: dailyTaskKey, reward: 1, balance: balance?.balance ?? 0 });
});

giftRoutes.get('/gifts', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT id, slug, title, base_price AS basePrice, upgrade_price AS upgradePrice, max_supply AS maxSupply,
    sold_count AS soldCount, base_image AS baseImage, collectible_variants_json AS collectibleVariantsJson, is_limited AS isLimited, is_unlimited AS isUnlimited, can_upgrade AS canUpgrade, can_transfer AS canTransfer, can_wear AS canWear, exchange_reward AS exchangeReward, exchange_window_days AS exchangeWindowDays, active FROM gift_types WHERE active = 1 ORDER BY title`).all<GiftType>();
  return ok(c, { gifts: rows.results.map(typeDto) });
});

giftRoutes.get('/users/me/gifts', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const rows = await c.env.DB.prepare(`SELECT ug.id, ug.gift_type_id AS giftTypeId, ug.serial_number AS serialNumber, ug.variant, ug.inscription, ug.accent_color AS accentColor,
    ug.is_collectible AS isCollectible, ug.is_public AS isPublic, CASE WHEN u.worn_gift_id = ug.id THEN 1 ELSE 0 END AS worn, ug.purchased_at AS purchasedAt, ug.upgraded_at AS upgradedAt, gt.title, gt.base_price AS basePrice, gt.max_supply AS maxSupply,
    gt.base_image AS baseImage, gt.collectible_variants_json AS collectibleVariantsJson, gt.upgrade_price AS upgradePrice, gt.is_limited AS isLimited, gt.is_unlimited AS isUnlimited, gt.can_upgrade AS canUpgrade, gt.can_transfer AS canTransfer, gt.can_wear AS canWear, gt.exchange_reward AS exchangeReward, gt.exchange_window_days AS exchangeWindowDays,
    (SELECT id FROM gift_market_listings ml WHERE ml.gift_id = ug.id AND ml.status = 'active') AS activeListingId
    FROM user_gifts ug JOIN gift_types gt ON gt.id = ug.gift_type_id JOIN users u ON u.id = ug.owner_user_id WHERE ug.owner_user_id = ? ORDER BY ug.purchased_at DESC`).bind(user.id).all<UserGift>();
  return ok(c, { gifts: rows.results.map(giftDto) });
});

giftRoutes.get('/users/:username/gifts', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT ug.id, ug.gift_type_id AS giftTypeId, ug.serial_number AS serialNumber, ug.variant, ug.inscription, ug.accent_color AS accentColor,
    ug.is_collectible AS isCollectible, ug.is_public AS isPublic, CASE WHEN u.worn_gift_id = ug.id THEN 1 ELSE 0 END AS worn, ug.purchased_at AS purchasedAt, ug.upgraded_at AS upgradedAt,
    gt.title, gt.base_price AS basePrice, gt.max_supply AS maxSupply, gt.base_image AS baseImage, gt.collectible_variants_json AS collectibleVariantsJson, gt.upgrade_price AS upgradePrice, gt.is_limited AS isLimited, gt.is_unlimited AS isUnlimited, gt.can_upgrade AS canUpgrade, gt.can_transfer AS canTransfer, gt.can_wear AS canWear, gt.exchange_reward AS exchangeReward, gt.exchange_window_days AS exchangeWindowDays, NULL AS activeListingId
    FROM users u JOIN user_gifts ug ON ug.owner_user_id = u.id JOIN gift_types gt ON gt.id = ug.gift_type_id
    WHERE u.username = ? AND ug.is_public = 1 ORDER BY worn DESC, ug.purchased_at DESC`).bind(c.req.param('username')).all<UserGift>();
  return ok(c, { gifts: rows.results.map(giftDto) });
});

giftRoutes.get('/gifts/collectibles/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT ug.id, ug.gift_type_id AS giftTypeId, ug.serial_number AS serialNumber, ug.variant, ug.inscription, ug.accent_color AS accentColor,
    ug.is_collectible AS isCollectible, ug.is_public AS isPublic, CASE WHEN u.worn_gift_id = ug.id THEN 1 ELSE 0 END AS worn, ug.purchased_at AS purchasedAt, ug.upgraded_at AS upgradedAt,
    gt.title, gt.base_price AS basePrice, gt.max_supply AS maxSupply, gt.base_image AS baseImage, gt.collectible_variants_json AS collectibleVariantsJson, gt.upgrade_price AS upgradePrice,
    gt.is_limited AS isLimited, gt.is_unlimited AS isUnlimited, gt.can_upgrade AS canUpgrade, gt.can_transfer AS canTransfer, gt.can_wear AS canWear, gt.exchange_reward AS exchangeReward,
    gt.exchange_window_days AS exchangeWindowDays, NULL AS activeListingId, u.username AS ownerUsername, u.display_name AS ownerDisplayName, u.avatar_key AS ownerAvatarKey
    FROM user_gifts ug JOIN gift_types gt ON gt.id = ug.gift_type_id JOIN users u ON u.id = ug.owner_user_id
    WHERE ug.id = ? AND ug.is_collectible = 1 AND ug.is_public = 1 AND u.status = 'active'`).bind(c.req.param('id')).first<PublicCollectible>();
  if (!row) return fail(c, 404, 'GIFT_NOT_FOUND', 'Collectible gift not found.');
  return ok(c, { gift: giftDto(row), owner: { username: row.ownerUsername, displayName: row.ownerDisplayName, avatarKey: row.ownerAvatarKey } });
});

giftRoutes.get('/gift-market', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT ml.id AS listingId, ml.price, ug.id, ug.gift_type_id AS giftTypeId, ug.serial_number AS serialNumber, ug.variant, ug.accent_color AS accentColor,
    ug.is_collectible AS isCollectible, ug.is_public AS isPublic, 0 AS worn, NULL AS activeListingId, ug.purchased_at AS purchasedAt, ug.upgraded_at AS upgradedAt, gt.title, gt.base_price AS basePrice, gt.max_supply AS maxSupply,
    gt.base_image AS baseImage, gt.collectible_variants_json AS collectibleVariantsJson, gt.upgrade_price AS upgradePrice, gt.is_limited AS isLimited, gt.is_unlimited AS isUnlimited, gt.can_upgrade AS canUpgrade, gt.can_transfer AS canTransfer, gt.can_wear AS canWear, gt.exchange_reward AS exchangeReward, gt.exchange_window_days AS exchangeWindowDays,
    u.username AS sellerUsername, u.display_name AS sellerDisplayName, u.avatar_key AS sellerAvatarKey
    FROM gift_market_listings ml JOIN user_gifts ug ON ug.id = ml.gift_id JOIN gift_types gt ON gt.id = ug.gift_type_id JOIN users u ON u.id = ml.seller_user_id
    WHERE ml.status = 'active' AND ug.owner_user_id = ml.seller_user_id ORDER BY ml.created_at DESC LIMIT 100`).all<MarketListing>();
  return ok(c, { listings: rows.results.map(listingDto) });
});

giftRoutes.post('/gifts/:giftId/buy', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  let recipientUsername = user.username;
  try { const body = await c.req.json<{ recipientUsername?: unknown }>(); if (body.recipientUsername !== undefined) recipientUsername = String(body.recipientUsername).trim().replace(/^@/, '').toLowerCase(); } catch { /* Empty body means buy for self. */ }
  if (!/^[a-z0-9_]{3,30}$/.test(recipientUsername)) return fail(c, 422, 'VALIDATION_ERROR', 'Recipient username is invalid.');
  const recipient = await c.env.DB.prepare("SELECT id, username FROM users WHERE username = ? AND status = 'active'").bind(recipientUsername).first<{ id: string; username: string }>();
  if (!recipient) return fail(c, 422, 'RECIPIENT_NOT_FOUND', 'Recipient is unavailable.');
  const giftTypeId = c.req.param('giftId');
  const type = await c.env.DB.prepare(`SELECT id, slug, title, base_price AS basePrice, upgrade_price AS upgradePrice, max_supply AS maxSupply,
    sold_count AS soldCount, base_image AS baseImage, collectible_variants_json AS collectibleVariantsJson, is_limited AS isLimited, is_unlimited AS isUnlimited, can_upgrade AS canUpgrade, can_transfer AS canTransfer, can_wear AS canWear, exchange_reward AS exchangeReward, exchange_window_days AS exchangeWindowDays, active FROM gift_types WHERE id = ?`).bind(giftTypeId).first<GiftType>();
  if (!type || type.active !== 1) return fail(c, 404, 'GIFT_NOT_FOUND', 'Gift not found.');
  if (type.isUnlimited !== 1 && type.soldCount >= type.maxSupply) return fail(c, 409, 'SOLD_OUT', 'This gift is sold out.');
  if (type.canTransfer !== 1 && recipient.id !== user.id) return fail(c, 409, 'GIFT_NOT_TRANSFERABLE', 'This gift can only be purchased for your own profile.');
  const giftId = crypto.randomUUID(); const now = new Date().toISOString();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO user_gifts (id, owner_user_id, gift_type_id, serial_number, purchased_at, created_at)
      SELECT ?, ?, g.id, g.sold_count + 1, ?, ? FROM gift_types g JOIN users u ON u.id = ?
      WHERE g.id = ? AND g.active = 1 AND (g.is_unlimited = 1 OR g.sold_count < g.max_supply) AND u.diamond_balance >= g.base_price`).bind(giftId, recipient.id, now, now, user.id, giftTypeId),
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
  const gift = await c.env.DB.prepare(`SELECT ug.id, ug.gift_type_id AS giftTypeId, ug.serial_number AS serialNumber, ug.variant, ug.accent_color AS accentColor,
    ug.is_collectible AS isCollectible, ug.is_public AS isPublic, 0 AS worn, ug.purchased_at AS purchasedAt, ug.upgraded_at AS upgradedAt, gt.title, gt.max_supply AS maxSupply,
    gt.base_image AS baseImage, gt.collectible_variants_json AS collectibleVariantsJson, gt.upgrade_price AS upgradePrice, gt.is_limited AS isLimited, gt.is_unlimited AS isUnlimited, gt.can_upgrade AS canUpgrade, gt.can_transfer AS canTransfer, gt.can_wear AS canWear, gt.exchange_reward AS exchangeReward, gt.exchange_window_days AS exchangeWindowDays, NULL AS activeListingId FROM user_gifts ug JOIN gift_types gt ON gt.id = ug.gift_type_id WHERE ug.id = ?`).bind(giftId).first<UserGift>();
  const balance = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(user.id).first<{ balance: number }>();
  return ok(c, { gift: gift ? giftDto(gift) : null, recipient: recipient.username, balance: balance?.balance ?? 0 }, 201);
});

giftRoutes.post('/gifts/:giftId/send', async (c) => {
  const sender = requireUser(c); if (sender instanceof Response) return sender;
  let recipientUsername = ''; let conversationId = ''; let inscription: string | null = null;
  try { const body = await c.req.json<{ recipientUsername?: unknown; conversationId?: unknown; inscription?: unknown }>(); recipientUsername = String(body.recipientUsername ?? '').trim().toLowerCase(); conversationId = String(body.conversationId ?? '').trim(); inscription = typeof body.inscription === 'string' ? body.inscription.trim().slice(0, 140) || null : null; } catch { return fail(c, 400, 'JSON_REQUIRED', 'Content-Type application/json is required.'); }
  if (!/^[a-z0-9_]{3,30}$/.test(recipientUsername)) return fail(c, 422, 'VALIDATION_ERROR', 'Recipient username is invalid.');
  const recipient = await c.env.DB.prepare("SELECT id FROM users WHERE username = ? AND status = 'active'").bind(recipientUsername).first<{ id: string }>();
  if (!recipient || recipient.id === sender.id) return fail(c, 422, 'RECIPIENT_NOT_FOUND', 'Recipient is unavailable.');
  const dialog = await c.env.DB.prepare(`SELECT c.id FROM conversations c WHERE c.id = ? AND c.kind = 'direct'
    AND (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.left_at IS NULL) = 2
    AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL)
    AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL)`).bind(conversationId, sender.id, recipient.id).first<{ id: string }>();
  if (!dialog) return fail(c, 403, 'CONVERSATION_FORBIDDEN', 'Gift can only be sent in the active direct conversation.');
  const type = await c.env.DB.prepare('SELECT id, title, base_price AS basePrice, max_supply AS maxSupply, sold_count AS soldCount, base_image AS baseImage, is_unlimited AS isUnlimited, can_transfer AS canTransfer FROM gift_types WHERE id = ? AND active = 1').bind(c.req.param('giftId')).first<{ id: string; title: string; basePrice: number; maxSupply: number; soldCount: number; baseImage: string; isUnlimited: number; canTransfer: number }>();
  if (!type || type.canTransfer !== 1) return fail(c, 409, 'GIFT_NOT_TRANSFERABLE', 'This gift cannot be sent to another user.');
  if (type.isUnlimited !== 1 && type.soldCount >= type.maxSupply) return fail(c, 409, 'SOLD_OUT', 'This gift is sold out.');
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO user_gifts (id, owner_user_id, gift_type_id, serial_number, inscription, purchased_at, created_at)
      SELECT ?, ?, g.id, g.sold_count + 1, ?, ?, ? FROM gift_types g JOIN users s ON s.id = ?
      WHERE g.id = ? AND (g.is_unlimited = 1 OR g.sold_count < g.max_supply) AND s.diamond_balance >= g.base_price`).bind(id, recipient.id, inscription, now, now, sender.id, type.id),
    c.env.DB.prepare('UPDATE gift_types SET sold_count = sold_count + 1 WHERE id = ? AND EXISTS (SELECT 1 FROM user_gifts WHERE id = ?)').bind(type.id, id),
    c.env.DB.prepare('UPDATE users SET diamond_balance = diamond_balance - ? WHERE id = ? AND EXISTS (SELECT 1 FROM user_gifts WHERE id = ?)').bind(type.basePrice, sender.id, id),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, ?, 'debit', 'gift_send_purchase', ?, ? WHERE EXISTS (SELECT 1 FROM user_gifts WHERE id = ?)`)
      .bind(crypto.randomUUID(), sender.id, -type.basePrice, id, now, id),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'INSUFFICIENT_DIAMONDS', 'Not enough diamonds or gift is sold out.');
  return ok(c, { gift: { id, title: type.title, image: type.baseImage, inscription, serialNumber: type.soldCount + 1 }, price: type.basePrice }, 201);
});

giftRoutes.post('/user-gifts/:id/upgrade', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const id = c.req.param('id');
  const gift = await c.env.DB.prepare(`SELECT ug.id, ug.gift_type_id AS giftTypeId, ug.serial_number AS serialNumber, ug.variant, ug.accent_color AS accentColor, ug.is_collectible AS isCollectible, ug.is_public AS isPublic, 0 AS worn,
    ug.purchased_at AS purchasedAt, ug.upgraded_at AS upgradedAt, gt.title, gt.max_supply AS maxSupply, gt.base_image AS baseImage, gt.collectible_variants_json AS collectibleVariantsJson,
    gt.upgrade_price AS upgradePrice, gt.is_limited AS isLimited, gt.is_unlimited AS isUnlimited, gt.can_upgrade AS canUpgrade, gt.can_transfer AS canTransfer, gt.can_wear AS canWear, gt.exchange_reward AS exchangeReward, gt.exchange_window_days AS exchangeWindowDays, NULL AS activeListingId FROM user_gifts ug JOIN gift_types gt ON gt.id = ug.gift_type_id WHERE ug.id = ? AND ug.owner_user_id = ? AND NOT EXISTS (SELECT 1 FROM gift_market_listings ml WHERE ml.gift_id = ug.id AND ml.status = 'active')`).bind(id, user.id).first<UserGift & { upgradePrice: number }>();
  if (!gift) return fail(c, 404, 'GIFT_NOT_FOUND', 'Gift not found.');
  if (gift.canUpgrade !== 1) return fail(c, 409, 'GIFT_NOT_UPGRADEABLE', 'This gift cannot be upgraded.');
  if (gift.isCollectible === 1) return fail(c, 409, 'ALREADY_COLLECTIBLE', 'Gift is already collectible.');
  const options = variants(gift.collectibleVariantsJson); if (!options.length) return fail(c, 500, 'GIFT_VARIANTS_UNAVAILABLE', 'Collectible variants are unavailable.');
  const variant = selectCollectibleVariant(options); const accentColor = giftColors[Math.floor(Math.random() * giftColors.length)] ?? '#111111'; const now = new Date().toISOString();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE user_gifts SET is_collectible = 1, variant = ?, accent_color = ?, upgraded_at = ? WHERE id = ? AND owner_user_id = ? AND is_collectible = 0
      AND EXISTS (SELECT 1 FROM users WHERE id = ? AND diamond_balance >= ? )`).bind(variant, accentColor, now, id, user.id, user.id, gift.upgradePrice),
    c.env.DB.prepare(`UPDATE users SET diamond_balance = diamond_balance - ? WHERE id = ? AND EXISTS (SELECT 1 FROM user_gifts WHERE id = ? AND upgraded_at = ?)`)
      .bind(gift.upgradePrice, user.id, id, now),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, ?, 'debit', 'gift_upgrade', ?, ? WHERE EXISTS (SELECT 1 FROM user_gifts WHERE id = ? AND upgraded_at = ?)`)
      .bind(crypto.randomUUID(), user.id, -gift.upgradePrice, id, now, id, now),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'INSUFFICIENT_DIAMONDS', 'Not enough diamonds or gift is already upgraded.');
  const balance = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(user.id).first<{ balance: number }>();
  return ok(c, { gift: giftDto({ ...gift, isCollectible: 1, accentColor, variant, upgradedAt: now }), balance: balance?.balance ?? 0 });
});

giftRoutes.delete('/user-gifts/:id/inscription', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const id = c.req.param('id'); const now = new Date().toISOString(); const operationId = crypto.randomUUID();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE user_gifts SET inscription = NULL, last_transfer_id = ? WHERE id = ? AND owner_user_id = ? AND is_collectible = 1 AND inscription IS NOT NULL
      AND EXISTS (SELECT 1 FROM users WHERE id = ? AND diamond_balance >= 25)`).bind(operationId, id, user.id, user.id),
    c.env.DB.prepare('UPDATE users SET diamond_balance = diamond_balance - 25 WHERE id = ? AND EXISTS (SELECT 1 FROM user_gifts WHERE id = ? AND last_transfer_id = ?)').bind(user.id, id, operationId),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, -25, 'debit', 'gift_inscription_removal', ?, ? WHERE EXISTS (SELECT 1 FROM user_gifts WHERE id = ? AND last_transfer_id = ?)`)
      .bind(crypto.randomUUID(), user.id, id, now, id, operationId),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'INSCRIPTION_UNAVAILABLE', 'This inscription cannot be removed.');
  return ok(c, { removed: true, fee: 25 });
});

giftRoutes.post('/user-gifts/:id/wear', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const result = await c.env.DB.prepare(`UPDATE users SET worn_gift_id = ? WHERE id = ? AND EXISTS
    (SELECT 1 FROM user_gifts ug JOIN gift_types gt ON gt.id = ug.gift_type_id WHERE ug.id = ? AND ug.owner_user_id = ? AND ug.is_collectible = 1 AND gt.can_wear = 1 AND NOT EXISTS (SELECT 1 FROM gift_market_listings ml WHERE ml.gift_id = ? AND ml.status = 'active'))`).bind(c.req.param('id'), user.id, c.req.param('id'), user.id, c.req.param('id')).run();
  if ((result.meta.changes ?? 0) !== 1) return fail(c, 404, 'GIFT_NOT_FOUND', 'Gift not found.');
  return ok(c, { wornGiftId: c.req.param('id') });
});

giftRoutes.delete('/users/me/worn-gift', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  await c.env.DB.prepare('UPDATE users SET worn_gift_id = NULL WHERE id = ?').bind(user.id).run();
  return ok(c, { wornGiftId: null });
});

giftRoutes.put('/user-gifts/:id/public', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  let isPublic = true;
  try { isPublic = (await c.req.json<{ isPublic?: unknown }>()).isPublic === true; } catch { return fail(c, 400, 'JSON_REQUIRED', 'Content-Type application/json is required.'); }
  const result = await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET worn_gift_id = NULL WHERE id = ? AND worn_gift_id = ? AND ? = 0').bind(user.id, c.req.param('id'), isPublic ? 1 : 0),
    c.env.DB.prepare('UPDATE user_gifts SET is_public = ? WHERE id = ? AND owner_user_id = ?').bind(isPublic ? 1 : 0, c.req.param('id'), user.id),
  ]);
  if ((result[1]?.meta.changes ?? 0) !== 1) {
    const balanceState = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(user.id).first<{ balance: number }>();
    if ((balanceState?.balance ?? 0) < 5) return fail(c, 409, 'INSUFFICIENT_DIAMONDS', 'At least 5 diamonds are required to transfer a gift.');
    return fail(c, 404, 'GIFT_NOT_FOUND', 'Gift not found.');
  }
  return ok(c, { isPublic });
});

giftRoutes.post('/user-gifts/:id/transfer', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  let recipientUsername = '';
  try { recipientUsername = String((await c.req.json<{ recipientUsername?: unknown }>()).recipientUsername ?? '').trim().toLowerCase(); } catch { return fail(c, 400, 'JSON_REQUIRED', 'Content-Type application/json is required.'); }
  if (!/^[a-z0-9_]{3,30}$/.test(recipientUsername)) return fail(c, 422, 'VALIDATION_ERROR', 'Recipient username is invalid.');
  const recipient = await c.env.DB.prepare("SELECT id FROM users WHERE username = ? AND status = 'active'").bind(recipientUsername).first<{ id: string }>();
  if (!recipient) return fail(c, 404, 'RECIPIENT_NOT_FOUND', 'Recipient not found.');
  if (recipient.id === user.id) return fail(c, 422, 'SELF_TRANSFER', 'You already own this gift.');
  const transferId = crypto.randomUUID(); const now = new Date().toISOString();
  const result = await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET worn_gift_id = NULL WHERE id = ? AND worn_gift_id = ?').bind(user.id, c.req.param('id')),
    c.env.DB.prepare(`UPDATE user_gifts SET owner_user_id = ?, last_transfer_id = ? WHERE id = ? AND owner_user_id = ? AND is_collectible = 1
      AND EXISTS (SELECT 1 FROM gift_types gt WHERE gt.id = user_gifts.gift_type_id AND gt.can_transfer = 1)
      AND EXISTS (SELECT 1 FROM users WHERE id = ? AND diamond_balance >= 5)
      AND NOT EXISTS (SELECT 1 FROM gift_market_listings ml WHERE ml.gift_id = user_gifts.id AND ml.status = 'active')`).bind(recipient.id, transferId, c.req.param('id'), user.id, user.id),
    c.env.DB.prepare(`UPDATE users SET diamond_balance = diamond_balance - 5 WHERE id = ? AND EXISTS
      (SELECT 1 FROM user_gifts WHERE id = ? AND last_transfer_id = ? AND owner_user_id = ?)`)
      .bind(user.id, c.req.param('id'), transferId, recipient.id),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, -5, 'debit', 'gift_transfer_fee', ?, ? WHERE EXISTS
      (SELECT 1 FROM user_gifts WHERE id = ? AND last_transfer_id = ? AND owner_user_id = ?)`)
      .bind(crypto.randomUUID(), user.id, c.req.param('id'), now, c.req.param('id'), transferId, recipient.id),
  ]);
  if ((result[1]?.meta.changes ?? 0) !== 1) return fail(c, 404, 'GIFT_NOT_FOUND', 'Gift not found.');
  const balance = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(user.id).first<{ balance: number }>();
  return ok(c, { transferred: true, fee: 5, balance: balance?.balance ?? 0 });
});

giftRoutes.post('/user-gifts/:id/exchange', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const id = c.req.param('id'); const now = new Date().toISOString(); const exchangeId = crypto.randomUUID();
  const exchangeable = await c.env.DB.prepare(`SELECT gt.exchange_reward AS reward FROM user_gifts ug JOIN gift_types gt ON gt.id = ug.gift_type_id
    WHERE ug.id = ? AND ug.owner_user_id = ? AND ug.is_collectible = 0 AND gt.exchange_reward > 0
      AND (gt.exchange_window_days IS NULL OR ug.purchased_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || gt.exchange_window_days || ' days'))
      AND NOT EXISTS (SELECT 1 FROM gift_market_listings ml WHERE ml.gift_id = ug.id AND ml.status = 'active')`).bind(id, user.id).first<{ reward: number }>();
  if (!exchangeable) return fail(c, 409, 'GIFT_NOT_EXCHANGEABLE', 'This gift cannot be exchanged.');
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO gift_exchanges (id, gift_id, user_id, reward, created_at)
      SELECT ?, ug.id, ?, ?, ? FROM user_gifts ug WHERE ug.id = ? AND ug.owner_user_id = ? AND ug.is_collectible = 0
      AND NOT EXISTS (SELECT 1 FROM gift_market_listings ml WHERE ml.gift_id = ug.id AND ml.status = 'active')`).bind(exchangeId, user.id, exchangeable.reward, now, id, user.id),
    c.env.DB.prepare(`UPDATE gift_types SET sold_count = MAX(0, sold_count - 1) WHERE id =
      (SELECT gift_type_id FROM user_gifts WHERE id = ?) AND EXISTS (SELECT 1 FROM gift_exchanges WHERE id = ?)`)
      .bind(id, exchangeId),
    c.env.DB.prepare('DELETE FROM user_gifts WHERE id = ? AND EXISTS (SELECT 1 FROM gift_exchanges WHERE id = ?)').bind(id, exchangeId),
    c.env.DB.prepare(`UPDATE users SET diamond_balance = diamond_balance + ? WHERE id = ? AND EXISTS (SELECT 1 FROM gift_exchanges WHERE id = ?)`)
      .bind(exchangeable.reward, user.id, exchangeId),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, ?, 'credit', 'gift_exchange', ?, ? WHERE EXISTS (SELECT 1 FROM gift_exchanges WHERE id = ?)`)
      .bind(crypto.randomUUID(), user.id, exchangeable.reward, id, now, exchangeId),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'GIFT_NOT_EXCHANGEABLE', 'This gift cannot be exchanged.');
  const balance = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(user.id).first<{ balance: number }>();
  return ok(c, { exchanged: true, reward: exchangeable.reward, balance: balance?.balance ?? 0 });
});

giftRoutes.post('/user-gifts/:id/list', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  let price = 0;
  try { price = Number((await c.req.json<{ price?: unknown }>()).price); } catch { return fail(c, 400, 'JSON_REQUIRED', 'Content-Type application/json is required.'); }
  if (!Number.isInteger(price) || price < 1 || price > 1_000_000) return fail(c, 422, 'INVALID_PRICE', 'Price must be a whole number from 1 to 1000000.');
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  try {
    const result = await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET worn_gift_id = NULL WHERE id = ? AND worn_gift_id = ?').bind(user.id, c.req.param('id')),
      c.env.DB.prepare(`INSERT INTO gift_market_listings (id, gift_id, seller_user_id, price, status, created_at)
        SELECT ?, ug.id, ?, ?, 'active', ? FROM user_gifts ug WHERE ug.id = ? AND ug.owner_user_id = ? AND ug.is_collectible = 1
          AND EXISTS (SELECT 1 FROM gift_types gt WHERE gt.id = ug.gift_type_id AND gt.can_transfer = 1)
          AND NOT EXISTS (SELECT 1 FROM gift_market_listings ml WHERE ml.gift_id = ug.id AND ml.status = 'active')`).bind(id, user.id, price, now, c.req.param('id'), user.id),
    ]);
    if ((result[1]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'GIFT_UNAVAILABLE', 'This gift cannot be listed.');
    return ok(c, { listingId: id, price }, 201);
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) return fail(c, 409, 'ALREADY_LISTED', 'This gift is already listed.');
    throw error;
  }
});

giftRoutes.delete('/gift-market/:id', async (c) => {
  const user = requireUser(c); if (user instanceof Response) return user;
  const result = await c.env.DB.prepare(`UPDATE gift_market_listings SET status = 'cancelled', cancelled_at = ?
    WHERE id = ? AND seller_user_id = ? AND status = 'active'`).bind(new Date().toISOString(), c.req.param('id'), user.id).run();
  if ((result.meta.changes ?? 0) !== 1) return fail(c, 404, 'LISTING_NOT_FOUND', 'Active listing not found.');
  return ok(c, { cancelled: true });
});

giftRoutes.post('/gift-market/:id/buy', async (c) => {
  const buyer = requireUser(c); if (buyer instanceof Response) return buyer;
  const listing = await c.env.DB.prepare(`SELECT gift_id AS giftId, seller_user_id AS sellerId, price FROM gift_market_listings WHERE id = ? AND status = 'active'`).bind(c.req.param('id')).first<{ giftId: string; sellerId: string; price: number }>();
  if (!listing) return fail(c, 404, 'LISTING_NOT_FOUND', 'Active listing not found.');
  if (listing.sellerId === buyer.id) return fail(c, 422, 'SELF_PURCHASE', 'You cannot buy your own listing.');
  const now = new Date().toISOString(); const listingId = c.req.param('id');
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE gift_market_listings SET status = 'sold', buyer_user_id = ?, sold_at = ? WHERE id = ? AND status = 'active'
      AND seller_user_id != ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND diamond_balance >= gift_market_listings.price)
      AND EXISTS (SELECT 1 FROM user_gifts WHERE id = gift_market_listings.gift_id AND owner_user_id = gift_market_listings.seller_user_id)`)
      .bind(buyer.id, now, listingId, buyer.id, buyer.id),
    c.env.DB.prepare(`UPDATE users SET diamond_balance = diamond_balance - (SELECT price FROM gift_market_listings WHERE id = ?)
      WHERE id = ? AND EXISTS (SELECT 1 FROM gift_market_listings WHERE id = ? AND buyer_user_id = ? AND sold_at = ?)`)
      .bind(listingId, buyer.id, listingId, buyer.id, now),
    c.env.DB.prepare(`UPDATE users SET diamond_balance = diamond_balance + (SELECT price FROM gift_market_listings WHERE id = ?)
      WHERE id = ? AND EXISTS (SELECT 1 FROM gift_market_listings WHERE id = ? AND buyer_user_id = ? AND sold_at = ?)`)
      .bind(listingId, listing.sellerId, listingId, buyer.id, now),
    c.env.DB.prepare(`UPDATE user_gifts SET owner_user_id = ? WHERE id = ? AND owner_user_id = ? AND EXISTS
      (SELECT 1 FROM gift_market_listings WHERE id = ? AND buyer_user_id = ? AND sold_at = ?)`)
      .bind(buyer.id, listing.giftId, listing.sellerId, listingId, buyer.id, now),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, -price, 'debit', 'gift_market_purchase', ?, ? FROM gift_market_listings WHERE id = ? AND buyer_user_id = ? AND sold_at = ?`)
      .bind(crypto.randomUUID(), buyer.id, listingId, now, listingId, buyer.id, now),
    c.env.DB.prepare(`INSERT INTO diamond_transactions (id, user_id, amount, type, reason, related_entity_id, created_at)
      SELECT ?, ?, price, 'credit', 'gift_market_sale', ?, ? FROM gift_market_listings WHERE id = ? AND buyer_user_id = ? AND sold_at = ?`)
      .bind(crypto.randomUUID(), listing.sellerId, listingId, now, listingId, buyer.id, now),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) return fail(c, 409, 'LISTING_UNAVAILABLE', 'This listing is no longer available or you do not have enough diamonds.');
  const balance = await c.env.DB.prepare('SELECT diamond_balance AS balance FROM users WHERE id = ?').bind(buyer.id).first<{ balance: number }>();
  return ok(c, { purchased: true, balance: balance?.balance ?? 0 });
});
