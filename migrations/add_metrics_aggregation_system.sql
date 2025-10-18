-- Metrics Aggregation System Migration
-- Adds weekly metrics, monthly metrics, custom metric definitions, and real-time metrics cache tables

-- ============================================
-- Weekly Metrics Rollup Table
-- ============================================
CREATE TABLE weekly_metrics (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  ip_asset_id TEXT REFERENCES ip_assets(id) ON DELETE CASCADE,
  license_id TEXT REFERENCES licenses(id) ON DELETE CASCADE,
  
  -- Aggregated metrics from daily_metrics
  total_views INTEGER DEFAULT 0 NOT NULL,
  total_clicks INTEGER DEFAULT 0 NOT NULL,
  total_conversions INTEGER DEFAULT 0 NOT NULL,
  total_revenue_cents INTEGER DEFAULT 0 NOT NULL,
  unique_visitors INTEGER DEFAULT 0 NOT NULL,
  total_engagement_time INTEGER DEFAULT 0 NOT NULL,
  
  -- Week-over-week comparisons
  views_growth_percent DECIMAL(10,2),
  clicks_growth_percent DECIMAL(10,2),
  conversions_growth_percent DECIMAL(10,2),
  revenue_growth_percent DECIMAL(10,2),
  
  -- Calculated metrics
  avg_daily_views DECIMAL(10,2),
  avg_daily_clicks DECIMAL(10,2),
  avg_daily_conversions DECIMAL(10,2),
  avg_daily_revenue_cents DECIMAL(10,2),
  
  -- Metadata
  days_in_period INTEGER DEFAULT 7 NOT NULL,
  aggregation_version VARCHAR(20) DEFAULT '1.0' NOT NULL,
  metadata JSONB DEFAULT '{}' NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  
  CONSTRAINT unique_weekly_metric UNIQUE (week_start_date, project_id, ip_asset_id, license_id)
);

-- ============================================
-- Monthly Metrics Rollup Table
-- ============================================
CREATE TABLE monthly_metrics (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start_date DATE NOT NULL,
  month_end_date DATE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  ip_asset_id TEXT REFERENCES ip_assets(id) ON DELETE CASCADE,
  license_id TEXT REFERENCES licenses(id) ON DELETE CASCADE,
  
  -- Aggregated metrics from daily_metrics
  total_views INTEGER DEFAULT 0 NOT NULL,
  total_clicks INTEGER DEFAULT 0 NOT NULL,
  total_conversions INTEGER DEFAULT 0 NOT NULL,
  total_revenue_cents INTEGER DEFAULT 0 NOT NULL,
  unique_visitors INTEGER DEFAULT 0 NOT NULL,
  total_engagement_time INTEGER DEFAULT 0 NOT NULL,
  
  -- Month-over-month comparisons
  views_growth_percent DECIMAL(10,2),
  clicks_growth_percent DECIMAL(10,2),
  conversions_growth_percent DECIMAL(10,2),
  revenue_growth_percent DECIMAL(10,2),
  
  -- Calculated metrics
  avg_daily_views DECIMAL(10,2),
  avg_daily_clicks DECIMAL(10,2),
  avg_daily_conversions DECIMAL(10,2),
  avg_daily_revenue_cents DECIMAL(10,2),
  
  -- Weekly aggregations within the month
  weeks_in_month INTEGER,
  weekly_breakdown JSONB DEFAULT '[]' NOT NULL,
  
  -- Metadata
  days_in_period INTEGER NOT NULL,
  aggregation_version VARCHAR(20) DEFAULT '1.0' NOT NULL,
  metadata JSONB DEFAULT '{}' NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  
  CONSTRAINT unique_monthly_metric UNIQUE (year, month, project_id, ip_asset_id, license_id)
);

-- ============================================
-- Custom Metric Definitions Table
-- ============================================
CREATE TABLE custom_metric_definitions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Definition
  metric_type VARCHAR(50) NOT NULL, -- 'count', 'sum', 'average', 'distinct_count', 'percentile', 'ratio'
  data_source VARCHAR(100) NOT NULL, -- 'events', 'daily_metrics', 'licenses', etc.
  calculation_formula TEXT NOT NULL, -- JSON expression or SQL fragment
  
  -- Dimensions and filters
  dimensions JSONB DEFAULT '[]' NOT NULL, -- Array of dimension fields
  filters JSONB DEFAULT '{}' NOT NULL, -- Filter conditions
  aggregation_method VARCHAR(50) NOT NULL, -- How to aggregate: 'sum', 'avg', 'max', 'min', 'count'
  
  -- Access control
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visibility VARCHAR(20) DEFAULT 'private' NOT NULL, -- 'private', 'team', 'organization', 'public'
  allowed_roles JSONB DEFAULT '["ADMIN"]' NOT NULL,
  
  -- Validation and safety
  is_validated BOOLEAN DEFAULT false NOT NULL,
  validation_errors JSONB,
  estimated_cost VARCHAR(20), -- 'low', 'medium', 'high' (query complexity)
  query_timeout_seconds INTEGER DEFAULT 30 NOT NULL,
  
  -- Versioning and audit
  version INTEGER DEFAULT 1 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  parent_metric_id TEXT REFERENCES custom_metric_definitions(id),
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0 NOT NULL,
  last_calculated_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT unique_active_metric_name UNIQUE (name, deleted_at)
);

-- ============================================
-- Custom Metric Values (Calculated Results)
-- ============================================
CREATE TABLE custom_metric_values (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_definition_id TEXT NOT NULL REFERENCES custom_metric_definitions(id) ON DELETE CASCADE,
  
  -- Time period
  period_type VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly', 'custom'
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  
  -- Dimensions (for grouping results)
  dimension_values JSONB DEFAULT '{}' NOT NULL,
  
  -- Calculated value
  metric_value DECIMAL(20,4) NOT NULL,
  metric_value_string TEXT, -- For non-numeric results
  
  -- Metadata
  calculation_timestamp TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  calculation_duration_ms INTEGER,
  record_count INTEGER, -- Number of records used in calculation
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  
  CONSTRAINT unique_custom_metric_value UNIQUE (metric_definition_id, period_start_date, period_end_date, dimension_values)
);

-- ============================================
-- Real-Time Metrics Cache Table
-- ============================================
CREATE TABLE realtime_metrics_cache (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key VARCHAR(255) NOT NULL UNIQUE,
  metric_type VARCHAR(50) NOT NULL, -- 'counter', 'gauge', 'histogram', 'rate'
  
  -- Current value
  current_value DECIMAL(20,4) NOT NULL,
  previous_value DECIMAL(20,4),
  
  -- Metadata
  dimensions JSONB DEFAULT '{}' NOT NULL,
  unit VARCHAR(50), -- 'count', 'seconds', 'bytes', 'percent', etc.
  
  -- Sliding window data (for moving averages, etc.)
  window_size_seconds INTEGER,
  window_data JSONB DEFAULT '[]' NOT NULL, -- Array of recent data points
  
  -- Update tracking
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  update_count INTEGER DEFAULT 1 NOT NULL,
  
  -- TTL and cache control
  expires_at TIMESTAMP WITH TIME ZONE,
  refresh_interval_seconds INTEGER DEFAULT 60,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  
  CONSTRAINT check_metric_type CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'rate'))
);

-- ============================================
-- Metrics Aggregation Jobs Log
-- ============================================
CREATE TABLE metrics_aggregation_jobs_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type VARCHAR(50) NOT NULL, -- 'daily', 'weekly', 'monthly', 'custom'
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  
  -- Job execution
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) NOT NULL, -- 'running', 'completed', 'failed', 'partial'
  
  -- Results
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  
  -- Performance
  duration_seconds DECIMAL(10,2),
  memory_used_mb INTEGER,
  
  -- Error details
  error_message TEXT,
  error_stack TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}' NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ============================================
-- Indexes for Weekly Metrics
-- ============================================
CREATE INDEX idx_weekly_metrics_week_start ON weekly_metrics(week_start_date DESC);
CREATE INDEX idx_weekly_metrics_project ON weekly_metrics(project_id, week_start_date DESC);
CREATE INDEX idx_weekly_metrics_asset ON weekly_metrics(ip_asset_id, week_start_date DESC);
CREATE INDEX idx_weekly_metrics_license ON weekly_metrics(license_id, week_start_date DESC);
CREATE INDEX idx_weekly_metrics_created_at ON weekly_metrics(created_at DESC);

-- ============================================
-- Indexes for Monthly Metrics
-- ============================================
CREATE INDEX idx_monthly_metrics_year_month ON monthly_metrics(year DESC, month DESC);
CREATE INDEX idx_monthly_metrics_month_start ON monthly_metrics(month_start_date DESC);
CREATE INDEX idx_monthly_metrics_project ON monthly_metrics(project_id, year DESC, month DESC);
CREATE INDEX idx_monthly_metrics_asset ON monthly_metrics(ip_asset_id, year DESC, month DESC);
CREATE INDEX idx_monthly_metrics_license ON monthly_metrics(license_id, year DESC, month DESC);
CREATE INDEX idx_monthly_metrics_created_at ON monthly_metrics(created_at DESC);

-- ============================================
-- Indexes for Custom Metric Definitions
-- ============================================
CREATE INDEX idx_custom_metrics_name ON custom_metric_definitions(name) WHERE deleted_at IS NULL;
CREATE INDEX idx_custom_metrics_created_by ON custom_metric_definitions(created_by);
CREATE INDEX idx_custom_metrics_active ON custom_metric_definitions(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_custom_metrics_type ON custom_metric_definitions(metric_type);
CREATE INDEX idx_custom_metrics_last_calculated ON custom_metric_definitions(last_calculated_at DESC);
CREATE INDEX idx_custom_metrics_usage ON custom_metric_definitions(usage_count DESC);

-- ============================================
-- Indexes for Custom Metric Values
-- ============================================
CREATE INDEX idx_custom_metric_values_definition ON custom_metric_values(metric_definition_id, period_start_date DESC);
CREATE INDEX idx_custom_metric_values_period ON custom_metric_values(period_start_date DESC, period_end_date DESC);
CREATE INDEX idx_custom_metric_values_timestamp ON custom_metric_values(calculation_timestamp DESC);

-- ============================================
-- Indexes for Real-Time Metrics Cache
-- ============================================
CREATE INDEX idx_realtime_metrics_metric_key ON realtime_metrics_cache(metric_key);
CREATE INDEX idx_realtime_metrics_type ON realtime_metrics_cache(metric_type);
CREATE INDEX idx_realtime_metrics_last_updated ON realtime_metrics_cache(last_updated_at DESC);
CREATE INDEX idx_realtime_metrics_expires_at ON realtime_metrics_cache(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================
-- Indexes for Aggregation Jobs Log
-- ============================================
CREATE INDEX idx_metrics_jobs_log_type_period ON metrics_aggregation_jobs_log(job_type, period_start_date DESC);
CREATE INDEX idx_metrics_jobs_log_status ON metrics_aggregation_jobs_log(status, started_at DESC);
CREATE INDEX idx_metrics_jobs_log_started_at ON metrics_aggregation_jobs_log(started_at DESC);

-- ============================================
-- Comments for Documentation
-- ============================================
COMMENT ON TABLE weekly_metrics IS 'Aggregated metrics by week for improved query performance';
COMMENT ON TABLE monthly_metrics IS 'Aggregated metrics by month with growth trends and weekly breakdowns';
COMMENT ON TABLE custom_metric_definitions IS 'User-defined custom metrics with flexible calculation formulas';
COMMENT ON TABLE custom_metric_values IS 'Calculated values for custom metrics across different time periods';
COMMENT ON TABLE realtime_metrics_cache IS 'Cache for real-time metrics updated incrementally from events';
COMMENT ON TABLE metrics_aggregation_jobs_log IS 'Audit log for metrics aggregation job executions';
