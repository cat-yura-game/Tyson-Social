PRAGMA foreign_keys = ON;

CREATE TABLE auth_rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  window_started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (scope, subject_hash)
);

CREATE INDEX idx_auth_rate_limits_expiry ON auth_rate_limits(expires_at);

PRAGMA optimize;
