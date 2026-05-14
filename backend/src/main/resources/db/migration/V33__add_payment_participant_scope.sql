ALTER TABLE payments
    ADD COLUMN participant_id BIGINT;

ALTER TABLE payments
    ADD CONSTRAINT fk_payments_participant
        FOREIGN KEY (participant_id) REFERENCES competition_participants(id);

CREATE INDEX idx_payments_participant_status
    ON payments(participant_id, status);
