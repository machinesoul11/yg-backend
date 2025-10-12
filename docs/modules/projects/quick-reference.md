# Projects Module - Quick Reference

## 🎯 Overview

The Projects module manages creative campaigns and licensing opportunities created by brands.

## 📋 Checklist

### ✅ Completed
- [x] Projects table schema
- [x] Events table schema  
- [x] Project enums (ProjectStatus, ProjectType)
- [x] TypeScript type definitions
- [x] Zod validation schemas
- [x] Custom error classes
- [x] ProjectService with CRUD operations
- [x] EventService for analytics
- [x] tRPC router with 8 endpoints
- [x] Background jobs (2)
- [x] Email templates (2)
- [x] README documentation
- [x] Implementation summary
- [x] Team management (add/remove/update members)
- [x] Timeline management (milestones CRUD)
- [x] Budget tracking (expenses CRUD, budget summary)
- [x] Enhanced team member retrieval
- [x] 13 new tRPC endpoints for extended features

### 🔄 Next Steps (Before Use)
- [ ] Run `npx prisma generate` to update Prisma client
- [ ] Run database migration `004_projects_table.sql`
- [ ] Register `projectsRouter` in main tRPC router
- [ ] Schedule background jobs
- [ ] Update authentication context in router (replace temp user IDs)
- [ ] Write unit tests
- [ ] Write integration tests

## 🚀 Quick Start

### 1. Install Dependencies (Already Done)
All dependencies are part of existing setup.

### 2. Generate Prisma Client
```bash
npx prisma generate
```

### 3. Run Migration
```bash
# Option 1: Prisma migrate
npx prisma migrate dev --name add_projects_table

# Option 2: Manual
psql $DATABASE_URL < prisma/migrations/004_projects_table.sql
```

### 4. Register Router
In your main tRPC router file:

```typescript
import { projectsRouter } from '@/modules/projects';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  brands: brandsRouter,
  creators: creatorsRouter,
  projects: projectsRouter, // ← Add this
});
```

### 5. Update Authentication Context
In `src/modules/projects/routers/projects.router.ts`, replace temp IDs:

```typescript
// BEFORE (temporary):
const userId = 'temp-user-id';
const userRole = 'ADMIN';

// AFTER (with auth):
const userId = ctx.session.user.id;
const userRole = ctx.session.user.role;
```

## 📡 API Endpoints

### Create Project
```typescript
const project = await trpc.projects.create.mutate({
  name: "Summer Campaign 2025",
  budgetCents: 500000,
  projectType: "CAMPAIGN"
});
```

### List Projects
```typescript
const { data } = await trpc.projects.list.useQuery({
  page: 1,
  limit: 20,
  status: "ACTIVE"
});
```

### Update Project
```typescript
const project = await trpc.projects.update.mutate({
  id: "project-id",
  status: "IN_PROGRESS"
});
```

### Delete Project
```typescript
await trpc.projects.delete.mutate({
  id: "project-id"
});
```

### Get Project Statistics
```typescript
const stats = await trpc.projects.getStatistics.useQuery({
  brandId: "optional-brand-id"
});
```

## 👥 Team Management Endpoints

### Add Team Member
```typescript
const member = await trpc.projects.addTeamMember.mutate({
  projectId: "project-id",
  userId: "user-id",
  role: "collaborator" // or "viewer"
});
```

### Remove Team Member
```typescript
await trpc.projects.removeTeamMember.mutate({
  projectId: "project-id",
  userId: "user-id"
});
```

### Update Team Member Role
```typescript
const member = await trpc.projects.updateTeamMemberRole.mutate({
  projectId: "project-id",
  userId: "user-id",
  role: "viewer"
});
```

### Get Enhanced Team
```typescript
const team = await trpc.projects.getEnhancedTeam.useQuery({
  projectId: "project-id"
});
// Returns: brand admin + all team members from metadata
```

## 📅 Timeline/Milestone Endpoints

### Create Milestone
```typescript
const milestone = await trpc.projects.createMilestone.mutate({
  projectId: "project-id",
  name: "Complete Asset Review",
  description: "Review all submitted assets",
  dueDate: "2025-12-31T23:59:59Z"
});
```

### Update Milestone
```typescript
const milestone = await trpc.projects.updateMilestone.mutate({
  projectId: "project-id",
  milestoneId: "milestone-id",
  status: "completed",
  name: "Updated Name (optional)"
});
```

### Delete Milestone
```typescript
await trpc.projects.deleteMilestone.mutate({
  projectId: "project-id",
  milestoneId: "milestone-id"
});
```

### List Milestones
```typescript
const milestones = await trpc.projects.listMilestones.useQuery({
  projectId: "project-id",
  status: "pending" // optional: "pending" | "in_progress" | "completed" | "cancelled"
});
// Returns sorted by due date (ascending)
```

## 💰 Budget Tracking Endpoints

### Add Expense
```typescript
const expense = await trpc.projects.addExpense.mutate({
  projectId: "project-id",
  description: "Professional photography",
  amountCents: 150000, // $1,500.00
  category: "Production",
  date: "2025-10-15T00:00:00Z",
  metadata: { vendor: "PhotoStudio Inc" } // optional
});
```

### Update Expense
```typescript
const expense = await trpc.projects.updateExpense.mutate({
  projectId: "project-id",
  expenseId: "expense-id",
  amountCents: 175000, // Updated amount
  description: "Updated description (optional)"
});
```

### Delete Expense
```typescript
await trpc.projects.deleteExpense.mutate({
  projectId: "project-id",
  expenseId: "expense-id"
});
```

### Get Budget Summary
```typescript
const summary = await trpc.projects.getBudgetSummary.useQuery({
  projectId: "project-id"
});

// Returns:
// {
//   budgetCents: 500000,
//   spentCents: 325000,
//   remainingCents: 175000,
//   utilizationPercent: 65,
//   expenseCount: 8,
//   expenses: [/* sorted by date, newest first */]
// }
```

## 🏗️ Service Layer Usage

### Direct Service Usage (if needed)
```typescript
import { ProjectService } from '@/modules/projects';
import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email';
import { AuditService } from '@/lib/services/audit';

const emailService = new EmailService();
const auditService = new AuditService(prisma);
const projectService = new ProjectService(prisma, emailService, auditService);

// Team Management
const member = await projectService.addTeamMember(
  'project-id',
  { userId: 'user-id', role: 'collaborator' },
  'current-user-id',
  'ADMIN'
);

// Timeline Management
const milestone = await projectService.createMilestone(
  'project-id',
  { name: 'Milestone', dueDate: '2025-12-31T00:00:00Z' },
  'user-id',
  'ADMIN'
);

// Budget Tracking
const expense = await projectService.addExpense(
  'project-id',
  { description: 'Expense', amountCents: 10000, category: 'Production', date: '2025-10-15T00:00:00Z' },
  'user-id',
  'ADMIN'
);

const summary = await projectService.getBudgetSummary(
  'project-id',
  'user-id',
  'ADMIN'
);
```

## 📊 Data Structures

### Project Metadata Structure
```typescript
{
  // Team members (stored in metadata.teamMembers)
  teamMembers: [
    {
      userId: "user-123",
      role: "collaborator" | "viewer",
      addedAt: "2025-10-11T...",
      addedBy: "admin-user-id"
    }
  ],
  
  // Milestones (stored in metadata.milestones)
  milestones: [
    {
      id: "ms_1728...",
      name: "Milestone Name",
      description: "Optional description",
      dueDate: "2025-12-31T...",
      status: "pending" | "in_progress" | "completed" | "cancelled",
      completedAt: "2025-11-15T..." (if completed),
      completedBy: "user-id" (if completed),
      createdAt: "2025-10-11T...",
      createdBy: "user-id"
    }
  ],
  
  // Expenses (stored in metadata.expenses)
  expenses: [
    {
      id: "exp_1728...",
      description: "Expense description",
      amountCents: 150000,
      category: "Production",
      date: "2025-10-15T...",
      metadata: { vendor: "..." },
      createdBy: "user-id",
      createdAt: "2025-10-11T..."
    }
  ]
}
```

## 🔒 Authorization

All endpoints enforce row-level security:
- **Brands** can only access their own projects
- **Admins** can access all projects
- Team members must be explicitly added to collaborate
- Only project owners and admins can modify team/timeline/budget

## 🎯 Best Practices

### Team Management
- Always verify user exists before adding to team
- Don't allow removing brand admin (protected)
- Use appropriate roles: `collaborator` for active work, `viewer` for read-only

### Timeline Management
- Keep milestones within project start/end dates
- Mark milestones complete as they're achieved
- Use status transitions: pending → in_progress → completed

### Budget Tracking
- Track all expenses by category for better reporting
- Budget warnings are logged but don't block expenses
- Use metadata field for vendor info, invoice numbers, etc.
- Review budget summary regularly: `utilizationPercent > 80` = time to review

## 🧪 Testing Data
