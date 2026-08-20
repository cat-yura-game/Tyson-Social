CREATE TABLE author_push_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, author_user_id),
  CHECK (user_id != author_user_id)
);

CREATE INDEX idx_author_push_preferences_author ON author_push_preferences(author_user_id, created_at DESC);
