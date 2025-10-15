-- Tax & Compliance Reports - Database Schema Extensions

-- ============================================================================
-- Tax Documents Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_documents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  document_type VARCHAR(50) NOT NULL, -- '1099-NEC', '1099-MISC', 'W8BEN', etc.
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  withholding_cents INTEGER NOT NULL DEFAULT 0,
  filing_status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'GENERATED', 'FILED', 'CORRECTED'
  pdf_storage_key TEXT,
  pdf_generated_at TIMESTAMPTZ,
  filed_at TIMESTAMPTZ,
  correction_of TEXT REFERENCES tax_documents(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT tax_documents_unique_creator_year_type UNIQUE (creator_id, tax_year, document_type),
  CONSTRAINT tax_documents_valid_year CHECK (tax_year >= 2020 AND tax_year <= 2050),
  CONSTRAINT tax_documents_valid_amount CHECK (total_amount_cents >= 0),
  CONSTRAINT tax_documents_valid_withholding CHECK (withholding_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_tax_documents_creator_year ON tax_documents(creator_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_documents_type_year ON tax_documents(document_type, tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_documents_filing_status ON tax_documents(filing_status);
CREATE INDEX IF NOT EXISTS idx_tax_documents_pdf_storage ON tax_documents(pdf_storage_key);

-- ============================================================================
-- Payment Thresholds Tracking Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_thresholds (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  jurisdiction VARCHAR(10) NOT NULL DEFAULT 'US', -- 'US', 'CA', 'UK', etc.
  total_payments_cents INTEGER NOT NULL DEFAULT 0,
  threshold_amount_cents INTEGER NOT NULL,
  threshold_met BOOLEAN NOT NULL DEFAULT FALSE,
  threshold_met_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  
  CONSTRAINT payment_thresholds_unique_creator_year_jurisdiction UNIQUE (creator_id, tax_year, jurisdiction),
  CONSTRAINT payment_thresholds_valid_year CHECK (tax_year >= 2020 AND tax_year <= 2050),
  CONSTRAINT payment_thresholds_valid_amounts CHECK (total_payments_cents >= 0 AND threshold_amount_cents > 0)
);

CREATE INDEX IF NOT EXISTS idx_payment_thresholds_creator_year ON payment_thresholds(creator_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_payment_thresholds_jurisdiction_year ON payment_thresholds(jurisdiction, tax_year);
CREATE INDEX IF NOT EXISTS idx_payment_thresholds_met ON payment_thresholds(threshold_met, last_updated);

-- ============================================================================
-- Tax Withholding Configuration Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_withholding (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  withholding_type VARCHAR(50) NOT NULL, -- 'BACKUP', 'INTERNATIONAL_TREATY', 'STATE_TAX'
  percentage_rate DECIMAL(5,4) NOT NULL, -- e.g., 0.2400 for 24%
  effective_start_date DATE NOT NULL,
  effective_end_date DATE,
  supporting_document_key TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE', 'EXPIRED'
  created_by TEXT NOT NULL REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT tax_withholding_valid_rate CHECK (percentage_rate >= 0 AND percentage_rate <= 1),
  CONSTRAINT tax_withholding_valid_dates CHECK (effective_end_date IS NULL OR effective_end_date > effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_tax_withholding_creator ON tax_withholding(creator_id);
CREATE INDEX IF NOT EXISTS idx_tax_withholding_status ON tax_withholding(status);
CREATE INDEX IF NOT EXISTS idx_tax_withholding_dates ON tax_withholding(effective_start_date, effective_end_date);

-- ============================================================================
-- Tax Jurisdiction Mapping Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_jurisdictions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  country_code VARCHAR(2) NOT NULL, -- ISO 3166-1 alpha-2
  state_province VARCHAR(10), -- State/Province code if applicable
  tax_treaty_status VARCHAR(50), -- 'NO_TREATY', 'REDUCED_RATE', 'EXEMPT'
  applicable_rate DECIMAL(5,4), -- Withholding rate if applicable
  reporting_requirements JSONB DEFAULT '{}',
  documentation_type VARCHAR(50), -- 'W9', 'W8BEN', 'W8BEN-E', etc.
  documentation_expiry DATE,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT tax_jurisdictions_valid_rate CHECK (applicable_rate IS NULL OR (applicable_rate >= 0 AND applicable_rate <= 1))
);

CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_creator ON tax_jurisdictions(creator_id);
CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_country ON tax_jurisdictions(country_code);
CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_primary ON tax_jurisdictions(creator_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_expiry ON tax_jurisdictions(documentation_expiry);

-- ============================================================================
-- Annual Tax Summary Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS annual_tax_summaries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  total_gross_payments_cents INTEGER NOT NULL DEFAULT 0,
  total_withheld_cents INTEGER NOT NULL DEFAULT 0,
  payment_count INTEGER NOT NULL DEFAULT 0,
  forms_required JSONB DEFAULT '[]', -- Array of form types needed
  forms_generated JSONB DEFAULT '[]', -- Array of generated forms
  summary_pdf_key TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT annual_tax_summaries_unique_creator_year UNIQUE (creator_id, tax_year),
  CONSTRAINT annual_tax_summaries_valid_year CHECK (tax_year >= 2020 AND tax_year <= 2050),
  CONSTRAINT annual_tax_summaries_valid_amounts CHECK (total_gross_payments_cents >= 0 AND total_withheld_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_annual_tax_summaries_creator_year ON annual_tax_summaries(creator_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_annual_tax_summaries_year ON annual_tax_summaries(tax_year);
CREATE INDEX IF NOT EXISTS idx_annual_tax_summaries_generated ON annual_tax_summaries(generated_at);

-- ============================================================================
-- Tax Form Processing Jobs Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_form_jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tax_year INTEGER NOT NULL,
  job_type VARCHAR(50) NOT NULL, -- 'YEAR_END_GENERATION', 'THRESHOLD_CHECK', 'RENEWAL_REMINDER'
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
  total_creators INTEGER DEFAULT 0,
  processed_creators INTEGER DEFAULT 0,
  failed_creators INTEGER DEFAULT 0,
  error_details JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT tax_form_jobs_valid_year CHECK (tax_year >= 2020 AND tax_year <= 2050),
  CONSTRAINT tax_form_jobs_valid_counts CHECK (processed_creators <= total_creators AND failed_creators <= processed_creators)
);

CREATE INDEX IF NOT EXISTS idx_tax_form_jobs_year_type ON tax_form_jobs(tax_year, job_type);
CREATE INDEX IF NOT EXISTS idx_tax_form_jobs_status ON tax_form_jobs(status);
CREATE INDEX IF NOT EXISTS idx_tax_form_jobs_created ON tax_form_jobs(created_at);

-- ============================================================================
-- Add Enums for Tax Document Types
-- ============================================================================
CREATE TYPE tax_document_type AS ENUM (
  '1099_NEC',
  '1099_MISC', 
  'W8_BEN',
  'W8_BEN_E',
  'W9',
  '1042_S',
  'VAT_SUMMARY',
  'GST_SUMMARY'
);

CREATE TYPE tax_filing_status AS ENUM (
  'PENDING',
  'GENERATED', 
  'DELIVERED',
  'FILED',
  'CORRECTED',
  'VOIDED'
);

CREATE TYPE tax_withholding_type AS ENUM (
  'BACKUP_WITHHOLDING',
  'INTERNATIONAL_TREATY',
  'STATE_TAX',
  'LOCAL_TAX'
);

-- Note: These will be added to the Prisma schema as enums
-- The tables above use VARCHAR temporarily until Prisma migration is applied
