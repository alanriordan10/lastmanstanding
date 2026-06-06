ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notification_pick_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notification_result_updates BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notification_competition_announcements BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notification_payment_updates BOOLEAN NOT NULL DEFAULT TRUE;
