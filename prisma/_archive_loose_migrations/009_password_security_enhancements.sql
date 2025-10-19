-- Migration: Enhanced Password Security Features
-- Adds password history tracking, remember-me functionality, and account lockout

-- Add account lockout fields to users table
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "last_failed_login" TIMESTAMP(3);

-- Add index for locked_until lookups
CREATE INDEX IF NOT EXISTS "users_locked_until_idx" ON "users"("locked_until");

-- Create password_history table
CREATE TABLE IF NOT EXISTS "password_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint for password_history
ALTER TABLE "password_history"
ADD CONSTRAINT "password_history_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Add index for password_history lookups
CREATE INDEX IF NOT EXISTS "password_history_user_id_created_at_idx"
ON "password_history"("user_id", "created_at");

-- Create remember_me_tokens table
CREATE TABLE IF NOT EXISTS "remember_me_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_info" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remember_me_tokens_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint on token_hash
ALTER TABLE "remember_me_tokens"
ADD CONSTRAINT "remember_me_tokens_token_hash_key"
UNIQUE ("token_hash");

-- Add foreign key constraint for remember_me_tokens
ALTER TABLE "remember_me_tokens"
ADD CONSTRAINT "remember_me_tokens_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Add indexes for remember_me_tokens lookups
CREATE INDEX IF NOT EXISTS "remember_me_tokens_token_hash_idx"
ON "remember_me_tokens"("token_hash");

CREATE INDEX IF NOT EXISTS "remember_me_tokens_user_id_expires_at_idx"
ON "remember_me_tokens"("user_id", "expires_at");

CREATE INDEX IF NOT EXISTS "remember_me_tokens_expires_at_idx"
ON "remember_me_tokens"("expires_at");

-- Comment the tables for documentation
COMMENT ON TABLE "password_history" IS 'Stores historical password hashes to prevent password reuse';
COMMENT ON TABLE "remember_me_tokens" IS 'Stores secure tokens for extended session persistence (remember me functionality)';

COMMENT ON COLUMN "users"."locked_until" IS 'Account lockout expiration timestamp - user cannot login before this time';
COMMENT ON COLUMN "users"."failed_login_count" IS 'Counter for failed login attempts within the current lockout window';
COMMENT ON COLUMN "users"."last_failed_login" IS 'Timestamp of the most recent failed login attempt';
