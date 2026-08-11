CREATE TABLE user_follows (
  follower_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (follower_user_id, followed_user_id),
  CHECK (follower_user_id != followed_user_id)
);
CREATE INDEX idx_user_follows_followed ON user_follows(followed_user_id, created_at DESC);
CREATE INDEX idx_user_follows_follower ON user_follows(follower_user_id, created_at DESC);

PRAGMA optimize;
