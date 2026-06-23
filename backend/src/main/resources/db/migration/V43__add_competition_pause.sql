ALTER TABLE competitions
    ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pause_reason VARCHAR(500),
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_competitions_paused ON competitions (paused) WHERE paused = TRUE;
