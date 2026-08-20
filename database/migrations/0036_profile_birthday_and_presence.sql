ALTER TABLE users ADD COLUMN last_seen_at TEXT;
ALTER TABLE users ADD COLUMN birthday_month_day TEXT CHECK (birthday_month_day IS NULL OR birthday_month_day GLOB '[0-1][0-9]-[0-3][0-9]');
ALTER TABLE users ADD COLUMN birthday_year INTEGER CHECK (birthday_year IS NULL OR birthday_year BETWEEN 1900 AND 2100);

UPDATE users SET last_seen_at = created_at WHERE last_seen_at IS NULL;
CREATE INDEX idx_users_last_seen ON users(last_seen_at DESC);
