-- Script to add 200 test users and join them to a competition
-- Run this against your MySQL database to test scaling

-- Step 1: Create 200 test users
-- Password for all: password123 (BCrypt hash)
-- BCrypt hash of "password123": $2a$10$N9qo8uLOickgx2ZXVz/L8eKEVYlYQYBC6nDqB4V8K8K8K8K8K8K8K
-- Note: You'll need to generate actual BCrypt hashes or use the Java seeder

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS create_test_users()
BEGIN
    DECLARE i INT DEFAULT 1;
    DECLARE user_id BIGINT;

    WHILE i <= 200 DO
        INSERT INTO users (email, username, password_hash, role, disabled, created_at, updated_at)
        VALUES (
            CONCAT('testuser', i, '@lms.com'),
            CONCAT('testuser', i),
            '$2a$10$N9qo8uLOickgx2ZXVz/L8eWd.Vh8F/jGD0A9YGdC5QgZ6jQqM2CpK', -- hash of "password123"
            'USER',
            0,
            NOW(),
            NOW()
        )
        ON DUPLICATE KEY UPDATE id=id; -- Skip if already exists

        SET i = i + 1;
    END WHILE;
END//

DELIMITER ;

-- Step 2: Execute the procedure
CALL create_test_users();

-- Step 3: Join all test users to competition ID 1 (Premier League Survivor 2026)
INSERT INTO competition_participants (competition_id, user_id, status, joined_at)
SELECT
    1, -- Competition ID
    u.id,
    'ACTIVE',
    NOW()
FROM users u
WHERE u.username LIKE 'testuser%'
AND NOT EXISTS (
    SELECT 1 FROM competition_participants cp
    WHERE cp.competition_id = 1 AND cp.user_id = u.id
);

-- Step 4: Create picks for Gameweek 3 (the next upcoming one) for all test users
-- Distribute them across all 20 teams randomly

INSERT INTO picks (competition_id, user_id, gameweek_id, team_id, source, locked, picked_at)
SELECT
    1, -- Competition ID
    u.id,
    (SELECT id FROM gameweeks WHERE competition_id = 1 AND week_number = 3 LIMIT 1),
    (SELECT id FROM teams ORDER BY RAND() LIMIT 1), -- Random team
    'USER',
    1, -- Locked for simulation
    NOW()
FROM users u
WHERE u.username LIKE 'testuser%'
AND NOT EXISTS (
    SELECT 1 FROM picks p
    WHERE p.competition_id = 1 AND p.user_id = u.id AND p.gameweek_id = (SELECT id FROM gameweeks WHERE competition_id = 1 AND week_number = 3 LIMIT 1)
);

-- Verify counts
SELECT
    'Users created' AS description,
    COUNT(*) AS count
FROM users
WHERE username LIKE 'testuser%'

UNION ALL

SELECT
    'Joined competition 1' AS description,
    COUNT(*) AS count
FROM competition_participants
WHERE competition_id = 1 AND user_id IN (SELECT id FROM users WHERE username LIKE 'testuser%')

UNION ALL

SELECT
    'Total participants in competition 1' AS description,
    COUNT(*) AS count
FROM competition_participants
WHERE competition_id = 1;

-- Clean up procedure
DROP PROCEDURE IF EXISTS create_test_users;
