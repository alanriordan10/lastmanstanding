-- =============================================================================
-- V5__add_club_admin_role.sql
-- Extends the users.role check constraint to include CLUB_ADMIN
-- =============================================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('USER', 'CLUB_ADMIN', 'ADMIN'));
