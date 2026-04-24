-- =============================================================================
-- V2__add_clubs.sql
-- Adds a clubs table and links competitions to clubs for grouping/filtering
-- =============================================================================

CREATE TABLE clubs (
    id          BIGSERIAL    NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description TEXT         NULL,
    created_by  BIGINT       NOT NULL,
    created_at  TIMESTAMP    NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_clubs_name UNIQUE (name),
    CONSTRAINT fk_clubs_created_by FOREIGN KEY (created_by) REFERENCES users (id)
);

ALTER TABLE competitions
    ADD COLUMN club_id BIGINT NULL,
    ADD CONSTRAINT fk_competitions_club FOREIGN KEY (club_id) REFERENCES clubs (id);
CREATE INDEX idx_competitions_club_id ON competitions (club_id);
