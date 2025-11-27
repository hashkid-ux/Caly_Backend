-- Migration 005: Make password_hash nullable for OAuth users
-- Purpose: Allow Google OAuth users to not have a password_hash (NULL is valid for OAuth-only users)
-- 
-- Background:
-- - Before: password_hash was NOT NULL, blocking OAuth user creation
-- - Issue: OAuth users don't have passwords, causing "null value violates not-null constraint" errors
-- - Solution: Make password_hash nullable with DEFAULT NULL
-- 
-- Safety: 
-- - Existing password users keep their hashes (no data loss)
-- - OAuth users now allowed with NULL password_hash
-- - Backward compatible: password-based auth still works
-- - Rollback: ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;

BEGIN;

-- Make password_hash nullable
ALTER TABLE users 
ALTER COLUMN password_hash DROP NOT NULL;

-- Add DEFAULT NULL for clarity (new inserts without password will be NULL)
ALTER TABLE users 
ALTER COLUMN password_hash SET DEFAULT NULL;

-- Log the migration
INSERT INTO migrations (name, applied_at) 
VALUES ('005_make_password_nullable_for_oauth', NOW())
ON CONFLICT (name) DO NOTHING;

COMMIT;
