-- Pricing model: each club gets 1 free competition (lifetime), then must buy
-- a "competition slot" credit (one-time EUR fee) to create additional ones.

ALTER TABLE clubs
    ADD COLUMN paid_competition_credits INT NOT NULL DEFAULT 0,
    ADD COLUMN free_competition_used BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: any club that already has at least one competition has used its free slot.
UPDATE clubs c
SET free_competition_used = TRUE
WHERE EXISTS (SELECT 1 FROM competitions comp WHERE comp.club_id = c.id);

CREATE TABLE club_slot_purchases (
    id                  BIGSERIAL PRIMARY KEY,
    club_id             BIGINT       NOT NULL REFERENCES clubs (id),
    stripe_session_id   VARCHAR(255) NOT NULL UNIQUE,
    amount_cents        INT          NOT NULL,
    currency            VARCHAR(10)  NOT NULL DEFAULT 'eur',
    status              VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    created_at          TIMESTAMP    NOT NULL DEFAULT now(),
    completed_at        TIMESTAMP    NULL
);

CREATE INDEX idx_club_slot_purchases_club_id ON club_slot_purchases (club_id);
