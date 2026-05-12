-- Multi-entry and gameweek processing query performance indexes

-- Picks frequently filtered by competition + gameweek (selections/results/reminders)
CREATE INDEX IF NOT EXISTS idx_picks_competition_gameweek
    ON picks (competition_id, gameweek_id);

-- Picks filtered by competition + participant (history/used teams)
CREATE INDEX IF NOT EXISTS idx_picks_competition_participant
    ON picks (competition_id, participant_id);

-- Gameweek lookups by competition + status ordered by week (next/open week scans)
CREATE INDEX IF NOT EXISTS idx_gameweeks_competition_status_week
    ON gameweeks (competition_id, status, week_number);

-- Payment checks commonly filter by competition + status (+ user)
CREATE INDEX IF NOT EXISTS idx_payments_competition_status
    ON payments (competition_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_competition_user_status
    ON payments (competition_id, user_id, status);
