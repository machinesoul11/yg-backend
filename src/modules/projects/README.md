# Projects Module

The Projects module serves as the **organizational container** for all creative work within YES GODDESS. It acts as the bridge between **Brands** (who initiate projects) and **IP Assets** (the creative output).

## Overview

Projects represent campaigns, content initiatives, or licensing opportunities that Brands create to discover and license creator work.

### System Position
- **Upstream:** Receives input from Brands creating briefs/campaigns
- **Downstream:** Contains IP Assets, generates Licenses, feeds into Analytics
- **Lateral:** Integrates with Messaging (project discussions), Notifications (project updates)

## Features

✅ **Complete CRUD operations** for projects
✅ **Role-based access control** (Brands can only access their own projects)
✅ **Status lifecycle management** with validation
✅ **Flexible project requirements** using JSONB
✅ **Budget tracking** in cents to avoid floating-point issues
✅ **Timeline management** with start/end dates
✅ **Analytics event tracking** for all operations
✅ **Redis caching** for performance
✅ **Audit logging** for all mutations
✅ **Background jobs** for creator matching and auto-archival
✅ **Email notifications** for project events

## Project Status Lifecycle

```
DRAFT → ACTIVE → IN_PROGRESS → COMPLETED → ARCHIVED
         ↓          ↓
      CANCELLED  CANCELLED
         ↓
      ARCHIVED
```

### Valid Status Transitions
- **DRAFT** → ACTIVE, CANCELLED
- **ACTIVE** → IN_PROGRESS, CANCELLED, ARCHIVED
- **IN_PROGRESS** → COMPLETED, CANCELLED
- **COMPLETED** → ARCHIVED
- **CANCELLED** → ARCHIVED
- **ARCHIVED** → (No transitions allowed)

## Project Types

- **CAMPAIGN** - Marketing campaign
- **CONTENT** - Content creation initiative
- **LICENSING** - Pure IP licensing opportunity

## Database Schema

### Projects Table

```sql
CREATE TABLE "projects" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL REFERENCES "brands"("id"),
  "name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "status" "ProjectStatus" DEFAULT 'DRAFT',
  "budgetCents" INTEGER DEFAULT 0,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "objectives" JSONB,          -- Array of objectives
  "requirements" JSONB,        -- Project requirements object
  "metadata" JSONB,            -- Flexible metadata storage
  "projectType" "ProjectType" DEFAULT 'CAMPAIGN',
  "createdBy" TEXT NOT NULL REFERENCES "users"("id"),
  "updatedBy" TEXT REFERENCES "users"("id"),
  "createdAt" TIMESTAMP(3) DEFAULT NOW(),
  "updatedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3)     -- Soft delete
);
```

### Events Table

```sql
CREATE TABLE "events" (
  "id" TEXT PRIMARY KEY,
  "eventType" VARCHAR(100) NOT NULL,
  "actorType" VARCHAR(50) NOT NULL,  -- 'brand', 'creator', 'admin', 'system'
  "actorId" TEXT,
  "projectId" TEXT REFERENCES "projects"("id"),
  "userId" TEXT,
  "brandId" TEXT,
  "creatorId" TEXT,
  "propsJson" JSONB,
  "createdAt" TIMESTAMP(3) DEFAULT NOW()
);
```

## API Endpoints (tRPC)

### Mutations

#### `projects.create`
Create a new project (brand users only).

```typescript
const project = await trpc.projects.create.mutate({
  name: "Summer Campaign 2025",
  description: "Looking for vibrant summer content",
  budgetCents: 500000, // $5,000
  projectType: "CAMPAIGN",
  objectives: [
    "Increase brand awareness",
    "Launch new product line"
  ],
  requirements: {
    assetTypes: ["image", "video"],
    deliverables: 10,
    exclusivity: true
  },
  startDate: "2025-06-01T00:00:00Z",
  endDate: "2025-08-31T23:59:59Z"
});
```

#### `projects.update`
Update an existing project.

```typescript
const updated = await trpc.projects.update.mutate({
  id: "clxxx...",
  status: "ACTIVE",
  budgetCents: 750000 // Increase budget
});
```

#### `projects.delete`
Soft delete a project (only if no active licenses exist).

```typescript
await trpc.projects.delete.mutate({ id: "clxxx..." });
```

### Queries

#### `projects.getById`
Get a single project by ID.

```typescript
const { data: project } = await trpc.projects.getById.useQuery({
  id: "clxxx..."
});
```

#### `projects.list`
List projects with filtering and pagination.

```typescript
const { data } = await trpc.projects.list.useQuery({
  page: 1,
  limit: 20,
  status: "ACTIVE",
  projectType: "CAMPAIGN",
  search: "summer",
  budgetMin: 100000,  // $1,000
  budgetMax: 1000000, // $10,000
  sortBy: "createdAt",
  sortOrder: "desc"
});
```

#### `projects.getMyProjects`
Get current brand user's projects.

```typescript
const { data } = await trpc.projects.getMyProjects.useQuery({
  page: 1,
  limit: 20,
  status: "ACTIVE"
});
```

#### `projects.getTeam`
Get team members associated with a project.

```typescript
const { data: team } = await trpc.projects.getTeam.useQuery({
  projectId: "clxxx..."
});
```

#### `projects.getStatistics`
Get project statistics (optionally filtered by brand).

```typescript
const { data: stats } = await trpc.projects.getStatistics.useQuery({
  brandId: "clyyy..." // Optional
});

// Returns:
// {
//   total: 42,
//   byStatus: { DRAFT: 5, ACTIVE: 10, ... },
//   byType: { CAMPAIGN: 30, CONTENT: 8, LICENSING: 4 },
//   totalBudgetCents: 5000000,
//   avgBudgetCents: 119047
// }
```

## Background Jobs

### `project-match-creators`
**Trigger:** When project status changes to ACTIVE  
**Purpose:** Find creators whose specialties match project requirements and notify them  
**Schedule:** Immediate (queued)

### `project-expiry-check`
**Trigger:** Daily cron at 02:00 UTC  
**Purpose:** Auto-archive projects past their end date  
**Schedule:** Daily

## Email Notifications

### Project Match Notification
Sent to creators when a new project matches their specialties.

**Template:** `ProjectMatchNotification.tsx`  
**Trigger:** `project-match-creators` job  
**Variables:**
- `creatorName`
- `projectName`
- `brandName`
- `projectDescription`
- `budgetRange`
- `projectUrl`

### Project Expired
Sent to brand admins when a project is auto-archived.

**Template:** `ProjectExpired.tsx`  
**Trigger:** `project-expiry-check` job  
**Variables:**
- `brandName`
- `projectName`
- `endDate`
- `projectUrl`

## Security & Authorization

### Row-Level Security (RLS)
- **Brands:** Can only create, view, update, and delete their own projects
- **Creators:** Can view ACTIVE projects (for discovery)
- **Admins:** Can view and manage all projects

### Validation Rules
- Project name: 3-200 characters
- Description: Max 5,000 characters
- Budget: 0 - $1,000,000 (in cents)
- End date must be after start date
- Max 10 objectives
- Status transitions must be valid

### Business Rules
- Only brand accounts can create projects
- Projects with active licenses cannot be deleted
- Archived projects cannot transition to other statuses
- Budget is stored in cents to avoid floating-point issues

## Caching Strategy

### Cache Keys
```typescript
- project:{id}                    // Individual project
- projects:brand:{brandId}:*      // Brand's project lists
- project:{projectId}:assets      // Project's assets
```

### Cache TTL
- Individual projects: 15 minutes
- Project lists: 5 minutes
- Statistics: 1 hour

### Cache Invalidation
Projects are automatically invalidated when:
- Project is created, updated, or deleted
- Project status changes
- Assets are added to the project

## Analytics Events

All project operations emit analytics events:

- `project.created` - New project created
- `project.updated` - Project details updated
- `project.status_changed` - Project status changed
- `project.deleted` - Project soft deleted
- `project.creators_matched` - Creators notified about project match (system)
- `project.auto_archived` - Project auto-archived after end date (system)

## Error Handling

The module defines custom error classes:

```typescript
- ProjectNotFoundError          // 404
- ProjectUnauthorizedError      // 403
- ProjectCreationError          // 500
- ProjectUpdateError            // 500
- ProjectDeleteError            // 500
- InvalidStatusTransitionError  // 400
- ProjectHasActiveLicensesError // 400
- OnlyBrandsCanCreateProjectsError // 403
```

All errors are mapped to appropriate tRPC error codes in the router.

## Testing

### Unit Tests
```bash
npm test src/modules/projects/services/project.service.test.ts
```

### Integration Tests
```bash
npm test src/modules/projects/routers/projects.router.test.ts
```

## File Structure

```
src/modules/projects/
├── index.ts                          # Module exports
├── errors/
│   └── project.errors.ts             # Custom error classes
├── types/
│   └── project.types.ts              # TypeScript type definitions
├── schemas/
│   └── project.schema.ts             # Zod validation schemas
├── services/
│   ├── project.service.ts            # Core business logic
│   └── event.service.ts              # Analytics event tracking
└── routers/
    └── projects.router.ts            # tRPC API endpoints

src/jobs/
├── project-match-creators.job.ts     # Creator matching background job
└── project-expiry-check.job.ts       # Auto-archival background job

emails/templates/
├── ProjectMatchNotification.tsx      # Creator match email
└── ProjectExpired.tsx                # Project expired email

prisma/migrations/
└── 004_projects_table.sql            # Database migration
```

## Future Enhancements

- [ ] Project templates for common campaign types
- [ ] Bulk project operations
- [ ] Project duplication
- [ ] Advanced search with Elasticsearch
- [ ] Project collaboration tools (comments, reviews)
- [ ] Automated budget tracking against licenses
- [ ] Project milestones and phases
- [ ] Real-time project updates via WebSockets
- [ ] Export project data (CSV, PDF reports)
- [ ] Project health scoring

## Related Modules

- **Brands** - Project owners
- **Creators** - Project participants
- **IP Assets** - Project deliverables
- **Licenses** - Project licensing
- **Analytics** - Project metrics
- **Notifications** - Project updates
- **Messaging** - Project discussions

---

**Last Updated:** October 10, 2025  
**Module Version:** 1.0.0  
**Status:** ✅ Complete
