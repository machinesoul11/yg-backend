-- Migration: Add Stripe Connect Account Tracking Tables
-- Description: Adds tables for tracking Stripe onboarding sessions, capabilities, and requirements
-- Date: 2025-10-14

-- Create stripe_onboarding_sessions table
CREATE TABLE IF NOT EXISTS "stripe_onboarding_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creator_id" TEXT NOT NULL,
    "stripe_account_id" TEXT NOT NULL,
    "account_link_url" TEXT NOT NULL,
    "return_url" TEXT NOT NULL,
    "refresh_url" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "stripe_onboarding_sessions_creator_id_fkey" 
        FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes for stripe_onboarding_sessions
CREATE INDEX "stripe_onboarding_sessions_creator_id_idx" ON "stripe_onboarding_sessions"("creator_id");
CREATE INDEX "stripe_onboarding_sessions_stripe_account_id_idx" ON "stripe_onboarding_sessions"("stripe_account_id");
CREATE INDEX "stripe_onboarding_sessions_expires_at_idx" ON "stripe_onboarding_sessions"("expires_at");
CREATE INDEX "stripe_onboarding_sessions_completed_at_idx" ON "stripe_onboarding_sessions"("completed_at");

-- Create stripe_account_capabilities table
CREATE TABLE IF NOT EXISTS "stripe_account_capabilities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creator_id" TEXT NOT NULL,
    "stripe_account_id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3),
    "enabled_at" TIMESTAMP(3),
    "disabled_at" TIMESTAMP(3),
    "restrictions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    
    CONSTRAINT "stripe_account_capabilities_creator_id_fkey" 
        FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stripe_account_capabilities_stripe_account_id_capability_key" 
        UNIQUE ("stripe_account_id", "capability")
);

-- Create indexes for stripe_account_capabilities
CREATE INDEX "stripe_account_capabilities_creator_id_idx" ON "stripe_account_capabilities"("creator_id");
CREATE INDEX "stripe_account_capabilities_stripe_account_id_idx" ON "stripe_account_capabilities"("stripe_account_id");
CREATE INDEX "stripe_account_capabilities_status_idx" ON "stripe_account_capabilities"("status");

-- Create stripe_account_requirements table
CREATE TABLE IF NOT EXISTS "stripe_account_requirements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creator_id" TEXT NOT NULL,
    "stripe_account_id" TEXT NOT NULL,
    "requirement_type" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    
    CONSTRAINT "stripe_account_requirements_creator_id_fkey" 
        FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "stripe_account_requirements_stripe_account_id_field_name_key" 
        UNIQUE ("stripe_account_id", "field_name")
);

-- Create indexes for stripe_account_requirements
CREATE INDEX "stripe_account_requirements_creator_id_idx" ON "stripe_account_requirements"("creator_id");
CREATE INDEX "stripe_account_requirements_stripe_account_id_idx" ON "stripe_account_requirements"("stripe_account_id");
CREATE INDEX "stripe_account_requirements_requirement_type_idx" ON "stripe_account_requirements"("requirement_type");
CREATE INDEX "stripe_account_requirements_resolved_at_idx" ON "stripe_account_requirements"("resolved_at");

-- Add comments for documentation
COMMENT ON TABLE "stripe_onboarding_sessions" IS 'Tracks Stripe Connect onboarding sessions and their expiration/completion';
COMMENT ON TABLE "stripe_account_capabilities" IS 'Stores Stripe account capabilities (transfers, card_payments, etc.) and their status';
COMMENT ON TABLE "stripe_account_requirements" IS 'Tracks verification requirements from Stripe for each account';

COMMENT ON COLUMN "stripe_onboarding_sessions"."account_link_url" IS 'Temporary URL for creator to complete onboarding';
COMMENT ON COLUMN "stripe_onboarding_sessions"."expires_at" IS 'When the account link URL expires (typically 5 minutes)';
COMMENT ON COLUMN "stripe_onboarding_sessions"."completed_at" IS 'When the onboarding was successfully completed';

COMMENT ON COLUMN "stripe_account_capabilities"."capability" IS 'Stripe capability name (transfers, card_payments, etc.)';
COMMENT ON COLUMN "stripe_account_capabilities"."status" IS 'active, inactive, pending, or restricted';
COMMENT ON COLUMN "stripe_account_capabilities"."restrictions" IS 'JSON containing any restrictions on this capability';

COMMENT ON COLUMN "stripe_account_requirements"."requirement_type" IS 'currently_due, eventually_due, past_due, or pending_verification';
COMMENT ON COLUMN "stripe_account_requirements"."field_name" IS 'Stripe field identifier (e.g., individual.id_number)';
COMMENT ON COLUMN "stripe_account_requirements"."deadline" IS 'For eventually_due requirements, when they must be fulfilled';
COMMENT ON COLUMN "stripe_account_requirements"."resolved_at" IS 'When the requirement was fulfilled';
