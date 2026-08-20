ALTER TABLE users ADD COLUMN worn_gift_id TEXT REFERENCES user_gifts(id) ON DELETE SET NULL;
ALTER TABLE user_gifts ADD COLUMN accent_color TEXT NOT NULL DEFAULT '#111111';

CREATE TABLE post_diamond_reactions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 1 CHECK (amount = 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (post_id, sender_user_id),
  CHECK (sender_user_id != recipient_user_id)
);
CREATE INDEX idx_post_diamond_reactions_post ON post_diamond_reactions(post_id);

PRAGMA optimize;
