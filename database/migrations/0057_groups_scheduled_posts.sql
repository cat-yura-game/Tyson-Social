ALTER TABLE conversations ADD COLUMN username TEXT;
ALTER TABLE conversation_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member'));
CREATE UNIQUE INDEX idx_group_conversations_username ON conversations(username COLLATE NOCASE) WHERE kind = 'group' AND username IS NOT NULL;

ALTER TABLE posts ADD COLUMN scheduled_at TEXT;
CREATE INDEX idx_posts_scheduled ON posts(status, scheduled_at) WHERE status = 'draft' AND scheduled_at IS NOT NULL;
