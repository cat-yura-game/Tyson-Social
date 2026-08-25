CREATE TABLE telegram_bot_visits (
  telegram_user_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  first_started_at TEXT NOT NULL,
  last_started_at TEXT NOT NULL,
  start_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE telegram_referral_codes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE telegram_bot_referrals (
  invited_telegram_user_id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registered_user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  bot_started_at TEXT NOT NULL,
  registered_at TEXT,
  reward_transaction_id TEXT UNIQUE REFERENCES diamond_transactions(id) ON DELETE SET NULL
);
CREATE INDEX idx_telegram_bot_referrals_referrer ON telegram_bot_referrals(referrer_user_id, registered_at);
