ALTER TABLE user_settings ADD COLUMN last_seen_visibility TEXT NOT NULL DEFAULT 'everyone'
  CHECK (last_seen_visibility IN ('everyone', 'friends', 'nobody'));
ALTER TABLE user_settings ADD COLUMN birthday_visibility TEXT NOT NULL DEFAULT 'everyone'
  CHECK (birthday_visibility IN ('everyone', 'friends', 'nobody'));
ALTER TABLE user_settings ADD COLUMN messaging_visibility TEXT NOT NULL DEFAULT 'everyone'
  CHECK (messaging_visibility IN ('everyone', 'friends', 'nobody'));
ALTER TABLE user_settings ADD COLUMN message_sounds_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (message_sounds_enabled IN (0, 1));
