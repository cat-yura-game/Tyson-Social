ALTER TABLE username_aliases ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_username_aliases_order ON username_aliases(user_id, sort_order, created_at);
