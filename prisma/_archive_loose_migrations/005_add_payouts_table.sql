-- CreateEnum for PayoutStatus
DO $$ BEGIN
 CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateTable: payouts
CREATE TABLE IF NOT EXISTS "payouts" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "royalty_statement_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "stripe_transfer_id" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "processed_at" TIMESTAMP(3),
    "failed_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_stripe_transfer_id_key" ON "payouts"("stripe_transfer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payouts_creator_id_status_idx" ON "payouts"("creator_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payouts_status_created_at_idx" ON "payouts"("status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payouts_stripe_transfer_id_idx" ON "payouts"("stripe_transfer_id");

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_royalty_statement_id_fkey" FOREIGN KEY ("royalty_statement_id") REFERENCES "royalty_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
