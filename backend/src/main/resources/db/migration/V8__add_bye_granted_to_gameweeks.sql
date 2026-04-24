-- =============================================================================
-- V8__add_bye_granted_to_gameweeks.sql
-- Adds bye_granted flag to track when all participants got a bye
-- =============================================================================

ALTER TABLE gameweeks
    ADD COLUMN bye_granted BOOLEAN NOT NULL DEFAULT FALSE;
