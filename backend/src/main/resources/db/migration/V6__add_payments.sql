-- =============================================================================
-- V6__add_payments.sql
-- Tracks Stripe payment intents for competition entry fees
-- =============================================================================

CREATE TABLE payments (
    id                           BIGSERIAL    NOT NULL,
    user_id                      BIGINT       NOT NULL,
    competition_id               BIGINT       NOT NULL,
    stripe_payment_intent_id     VARCHAR(255) NOT NULL,
    amount_cents                 INT          NOT NULL,
    currency                     VARCHAR(10)  NOT NULL DEFAULT 'eur',
    status                       VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    created_at                   TIMESTAMP    NOT NULL,
    updated_at                   TIMESTAMP    NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_payments_intent UNIQUE (stripe_payment_intent_id),
    CONSTRAINT chk_payments_status CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED')),
    CONSTRAINT fk_payments_user        FOREIGN KEY (user_id)        REFERENCES users (id),
    CONSTRAINT fk_payments_competition FOREIGN KEY (competition_id) REFERENCES competitions (id)
);
CREATE INDEX idx_payments_user        ON payments (user_id);
CREATE INDEX idx_payments_competition ON payments (competition_id);
