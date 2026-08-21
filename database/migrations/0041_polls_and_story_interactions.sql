CREATE TABLE post_polls (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  ends_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE post_poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES post_polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE(poll_id, sort_order)
);
CREATE TABLE post_poll_votes (
  poll_id TEXT NOT NULL REFERENCES post_polls(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES post_poll_options(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (poll_id, user_id)
);
CREATE INDEX idx_post_poll_votes_option ON post_poll_votes(option_id);

CREATE TABLE story_reactions (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('❤️', '🔥', '😂', '😮', '👏')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (story_id, user_id)
);
CREATE TABLE story_replies (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_story_replies_story ON story_replies(story_id, created_at DESC);
