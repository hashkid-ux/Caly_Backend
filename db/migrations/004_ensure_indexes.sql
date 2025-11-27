-- Migration: Fix schema indexes and constraints
-- Description: Ensures all necessary indexes exist for performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_client_id ON users(client_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Calls table indexes (if table exists)
CREATE INDEX IF NOT EXISTS idx_calls_client_id ON calls(client_id);
CREATE INDEX IF NOT EXISTS idx_calls_start_ts ON calls(start_ts);
CREATE INDEX IF NOT EXISTS idx_calls_phone_from ON calls(phone_from);
CREATE INDEX IF NOT EXISTS idx_calls_resolved ON calls(resolved);

-- Actions table indexes (if table exists)
CREATE INDEX IF NOT EXISTS idx_actions_call_id ON actions(call_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_type ON actions(action_type);

-- Entities table indexes (if table exists)
CREATE INDEX IF NOT EXISTS idx_entities_call_id ON entities(call_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);

-- Audit logs indexes (if table exists)
CREATE INDEX IF NOT EXISTS idx_audit_logs_call_id ON audit_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_client_id ON audit_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Agent metrics indexes (if table exists)
CREATE INDEX IF NOT EXISTS idx_agent_metrics_client_date ON agent_metrics(client_id, date);

SELECT 'Schema indexes migration completed' as status;
