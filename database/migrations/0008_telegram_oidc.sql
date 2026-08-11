CREATE TABLE telegram_identities (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL UNIQUE,
  telegram_user_id TEXT,
  display_name TEXT,
  username TEXT,
  picture_url TEXT,
  linked_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE TABLE telegram_oauth_states (
  state_hash TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('login', 'link')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  CHECK ((action = 'link' AND user_id IS NOT NULL AND session_id IS NOT NULL) OR (action = 'login' AND user_id IS NULL AND session_id IS NULL))
);
CREATE INDEX idx_telegram_oauth_states_expiry ON telegram_oauth_states(expires_at);

CREATE TABLE telegram_login_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_telegram_login_tickets_expiry ON telegram_login_tickets(expires_at);
