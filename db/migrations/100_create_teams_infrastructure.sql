-- Migration: Create Teams Infrastructure
-- Date: 2025-11-29
-- Purpose: Create all tables for team management, agent assignments, and performance tracking
-- Dependencies: clients, users, sector_agents tables must exist

-- STEP 1: Create teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  sector VARCHAR(50) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  lead_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE (client_id, sector, name)
);

CREATE INDEX IF NOT EXISTS idx_teams_client_id ON teams(client_id);
CREATE INDEX IF NOT EXISTS idx_teams_sector ON teams(sector);
CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);
CREATE INDEX IF NOT EXISTS idx_teams_created_at ON teams(created_at);

-- STEP 2: Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('lead', 'senior', 'member', 'trainee')),
  performance_score INT DEFAULT 0,
  avg_rating DECIMAL(3, 2) DEFAULT 0,
  calls_this_week INT DEFAULT 0,
  calls_total INT DEFAULT 0,
  success_rate DECIMAL(5, 2) DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON team_members(role);
CREATE INDEX IF NOT EXISTS idx_team_members_performance_score ON team_members(performance_score);
CREATE INDEX IF NOT EXISTS idx_team_members_active ON team_members(active);

-- STEP 3: Create team_agent_assignments table
CREATE TABLE IF NOT EXISTS team_agent_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  agent_type VARCHAR(255) NOT NULL,
  agent_class VARCHAR(500),
  proficiency_level INT DEFAULT 80 CHECK (proficiency_level >= 0 AND proficiency_level <= 100),
  calls_handled INT DEFAULT 0,
  success_rate DECIMAL(5, 2) DEFAULT 0,
  avg_handling_time INT DEFAULT 0,
  customer_satisfaction DECIMAL(3, 2) DEFAULT 0,
  last_used TIMESTAMP,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE (team_member_id, agent_type)
);

CREATE INDEX IF NOT EXISTS idx_assignments_team_member ON team_agent_assignments(team_member_id);
CREATE INDEX IF NOT EXISTS idx_assignments_agent_type ON team_agent_assignments(agent_type);
CREATE INDEX IF NOT EXISTS idx_assignments_proficiency ON team_agent_assignments(proficiency_level);
CREATE INDEX IF NOT EXISTS idx_assignments_success_rate ON team_agent_assignments(success_rate);

-- STEP 4: Create team_performance table
CREATE TABLE IF NOT EXISTS team_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  calls_handled INT DEFAULT 0,
  calls_completed INT DEFAULT 0,
  calls_escalated INT DEFAULT 0,
  avg_duration_seconds INT DEFAULT 0,
  avg_satisfaction DECIMAL(3, 2) DEFAULT 0,
  success_rate DECIMAL(5, 2) DEFAULT 0,
  resolution_rate DECIMAL(5, 2) DEFAULT 0,
  issues_resolved INT DEFAULT 0,
  issues_escalated INT DEFAULT 0,
  avg_waiting_time INT DEFAULT 0,
  peak_hour VARCHAR(5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE (team_id, team_member_id, date)
);

CREATE INDEX IF NOT EXISTS idx_perf_team_id ON team_performance(team_id);
CREATE INDEX IF NOT EXISTS idx_perf_team_member_id ON team_performance(team_member_id);
CREATE INDEX IF NOT EXISTS idx_perf_date ON team_performance(date);
CREATE INDEX IF NOT EXISTS idx_perf_success_rate ON team_performance(success_rate);

-- STEP 5: Create channels table for multi-channel configuration
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel_type VARCHAR(50) NOT NULL CHECK (channel_type IN ('sms', 'email', 'whatsapp', 'voice', 'telegram')),
  provider VARCHAR(100),
  is_enabled BOOLEAN DEFAULT FALSE,
  configuration JSONB,
  credentials JSONB,
  webhook_url TEXT,
  webhook_secret TEXT,
  rate_limit_per_hour INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE (client_id, channel_type)
);

CREATE INDEX IF NOT EXISTS idx_channels_client_id ON channels(client_id);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(channel_type);
CREATE INDEX IF NOT EXISTS idx_channels_enabled ON channels(is_enabled);

-- STEP 6: Update agent_metrics if it already exists, or create it (modified to avoid duplicates)
CREATE TABLE IF NOT EXISTS agent_metrics_v2 (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  agent_type VARCHAR(255),
  date DATE NOT NULL,
  calls_handled INT DEFAULT 0,
  calls_successful INT DEFAULT 0,
  calls_failed INT DEFAULT 0,
  avg_handling_time INT DEFAULT 0,
  avg_customer_satisfaction DECIMAL(3, 2) DEFAULT 0,
  resolution_rate DECIMAL(5, 2) DEFAULT 0,
  escalation_rate DECIMAL(5, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE (team_member_id, agent_type, date)
);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_client ON agent_metrics_v2(client_id);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_team_member ON agent_metrics_v2(team_member_id);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_type ON agent_metrics_v2(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_date ON agent_metrics_v2(date);

-- STEP 7: Create business_rules table for sector-specific rules
CREATE TABLE IF NOT EXISTS business_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sector VARCHAR(50) NOT NULL,
  rule_name VARCHAR(255) NOT NULL,
  rule_type VARCHAR(50) CHECK (rule_type IN ('escalation', 'routing', 'automation', 'response', 'validation')),
  conditions JSONB NOT NULL,
  actions JSONB NOT NULL,
  priority INT DEFAULT 100,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rules_client ON business_rules(client_id);
CREATE INDEX IF NOT EXISTS idx_rules_sector ON business_rules(sector);
CREATE INDEX IF NOT EXISTS idx_rules_type ON business_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON business_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_rules_priority ON business_rules(priority);

-- STEP 8: Create settings_audit table for configuration change tracking
CREATE TABLE IF NOT EXISTS settings_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  setting_name VARCHAR(255) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  change_type VARCHAR(50) CHECK (change_type IN ('created', 'updated', 'deleted')),
  reason TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_client ON settings_audit(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_changed_by ON settings_audit(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON settings_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_setting_name ON settings_audit(setting_name);

-- STEP 9: Create triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
DROP TRIGGER IF EXISTS update_team_members_updated_at ON team_members;
DROP TRIGGER IF EXISTS update_team_agent_assignments_updated_at ON team_agent_assignments;
DROP TRIGGER IF EXISTS update_team_performance_updated_at ON team_performance;
DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
DROP TRIGGER IF EXISTS update_agent_metrics_v2_updated_at ON agent_metrics_v2;
DROP TRIGGER IF EXISTS update_business_rules_updated_at ON business_rules;

-- Create triggers
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON team_members
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_agent_assignments_updated_at BEFORE UPDATE ON team_agent_assignments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_performance_updated_at BEFORE UPDATE ON team_performance
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_metrics_v2_updated_at BEFORE UPDATE ON agent_metrics_v2
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_rules_updated_at BEFORE UPDATE ON business_rules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- STEP 10: Create indexes for query optimization
CREATE INDEX IF NOT EXISTS idx_teams_client_sector ON teams(client_id, sector);
CREATE INDEX IF NOT EXISTS idx_team_members_team_role ON team_members(team_id, role);
CREATE INDEX IF NOT EXISTS idx_assignments_team_success ON team_agent_assignments(team_member_id, success_rate);
CREATE INDEX IF NOT EXISTS idx_performance_team_date ON team_performance(team_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_channels_client_type_enabled ON channels(client_id, channel_type, is_enabled);
CREATE INDEX IF NOT EXISTS idx_metrics_agent_date ON agent_metrics_v2(agent_type, date DESC);
CREATE INDEX IF NOT EXISTS idx_rules_client_sector ON business_rules(client_id, sector, enabled);
CREATE INDEX IF NOT EXISTS idx_audit_client_date ON settings_audit(client_id, created_at DESC);

-- STEP 11: Add missing columns to existing tables (if needed)
-- Add columns to calls table if they don't exist
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS agent_type VARCHAR(255);
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS escalation_reason VARCHAR(255);
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS handling_time_seconds INT;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_calls_team_id ON calls(team_id);
CREATE INDEX IF NOT EXISTS idx_calls_team_member_id ON calls(team_member_id);
CREATE INDEX IF NOT EXISTS idx_calls_agent_type ON calls(agent_type);

-- STEP 12: Grant permissions (if using separate DB user - optional)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO caly_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO caly_user;

-- Verification queries
SELECT '✅ Teams infrastructure created successfully!' as status;

-- Show created tables and their sizes
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN (
  'teams', 'team_members', 'team_agent_assignments', 'team_performance',
  'channels', 'agent_metrics_v2', 'business_rules', 'settings_audit'
)
ORDER BY pg_total_relation_size('public.' || tablename) DESC;
