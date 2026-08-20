ALTER TABLE gift_types ADD COLUMN is_unlimited INTEGER NOT NULL DEFAULT 0 CHECK (is_unlimited IN (0, 1));
ALTER TABLE gift_types ADD COLUMN can_upgrade INTEGER NOT NULL DEFAULT 1 CHECK (can_upgrade IN (0, 1));
ALTER TABLE gift_types ADD COLUMN can_transfer INTEGER NOT NULL DEFAULT 1 CHECK (can_transfer IN (0, 1));
ALTER TABLE gift_types ADD COLUMN can_wear INTEGER NOT NULL DEFAULT 1 CHECK (can_wear IN (0, 1));
ALTER TABLE gift_types ADD COLUMN exchange_reward INTEGER NOT NULL DEFAULT 21 CHECK (exchange_reward >= 0);
ALTER TABLE gift_types ADD COLUMN exchange_window_days INTEGER DEFAULT 7 CHECK (exchange_window_days IS NULL OR exchange_window_days >= 0);

CREATE TABLE gift_exchanges_new (
  id TEXT PRIMARY KEY,
  gift_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward INTEGER NOT NULL CHECK (reward > 0),
  created_at TEXT NOT NULL
);
INSERT INTO gift_exchanges_new (id, gift_id, user_id, reward, created_at)
  SELECT id, gift_id, user_id, reward, created_at FROM gift_exchanges;
DROP TABLE gift_exchanges;
ALTER TABLE gift_exchanges_new RENAME TO gift_exchanges;

INSERT INTO gift_types (
  id, slug, title, base_price, upgrade_price, max_supply, sold_count, base_image,
  collectible_variants_json, active, is_limited, is_unlimited, can_upgrade,
  can_transfer, can_wear, exchange_reward, exchange_window_days
) VALUES (
  'tyson', 'tyson', 'Tyson', 15, 1, 2147483647, 0, '/gift/tyson/base.webp',
  '[]', 1, 0, 1, 0, 0, 0, 13, NULL
);

PRAGMA optimize;
