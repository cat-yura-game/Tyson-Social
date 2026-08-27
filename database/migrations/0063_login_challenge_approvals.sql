ALTER TABLE login_challenges ADD COLUMN email_approved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE login_challenges ADD COLUMN telegram_approved INTEGER NOT NULL DEFAULT 0;
