CREATE TABLE username_aliases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_username_aliases_user ON username_aliases(user_id, created_at);
