ALTER TABLE competitions
    ADD COLUMN manual_payment_policy VARCHAR(20) NOT NULL DEFAULT 'STRICT';

