ALTER TABLE ai_conversations ADD COLUMN archived_at TEXT;
CREATE INDEX idx_ai_conversations_user_archive ON ai_conversations(user_id, archived_at, updated_at DESC);

CREATE TABLE ai_user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_model_tier TEXT NOT NULL DEFAULT 'lite' CHECK (default_model_tier IN ('lite', 'flash', 'smart')),
  profile_name TEXT NOT NULL DEFAULT '',
  profile_context TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
