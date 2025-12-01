-- ============================================================================
-- MIGRATION: Complete App Rebuild - Dynamic, Multi-Sector, Multi-Provider
-- DATE: November 30, 2025
-- ============================================================================

-- ============================================================================
-- 1. SECTOR CONFIGURATIONS (Flexible APIs per sector)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sector_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sector VARCHAR(100) NOT NULL,
  required_apis JSONB DEFAULT '[]', -- List of API types needed
  optional_apis JSONB DEFAULT '[]',
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, sector)
);

CREATE INDEX IF NOT EXISTS idx_sector_config_client ON sector_configurations(client_id);
CREATE INDEX IF NOT EXISTS idx_sector_config_sector ON sector_configurations(sector);

-- ============================================================================
-- 2. API CREDENTIALS (Generic, encrypted storage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  api_type VARCHAR(100) NOT NULL, -- 'shopify', 'emr_epic', 'mls', 'stripe', etc.
  provider_name VARCHAR(100) NOT NULL, -- User-friendly name
  sector VARCHAR(100) NOT NULL, -- Which sector this API belongs to
  encrypted_credentials JSONB NOT NULL, -- AES-256 encrypted JSON
  status VARCHAR(50) DEFAULT 'pending', -- pending, active, inactive, expired
  verified BOOLEAN DEFAULT false,
  last_verified_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, api_type, sector)
);

CREATE INDEX IF NOT EXISTS idx_api_creds_client ON api_credentials(client_id);
CREATE INDEX IF NOT EXISTS idx_api_creds_sector ON api_credentials(sector);
CREATE INDEX IF NOT EXISTS idx_api_creds_type ON api_credentials(api_type);

-- ============================================================================
-- 3. TELEPHONY CONFIGURATION (Multi-provider support)
-- ============================================================================
CREATE TABLE IF NOT EXISTS telephony_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider_type VARCHAR(100) NOT NULL, -- 'exotel', 'twilio', 'voicebase', 'jio_calls'
  phone_number VARCHAR(20) NOT NULL,
  provider_credentials JSONB NOT NULL, -- Encrypted
  webhook_url VARCHAR(500),
  webhook_secret VARCHAR(255), -- For signature verification
  status VARCHAR(50) DEFAULT 'pending', -- pending, active, inactive
  verified BOOLEAN DEFAULT false,
  last_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_tel_config_client ON telephony_config(client_id);
CREATE INDEX IF NOT EXISTS idx_tel_config_provider ON telephony_config(provider_type);

-- ============================================================================
-- 4. AGENTS REGISTRY (All 54+ agents, centralized)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agents_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name VARCHAR(255) NOT NULL UNIQUE, -- 'OrderStatusAgent', 'AppointmentBookingAgent'
  agent_type VARCHAR(100), -- For grouping
  sector VARCHAR(100) NOT NULL,
  description TEXT,
  capabilities JSONB NOT NULL, -- ['order_lookup', 'track_shipment']
  required_apis JSONB NOT NULL, -- ['shopify', 'tracking_api']
  optional_apis JSONB DEFAULT '[]',
  languages JSONB DEFAULT '["hindi", "english"]',
  timeout_ms INT DEFAULT 30000,
  compliance_requirements JSONB, -- {'hipaa': true, 'gdpr': false}
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_agent_sector (sector),
  INDEX idx_agent_active (is_active)
);

-- ============================================================================
-- 5. AGENT ASSIGNMENTS (Which agents each client has enabled)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_name VARCHAR(255) NOT NULL REFERENCES agents_registry(agent_name),
  sector VARCHAR(100) NOT NULL,
  enabled BOOLEAN DEFAULT false, -- Client explicitly enables this agent
  priority INT DEFAULT 100, -- If multiple agents can handle, pick by priority
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, sector, agent_name)
);

CREATE INDEX IF NOT EXISTS idx_agent_assign_client ON agent_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_agent_assign_sector ON agent_assignments(sector);

-- ============================================================================
-- 6. RULES & TONE CONFIGURATION
-- ============================================================================
CREATE TABLE IF NOT EXISTS rules_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sector VARCHAR(100) NOT NULL,
  tone VARCHAR(100) DEFAULT 'professional', -- 'formal', 'casual', 'empathetic', 'professional'
  greeting TEXT,
  closing TEXT,
  language_preference VARCHAR(50) DEFAULT 'auto', -- 'hindi', 'english', 'hinglish', 'auto'
  behavior_rules JSONB, -- {response_time, politeness_level, etc.}
  escalation_rules JSONB, -- {timeout_attempts, sentiment_threshold, etc.}
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, sector)
);

CREATE INDEX IF NOT EXISTS idx_rules_client ON rules_config(client_id);

-- ============================================================================
-- 7. TEAMS (Human staff groups)
-- ============================================================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sector VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active', -- active, inactive, archived
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_client ON teams(client_id);

-- ============================================================================
-- 8. TEAM MEMBERS (Individual staff)
-- ============================================================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'agent', -- agent, supervisor, manager, admin
  status VARCHAR(50) DEFAULT 'active', -- active, inactive, onboarding
  proficiency_level INT DEFAULT 50, -- 0-100
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

-- ============================================================================
-- 9. TEAM MEMBER AGENT ASSIGNMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS team_member_agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  agent_name VARCHAR(255) NOT NULL REFERENCES agents_registry(agent_name),
  sector VARCHAR(100) NOT NULL,
  proficiency_level INT DEFAULT 50, -- 0-100: how skilled this person is with this agent
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(member_id, agent_name)
);

CREATE INDEX IF NOT EXISTS idx_member_agent_member ON team_member_agent_assignments(member_id);

-- ============================================================================
-- 10. ENHANCED CALL BILLING (Track every call precisely)
-- ============================================================================
CREATE TABLE IF NOT EXISTS call_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id VARCHAR(255) NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id),
  sector VARCHAR(100),
  agent_name VARCHAR(255),
  team_id UUID REFERENCES teams(id),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration_sec INT, -- Duration in seconds (calculated at end)
  charge_amount DECIMAL(10, 2), -- ₹2 per minute
  status VARCHAR(50) DEFAULT 'in_progress', -- in_progress, completed, escalated, failed
  escalated_to_human BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_client ON call_billing(client_id);
CREATE INDEX IF NOT EXISTS idx_billing_sector ON call_billing(sector);

-- ============================================================================
-- 11. AUDIT LOG (All changes tracked)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100), -- CREATE, UPDATE, DELETE, READ, TEST
  resource_type VARCHAR(100), -- credential, agent, rule, team, call
  resource_id VARCHAR(255),
  old_value JSONB,
  new_value JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_log(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);

-- ============================================================================
-- FINAL: Mark as complete
-- ============================================================================
INSERT INTO schema_migrations (version, description) VALUES ('201', 'Complete app rebuild schema') ON CONFLICT DO NOTHING;
