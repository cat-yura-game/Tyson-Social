CREATE TABLE short_video_uploads (
  id TEXT PRIMARY KEY,
  uploader_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('video/mp4', 'video/webm', 'video/quicktime')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 125829120),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX idx_short_video_uploads_expiry ON short_video_uploads(expires_at);
