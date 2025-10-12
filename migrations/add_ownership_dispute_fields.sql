-- Add Ownership Dispute Fields to ip_ownerships table
-- Migration created: 2024-01-11
-- Purpose: Support ownership dispute handling workflow

-- Add dispute tracking fields
ALTER TABLE ip_ownerships 
ADD COLUMN IF NOT EXISTS disputed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
ADD COLUMN IF NOT EXISTS disputed_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- Add index for efficient dispute queries
CREATE INDEX IF NOT EXISTS idx_ip_ownerships_disputed ON ip_ownerships(disputed);

-- Add index for admin dispute dashboard queries
CREATE INDEX IF NOT EXISTS idx_ip_ownerships_disputed_at ON ip_ownerships(disputed_at DESC) WHERE disputed = TRUE;

-- Update existing records to have disputed = false (already default)
UPDATE ip_ownerships SET disputed = FALSE WHERE disputed IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN ip_ownerships.disputed IS 'Whether this ownership record is currently disputed';
COMMENT ON COLUMN ip_ownerships.disputed_at IS 'When the ownership was flagged as disputed';
COMMENT ON COLUMN ip_ownerships.dispute_reason IS 'Reason for the dispute';
COMMENT ON COLUMN ip_ownerships.disputed_by IS 'User ID who flagged the dispute';
COMMENT ON COLUMN ip_ownerships.resolved_at IS 'When the dispute was resolved';
COMMENT ON COLUMN ip_ownerships.resolved_by IS 'User ID who resolved the dispute';
COMMENT ON COLUMN ip_ownerships.resolution_notes IS 'Notes about how the dispute was resolved';

-- Verify migration
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'ip_ownerships' 
  AND column_name IN ('disputed', 'disputed_at', 'dispute_reason', 'disputed_by', 'resolved_at', 'resolved_by', 'resolution_notes')
ORDER BY ordinal_position;
