ALTER TABLE picks
    ADD COLUMN participant_id BIGINT;

UPDATE picks p
SET participant_id = cp.id
FROM competition_participants cp
WHERE cp.competition_id = p.competition_id
  AND cp.user_id = p.user_id
  AND cp.entry_number = 1
  AND p.participant_id IS NULL;

ALTER TABLE picks
    ALTER COLUMN participant_id SET NOT NULL;

ALTER TABLE picks
    ADD CONSTRAINT fk_picks_participant
        FOREIGN KEY (participant_id) REFERENCES competition_participants (id);

ALTER TABLE picks
    DROP CONSTRAINT IF EXISTS uk_pick_per_week;

ALTER TABLE picks
    DROP CONSTRAINT IF EXISTS uk_pick_team_once;

ALTER TABLE picks
    ADD CONSTRAINT uk_pick_per_entry_week UNIQUE (competition_id, participant_id, gameweek_id);

ALTER TABLE picks
    ADD CONSTRAINT uk_pick_team_once_per_entry UNIQUE (competition_id, participant_id, team_id);

CREATE INDEX IF NOT EXISTS idx_picks_participant_id
    ON picks (participant_id);
