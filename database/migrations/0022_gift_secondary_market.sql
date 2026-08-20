CREATE TABLE gift_market_listings (
  id TEXT PRIMARY KEY,
  gift_id TEXT NOT NULL REFERENCES user_gifts(id) ON DELETE CASCADE,
  seller_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  price INTEGER NOT NULL CHECK (price BETWEEN 1 AND 1000000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sold_at TEXT,
  cancelled_at TEXT
);
CREATE UNIQUE INDEX idx_gift_market_one_active_listing ON gift_market_listings(gift_id) WHERE status = 'active';
CREATE INDEX idx_gift_market_active ON gift_market_listings(status, created_at DESC);
CREATE INDEX idx_gift_market_seller ON gift_market_listings(seller_user_id, status);
PRAGMA optimize;
