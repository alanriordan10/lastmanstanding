-- Repair the invalid state produced by older builds that allowed simulation while
-- a competition was paused. These rounds had resolved overrides but remained UPCOMING.
DELETE FROM pick_results
WHERE pick_id IN (
    SELECT p.id
    FROM picks p
    JOIN gameweeks g ON g.id = p.gameweek_id
    WHERE g.status = 'UPCOMING'
      AND EXISTS (
          SELECT 1 FROM fixtures f
          WHERE f.gameweek_id = g.id
            AND f.override_status IN ('FINISHED', 'POSTPONED', 'CANCELLED')
      )
      AND NOT EXISTS (
          SELECT 1 FROM fixtures f
          WHERE f.gameweek_id = g.id
            AND COALESCE(f.override_status, f.imported_status) NOT IN ('FINISHED', 'POSTPONED', 'CANCELLED')
      )
);

DELETE FROM picks
WHERE gameweek_id IN (
    SELECT g.id
    FROM gameweeks g
    WHERE g.status = 'UPCOMING'
      AND EXISTS (
          SELECT 1 FROM fixtures f
          WHERE f.gameweek_id = g.id
            AND f.override_status IN ('FINISHED', 'POSTPONED', 'CANCELLED')
      )
      AND NOT EXISTS (
          SELECT 1 FROM fixtures f
          WHERE f.gameweek_id = g.id
            AND COALESCE(f.override_status, f.imported_status) NOT IN ('FINISHED', 'POSTPONED', 'CANCELLED')
      )
);

UPDATE gameweeks g
SET status = 'COMPLETED',
    bye_granted = TRUE,
    voided = TRUE,
    void_reason = 'Competition was paused when this gameweek was simulated. All active entries advance.'
WHERE g.status = 'UPCOMING'
  AND EXISTS (
      SELECT 1 FROM fixtures f
      WHERE f.gameweek_id = g.id
        AND f.override_status IN ('FINISHED', 'POSTPONED', 'CANCELLED')
  )
  AND NOT EXISTS (
      SELECT 1 FROM fixtures f
      WHERE f.gameweek_id = g.id
        AND COALESCE(f.override_status, f.imported_status) NOT IN ('FINISHED', 'POSTPONED', 'CANCELLED')
  );
