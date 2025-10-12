-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED', 'UNSUBSCRIBED', 'COMPLAINED');

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "template_id" TEXT NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "preview_text" VARCHAR(200),
    "segment_criteria" JSONB,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "scheduled_send_time" TIMESTAMP(3),
    "timezone" TEXT DEFAULT 'UTC',
    "send_started_at" TIMESTAMP(3),
    "send_completed_at" TIMESTAMP(3),
    "messages_per_hour" INTEGER NOT NULL DEFAULT 1000,
    "batch_size" INTEGER NOT NULL DEFAULT 100,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "opened_count" INTEGER NOT NULL DEFAULT 0,
    "clicked_count" INTEGER NOT NULL DEFAULT 0,
    "bounced_count" INTEGER NOT NULL DEFAULT 0,
    "unsubscribed_count" INTEGER NOT NULL DEFAULT 0,
    "complained_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "first_clicked_at" TIMESTAMP(3),
    "bounced_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "complained_at" TIMESTAMP(3),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "personalization_data" JSONB,
    "message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_email_segments" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "criteria" JSONB NOT NULL,
    "estimated_size" INTEGER,
    "last_calculated_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_email_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_clicks" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "recipient_id" TEXT,
    "email" TEXT NOT NULL,
    "clicked_url" TEXT NOT NULL,
    "link_position" INTEGER,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "device_type" TEXT,
    "geographic_data" JSONB,

    CONSTRAINT "email_campaign_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_reports" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "device_breakdown" JSONB,
    "geographic_breakdown" JSONB,
    "hourly_breakdown" JSONB,
    "link_performance" JSONB,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaign_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_campaigns_created_by_idx" ON "email_campaigns"("created_by");

-- CreateIndex
CREATE INDEX "email_campaigns_status_idx" ON "email_campaigns"("status");

-- CreateIndex
CREATE INDEX "email_campaigns_scheduled_send_time_idx" ON "email_campaigns"("scheduled_send_time");

-- CreateIndex
CREATE INDEX "email_campaigns_created_at_idx" ON "email_campaigns"("created_at");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaign_id_status_idx" ON "campaign_recipients"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "campaign_recipients_user_id_idx" ON "campaign_recipients"("user_id");

-- CreateIndex
CREATE INDEX "campaign_recipients_email_idx" ON "campaign_recipients"("email");

-- CreateIndex
CREATE INDEX "campaign_recipients_status_idx" ON "campaign_recipients"("status");

-- CreateIndex
CREATE INDEX "saved_email_segments_created_by_idx" ON "saved_email_segments"("created_by");

-- CreateIndex
CREATE INDEX "saved_email_segments_is_public_idx" ON "saved_email_segments"("is_public");

-- CreateIndex
CREATE INDEX "email_campaign_clicks_campaign_id_idx" ON "email_campaign_clicks"("campaign_id");

-- CreateIndex
CREATE INDEX "email_campaign_clicks_recipient_id_idx" ON "email_campaign_clicks"("recipient_id");

-- CreateIndex
CREATE INDEX "email_campaign_clicks_clicked_at_idx" ON "email_campaign_clicks"("clicked_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_campaign_reports_campaign_id_key" ON "email_campaign_reports"("campaign_id");

-- CreateIndex
CREATE INDEX "email_campaign_reports_generated_at_idx" ON "email_campaign_reports"("generated_at");

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "email_preferences" ADD COLUMN "global_unsubscribe" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "email_preferences" ADD COLUMN "unsubscribe_token" TEXT;
ALTER TABLE "email_preferences" ADD COLUMN "preference_center_last_visited" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "email_preferences_global_unsubscribe_idx" ON "email_preferences"("global_unsubscribe");

-- CreateIndex
CREATE UNIQUE INDEX "email_preferences_unsubscribe_token_key" ON "email_preferences"("unsubscribe_token");
