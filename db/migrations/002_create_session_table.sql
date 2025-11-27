-- Migration: Create session table for PostgreSQL
-- Description: Creates session table for connect-pg-simple session store

CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
) WITH (OIDS=FALSE);

-- Add primary key
ALTER TABLE IF EXISTS "session" 
ADD CONSTRAINT session_pkey PRIMARY KEY ("sid");

-- Add index for session expiry cleanup
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

SELECT 'Session table migration completed' as status;
