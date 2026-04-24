-- =============================================================================
-- V3__add_user_disabled.sql
-- Adds a disabled flag to users for admin to disable/enable accounts
-- =============================================================================

ALTER TABLE users
    ADD COLUMN disabled BOOLEAN NOT NULL DEFAULT FALSE;
