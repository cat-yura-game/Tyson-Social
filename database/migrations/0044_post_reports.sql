CREATE TABLE post_reports (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('spam', 'scam', 'hate', 'harassment', 'violence', 'sexual', 'privacy', 'other')),
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('processing', 'no_violation', 'review', 'removed', 'failed')),
  ai_action TEXT CHECK (ai_action IN ('keep', 'review', 'remove')),
  ai_confidence REAL CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  ai_reason TEXT,
  ai_categories_json TEXT NOT NULL DEFAULT '[]',
  ai_provider TEXT,
  ai_model_version TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(post_id, reporter_user_id)
);

CREATE INDEX idx_post_reports_post_created ON post_reports(post_id, created_at DESC);
CREATE INDEX idx_post_reports_status_created ON post_reports(status, created_at DESC);

PRAGMA optimize;
