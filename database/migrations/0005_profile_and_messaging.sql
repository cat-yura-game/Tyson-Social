ALTER TABLE users ADD COLUMN username_changed_at TEXT;

CREATE INDEX idx_encrypted_messages_recipient_conversation
  ON encrypted_messages(recipient_device_id, conversation_id, created_at);

PRAGMA optimize;
