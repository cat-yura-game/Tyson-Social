-- Allow encrypted Messenger attachments up to the Telegram-linked account limit
-- plus authenticated-encryption overhead. The application still applies the
-- account-specific 5 MiB / 10 MiB limit before inserting a row.
CREATE TABLE encrypted_message_attachments_next (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  uploader_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485824),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO encrypted_message_attachments_next
  (id, conversation_id, uploader_user_id, storage_key, byte_size, created_at)
SELECT id, conversation_id, uploader_user_id, storage_key, byte_size, created_at
FROM encrypted_message_attachments;

DROP TABLE encrypted_message_attachments;
ALTER TABLE encrypted_message_attachments_next RENAME TO encrypted_message_attachments;
CREATE INDEX idx_encrypted_attachments_conversation ON encrypted_message_attachments(conversation_id, created_at);

PRAGMA optimize;
