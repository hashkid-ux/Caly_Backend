-- ==========================================
-- Telephony Provider Configuration Tables
-- Migration: 202_telephony_providers.sql
-- ==========================================

-- ============================================
-- 1. Enhance telephony_config table
-- ============================================
ALTER TABLE telephony_config 
ADD COLUMN IF NOT EXISTS backup_provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS backup_credentials BYTEA,
ADD COLUMN IF NOT EXISTS failover_threshold INT DEFAULT 3,
ADD COLUMN IF NOT EXISTS failover_window INT DEFAULT 300,
ADD COLUMN IF NOT EXISTS health_check_interval INT DEFAULT 60,
ADD COLUMN IF NOT EXISTS tested_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS error_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT;

-- ============================================
-- 2. Create provider_status table
-- ============================================
CREATE TABLE IF NOT EXISTS provider_status (
  id SERIAL PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider_name VARCHAR(50) NOT NULL,
  is_healthy BOOLEAN DEFAULT true,
  last_check TIMESTAMP DEFAULT NOW(),
  consecutive_failures INT DEFAULT 0,
  last_error TEXT,
  call_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, provider_name)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_provider_status_client 
ON provider_status(client_id);

CREATE INDEX IF NOT EXISTS idx_provider_status_health 
ON provider_status(is_healthy);

-- ============================================
-- 3. Create provider_logs table
-- ============================================
CREATE TABLE IF NOT EXISTS provider_logs (
  id SERIAL PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider_name VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,  -- 'init', 'success', 'failure', 'failover', 'health_check'
  details JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Create index for fast queries
CREATE INDEX IF NOT EXISTS idx_provider_logs_client 
ON provider_logs(client_id);

CREATE INDEX IF NOT EXISTS idx_provider_logs_timestamp 
ON provider_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_provider_logs_provider 
ON provider_logs(provider_name);

-- ============================================
-- 4. Enhance call_billing table
-- ============================================
ALTER TABLE call_billing 
ADD COLUMN IF NOT EXISTS provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS external_call_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS call_type VARCHAR(50);  -- 'inbound', 'outbound'

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_call_billing_provider 
ON call_billing(provider);

CREATE INDEX IF NOT EXISTS idx_call_billing_external_id 
ON call_billing(external_call_id);

-- ============================================
-- 5. Create provider_credentials table
-- ============================================
CREATE TABLE IF NOT EXISTS provider_credentials (
  id SERIAL PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider_name VARCHAR(50) NOT NULL,
  encrypted_credentials BYTEA NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  tested_at TIMESTAMP,
  test_status VARCHAR(50),  -- 'success', 'failed'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, provider_name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_provider_credentials_client 
ON provider_credentials(client_id);

CREATE INDEX IF NOT EXISTS idx_provider_credentials_active 
ON provider_credentials(is_active);

-- ============================================
-- 6. Create provider_usage_stats table
-- ============================================
CREATE TABLE IF NOT EXISTS provider_usage_stats (
  id SERIAL PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider_name VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  total_calls INT DEFAULT 0,
  successful_calls INT DEFAULT 0,
  failed_calls INT DEFAULT 0,
  total_duration INT DEFAULT 0,  -- in seconds
  total_cost DECIMAL(10, 2) DEFAULT 0,
  uptime_percentage DECIMAL(5, 2) DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, provider_name, date)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_provider_usage_stats_client 
ON provider_usage_stats(client_id);

CREATE INDEX IF NOT EXISTS idx_provider_usage_stats_date 
ON provider_usage_stats(date);

-- ============================================
-- 7. Create call_quality_metrics table
-- ============================================
CREATE TABLE IF NOT EXISTS call_quality_metrics (
  id SERIAL PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  call_id VARCHAR(255),
  provider_name VARCHAR(50),
  call_duration INT,  -- in seconds
  audio_quality DECIMAL(3, 1),  -- 1-5 scale
  latency INT,  -- in milliseconds
  packet_loss DECIMAL(5, 2),  -- percentage
  jitter INT,  -- in milliseconds
  echo_cancellation_score DECIMAL(3, 1),
  call_completion_status VARCHAR(50),  -- 'completed', 'dropped', 'transferred'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_call_quality_client 
ON call_quality_metrics(client_id);

CREATE INDEX IF NOT EXISTS idx_call_quality_provider 
ON call_quality_metrics(provider_name);

-- ============================================
-- 8. Permissions and Constraints
-- ============================================

-- Ensure telephony_config has proper constraints
ALTER TABLE telephony_config 
ADD CONSTRAINT chk_provider_name CHECK (provider_name IN ('exotel', 'twilio', 'voicebase', 'custom'));

-- Ensure only one active provider per client
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_provider_per_client 
ON telephony_config(client_id) 
WHERE is_active = true;

-- ============================================
-- 9. Add updated_at triggers
-- ============================================

-- Update trigger for provider_status
CREATE OR REPLACE FUNCTION update_provider_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_provider_status_updated_at ON provider_status;
CREATE TRIGGER trigger_provider_status_updated_at
BEFORE UPDATE ON provider_status
FOR EACH ROW
EXECUTE FUNCTION update_provider_status_timestamp();

-- Update trigger for provider_credentials
CREATE OR REPLACE FUNCTION update_provider_credentials_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_provider_credentials_updated_at ON provider_credentials;
CREATE TRIGGER trigger_provider_credentials_updated_at
BEFORE UPDATE ON provider_credentials
FOR EACH ROW
EXECUTE FUNCTION update_provider_credentials_timestamp();

-- ============================================
-- 10. Validation
-- ============================================

-- Verify migration
SELECT 
  'Tables created/updated:' as status,
  COUNT(*) as table_count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'telephony_config',
  'provider_status',
  'provider_logs',
  'provider_credentials',
  'provider_usage_stats',
  'call_quality_metrics'
);

-- All tables and columns created successfully!
