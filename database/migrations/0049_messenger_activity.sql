CREATE TABLE conversation_activity (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity TEXT NOT NULL CHECK (activity IN ('typing', 'recording_audio', 'recording_video')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
