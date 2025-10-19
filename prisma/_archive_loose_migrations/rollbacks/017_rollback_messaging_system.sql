-- ============================================
-- Rollback Script for Messaging System
-- Removes all messaging tables and related objects
-- ============================================

-- Drop triggers first
DROP TRIGGER IF EXISTS update_messages_updated_at ON "messages";
DROP TRIGGER IF EXISTS update_message_threads_updated_at ON "message_threads";

-- Drop function
DROP FUNCTION IF EXISTS update_messaging_updated_at();

-- Drop foreign key constraints (these will be dropped with the tables, but explicit for clarity)
ALTER TABLE IF EXISTS "message_attachments" DROP CONSTRAINT IF EXISTS "message_attachments_message_id_fkey";
ALTER TABLE IF EXISTS "messages" DROP CONSTRAINT IF EXISTS "messages_thread_id_fkey";
ALTER TABLE IF EXISTS "messages" DROP CONSTRAINT IF EXISTS "messages_sender_id_fkey";
ALTER TABLE IF EXISTS "messages" DROP CONSTRAINT IF EXISTS "messages_recipient_id_fkey";

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS "message_attachments";
DROP TABLE IF EXISTS "messages";
DROP TABLE IF EXISTS "message_threads";

-- Note: This rollback script does NOT remove the relations from the User model in Prisma schema
-- If rolling back, also remove these lines from the User model in schema.prisma:
--   sentMessages         Message[]            @relation("SentMessages")
--   receivedMessages     Message[]            @relation("ReceivedMessages")
