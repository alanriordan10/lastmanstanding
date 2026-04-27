ALTER TABLE competitions
    ADD COLUMN visibility VARCHAR(20),
    ADD COLUMN join_code VARCHAR(12);

UPDATE competitions
SET visibility = 'PUBLIC'
WHERE visibility IS NULL;

UPDATE competitions
SET join_code = 'LMS' || LPAD(id::text, 9, '0')
WHERE join_code IS NULL;

ALTER TABLE competitions
    ALTER COLUMN visibility SET DEFAULT 'PUBLIC',
    ALTER COLUMN visibility SET NOT NULL,
    ALTER COLUMN join_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_competitions_join_code ON competitions (join_code);
CREATE INDEX IF NOT EXISTS idx_competitions_visibility_status ON competitions (visibility, status);
