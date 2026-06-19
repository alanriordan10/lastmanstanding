-- Completed competitions never play remaining UPCOMING gameweeks.
-- Preserve all locked/in-progress/completed history and remove only unused future data.
DELETE FROM pick_results
WHERE pick_id IN (
    SELECT p.id
    FROM picks p
    JOIN gameweeks g ON g.id = p.gameweek_id
    JOIN competitions c ON c.id = g.competition_id
    WHERE c.status = 'COMPLETED' AND g.status = 'UPCOMING'
);

DELETE FROM picks
WHERE gameweek_id IN (
    SELECT g.id
    FROM gameweeks g
    JOIN competitions c ON c.id = g.competition_id
    WHERE c.status = 'COMPLETED' AND g.status = 'UPCOMING'
);

DELETE FROM fixtures
WHERE gameweek_id IN (
    SELECT g.id
    FROM gameweeks g
    JOIN competitions c ON c.id = g.competition_id
    WHERE c.status = 'COMPLETED' AND g.status = 'UPCOMING'
);

DELETE FROM gameweeks
WHERE status = 'UPCOMING'
  AND competition_id IN (
      SELECT id FROM competitions WHERE status = 'COMPLETED'
  );
