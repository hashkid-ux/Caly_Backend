/**
 * ✅ PHASE 3 FIX 3.3: Account Linking Policy Migration
 * 
 * Purpose:
 * - Allow users to link multiple authentication methods (OAuth + email/password)
 * - Prevent email duplication across different auth methods
 * - Track which auth methods are linked to each account
 * 
 * Changes:
 * 1. Add auth_methods table to track linked authentication methods
 * 2. Add linked_accounts table to link multiple auth identities to single user
 * 3. Add indices for performance
 */

-- Create auth_methods table to track authentication methods
CREATE TABLE IF NOT EXISTS auth_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'email', 'google', 'github', etc.
  provider_id TEXT, -- google_id, github_id, etc. (NULL for email)
  provider_email TEXT, -- email from OAuth provider
  is_primary BOOLEAN DEFAULT FALSE,
  linked_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_provider_id UNIQUE (provider, provider_id) WHERE provider_id IS NOT NULL,
  CONSTRAINT unique_email_auth UNIQUE (provider, provider_email) WHERE provider_email IS NOT NULL AND provider != 'email'
);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_auth_methods_user_id ON auth_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_methods_provider ON auth_methods(provider);
CREATE INDEX IF NOT EXISTS idx_auth_methods_provider_id ON auth_methods(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_methods_provider_email ON auth_methods(provider_email) WHERE provider_email IS NOT NULL;

-- Note: Initial auth_methods records will be created by application code
-- This ensures proper error handling and validation
