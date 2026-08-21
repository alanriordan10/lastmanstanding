-- Stop storing client IP on user records; keep last_login_at only.
ALTER TABLE users
    DROP COLUMN last_login_ip;

