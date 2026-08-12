ALTER TABLE conversations ADD COLUMN security_mode TEXT NOT NULL DEFAULT 'cloud' CHECK (security_mode IN ('cloud', 'secret'));

-- Conversations created before this migration contain device-bound E2EE envelopes.
UPDATE conversations SET security_mode = 'secret';

-- Saved Messages is an account-synchronised personal archive, not a secret chat.
UPDATE conversations SET security_mode = 'cloud'
WHERE id IN (SELECT conversation_id FROM saved_conversations);

ALTER TABLE user_settings ADD COLUMN secret_chat_enabled INTEGER NOT NULL DEFAULT 0 CHECK (secret_chat_enabled IN (0, 1));

CREATE TABLE cloud_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_cloud_messages_conversation ON cloud_messages(conversation_id, created_at);

PRAGMA optimize;
