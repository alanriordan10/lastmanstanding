-- Track the last successful sign-in per user for security/UX.
ALTER TABLE users
    ADD COLUMN last_login_at TIMESTAMP NULL,
    ADD COLUMN last_login_ip VARCHAR(64) NULL;

-- Backfill: assume existing users' last login was when they were created.
UPDATE users SET last_login_at = created_at WHERE last_login_at IS NULL;