ALTER TABLE users ADD COLUMN diamond_balance INTEGER NOT NULL DEFAULT 0 CHECK (diamond_balance >= 0);

CREATE TABLE gift_types (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  base_price INTEGER NOT NULL CHECK (base_price > 0),
  upgrade_price INTEGER NOT NULL CHECK (upgrade_price > 0),
  max_supply INTEGER NOT NULL CHECK (max_supply > 0),
  sold_count INTEGER NOT NULL DEFAULT 0 CHECK (sold_count >= 0 AND sold_count <= max_supply),
  base_image TEXT NOT NULL,
  collectible_variants_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE user_gifts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gift_type_id TEXT NOT NULL REFERENCES gift_types(id) ON DELETE RESTRICT,
  serial_number INTEGER NOT NULL CHECK (serial_number > 0),
  variant TEXT,
  is_collectible INTEGER NOT NULL DEFAULT 0 CHECK (is_collectible IN (0, 1)),
  purchased_at TEXT NOT NULL,
  upgraded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(gift_type_id, serial_number),
  CHECK ((is_collectible = 0 AND variant IS NULL AND upgraded_at IS NULL) OR (is_collectible = 1 AND variant IS NOT NULL AND upgraded_at IS NOT NULL))
);
CREATE INDEX idx_user_gifts_owner ON user_gifts(owner_user_id, purchased_at DESC);

CREATE TABLE diamond_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount != 0),
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  reason TEXT NOT NULL,
  related_entity_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_diamond_transactions_user ON diamond_transactions(user_id, created_at DESC);

INSERT INTO gift_types (id, slug, title, base_price, upgrade_price, max_supply, base_image, collectible_variants_json) VALUES
  ('tyson-crown', 'tyson-crown', 'Tyson Crown', 25, 25, 50, '/gift/cat-crown/base.png', '["/gift/cat-crown/collectible-1.png","/gift/cat-crown/collectible-2.png","/gift/cat-crown/collectible-3.png","/gift/cat-crown/collectible-4.png","/gift/cat-crown/collectible-5.png"]'),
  ('tyson-love', 'tyson-love', 'Tyson Love', 25, 25, 50, '/gift/cat-love/base.png', '["/gift/cat-love/collectible-1.png","/gift/cat-love/collectible-2.png","/gift/cat-love/collectible-3.png","/gift/cat-love/collectible-4.png","/gift/cat-love/collectible-5.png"]');

PRAGMA optimize;
