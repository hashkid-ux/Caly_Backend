-- Phase 4 Database Optimizations
-- Adds indexes to frequently queried columns
-- Improves query performance under load
-- Run: psql -U postgres -d caly < 003-phase4-indexes.sql

-- =========================================================
-- Calls table indexes (most frequently queried)
-- =========================================================

-- Index on client_id + created_at (common queries)
CREATE INDEX IF NOT EXISTS idx_calls_client_id_created_at 
ON calls(client_id DESC, created_at DESC);

-- Index on client_id + status (for filtering)
CREATE INDEX IF NOT EXISTS idx_calls_client_id_status 
ON calls(client_id, status);

-- Index on phone_from (for lookup by phone)
CREATE INDEX IF NOT EXISTS idx_calls_phone_from 
ON calls(phone_from);

-- Index on resolved status (common filter)
CREATE INDEX IF NOT EXISTS idx_calls_resolved 
ON calls(resolved);

-- =========================================================
-- Actions table indexes
-- =========================================================

-- Index on call_id + created_at
CREATE INDEX IF NOT EXISTS idx_actions_call_id_created_at 
ON actions(call_id, created_at DESC);

-- =========================================================
-- Audit logs table indexes
-- =========================================================

-- Index on timestamp for retention queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp 
ON audit_logs(created_at DESC);

-- Index on event_type for monitoring
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type 
ON audit_logs(event_type);

-- =========================================================
-- Verify indexes were created
-- =========================================================

SELECT 
  schemaname,
  tablename,
  indexname
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
