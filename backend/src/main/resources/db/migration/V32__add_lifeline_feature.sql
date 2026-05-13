ALTER TABLE competitions
    ADD COLUMN lifeline_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE competition_participants
    ADD COLUMN lifeline_used BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN lifeline_used_week INTEGER;

ALTER TABLE picks
    ADD COLUMN use_lifeline BOOLEAN NOT NULL DEFAULT FALSE;
