CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('follow', 'comment', 'diamond')),
  entity_id TEXT,
  message TEXT NOT NULL,
  dedupe_key TEXT UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at, created_at DESC);
