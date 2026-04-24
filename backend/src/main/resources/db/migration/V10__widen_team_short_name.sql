-- =============================================================================
-- V10__widen_team_short_name.sql
-- Widen short_name column to accommodate longer football-data.org shortName values
-- =============================================================================

ALTER TABLE teams
    ALTER COLUMN short_name TYPE VARCHAR(50);
