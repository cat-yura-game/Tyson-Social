-- Tyson Shorts beta: short-form vertical video feed.
CREATE TABLE short_videos (
  id TEXT PRIMARY KEY,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('video/mp4', 'video/webm', 'video/quicktime')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 125829120),
  caption TEXT NOT NULL DEFAULT '' CHECK (length(caption) <= 500),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('review', 'published', 'blocked', 'deleted')),
  like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_short_videos_feed ON short_videos(status, published_at DESC);
CREATE INDEX idx_short_videos_author ON short_videos(author_user_id, published_at DESC);

CREATE TABLE short_video_reactions (
  video_id TEXT NOT NULL REFERENCES short_videos(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (video_id, user_id)
);
CREATE INDEX idx_short_video_reactions_user ON short_video_reactions(user_id, reaction, updated_at DESC);

-- One counted view per viewer per UTC day prevents artificial view inflation.
CREATE TABLE short_video_daily_views (
  video_id TEXT NOT NULL REFERENCES short_videos(id) ON DELETE CASCADE,
  viewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (video_id, viewer_user_id, viewed_on)
);
