ALTER TABLE fixtures
    ADD COLUMN odds_home_win NUMERIC(8,4),
    ADD COLUMN odds_draw NUMERIC(8,4),
    ADD COLUMN odds_away_win NUMERIC(8,4),
    ADD COLUMN odds_implied_home NUMERIC(8,6),
    ADD COLUMN odds_implied_draw NUMERIC(8,6),
    ADD COLUMN odds_implied_away NUMERIC(8,6),
    ADD COLUMN odds_source VARCHAR(64),
    ADD COLUMN odds_updated_at TIMESTAMP;
