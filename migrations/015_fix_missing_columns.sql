-- Migration: Fix missing columns in sector_agents and calls tables
-- Date: 2025-11-30
-- Description: Add missing columns that code references but don't exist in schema

-- 1. Add 'is_available' column to sector_agents as alias for 'enabled'
ALTER TABLE IF EXISTS sector_agents ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;

-- Set is_available = enabled for consistency
UPDATE sector_agents SET is_available = enabled WHERE is_available IS NULL;

-- 2. Add 'call_status' column to calls table (for backward compatibility with performanceAggregator code)
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS call_status VARCHAR(50) DEFAULT 'pending';

-- Populate call_status based on resolved flag
UPDATE calls 
SET call_status = CASE 
  WHEN resolved = true THEN 'completed'
  WHEN resolved = false THEN 'pending'
  ELSE 'pending'
END
WHERE call_status = 'pending' OR call_status IS NULL;

-- 3. Add 'satisfaction_score' column as alias for 'customer_satisfaction'
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS satisfaction_score INTEGER;

-- Sync satisfaction_score with customer_satisfaction
UPDATE calls 
SET satisfaction_score = customer_satisfaction 
WHERE satisfaction_score IS NULL AND customer_satisfaction IS NOT NULL;

-- 4. Add missing columns that agents might use
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS agent_type VARCHAR(100);
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS team_member_id UUID;
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT FALSE;

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_calls_call_status ON calls(call_status);
CREATE INDEX IF NOT EXISTS idx_calls_resolved_status ON calls(resolved);
CREATE INDEX IF NOT EXISTS idx_sector_agents_enabled ON sector_agents(enabled);
CREATE INDEX IF NOT EXISTS idx_sector_agents_is_available ON sector_agents(is_available);

-- Migration metadata
INSERT INTO migrations (name, description, applied_at) 
VALUES (
  '015_fix_missing_columns',
  'Add missing columns for backward compatibility',
  NOW()
)
ON CONFLICT (name) DO NOTHING;
