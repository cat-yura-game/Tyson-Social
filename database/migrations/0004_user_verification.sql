ALTER TABLE users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0, 1));
CREATE INDEX idx_users_verified ON users(is_verified, created_at DESC) WHERE is_verified = 1;
