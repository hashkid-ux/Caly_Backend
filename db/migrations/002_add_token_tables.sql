-- Migration: Add password reset tokens and refresh token blacklist tables
-- Purpose: Store password reset tokens and blacklisted refresh tokens for logout/revocation
-- Date: 2025-11-27

-- Table for password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  reset_token VARCHAR(255) NOT NULL UNIQUE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_password_reset_user_id FOREIGN KEY (user_id) 
    REFERENCES users(id) ON DELETE CASCADE
);

-- Table for refresh token blacklist (logout/revocation)
CREATE TABLE IF NOT EXISTS refresh_token_blacklist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  token_jti VARCHAR(255) NOT NULL UNIQUE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reason VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_refresh_token_user_id FOREIGN KEY (user_id) 
    REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id 
  ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash 
  ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at 
  ON password_reset_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_refresh_token_blacklist_token_jti 
  ON refresh_token_blacklist(token_jti);
CREATE INDEX IF NOT EXISTS idx_refresh_token_blacklist_token_hash 
  ON refresh_token_blacklist(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_token_blacklist_expires_at 
  ON refresh_token_blacklist(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_token_blacklist_user_id 
  ON refresh_token_blacklist(user_id);

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_password_reset_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS password_reset_tokens_update_trigger
BEFORE UPDATE ON password_reset_tokens
FOR EACH ROW
EXECUTE FUNCTION update_password_reset_tokens_updated_at();
