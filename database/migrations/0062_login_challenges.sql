CREATE TABLE login_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('telegram', 'email', 'both')),
  code_hash TEXT,
  telegram_token_hash TEXT UNIQUE,
  user_agent TEXT,
  ip_hash TEXT,
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  denied_at TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_login_challenges_pending ON login_challenges(user_id, expires_at) WHERE approved_at IS NULL AND denied_at IS NULL AND consumed_at IS NULL;
