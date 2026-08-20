CREATE TABLE post_diamond_reactions_next (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 1000000),
  created_at TEXT NOT NULL
);
INSERT INTO post_diamond_reactions_next (id, post_id, sender_user_id, recipient_user_id, amount, created_at)
SELECT post_id || ':' || sender_user_id, post_id, sender_user_id, recipient_user_id, amount, created_at FROM post_diamond_reactions;
DROP TABLE post_diamond_reactions;
ALTER TABLE post_diamond_reactions_next RENAME TO post_diamond_reactions;
CREATE INDEX idx_post_diamond_reactions_post ON post_diamond_reactions(post_id);

CREATE TABLE comment_diamond_reactions (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 1000000),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_comment_diamond_reactions_comment ON comment_diamond_reactions(comment_id);
PRAGMA optimize;
