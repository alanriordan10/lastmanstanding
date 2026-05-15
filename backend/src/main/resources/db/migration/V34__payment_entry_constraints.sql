CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_succeeded_per_participant
    ON payments(participant_id)
    WHERE status = 'SUCCEEDED' AND participant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_competition_participant_status
    ON payments(competition_id, participant_id, status);

