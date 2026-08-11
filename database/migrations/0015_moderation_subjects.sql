ALTER TABLE moderation_results RENAME TO moderation_results_old;

CREATE TABLE moderation_results (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('post', 'comment', 'post_media', 'profile', 'avatar', 'story', 'display_name')),
  subject_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'review', 'block')),
  risk_score REAL NOT NULL CHECK (risk_score >= 0 AND risk_score <= 1),
  categories_json TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO moderation_results SELECT * FROM moderation_results_old;
DROP TABLE moderation_results_old;

CREATE INDEX idx_moderation_subject ON moderation_results(subject_type, subject_id, created_at DESC);
CREATE INDEX idx_moderation_review ON moderation_results(decision, created_at) WHERE decision = 'review';

PRAGMA optimize;
