-- Migration: Add Content Workflow Editorial Features
-- Date: 2025-10-15
-- Description: Adds content workflow features including author assignment, approval workflow, and workflow history

-- Add new enum values to PostStatus
ALTER TYPE "PostStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "PostStatus" ADD VALUE 'APPROVED';
ALTER TYPE "PostStatus" ADD VALUE 'REJECTED';

-- Add assigned_to_id column to posts table
ALTER TABLE "posts" ADD COLUMN "assigned_to_id" TEXT;

-- Add foreign key constraint for assigned_to_id
ALTER TABLE "posts" ADD CONSTRAINT "posts_assigned_to_id_fkey" 
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for assigned_to_id
CREATE INDEX "posts_assigned_to_id_idx" ON "posts"("assigned_to_id");

-- Add compound index for assignedToId and status
CREATE INDEX "posts_assigned_to_id_status_idx" ON "posts"("assigned_to_id", "status");

-- Create post_workflow_history table
CREATE TABLE "post_workflow_history" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "from_status" "PostStatus" NOT NULL,
    "to_status" "PostStatus" NOT NULL,
    "user_id" TEXT NOT NULL,
    "comments" TEXT,
    "reason" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_workflow_history_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraints for post_workflow_history
ALTER TABLE "post_workflow_history" ADD CONSTRAINT "post_workflow_history_post_id_fkey" 
    FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_workflow_history" ADD CONSTRAINT "post_workflow_history_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add indexes for post_workflow_history
CREATE INDEX "post_workflow_history_post_id_idx" ON "post_workflow_history"("post_id");
CREATE INDEX "post_workflow_history_created_at_idx" ON "post_workflow_history"("created_at" DESC);
CREATE INDEX "post_workflow_history_user_id_idx" ON "post_workflow_history"("user_id");
CREATE INDEX "post_workflow_history_from_status_to_status_idx" ON "post_workflow_history"("from_status", "to_status");
