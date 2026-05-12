ALTER TABLE competition_participants
    ADD COLUMN entry_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE competition_participants
    DROP CONSTRAINT IF EXISTS uk_comp_participant;

ALTER TABLE competition_participants
    ADD CONSTRAINT uk_comp_participant_entry UNIQUE (competition_id, user_id, entry_number);

CREATE INDEX IF NOT EXISTS idx_comp_participants_comp_user
    ON competition_participants (competition_id, user_id);
