-- =============================================================================
-- V11__cleanup_sparse_gameweeks.sql
-- Remove gameweeks that have fewer than 3 playable (non-postponed, non-cancelled)
-- fixtures — these were created erroneously from single-fixture PL weeks.
-- =============================================================================

-- Delete fixtures belonging to gameweeks that have < 3 playable fixtures
DELETE FROM fixtures
WHERE gameweek_id IN (
    SELECT gw.id
    FROM gameweeks gw
    JOIN fixtures f2 ON f2.gameweek_id = gw.id
    GROUP BY gw.id
    HAVING SUM(CASE WHEN COALESCE(f2.override_status, f2.imported_status) NOT IN ('POSTPONED','CANCELLED') THEN 1 ELSE 0 END) < 3
);

-- Delete the now-empty (or sparse) gameweeks themselves
DELETE FROM gameweeks
WHERE id NOT IN (
    SELECT DISTINCT gameweek_id FROM fixtures
)
AND status = 'UPCOMING';
