INSERT INTO gift_types (
  id, slug, title, base_price, upgrade_price, max_supply, sold_count, base_image,
  collectible_variants_json, active, is_limited, is_unlimited, can_upgrade,
  can_transfer, can_wear, exchange_reward, exchange_window_days
) VALUES (
  'magic-cat', 'magic-cat', 'Magic Cat', 25, 25, 50, 0, '/gift/magic-cat/base.webp',
  '["/gift/magic-cat/collectible-1.webp","/gift/magic-cat/collectible-2.webp","/gift/magic-cat/collectible-3.webp","/gift/magic-cat/collectible-4.webp","/gift/magic-cat/collectible-5.webp"]',
  1, 1, 0, 1, 1, 1, 21, 7
);

PRAGMA optimize;
