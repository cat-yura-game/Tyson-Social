CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ai', 'open', 'closed')) DEFAULT 'ai',
  question TEXT,
  ai_answer TEXT,
  ai_attempts INTEGER NOT NULL DEFAULT 0,
  screenshot_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX idx_support_tickets_user ON support_tickets(user_id, updated_at DESC);
CREATE TABLE support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user','ai','owner')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_support_messages_ticket ON support_messages(ticket_id, created_at);
