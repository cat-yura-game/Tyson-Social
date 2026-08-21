ALTER TABLE conversations ADD COLUMN title TEXT;
ALTER TABLE user_settings ADD COLUMN stories_visibility TEXT NOT NULL DEFAULT 'everyone'
  CHECK (stories_visibility IN ('everyone', 'friends', 'nobody'));
CREATE INDEX idx_conversations_kind_updated ON conversations(kind, updated_at DESC);
