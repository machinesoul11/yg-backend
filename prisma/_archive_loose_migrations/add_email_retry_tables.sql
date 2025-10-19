-- CreateTable for Email Retry Queue
CREATE TABLE IF NOT EXISTS "email_retry_queue" (
    "id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "recipient_user_id" TEXT,
    "subject" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "template_variables" JSONB,
    "tags" JSONB,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMP(3) NOT NULL,
    "original_send_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_retry_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable for Email Dead Letter Queue
CREATE TABLE IF NOT EXISTS "email_dead_letter_queue" (
    "id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "template_variables" JSONB,
    "final_error" TEXT NOT NULL,
    "failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_dead_letter_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable for Email Retry Metrics
CREATE TABLE IF NOT EXISTS "email_retry_metrics" (
    "id" TEXT NOT NULL,
    "metric_type" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_retry_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_retry_queue_recipient_email_idx" ON "email_retry_queue"("recipient_email");
CREATE INDEX IF NOT EXISTS "email_retry_queue_next_retry_at_idx" ON "email_retry_queue"("next_retry_at");
CREATE INDEX IF NOT EXISTS "email_retry_queue_attempt_count_idx" ON "email_retry_queue"("attempt_count");
CREATE UNIQUE INDEX IF NOT EXISTS "email_retry_queue_recipient_email_template_name_key" ON "email_retry_queue"("recipient_email", "template_name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_dead_letter_queue_recipient_email_idx" ON "email_dead_letter_queue"("recipient_email");
CREATE INDEX IF NOT EXISTS "email_dead_letter_queue_failed_at_idx" ON "email_dead_letter_queue"("failed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_retry_metrics_metric_type_idx" ON "email_retry_metrics"("metric_type");
CREATE INDEX IF NOT EXISTS "email_retry_metrics_created_at_idx" ON "email_retry_metrics"("created_at");
