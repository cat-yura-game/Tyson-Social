CREATE TABLE verified_account_links (
  parent_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (parent_user_id, child_user_id),
  CHECK (parent_user_id != child_user_id)
);

CREATE INDEX idx_verified_account_links_parent ON verified_account_links(parent_user_id, created_at DESC);

PRAGMA optimize;
