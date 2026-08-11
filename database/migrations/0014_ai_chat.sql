CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Новый диалог',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id, updated_at DESC);

CREATE TABLE ai_chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  image_storage_key TEXT,
  image_expires_at TEXT,
  model_version TEXT,
  created_at TEXT NOT NULL,
  CHECK ((image_storage_key IS NULL AND image_expires_at IS NULL) OR (image_storage_key IS NOT NULL AND image_expires_at IS NOT NULL))
);

CREATE INDEX idx_ai_chat_messages_conversation ON ai_chat_messages(conversation_id, created_at ASC);
CREATE INDEX idx_ai_chat_messages_expiring_images ON ai_chat_messages(image_expires_at) WHERE image_storage_key IS NOT NULL;

CREATE TABLE ai_daily_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, usage_date)
);

PRAGMA optimize;
