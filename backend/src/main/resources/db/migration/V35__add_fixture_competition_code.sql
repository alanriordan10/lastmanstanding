ALTER TABLE competitions
ADD COLUMN IF NOT EXISTS fixture_competition_code VARCHAR(16) NOT NULL DEFAULT 'PL';

UPDATE competitions
SET fixture_competition_code = 'PL'
WHERE fixture_competition_code IS NULL OR trim(fixture_competition_code) = '';
