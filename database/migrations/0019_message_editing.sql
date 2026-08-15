ALTER TABLE cloud_messages ADD COLUMN edited_at TEXT;
ALTER TABLE encrypted_messages ADD COLUMN edited_at TEXT;

PRAGMA optimize;
