ALTER TABLE telegram_oauth_states ADD COLUMN native_return INTEGER NOT NULL DEFAULT 0 CHECK (native_return IN (0, 1));
