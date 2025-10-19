-- ============================================
-- Messaging System Tables Migration
-- Phase 6.5: Messaging System Implementation
-- ============================================

-- CreateTable: message_threads
-- Stores conversation threads between users
CREATE TABLE "message_threads" (
    "id" TEXT NOT NULL,
    "subject" VARCHAR(255),
    "participants_json" JSONB NOT NULL,
    "last_message_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable: messages
-- Stores individual messages within threads
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: message_attachments
-- Stores file attachments for messages
CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- Indexes for Performance
-- ============================================

-- MessageThread indexes
CREATE INDEX "message_threads_last_message_at_idx" ON "message_threads"("last_message_at");
CREATE INDEX "message_threads_participants_json_idx" ON "message_threads" USING GIN ("participants_json");
CREATE INDEX "message_threads_deleted_at_idx" ON "message_threads"("deleted_at");

-- Message indexes
-- Composite index for thread queries (ordered by date)
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");
-- Composite index for inbox queries (unread messages)
CREATE INDEX "messages_recipient_id_read_at_idx" ON "messages"("recipient_id", "read_at");
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");
CREATE INDEX "messages_deleted_at_idx" ON "messages"("deleted_at");

-- MessageAttachment indexes
CREATE INDEX "message_attachments_message_id_idx" ON "message_attachments"("message_id");

-- ============================================
-- Foreign Key Constraints
-- ============================================

-- Messages foreign keys
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" 
    FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" 
    FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_fkey" 
    FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MessageAttachment foreign keys
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" 
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- Trigger for updated_at timestamp
-- ============================================

-- Create or replace function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_messaging_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to message_threads
CREATE TRIGGER update_message_threads_updated_at
    BEFORE UPDATE ON "message_threads"
    FOR EACH ROW
    EXECUTE FUNCTION update_messaging_updated_at();

-- Apply trigger to messages
CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON "messages"
    FOR EACH ROW
    EXECUTE FUNCTION update_messaging_updated_at();

-- ============================================
-- Comments for Documentation
-- ============================================

COMMENT ON TABLE "message_threads" IS 'Conversation threads between users with participant tracking';
COMMENT ON COLUMN "message_threads"."participants_json" IS 'JSON array of user IDs participating in the thread';
COMMENT ON COLUMN "message_threads"."last_message_at" IS 'Timestamp of the most recent message for sorting';

COMMENT ON TABLE "messages" IS 'Individual messages within conversation threads';
COMMENT ON COLUMN "messages"."read_at" IS 'Timestamp when recipient marked message as read';

COMMENT ON TABLE "message_attachments" IS 'File attachments linked to messages';
COMMENT ON COLUMN "message_attachments"."storage_key" IS 'Unique identifier in cloud storage (R2/Azure)';
