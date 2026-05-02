ALTER TABLE competitions
    ALTER COLUMN join_code DROP NOT NULL;

UPDATE competitions
SET join_code = NULL
WHERE visibility = 'PUBLIC';
