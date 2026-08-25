CREATE TABLE guest_ai_daily_usage (
  usage_date TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (usage_date, ip_hash)
);
