-- Migration: Create Creators Table
-- Description: Creates the creators table for managing creator/talent profiles
-- Related to: Talent module, but with enhanced fields for IP licensing platform

-- Create creators table
CREATE TABLE IF NOT EXISTS creators (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    stage_name TEXT NOT NULL,
    bio TEXT,
    specialties JSONB NOT NULL DEFAULT '[]',
    social_links JSONB,
    stripe_account_id TEXT UNIQUE,
    onboarding_status TEXT NOT NULL DEFAULT 'pending',
    portfolio_url TEXT,
    website TEXT,
    availability JSONB,
    preferences JSONB,
    verification_status TEXT NOT NULL DEFAULT 'pending',
    verified_at TIMESTAMP WITH TIME ZONE,
    performance_metrics JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Foreign key constraints
    CONSTRAINT fk_creators_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Check constraints
    CONSTRAINT chk_verification_status CHECK (verification_status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT chk_onboarding_status CHECK (onboarding_status IN ('pending', 'in_progress', 'completed', 'failed'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_creators_user_id ON creators(user_id);
CREATE INDEX IF NOT EXISTS idx_creators_verification_status ON creators(verification_status);
CREATE INDEX IF NOT EXISTS idx_creators_onboarding_status ON creators(onboarding_status);
CREATE INDEX IF NOT EXISTS idx_creators_deleted_at ON creators(deleted_at);
CREATE INDEX IF NOT EXISTS idx_creators_verified_at ON creators(verified_at);
CREATE INDEX IF NOT EXISTS idx_creators_stripe_account_id ON creators(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

-- Create GIN index for JSONB fields for efficient querying
CREATE INDEX IF NOT EXISTS idx_creators_specialties_gin ON creators USING GIN (specialties);
CREATE INDEX IF NOT EXISTS idx_creators_social_links_gin ON creators USING GIN (social_links) WHERE social_links IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creators_performance_metrics_gin ON creators USING GIN (performance_metrics) WHERE performance_metrics IS NOT NULL;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_creators_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_creators_updated_at
    BEFORE UPDATE ON creators
    FOR EACH ROW
    EXECUTE FUNCTION update_creators_updated_at();

-- Add comments for documentation
COMMENT ON TABLE creators IS 'Creator/talent profiles for IP licensing platform';
COMMENT ON COLUMN creators.id IS 'Unique creator identifier (CUID)';
COMMENT ON COLUMN creators.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN creators.stage_name IS 'Public-facing creator name';
COMMENT ON COLUMN creators.bio IS 'Creator biography (max 2000 chars)';
COMMENT ON COLUMN creators.specialties IS 'Array of creator specialties (photography, videography, etc.)';
COMMENT ON COLUMN creators.social_links IS 'Social media and portfolio links';
COMMENT ON COLUMN creators.stripe_account_id IS 'Stripe Connect account ID for payouts';
COMMENT ON COLUMN creators.onboarding_status IS 'Stripe onboarding completion status';
COMMENT ON COLUMN creators.portfolio_url IS 'Primary portfolio URL';
COMMENT ON COLUMN creators.website IS 'Personal website URL';
COMMENT ON COLUMN creators.availability IS 'Creator availability and schedule';
COMMENT ON COLUMN creators.preferences IS 'Project preferences and collaboration style';
COMMENT ON COLUMN creators.verification_status IS 'Admin verification status';
COMMENT ON COLUMN creators.verified_at IS 'Timestamp of admin approval';
COMMENT ON COLUMN creators.performance_metrics IS 'Cached performance metrics (earnings, licenses, ratings)';
COMMENT ON COLUMN creators.deleted_at IS 'Soft delete timestamp (preserves data for royalties)';
