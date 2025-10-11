# Projects Module - Step-by-Step Deployment Guide

Follow these steps **in order** to successfully deploy the Projects Module to your YES GODDESS backend.

## Prerequisites

- [x] PostgreSQL database running
- [x] Redis instance running
- [x] Node.js environment set up
- [x] All dependencies installed
- [x] Resend API key configured

---

## Step 1: Backup Database (IMPORTANT!)

```bash
# Create a backup before migration
pg_dump $DATABASE_URL > backup_before_projects_$(date +%Y%m%d_%H%M%S).sql

# Verify backup was created
ls -lh backup_before_projects_*.sql
```

**✅ Checkpoint:** Backup file exists and has content

---

## Step 2: Generate Prisma Client

```bash
# Update Prisma client with new models
npx prisma generate
```

**Expected output:**
```
✔ Generated Prisma Client (x.x.x) to ./node_modules/@prisma/client
```

**✅ Checkpoint:** No errors in output

---

## Step 3: Run Database Migration

### Option A: Using Prisma Migrate (Recommended)

```bash
npx prisma migrate dev --name add_projects_table
```

### Option B: Manual SQL Execution

```bash
psql $DATABASE_URL < prisma/migrations/004_projects_table.sql
```

**✅ Checkpoint:** No SQL errors

---

## Step 4: Verify Migration

```bash
./scripts/verify-projects-migration.sh
```

**Expected output:**
```
🔍 Verifying Projects Module Migration...

📊 Checking Database Tables...
✓ Projects table exists
✓ Events table exists

🔑 Checking Enums...
✓ ProjectStatus enum exists
✓ ProjectType enum exists

[... more checks ...]

Results: 15 passed, 0 failed
✓ All checks passed! Migration successful.
```

**✅ Checkpoint:** All checks passed

**If checks fail:**
1. Review error messages
2. Check database connection
3. Verify migration SQL was applied
4. Re-run migration if needed

---

## Step 5: Open Prisma Studio

```bash
npx prisma studio
```

**Verify:**
1. Navigate to `projects` table - should be empty but structure exists
2. Navigate to `events` table - should be empty but structure exists
3. Check that `ProjectStatus` and `ProjectType` enums are visible

**✅ Checkpoint:** Tables visible in Prisma Studio

---

## Step 6: Restart Development Server

```bash
# Stop current server (Ctrl+C)

# Restart
npm run dev
```

**✅ Checkpoint:** Server starts without errors

---

## Step 7: Register Projects Router

**File:** `src/app/api/trpc/[trpc]/route.ts` (or your tRPC router file)

**Add:**
```typescript
import { projectsRouter } from '@/modules/projects';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  brands: brandsRouter,
  creators: creatorsRouter,
  projects: projectsRouter, // ← ADD THIS LINE
});

export type AppRouter = typeof appRouter;
```

**✅ Checkpoint:** No TypeScript errors, server restarts successfully

---

## Step 8: Update Authentication Context

**File:** `src/modules/projects/routers/projects.router.ts`

**Find and replace all instances:**

```typescript
// BEFORE (lines ~109, 136, 156, 189, 213, 234, 254, 283)
const userId = 'temp-user-id'; // ctx.user.id
const userRole = 'ADMIN'; // ctx.user.role

// AFTER (when Auth.js is configured)
const userId = ctx.session.user.id;
const userRole = ctx.session.user.role;
```

**Note:** If authentication is not yet implemented, leave as-is for now and update later.

**✅ Checkpoint:** File saves without errors

---

## Step 9: Test API Endpoints

### 9.1 Test Create Project

Open your API client (Postman, Insomnia, or tRPC client):

```typescript
// Create a test project
const project = await trpc.projects.create.mutate({
  name: "Test Campaign",
  description: "Testing the projects module",
  budgetCents: 100000, // $1,000
  projectType: "CAMPAIGN",
  objectives: ["Test objective 1"],
});

console.log('Created project:', project);
```

**Expected:** Project created successfully, ID returned

**✅ Checkpoint:** Project created

---

### 9.2 Test List Projects

```typescript
const { data } = await trpc.projects.list.useQuery({
  page: 1,
  limit: 20,
});

console.log('Projects:', data);
```

**Expected:** List of projects returned (including test project)

**✅ Checkpoint:** List works

---

### 9.3 Test Update Project

```typescript
const updated = await trpc.projects.update.mutate({
  id: '<project-id-from-create>',
  status: 'ACTIVE',
});

console.log('Updated project:', updated);
```

**Expected:** Project status updated to ACTIVE

**✅ Checkpoint:** Update works

---

### 9.4 Test Delete Project

```typescript
await trpc.projects.delete.mutate({
  id: '<project-id-from-create>',
});
```

**Expected:** Project soft-deleted successfully

**✅ Checkpoint:** Delete works

---

## Step 10: Verify Database Data

```bash
# Open Prisma Studio
npx prisma studio
```

**Verify:**
1. Test project appears in `projects` table
2. `deletedAt` is set (soft delete)
3. Events appear in `events` table for create/update/delete actions

**✅ Checkpoint:** Data in database matches API operations

---

## Step 11: Set Up Background Jobs

### 11.1 Install BullMQ (if not already installed)

```bash
npm install bullmq
```

### 11.2 Create Job Queue

**File:** `src/lib/queue/index.ts` (create if doesn't exist)

```typescript
import { Queue, Worker } from 'bullmq';
import { projectMatchCreatorsJob } from '@/jobs/project-match-creators.job';
import { projectExpiryCheckJob } from '@/jobs/project-expiry-check.job';

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Create queue
export const projectQueue = new Queue('projects', { connection: redisConnection });

// Create workers
const projectWorker = new Worker(
  'projects',
  async (job) => {
    switch (job.name) {
      case 'project-match-creators':
        await projectMatchCreatorsJob(job.data);
        break;
    }
  },
  { connection: redisConnection }
);

// Schedule daily job
import cron from 'node-cron';
cron.schedule('0 2 * * *', async () => {
  await projectExpiryCheckJob();
});
```

**✅ Checkpoint:** Jobs queue created

---

### 11.3 Trigger Job on Status Change

**File:** `src/modules/projects/services/project.service.ts`

Find the `updateProject` method, after the status change to ACTIVE, add:

```typescript
// After line ~195 (where status change is detected)
if (data.status === 'ACTIVE' && project.status !== 'ACTIVE') {
  // Trigger creator matching job
  await projectQueue.add('project-match-creators', { projectId: updated.id });
}
```

**✅ Checkpoint:** Job triggering code added

---

## Step 12: Test Background Jobs

### 12.1 Test Creator Matching

```typescript
// Update a project to ACTIVE status
await trpc.projects.update.mutate({
  id: '<project-id>',
  status: 'ACTIVE',
});

// Check job queue
// Should see job in BullMQ dashboard or logs
```

**Expected:** Job triggered, creators matched (if any exist)

**✅ Checkpoint:** Creator matching job runs

---

### 12.2 Test Expiry Check

```bash
# Run manually to test
node -e "require('./src/jobs/project-expiry-check.job').projectExpiryCheckJob()"
```

**Expected:** Job runs, checks for expired projects

**✅ Checkpoint:** Expiry check job runs

---

## Step 13: Test Email Templates

### 13.1 Preview Templates

```bash
# If you have React Email installed
npx email dev
```

Navigate to:
- `ProjectMatchNotification` template
- `ProjectExpired` template

**Verify:** Templates render correctly, follow brand guidelines

**✅ Checkpoint:** Templates look correct

---

### 13.2 Test Email Sending (Optional)

Update job files to use a test email address and trigger manually:

```typescript
// In project-match-creators.job.ts, temporarily change:
await emailService.sendTransactional({
  email: 'your-test@email.com', // ← Your email
  // ... rest of config
});
```

**✅ Checkpoint:** Test email received

---

## Step 14: Monitor & Verify

### 14.1 Check Logs

```bash
# Watch application logs
tail -f logs/application.log

# Or console output
# Look for:
# - [ProjectService] entries
# - [EventService] entries
# - [Job] entries
```

**✅ Checkpoint:** No errors in logs

---

### 14.2 Check Redis Cache

```bash
redis-cli

# Check for project cache keys
KEYS project:*
KEYS projects:brand:*

# Check cache values
GET project:<some-id>
```

**✅ Checkpoint:** Cache keys exist and contain data

---

### 14.3 Check Analytics Events

```sql
-- In psql or Prisma Studio
SELECT * FROM events WHERE "eventType" LIKE 'project%' ORDER BY "createdAt" DESC LIMIT 10;
```

**Expected:** Events for project.created, project.updated, etc.

**✅ Checkpoint:** Events tracked correctly

---

## Step 15: Performance Check

### 15.1 Test with Multiple Projects

```typescript
// Create 10 test projects
for (let i = 0; i < 10; i++) {
  await trpc.projects.create.mutate({
    name: `Test Project ${i}`,
    budgetCents: 100000 * (i + 1),
    projectType: 'CAMPAIGN',
  });
}
```

### 15.2 Test List Performance

```typescript
// Test pagination
const page1 = await trpc.projects.list.useQuery({ page: 1, limit: 5 });
const page2 = await trpc.projects.list.useQuery({ page: 2, limit: 5 });

console.log('Page 1:', page1.data.data.length, 'projects');
console.log('Page 2:', page2.data.data.length, 'projects');
```

**✅ Checkpoint:** Pagination works correctly

---

### 15.3 Test Cache Hit Rate

```bash
redis-cli

# Check cache stats
INFO stats

# Look for keyspace_hits and keyspace_misses
# Calculate hit rate = hits / (hits + misses)
```

**Target:** > 80% hit rate after a few queries

**✅ Checkpoint:** Acceptable cache performance

---

## Step 16: Clean Up Test Data

```typescript
// Delete test projects
const testProjects = await prisma.project.findMany({
  where: { name: { startsWith: 'Test' } }
});

for (const project of testProjects) {
  await trpc.projects.delete.mutate({ id: project.id });
}
```

**✅ Checkpoint:** Test data cleaned up

---

## Step 17: Documentation

### 17.1 Update Project README

Add to main project README:

```markdown
## Projects Module

Manage creative campaigns and licensing opportunities.

- [Documentation](./src/modules/projects/README.md)
- [Quick Reference](./docs/PROJECTS_QUICK_REFERENCE.md)
- [API Endpoints](#projects-api)
```

**✅ Checkpoint:** Documentation linked

---

### 17.2 Update API Documentation

If you have API docs (Swagger, etc.), add projects endpoints.

**✅ Checkpoint:** API docs updated

---

## Step 18: Production Preparation

### 18.1 Environment Variables

Verify these are set in production:

```bash
DATABASE_URL_POOLED=postgresql://...
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
RESEND_API_KEY=re_...
NEXT_PUBLIC_APP_URL=https://app.yesgoddess.com
ADMIN_EMAIL=admin@yesgoddess.com
```

**✅ Checkpoint:** All env vars set

---

### 18.2 Run Production Build

```bash
npm run build
```

**Expected:** Build succeeds without errors

**✅ Checkpoint:** Production build works

---

## Step 19: Production Deployment

### 19.1 Deploy to Staging

1. Push code to staging branch
2. Run migration in staging database
3. Run verification script
4. Test all endpoints in staging
5. Monitor for 24 hours

**✅ Checkpoint:** Staging deployment successful

---

### 19.2 Deploy to Production

1. Create production backup
2. Deploy code
3. Run migration
4. Run verification script
5. Monitor closely

**✅ Checkpoint:** Production deployment successful

---

## Step 20: Post-Deployment Monitoring

### Monitor for 48 hours:

- [ ] API response times
- [ ] Error rates
- [ ] Database query performance
- [ ] Redis hit rates
- [ ] Background job execution
- [ ] Email delivery rates

**✅ Checkpoint:** All metrics healthy

---

## 🎉 Deployment Complete!

### Verification Checklist

- [x] Database migration successful
- [x] API endpoints working
- [x] Background jobs running
- [x] Email templates rendering
- [x] Cache functioning
- [x] Events tracking
- [x] No errors in logs
- [x] Production build succeeds
- [x] Documentation updated

### Success Criteria

✅ Projects can be created  
✅ Projects can be listed and filtered  
✅ Projects can be updated  
✅ Projects can be deleted  
✅ Background jobs execute  
✅ Emails send correctly  
✅ Cache improves performance  
✅ Analytics events tracked  

---

## 🆘 Troubleshooting

### Issue: Migration Fails

**Solution:**
```bash
# Check database connection
psql $DATABASE_URL -c "SELECT version();"

# Review migration file
cat prisma/migrations/004_projects_table.sql

# Run manually line by line to identify issue
```

### Issue: TypeScript Errors

**Solution:**
```bash
# Regenerate Prisma client
npx prisma generate

# Clear TypeScript cache
rm -rf node_modules/.cache
rm -rf .next

# Restart TS server in VS Code
# Cmd+Shift+P → "TypeScript: Restart TS Server"
```

### Issue: Cache Not Working

**Solution:**
```bash
# Test Redis connection
redis-cli ping  # Should return PONG

# Check Redis URL
echo $REDIS_URL

# Verify CacheService
node -e "require('./src/lib/redis/cache.service').cacheService.get('test')"
```

### Issue: Jobs Not Running

**Solution:**
```bash
# Check BullMQ queue
redis-cli KEYS bull:*

# Check worker is running
ps aux | grep worker

# Review job logs
```

---

## 📞 Support

If you encounter issues not covered here:

1. Review error messages carefully
2. Check the [Implementation Summary](./docs/PROJECTS_IMPLEMENTATION_SUMMARY.md)
3. Consult the [Module README](./src/modules/projects/README.md)
4. Review similar modules (brands, creators)

---

**Deployment Guide Version:** 1.0  
**Last Updated:** October 10, 2025  
**Estimated Time:** 2-4 hours (development) + testing time

**Good luck! 🚀**
