-- Brand Management Table Migration
-- Adds new fields for enhanced brand profile management

-- Add new JSONB and VARCHAR fields to brands table
ALTER TABLE "brands"
  ADD COLUMN IF NOT EXISTS "company_size" JSONB,
  ADD COLUMN IF NOT EXISTS "target_audience" JSONB,
  ADD COLUMN IF NOT EXISTS "billing_info" JSONB,
  ADD COLUMN IF NOT EXISTS "brand_guidelines_url" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_info" JSONB,
  ADD COLUMN IF NOT EXISTS "team_members" JSONB,
  ADD COLUMN IF NOT EXISTS "verification_status" VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "verification_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP;

-- Make industry nullable
ALTER TABLE "brands"
  ALTER COLUMN "industry" DROP NOT NULL;

-- Make description nullable
ALTER TABLE "brands"
  ALTER COLUMN "description" DROP NOT NULL;

-- Alter companyName field to have proper constraints
ALTER TABLE "brands"
  ALTER COLUMN "companyName" TYPE VARCHAR(255);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "brands_company_name_idx" ON "brands"("companyName");
CREATE INDEX IF NOT EXISTS "brands_industry_idx" ON "brands"("industry");
CREATE INDEX IF NOT EXISTS "brands_verification_status_idx" ON "brands"("verification_status");
CREATE INDEX IF NOT EXISTS "brands_deleted_at_idx" ON "brands"("deletedAt");
CREATE INDEX IF NOT EXISTS "brands_user_id_idx" ON "brands"("userId");
CREATE INDEX IF NOT EXISTS "brands_created_at_idx" ON "brands"("createdAt");

-- Update existing records to have default verification_status
UPDATE "brands"
SET "verification_status" = CASE
  WHEN "isVerified" = TRUE THEN 'verified'
  ELSE 'pending'
END
WHERE "verification_status" IS NULL;

-- Comment on new columns
COMMENT ON COLUMN "brands"."company_size" IS 'JSON: { employee_count, revenue_range, funding_stage }';
COMMENT ON COLUMN "brands"."target_audience" IS 'JSON: { demographics, interests, psychographics }';
COMMENT ON COLUMN "brands"."billing_info" IS 'JSON: { tax_id, billing_email, billing_address, payment_terms, preferred_currency }';
COMMENT ON COLUMN "brands"."brand_guidelines_url" IS 'Storage URL for brand guidelines document';
COMMENT ON COLUMN "brands"."contact_info" IS 'JSON: { primary_contact, company_phone, website, social_links }';
COMMENT ON COLUMN "brands"."team_members" IS 'JSON Array: [{ user_id, role, permissions, added_at, added_by }]';
COMMENT ON COLUMN "brands"."verification_status" IS 'Brand verification status: pending, verified, rejected';
COMMENT ON COLUMN "brands"."verified_at" IS 'Timestamp when brand was verified';
COMMENT ON COLUMN "brands"."verification_notes" IS 'Admin notes about verification';
COMMENT ON COLUMN "brands"."deleted_at" IS 'Soft delete timestamp';
