CREATE TABLE telegram_notification_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  messages_enabled INTEGER NOT NULL DEFAULT 1 CHECK (messages_enabled IN (0, 1)),
  interactions_enabled INTEGER NOT NULL DEFAULT 1 CHECK (interactions_enabled IN (0, 1)),
  posts_enabled INTEGER NOT NULL DEFAULT 1 CHECK (posts_enabled IN (0, 1)),
  security_enabled INTEGER NOT NULL DEFAULT 1 CHECK (security_enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
