-- Migration 006: Add refresh token blacklist table
-- Purpose: Revoke refresh tokens on logout to prevent token reuse

CREATE TABLE IF NOT EXISTS refresh_token_blacklist (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_jti VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  blacklisted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_refresh_token_blacklist_expires_at 
ON refresh_token_blacklist(expires_at);

-- Index for looking up blacklisted tokens
CREATE INDEX IF NOT EXISTS idx_refresh_token_blacklist_jti 
ON refresh_token_blacklist(token_jti);

-- Index for user-based queries
CREATE INDEX IF NOT EXISTS idx_refresh_token_blacklist_user_id 
ON refresh_token_blacklist(user_id);
