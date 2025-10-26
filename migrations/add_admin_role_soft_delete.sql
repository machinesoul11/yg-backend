-- Add soft delete fields to admin_roles table
ALTER TABLE "admin_roles" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "admin_roles" ADD COLUMN "deleted_by" TEXT;
ALTER TABLE "admin_roles" ADD COLUMN "deletion_reason" TEXT;

-- Add indices for soft delete queries
CREATE INDEX "admin_roles_deleted_at_idx" ON "admin_roles"("deleted_at");
CREATE INDEX "admin_roles_user_id_deleted_at_idx" ON "admin_roles"("user_id", "deleted_at");

-- Update existing queries to filter out deleted roles
-- NOTE: Application code should be updated to include deletedAt: null in where clauses
