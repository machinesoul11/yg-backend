-- Users & Authentication Module Migration
-- This migration adds authentication-related fields and tables

-- Add authentication fields to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verified TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Add indexes to users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

-- Note: Skip session indexes if sessions table doesn't exist or has different schema
-- CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
-- CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

-- Create verification_tokens table
CREATE TABLE IF NOT EXISTS verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT fk_verification_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_expires ON verification_tokens(expires);

-- Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT fk_password_reset_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires);

-- Create audit_events table
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  action TEXT NOT NULL,
  user_id TEXT,
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  before_json JSONB,
  after_json JSONB,
  CONSTRAINT fk_audit_events_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_user_timestamp ON audit_events(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_events_action_timestamp ON audit_events(action, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_events_email ON audit_events(email);

-- Update UserRole enum to include CREATOR instead of TALENT
-- Note: This requires manual handling in production
-- ALTER TYPE UserRole RENAME VALUE 'TALENT' TO 'CREATOR';
