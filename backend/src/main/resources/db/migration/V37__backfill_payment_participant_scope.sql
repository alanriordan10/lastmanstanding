-- Preserve existing manual/legacy payments after payments became entry-scoped.
-- If a user has multiple entries, an existing competition-level payment is attached
-- to their first entry. If duplicate legacy payments exist, only the earliest
-- succeeded payment is attached; the rest remain unscoped to avoid violating the
-- one-succeeded-payment-per-participant constraint.
WITH first_entries AS (
    SELECT DISTINCT ON (cp.competition_id, cp.user_id)
           cp.id AS participant_id,
           cp.competition_id,
           cp.user_id
    FROM competition_participants cp
    ORDER BY cp.competition_id, cp.user_id, cp.entry_number ASC, cp.id ASC
), candidate_payments AS (
    SELECT p.id AS payment_id,
           fe.participant_id,
           ROW_NUMBER() OVER (
               PARTITION BY fe.participant_id
               ORDER BY p.created_at ASC, p.id ASC
           ) AS payment_rank
    FROM payments p
    JOIN first_entries fe
      ON fe.competition_id = p.competition_id
     AND fe.user_id = p.user_id
    WHERE p.participant_id IS NULL
      AND p.status = 'SUCCEEDED'
      AND NOT EXISTS (
          SELECT 1
          FROM payments existing
          WHERE existing.participant_id = fe.participant_id
            AND existing.status = 'SUCCEEDED'
      )
)
UPDATE payments p
SET participant_id = candidate_payments.participant_id
FROM candidate_payments
WHERE p.id = candidate_payments.payment_id
  AND candidate_payments.payment_rank = 1;
