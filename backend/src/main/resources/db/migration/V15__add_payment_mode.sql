-- Add payment_mode to competitions (STRIPE, MANUAL, FREE)
ALTER TABLE competitions
    ADD COLUMN payment_mode VARCHAR(20) NOT NULL DEFAULT 'STRIPE';

UPDATE competitions
SET payment_mode = CASE
    WHEN entry_fee IS NULL OR entry_fee = 0 THEN 'FREE'
    ELSE 'STRIPE'
END;
