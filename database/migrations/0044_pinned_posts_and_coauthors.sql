ALTER TABLE posts ADD COLUMN pinned_at TEXT;
CREATE INDEX idx_posts_author_pinned ON posts(author_user_id, pinned_at DESC, published_at DESC);
CREATE TABLE post_coauthors (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX idx_post_coauthors_user ON post_coauthors(user_id, post_id);
