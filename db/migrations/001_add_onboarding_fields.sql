-- Backend/db/migrations/001_add_onboarding_fields.sql
-- Migration to add onboarding and integration fields to clients table

ALTER TABLE clients ADD COLUMN IF NOT EXISTS shopify_store VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS shopify_api_key VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS shopify_api_secret_encrypted TEXT;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS exotel_sid VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS exotel_number VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS exotel_token_encrypted TEXT;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS return_window_days INTEGER DEFAULT 14;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS refund_auto_threshold NUMERIC(10,2) DEFAULT 2000;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cancel_window_hours INTEGER DEFAULT 24;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS escalation_threshold INTEGER DEFAULT 60;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS enable_whatsapp BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS enable_sms BOOLEAN DEFAULT true;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS enable_email BOOLEAN DEFAULT true;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_configured BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP;

-- Add index for quick lookup of configured clients
CREATE INDEX IF NOT EXISTS idx_clients_is_configured ON clients(is_configured);
CREATE INDEX IF NOT EXISTS idx_clients_onboarding_completed ON clients(onboarding_completed_at);
