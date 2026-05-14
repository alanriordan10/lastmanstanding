CREATE UNIQUE INDEX uq_payments_participant_succeeded
    ON payments(participant_id)
    WHERE participant_id IS NOT NULL AND status = 'SUCCEEDED';

CREATE INDEX idx_payments_comp_participant_status
    ON payments(competition_id, participant_id, status);
