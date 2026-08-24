CREATE TABLE telegram_star_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id TEXT NOT NULL,
  stars_amount INTEGER NOT NULL CHECK (stars_amount > 0),
  diamond_amount INTEGER NOT NULL CHECK (diamond_amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'cancelled')),
  telegram_payment_charge_id TEXT UNIQUE,
  credit_marker TEXT UNIQUE,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_telegram_star_orders_user ON telegram_star_orders(user_id, created_at DESC);
