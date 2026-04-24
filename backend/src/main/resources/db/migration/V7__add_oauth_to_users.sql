-- =============================================================================
-- V7__add_oauth_to_users.sql
-- Adds OAuth2 provider fields so users can sign in with Google, Facebook etc.
-- password_hash made nullable for OAuth-only users (no password set)
-- =============================================================================

ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL,
    ADD COLUMN oauth_provider    VARCHAR(50)  NULL,
    ADD COLUMN oauth_provider_id VARCHAR(255) NULL,
    ADD COLUMN avatar_url        VARCHAR(500) NULL;

ALTER TABLE users ADD CONSTRAINT uk_users_oauth UNIQUE (oauth_provider, oauth_provider_id);
