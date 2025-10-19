-- CreateTable: TwoFactorComplianceMetrics
CREATE TABLE "two_factor_compliance_metrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "period_type" TEXT NOT NULL,
    "total_users" INTEGER NOT NULL,
    "users_with_two_factor" INTEGER NOT NULL,
    "adoption_rate" DECIMAL(5,2) NOT NULL,
    "admin_total" INTEGER NOT NULL,
    "admin_enabled" INTEGER NOT NULL,
    "creator_total" INTEGER NOT NULL,
    "creator_enabled" INTEGER NOT NULL,
    "brand_total" INTEGER NOT NULL,
    "brand_enabled" INTEGER NOT NULL,
    "talent_total" INTEGER NOT NULL,
    "talent_enabled" INTEGER NOT NULL,
    "viewer_total" INTEGER NOT NULL,
    "viewer_enabled" INTEGER NOT NULL,
    "total_auth_attempts" INTEGER NOT NULL,
    "successful_auths" INTEGER NOT NULL,
    "failed_auths" INTEGER NOT NULL,
    "failure_rate" DECIMAL(5,2) NOT NULL,
    "totp_attempts" INTEGER NOT NULL,
    "sms_attempts" INTEGER NOT NULL,
    "backup_code_attempts" INTEGER NOT NULL,
    "account_lockouts" INTEGER NOT NULL,
    "suspicious_activities" INTEGER NOT NULL,
    "emergency_codes_generated" INTEGER NOT NULL,
    "admin_resets" INTEGER NOT NULL,
    "backup_codes_regenerated" INTEGER NOT NULL,
    "users_with_low_backup_codes" INTEGER NOT NULL,
    "backup_codes_used" INTEGER NOT NULL,
    "adoption_rate_change" DECIMAL(5,2),
    "failure_rate_change" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "two_factor_compliance_metrics_period_start_period_end_period_type_key" UNIQUE("period_start", "period_end", "period_type")
);

-- CreateIndex
CREATE INDEX "two_factor_compliance_metrics_period_start_idx" ON "two_factor_compliance_metrics"("period_start" DESC);
CREATE INDEX "two_factor_compliance_metrics_period_type_period_start_idx" ON "two_factor_compliance_metrics"("period_type", "period_start" DESC);

-- CreateTable: TwoFactorSecurityEvent
CREATE TABLE "two_factor_security_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_category" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "failure_reason" TEXT,
    "method" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "device_fingerprint" TEXT,
    "location_country" TEXT,
    "location_region" TEXT,
    "location_city" TEXT,
    "is_anomalous" BOOLEAN NOT NULL DEFAULT false,
    "anomaly_score" DECIMAL(5,2),
    "anomaly_reasons" TEXT[],
    "admin_id" TEXT,
    "admin_action" TEXT,
    "admin_reason" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "two_factor_security_events_user_id_timestamp_idx" ON "two_factor_security_events"("user_id", "timestamp" DESC);
CREATE INDEX "two_factor_security_events_event_type_timestamp_idx" ON "two_factor_security_events"("event_type", "timestamp" DESC);
CREATE INDEX "two_factor_security_events_event_category_timestamp_idx" ON "two_factor_security_events"("event_category", "timestamp" DESC);
CREATE INDEX "two_factor_security_events_is_anomalous_timestamp_idx" ON "two_factor_security_events"("is_anomalous", "timestamp" DESC);
CREATE INDEX "two_factor_security_events_timestamp_idx" ON "two_factor_security_events"("timestamp" DESC);
CREATE INDEX "two_factor_security_events_ip_address_timestamp_idx" ON "two_factor_security_events"("ip_address", "timestamp" DESC);
CREATE INDEX "two_factor_security_events_admin_id_timestamp_idx" ON "two_factor_security_events"("admin_id", "timestamp" DESC);

-- CreateTable: TwoFactorSecurityAlert
CREATE TABLE "two_factor_security_alerts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alert_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recommendation" TEXT,
    "metric" TEXT NOT NULL,
    "current_value" DECIMAL(10,2) NOT NULL,
    "threshold" DECIMAL(10,2) NOT NULL,
    "baseline_value" DECIMAL(10,2),
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "affected_user_count" INTEGER,
    "affected_users" TEXT[],
    "affected_ip_addresses" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "resolution" TEXT,
    "notification_sent" BOOLEAN NOT NULL DEFAULT false,
    "notification_sent_at" TIMESTAMP(3),
    "notified_admins" TEXT[],
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "two_factor_security_alerts_alert_type_created_at_idx" ON "two_factor_security_alerts"("alert_type", "created_at" DESC);
CREATE INDEX "two_factor_security_alerts_severity_status_idx" ON "two_factor_security_alerts"("severity", "status");
CREATE INDEX "two_factor_security_alerts_status_created_at_idx" ON "two_factor_security_alerts"("status", "created_at" DESC);
CREATE INDEX "two_factor_security_alerts_created_at_idx" ON "two_factor_security_alerts"("created_at" DESC);

-- CreateTable: TwoFactorComplianceReport
CREATE TABLE "two_factor_compliance_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "report_type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "generated_by" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generation_status" TEXT NOT NULL DEFAULT 'pending',
    "report_data" JSONB,
    "summary" TEXT,
    "storage_url" TEXT,
    "storage_key" TEXT,
    "file_size" INTEGER,
    "emailed_to" TEXT[],
    "emailed_at" TIMESTAMP(3),
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "last_downloaded_at" TIMESTAMP(3),
    "is_scheduled" BOOLEAN NOT NULL DEFAULT false,
    "schedule_frequency" TEXT,
    "next_generation_date" TIMESTAMP(3),
    "error_message" TEXT,
    "error_stack" TEXT,
    "metadata" JSONB,
    "expires_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "two_factor_compliance_reports_report_type_generated_at_idx" ON "two_factor_compliance_reports"("report_type", "generated_at" DESC);
CREATE INDEX "two_factor_compliance_reports_generated_by_generated_at_idx" ON "two_factor_compliance_reports"("generated_by", "generated_at" DESC);
CREATE INDEX "two_factor_compliance_reports_generation_status_idx" ON "two_factor_compliance_reports"("generation_status");
CREATE INDEX "two_factor_compliance_reports_is_scheduled_next_generation_date_idx" ON "two_factor_compliance_reports"("is_scheduled", "next_generation_date");
CREATE INDEX "two_factor_compliance_reports_generated_at_idx" ON "two_factor_compliance_reports"("generated_at" DESC);
