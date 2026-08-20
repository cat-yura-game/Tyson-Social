ALTER TABLE user_gifts ADD COLUMN inscription TEXT CHECK (inscription IS NULL OR length(inscription) BETWEEN 1 AND 140);
ALTER TABLE user_gifts ADD COLUMN redeemed_at TEXT;
CREATE TABLE gift_exchanges (
  id TEXT PRIMARY KEY,
  gift_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward INTEGER NOT NULL CHECK (reward = 20),
  created_at TEXT NOT NULL
);
PRAGMA optimize;
