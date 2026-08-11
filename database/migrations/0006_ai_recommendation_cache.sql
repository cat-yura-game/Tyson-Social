CREATE TABLE ai_recommendation_cache (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  ordered_post_ids_json TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_version TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_ai_recommendation_cache_expiry ON ai_recommendation_cache(expires_at);
