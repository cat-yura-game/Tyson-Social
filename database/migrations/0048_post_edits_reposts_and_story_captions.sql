ALTER TABLE posts ADD COLUMN edited_at TEXT;
ALTER TABLE posts ADD COLUMN repost_of_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE stories ADD COLUMN caption TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_posts_repost_author ON posts(author_user_id, repost_of_post_id, published_at DESC);
