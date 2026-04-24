-- stripe_payment_intent_id should be nullable for manual payments
ALTER TABLE payments
    ALTER COLUMN stripe_payment_intent_id DROP NOT NULL;
