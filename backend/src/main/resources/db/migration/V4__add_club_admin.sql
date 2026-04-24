-- =============================================================================
-- V4__add_club_admin.sql
-- Adds a club_admin_id FK to clubs so each club has an assigned admin user
-- =============================================================================

ALTER TABLE clubs
    ADD COLUMN club_admin_id BIGINT NULL,
    ADD CONSTRAINT fk_clubs_club_admin FOREIGN KEY (club_admin_id) REFERENCES users (id);
