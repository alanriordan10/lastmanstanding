ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS participant_id BIGINT;

ALTER TABLE payments
    ADD CONSTRAINT fk_payments_participant
    FOREIGN KEY (participant_id) REFERENCES competition_participants(id);

CREATE INDEX IF NOT EXISTS idx_payments_participant_id
    ON payments(participant_id);

