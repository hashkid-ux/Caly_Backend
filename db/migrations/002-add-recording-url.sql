-- Backend/db/migrations/002-add-recording-url.sql - Add recording storage support

-- Add recording_url column to calls table if it doesn't exist
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS recording_url VARCHAR(500) DEFAULT NULL;

-- Add call_charges table for billing
CREATE TABLE IF NOT EXISTS call_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  duration_seconds INTEGER NOT NULL,
  rate_per_minute DECIMAL(10, 2) NOT NULL DEFAULT 30,
  total_amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_calls_recording_url ON calls(recording_url);
CREATE INDEX IF NOT EXISTS idx_call_charges_client_id ON call_charges(client_id);
CREATE INDEX IF NOT EXISTS idx_call_charges_created_at ON call_charges(created_at);
CREATE INDEX IF NOT EXISTS idx_call_charges_call_id ON call_charges(call_id);

-- Add duration_seconds and charge_amount to calls if not exists
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS charge_amount DECIMAL(10, 2) DEFAULT 0;
