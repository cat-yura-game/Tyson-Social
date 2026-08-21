CREATE TABLE ai_pro_subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  trial_used INTEGER NOT NULL DEFAULT 0 CHECK (trial_used IN (0, 1)),
  updated_at TEXT NOT NULL
);
ALTER TABLE ai_user_settings ADD COLUMN memory_enabled INTEGER NOT NULL DEFAULT 0 CHECK (memory_enabled IN (0, 1));
