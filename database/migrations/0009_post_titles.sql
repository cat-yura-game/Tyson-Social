ALTER TABLE posts ADD COLUMN title TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 200);

PRAGMA optimize;
