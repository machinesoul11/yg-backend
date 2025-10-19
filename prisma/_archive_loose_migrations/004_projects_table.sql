-- Projects Table Migration
-- Creates the projects table with all required fields and relationships

-- Create ProjectStatus enum
CREATE TYPE "ProjectStatus" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED'
);

-- Create ProjectType enum
CREATE TYPE "ProjectType" AS ENUM (
  'CAMPAIGN',
  'CONTENT',
  'LICENSING'
);

-- Create projects table
CREATE TABLE "projects" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
  
  -- Financial
  "budgetCents" INTEGER NOT NULL DEFAULT 0,
  
  -- Timeline
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  
  -- Flexible data (JSONB)
  "objectives" JSONB,
  "requirements" JSONB,
  "metadata" JSONB,
  
  -- Type
  "projectType" "ProjectType" NOT NULL DEFAULT 'CAMPAIGN',
  
  -- Audit fields
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  
  -- Foreign keys
  CONSTRAINT "projects_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "projects_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "projects_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create indexes
CREATE INDEX "projects_brandId_status_idx" ON "projects"("brandId", "status");
CREATE INDEX "projects_createdAt_idx" ON "projects"("createdAt");
CREATE INDEX "projects_deletedAt_idx" ON "projects"("deletedAt");
CREATE INDEX "projects_status_idx" ON "projects"("status");
CREATE INDEX "projects_projectType_idx" ON "projects"("projectType");

-- Create events table for analytics
CREATE TABLE "events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventType" VARCHAR(100) NOT NULL,
  "actorType" VARCHAR(50) NOT NULL,
  "actorId" TEXT,
  
  -- Resource references
  "projectId" TEXT,
  "userId" TEXT,
  "brandId" TEXT,
  "creatorId" TEXT,
  
  -- Event data
  "propsJson" JSONB,
  
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign keys
  CONSTRAINT "events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create indexes for events
CREATE INDEX "events_eventType_createdAt_idx" ON "events"("eventType", "createdAt");
CREATE INDEX "events_projectId_idx" ON "events"("projectId");
CREATE INDEX "events_actorId_actorType_idx" ON "events"("actorId", "actorType");
CREATE INDEX "events_createdAt_idx" ON "events"("createdAt");

-- Add helpful comments
COMMENT ON TABLE "projects" IS 'Project/campaign management for brands';
COMMENT ON COLUMN "projects"."budgetCents" IS 'Budget in cents to avoid floating point issues';
COMMENT ON COLUMN "projects"."objectives" IS 'Array of project objectives as JSON';
COMMENT ON COLUMN "projects"."requirements" IS 'Project requirements object as JSON';
COMMENT ON COLUMN "projects"."metadata" IS 'Flexible metadata storage as JSON';
COMMENT ON COLUMN "projects"."deletedAt" IS 'Soft delete timestamp';

COMMENT ON TABLE "events" IS 'Analytics and audit events tracking';
COMMENT ON COLUMN "events"."propsJson" IS 'Event-specific properties as JSON';
