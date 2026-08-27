ALTER TABLE user_settings ADD COLUMN login_approval_enabled INTEGER NOT NULL DEFAULT 0 CHECK (login_approval_enabled IN (0, 1));
ALTER TABLE user_settings ADD COLUMN login_approval_method TEXT NOT NULL DEFAULT 'email' CHECK (login_approval_method IN ('telegram', 'email', 'both'));
