CREATE TABLE post_promotions (
  post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchased_views INTEGER NOT NULL CHECK (purchased_views > 0),
  delivered_views INTEGER NOT NULL DEFAULT 0 CHECK (delivered_views >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_post_promotions_active ON post_promotions(delivered_views, purchased_views, updated_at DESC);

CREATE TABLE post_promotion_views (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  view_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(post_id, viewer_user_id, view_date)
);

CREATE INDEX idx_post_promotion_views_post ON post_promotion_views(post_id, created_at DESC);
