-- Caly Database Schema for PostgreSQL (Production Ready)
-- Run this to create all required tables for multi-tenancy

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- SESSION TABLE (for connect-pg-simple)
-- ========================================
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar PRIMARY KEY COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Clients table: Multi-tenant client configuration
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  
  -- ✅ SECTOR EXPANSION: Add sector field
  sector VARCHAR(50) DEFAULT 'ecommerce', -- ecommerce|healthcare|realestate|logistics|fintech|support|telecom|government|education|saas|custom
  
  -- Shopify Integration
  shopify_store_url TEXT UNIQUE,
  shopify_api_key TEXT,
  shopify_api_secret TEXT,
  
  -- Shiprocket Integration (future)
  shiprocket_email TEXT,
  shiprocket_password TEXT,
  
  -- Exotel Configuration
  exotel_number TEXT,
  exotel_sid TEXT,
  exotel_token TEXT,
  
  -- WhatsApp Business (future)
  whatsapp_business_id TEXT,
  
  -- Business Rules (E-commerce defaults, overridable per sector)
  return_window_days INTEGER DEFAULT 14,
  refund_auto_threshold INTEGER DEFAULT 2000,
  cancel_window_hours INTEGER DEFAULT 24,
  retention_days INTEGER DEFAULT 45,
  
  -- Feature Flags
  enable_whatsapp BOOLEAN DEFAULT FALSE,
  enable_sms BOOLEAN DEFAULT TRUE,
  enable_email BOOLEAN DEFAULT TRUE,
  
  -- Status
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ✅ SECTOR EXPANSION: Create sector_configurations table
CREATE TABLE IF NOT EXISTS sector_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sector VARCHAR(50) NOT NULL, -- Denormalized for efficiency
  
  -- Generic config JSON (flexible per sector)
  -- E-commerce: {return_window_days, refund_threshold, cancel_window_hours}
  -- Healthcare: {appointment_buffer_mins, escalation_wait_time, hipaa_enabled}
  -- Real Estate: {followup_window_hours, showing_duration_mins, offer_expiry_hours}
  -- Logistics: {delivery_attempt_limit, address_clarification_threshold}
  -- Fintech: {transaction_verification_timeout, fraud_alert_threshold}
  config JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, sector)
);

-- ✅ SECTOR EXPANSION: Create sector_agents table (maps which agents are available per sector)
CREATE TABLE IF NOT EXISTS sector_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sector VARCHAR(50) NOT NULL,
  agent_type VARCHAR(100) NOT NULL, -- e.g., OrderStatusAgent, AppointmentBookingAgent, PropertyInquiryAgent
  agent_class VARCHAR(255) NOT NULL, -- Full class name for dynamic loading
  enabled BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 100, -- Lower = higher priority for intent matching
  success_rate FLOAT DEFAULT 0.8, -- Success rate for routing optimization
  avg_handling_time INTEGER DEFAULT 300, -- Average handling time in seconds
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(sector, agent_type)
);

-- Ensure performance columns exist (safe for existing DBs)
ALTER TABLE IF EXISTS sector_agents ADD COLUMN IF NOT EXISTS success_rate FLOAT DEFAULT 0.8;
ALTER TABLE IF EXISTS sector_agents ADD COLUMN IF NOT EXISTS avg_handling_time INTEGER DEFAULT 300;

-- ✅ SECTOR EXPANSION: Create sector_entities table (defines entity types per sector)
CREATE TABLE IF NOT EXISTS sector_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sector VARCHAR(50) NOT NULL,
  entity_type VARCHAR(100) NOT NULL, -- e.g., order_id, patient_id, property_id, parcel_id
  description TEXT,
  extraction_hints TEXT[], -- Helper text for NER (Named Entity Recognition)
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(sector, entity_type)
);

-- ✅ SECTOR EXPANSION: Create sector_intent_patterns table (intent detection patterns per sector)
CREATE TABLE IF NOT EXISTS sector_intent_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sector VARCHAR(50) NOT NULL,
  intent VARCHAR(100) NOT NULL, -- e.g., BOOK_APPOINTMENT, TRACK_ORDER, PROPERTY_INQUIRY
  language VARCHAR(10) NOT NULL DEFAULT 'en', -- en, hi, es, fr, etc.
  regex_pattern TEXT NOT NULL, -- RegEx for pattern matching
  examples TEXT[], -- Example phrases that match
  priority INTEGER DEFAULT 100,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(sector, intent, language)
);

-- Users table: User accounts with passwords (one-to-many with clients)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'user',
  otp_code VARCHAR(6),
  otp_expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP WITH TIME ZONE,
  -- Google OAuth columns
  google_id VARCHAR(255) UNIQUE,
  google_refresh_token TEXT,
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_client_id ON users(client_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Ensure OAuth columns exist (safe for existing databases)
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id_alt ON users(google_id) WHERE google_id IS NOT NULL;

-- Calls table: Main call records (per client)
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  call_sid TEXT UNIQUE,
  phone_from TEXT,
  phone_to TEXT,
  start_ts TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_ts TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  transcript_full TEXT,
  recording_url TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  escalated BOOLEAN DEFAULT FALSE,
  customer_satisfaction INTEGER, -- 1-5 rating
  agent_type VARCHAR(100),
  team_member_id UUID,
  team_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure all required columns exist with ALTER TABLE (safe for existing DBs)
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS agent_type VARCHAR(100);
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS team_member_id UUID;
ALTER TABLE IF EXISTS calls ADD COLUMN IF NOT EXISTS team_id UUID;

-- Actions table: Tracks all backend actions performed during calls
CREATE TABLE IF NOT EXISTS actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  params JSONB,
  status TEXT DEFAULT 'pending', -- pending|success|failed
  result JSONB,
  confidence FLOAT,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Entities table: Extracted information from conversations
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- order_id, phone, email, name, product_id, etc.
  value TEXT,
  confidence FLOAT,
  source TEXT, -- 'user_speech' | 'ai_inference'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit logs: Track all system actions for security and compliance
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  user_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent Performance Metrics (for analytics)
CREATE TABLE IF NOT EXISTS agent_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  total_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  avg_duration_ms INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, agent_type, date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_calls_client_id ON calls(client_id);
CREATE INDEX IF NOT EXISTS idx_calls_start_ts ON calls(start_ts);
CREATE INDEX IF NOT EXISTS idx_calls_phone_from ON calls(phone_from);
CREATE INDEX IF NOT EXISTS idx_calls_resolved ON calls(resolved);
CREATE INDEX IF NOT EXISTS idx_actions_call_id ON actions(call_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_type ON actions(action_type);
CREATE INDEX IF NOT EXISTS idx_entities_call_id ON entities(call_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_call_id ON audit_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_client_id ON audit_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_client_date ON agent_metrics(client_id, date);

-- ✅ SECTOR EXPANSION: Indexes for new sector tables
CREATE INDEX IF NOT EXISTS idx_sector_configs_client_id ON sector_configurations(client_id, sector);
CREATE INDEX IF NOT EXISTS idx_sector_agents_sector ON sector_agents(sector, enabled);
CREATE INDEX IF NOT EXISTS idx_sector_entities_sector ON sector_entities(sector);
CREATE INDEX IF NOT EXISTS idx_sector_intent_patterns_sector_intent ON sector_intent_patterns(sector, intent, language);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers before recreating them
DROP TRIGGER IF EXISTS update_calls_updated_at ON calls;
DROP TRIGGER IF EXISTS update_actions_updated_at ON actions;
DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

-- Add triggers to auto-update updated_at
CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_actions_updated_at BEFORE UPDATE ON actions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for client dashboard (optional but useful)
CREATE OR REPLACE VIEW client_dashboard_stats AS
SELECT 
  c.id as client_id,
  c.name as client_name,
  COUNT(DISTINCT ca.id) as total_calls,
  COUNT(DISTINCT CASE WHEN ca.resolved = true THEN ca.id END) as resolved_calls,
  ROUND(
    CAST(COUNT(DISTINCT CASE WHEN ca.resolved = true THEN ca.id END) AS NUMERIC) / 
    NULLIF(COUNT(DISTINCT ca.id), 0) * 100, 
    2
  ) as automation_rate,
  ROUND(AVG(EXTRACT(EPOCH FROM (ca.end_ts - ca.start_ts))), 0) as avg_duration_seconds,
  COUNT(DISTINCT a.id) as total_actions,
  COUNT(DISTINCT CASE WHEN a.status = 'success' THEN a.id END) as successful_actions
FROM clients c
LEFT JOIN calls ca ON c.id = ca.client_id
LEFT JOIN actions a ON ca.id = a.call_id
WHERE ca.start_ts >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY c.id, c.name;

-- Query to verify setup
SELECT 'Database schema created successfully!' as status,
       COUNT(*) as total_clients
FROM clients;

-- Show table sizes (for monitoring)
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Grant permissions (if using separate DB user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO caly_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO caly_user;