CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_stories_active ON stories(expires_at, created_at DESC);
CREATE INDEX idx_stories_author ON stories(author_user_id, expires_at DESC);

PRAGMA optimize;
