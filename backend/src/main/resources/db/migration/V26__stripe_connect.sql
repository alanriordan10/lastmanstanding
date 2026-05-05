ALTER TABLE clubs
    ADD COLUMN stripe_account_id VARCHAR(255),
    ADD COLUMN stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE clubs
    ADD CONSTRAINT uq_clubs_stripe_account_id UNIQUE (stripe_account_id);

ALTER TABLE competitions
    ADD COLUMN stripe_destination_account_id VARCHAR(255);

ALTER TABLE payments
    ADD COLUMN stripe_charge_id VARCHAR(255),
    ADD COLUMN stripe_transfer_id VARCHAR(255),
    ADD COLUMN application_fee_amount_cents INTEGER,
    ADD COLUMN destination_account_id VARCHAR(255),
    ADD COLUMN webhook_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
