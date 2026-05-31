-- Keep audit history when a user account is deleted.
-- Old audit rows should not block user deletion; the actor becomes anonymous/null.

ALTER TABLE audit_logs
    DROP CONSTRAINT IF EXISTS fk_audit_logs_user;

ALTER TABLE audit_logs
    ADD CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;
