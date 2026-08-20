ALTER TABLE gift_types ADD COLUMN is_limited INTEGER NOT NULL DEFAULT 1 CHECK (is_limited IN (0, 1));
