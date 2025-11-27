-- Migration: Add settings JSONB column to clients table
-- Purpose: Consolidate all individual settings into a single JSON column
-- This allows flexible storage and retrieval of client configuration
-- Date: 2025-11-27

-- Step 1: Add the settings column as nullable JSONB
ALTER TABLE clients ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT NULL;

-- Step 2: Migrate existing data from individual columns to JSON structure
-- Only update rows that don't already have settings populated
UPDATE clients 
SET settings = jsonb_build_object(
  'shopify', jsonb_build_object(
    'store', COALESCE(shopify_store_url, ''),
    'apiKey', COALESCE(shopify_api_key, ''),
    'apiSecret', COALESCE(shopify_api_secret, '')
  ),
  'exotel', jsonb_build_object(
    'number', COALESCE(exotel_number, ''),
    'sid', COALESCE(exotel_sid, ''),
    'token', COALESCE(exotel_token, '')
  ),
  'business', jsonb_build_object(
    'returnWindowDays', COALESCE(return_window_days, 14),
    'refundAutoThreshold', COALESCE(refund_auto_threshold, 2000),
    'cancelWindowHours', COALESCE(cancel_window_hours, 24),
    'escalationThreshold', 60
  ),
  'channels', jsonb_build_object(
    'whatsApp', COALESCE(enable_whatsapp, false),
    'sms', COALESCE(enable_sms, true),
    'email', COALESCE(enable_email, true)
  ),
  'localization', jsonb_build_object(
    'timezone', 'Asia/Kolkata',
    'language', 'hi'
  )
)
WHERE settings IS NULL;

-- Step 3: Add index on settings for better query performance
CREATE INDEX IF NOT EXISTS idx_clients_settings ON clients USING GIN(settings);

-- Step 4: Ensure all rows have settings (fallback for safety)
-- Any row that still doesn't have settings gets default values
UPDATE clients 
SET settings = jsonb_build_object(
  'shopify', jsonb_build_object('store', '', 'apiKey', '', 'apiSecret', ''),
  'exotel', jsonb_build_object('number', '', 'sid', '', 'token', ''),
  'business', jsonb_build_object('returnWindowDays', 14, 'refundAutoThreshold', 2000, 'cancelWindowHours', 24, 'escalationThreshold', 60),
  'channels', jsonb_build_object('whatsApp', false, 'sms', true, 'email', true),
  'localization', jsonb_build_object('timezone', 'Asia/Kolkata', 'language', 'hi')
)
WHERE settings IS NULL;

-- Migration complete
-- The clients table now has a consolidated settings JSONB column
-- All routes can now use: SELECT ... settings FROM clients
-- And: UPDATE clients SET settings = $1 WHERE id = $2
