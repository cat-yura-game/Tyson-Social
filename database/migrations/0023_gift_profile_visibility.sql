ALTER TABLE user_gifts ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1));
CREATE INDEX idx_user_gifts_public_owner ON user_gifts(owner_user_id, is_public, purchased_at DESC);
PRAGMA optimize;
