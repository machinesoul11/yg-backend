-- ============================================================================
-- Migration: Add Database Check Constraints for Data Validation
-- Created: 2025-10-10
-- Purpose: Enforce data integrity at the database level for financial, 
--          percentage, and temporal fields across the YesGoddess platform
-- ============================================================================
-- 
-- This migration adds check constraints to ensure:
-- 1. Monetary values (fee_cents, amount_cents, etc.) are non-negative
-- 2. Basis point values (rev_share_bps, share_bps) are between 0 and 10000
-- 3. Date ranges are logically valid (end_date > start_date)
-- 4. Status enums contain only valid values
--
-- IMPORTANT: Data has been validated before migration. All existing records 
-- comply with these constraints.
-- ============================================================================

-- ============================================================================
-- 1. Fee and Monetary Amount Constraints (Non-Negative)
-- ============================================================================

-- Licenses: Ensure license fees cannot be negative
ALTER TABLE licenses
ADD CONSTRAINT fee_cents_non_negative 
CHECK (fee_cents >= 0);

-- Payouts: Ensure payout amounts cannot be negative
ALTER TABLE payouts
ADD CONSTRAINT payout_amount_non_negative 
CHECK (amount_cents >= 0);

-- Royalty Runs: Ensure revenue and royalty totals cannot be negative
ALTER TABLE royalty_runs
ADD CONSTRAINT total_revenue_cents_non_negative 
CHECK (total_revenue_cents >= 0);

ALTER TABLE royalty_runs
ADD CONSTRAINT total_royalties_cents_non_negative 
CHECK (total_royalties_cents >= 0);

-- Royalty Statements: Ensure earnings cannot be negative
ALTER TABLE royalty_statements
ADD CONSTRAINT total_earnings_cents_non_negative 
CHECK (total_earnings_cents >= 0);

-- Royalty Lines: Ensure revenue and calculated royalties cannot be negative
ALTER TABLE royalty_lines
ADD CONSTRAINT revenue_cents_non_negative 
CHECK (revenue_cents >= 0);

ALTER TABLE royalty_lines
ADD CONSTRAINT calculated_royalty_cents_non_negative 
CHECK (calculated_royalty_cents >= 0);

-- Daily Metrics: Ensure revenue metrics cannot be negative
ALTER TABLE daily_metrics
ADD CONSTRAINT revenue_cents_non_negative 
CHECK ("revenueCents" >= 0);

-- Projects: Ensure budget cannot be negative
ALTER TABLE projects
ADD CONSTRAINT budget_cents_non_negative 
CHECK ("budgetCents" >= 0);

-- ============================================================================
-- 2. Basis Points (BPS) Range Constraints (0-10000 = 0%-100%)
-- ============================================================================

-- Licenses: Ensure revenue share percentage is valid (0-100%)
ALTER TABLE licenses
ADD CONSTRAINT rev_share_bps_valid_range 
CHECK (rev_share_bps >= 0 AND rev_share_bps <= 10000);

-- IP Ownerships: Ensure ownership share percentage is valid (0-100%)
-- Note: Sum constraint is already enforced by trigger in add_ownership_constraint.sql
ALTER TABLE ip_ownerships
ADD CONSTRAINT share_bps_valid_range 
CHECK (share_bps >= 0 AND share_bps <= 10000);

-- Royalty Lines: Ensure share percentage used in calculations is valid
ALTER TABLE royalty_lines
ADD CONSTRAINT share_bps_valid_range 
CHECK (share_bps >= 0 AND share_bps <= 10000);

-- Feature Flags: Ensure rollout percentage is valid
ALTER TABLE feature_flags
ADD CONSTRAINT rollout_percentage_valid_range 
CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100);

-- ============================================================================
-- 3. Date Range Validation Constraints
-- ============================================================================

-- Licenses: Ensure end date is after start date
-- This prevents logically impossible license periods
ALTER TABLE licenses
ADD CONSTRAINT license_end_after_start 
CHECK (end_date > start_date);

-- IP Ownerships: Ensure end date is after start date (when end_date is set)
-- Allows NULL end_date for ongoing ownership
ALTER TABLE ip_ownerships
ADD CONSTRAINT ownership_end_after_start 
CHECK (end_date IS NULL OR end_date > start_date);

-- Royalty Runs: Ensure period end is after period start
-- Critical for royalty calculation accuracy
ALTER TABLE royalty_runs
ADD CONSTRAINT royalty_period_valid_range 
CHECK (period_end > period_start);

-- Royalty Lines: Ensure line period end is after start
ALTER TABLE royalty_lines
ADD CONSTRAINT royalty_line_period_valid 
CHECK (period_end > period_start);

-- Projects: Ensure project end date is after start date (when both are set)
-- Allows NULL dates for projects without defined timelines
ALTER TABLE projects
ADD CONSTRAINT project_end_after_start 
CHECK ("endDate" IS NULL OR "startDate" IS NULL OR "endDate" > "startDate");

-- ============================================================================
-- 4. Status Enum Constraints
-- ============================================================================
-- Note: Most status fields use Prisma enums which are enforced at the 
-- database level automatically. The following are for any string-based
-- status fields that don't use native enums.

-- Creators: Ensure onboarding status contains valid values
ALTER TABLE creators
ADD CONSTRAINT onboarding_status_valid 
CHECK ("onboardingStatus" IN ('pending', 'in_progress', 'completed', 'rejected'));

-- Creators: Ensure verification status contains valid values
ALTER TABLE creators
ADD CONSTRAINT verification_status_valid 
CHECK ("verificationStatus" IN ('pending', 'verified', 'rejected'));

-- Brands: Ensure verification status contains valid values
ALTER TABLE brands
ADD CONSTRAINT brand_verification_status_valid 
CHECK ("verificationStatus" IN ('pending', 'verified', 'rejected'));

-- ============================================================================
-- 5. Additional Business Logic Constraints
-- ============================================================================

-- Daily Metrics: Ensure non-negative counts
ALTER TABLE daily_metrics
ADD CONSTRAINT views_non_negative 
CHECK (views >= 0);

ALTER TABLE daily_metrics
ADD CONSTRAINT clicks_non_negative 
CHECK (clicks >= 0);

ALTER TABLE daily_metrics
ADD CONSTRAINT conversions_non_negative 
CHECK (conversions >= 0);

ALTER TABLE daily_metrics
ADD CONSTRAINT unique_visitors_non_negative 
CHECK ("uniqueVisitors" >= 0);

ALTER TABLE daily_metrics
ADD CONSTRAINT engagement_time_non_negative 
CHECK ("engagementTime" >= 0);

-- Payouts: Ensure retry count is non-negative
ALTER TABLE payouts
ADD CONSTRAINT retry_count_non_negative 
CHECK (retry_count >= 0);

-- IP Assets: Ensure file size is positive
ALTER TABLE ip_assets
ADD CONSTRAINT file_size_positive 
CHECK (file_size > 0);

-- IP Assets: Ensure version is positive
ALTER TABLE ip_assets
ADD CONSTRAINT version_positive 
CHECK (version > 0);

-- ============================================================================
-- Indexes to support constraint checking
-- (Most of these should already exist, but adding for completeness)
-- ============================================================================

-- Index on licenses for date range queries (supports end_date > start_date checks)
CREATE INDEX IF NOT EXISTS idx_licenses_dates ON licenses(start_date, end_date);

-- Index on royalty_runs for period queries
CREATE INDEX IF NOT EXISTS idx_royalty_runs_period ON royalty_runs(period_start, period_end);

-- Index on ip_ownerships for active ownership queries
CREATE INDEX IF NOT EXISTS idx_ip_ownerships_dates ON ip_ownerships(start_date, end_date);

-- ============================================================================
-- Migration complete
-- ============================================================================

-- Add a comment to track this migration
COMMENT ON TABLE licenses IS 'Licenses table with check constraints for data validation (added 2025-10-10)';
COMMENT ON TABLE payouts IS 'Payouts table with check constraints for data validation (added 2025-10-10)';
COMMENT ON TABLE royalty_runs IS 'Royalty runs table with check constraints for data validation (added 2025-10-10)';
COMMENT ON TABLE ip_ownerships IS 'IP ownerships table with check constraints for data validation (added 2025-10-10)';
