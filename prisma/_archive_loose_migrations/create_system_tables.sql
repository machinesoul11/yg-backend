-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LICENSE', 'PAYOUT', 'ROYALTY', 'PROJECT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "request_hash" TEXT,
    "response_status" INTEGER,
    "response_body" JSONB,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processing_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "conditions" JSONB,
    "rollout_percentage" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "action_url" TEXT,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");

-- CreateIndex
CREATE INDEX "idempotency_keys_key_idx" ON "idempotency_keys"("key");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_entity_type_entity_id_idx" ON "idempotency_keys"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_name_key" ON "feature_flags"("name");

-- CreateIndex
CREATE INDEX "feature_flags_name_idx" ON "feature_flags"("name");

-- CreateIndex
CREATE INDEX "feature_flags_enabled_idx" ON "feature_flags"("enabled");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_created_at_idx" ON "notifications"("user_id", "read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_type_idx" ON "notifications"("user_id", "type");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
