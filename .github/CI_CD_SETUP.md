# CI/CD Integration for Database Migrations

This guide explains how to set up and use the automated CI/CD workflows for database migrations in the YesGoddess backend.

---

## Overview

The project includes three GitHub Actions workflows for database operations:

1. **`database-test.yml`** - Tests migrations on pull requests
2. **`database-migration-staging.yml`** - Auto-deploys to staging on develop/staging branch
3. **`database-migration-production.yml`** - Controlled production deployments

---

## Workflow Files

### 1. Database Migration Tests (`database-test.yml`)

**Triggers:**
- Pull requests to `main` or `develop` branches
- Changes to `prisma/schema.prisma`, `prisma/migrations/**`, or `prisma/seed.ts`

**What It Does:**
- Spins up a PostgreSQL test database
- Applies all migrations from scratch
- Runs seed scripts
- Validates schema
- Checks for schema drift
- Tests rollback script syntax
- Comments results on PR

**Required Secrets:** None (uses ephemeral test database)

### 2. Staging Deployment (`database-migration-staging.yml`)

**Triggers:**
- Pushes to `develop` or `staging` branches
- Changes to Prisma files

**What It Does:**
- Checks migration status
- Applies pending migrations
- Verifies database health
- Runs seed data (on develop only)
- Sends Slack notifications

**Required Secrets:**
- `STAGING_DATABASE_URL` - Direct connection to staging database
- `SLACK_WEBHOOK_URL` - For notifications (optional)

### 3. Production Deployment (`database-migration-production.yml`)

**Triggers:**
- GitHub release published
- Manual workflow dispatch (requires "CONFIRM" input)

**What It Does:**
- Creates database backup via Supabase API
- Waits for backup completion
- Applies migrations with transaction safety
- Verifies database health
- Triggers Vercel deployment
- Sends detailed Slack notifications

**Required Secrets:**
- `PRODUCTION_DATABASE_URL` - Direct connection to production database
- `SUPABASE_PROJECT_ID` - For backup API calls
- `SUPABASE_SERVICE_KEY` - For admin operations
- `SLACK_WEBHOOK_URL` - For notifications (optional)

---

## Setup Instructions

### Step 1: Configure GitHub Environments

1. Go to your repository → Settings → Environments
2. Create three environments:
   - `staging`
   - `production`

3. For `production` environment:
   - Enable "Required reviewers"
   - Add approval requirements
   - Set deployment branch pattern to `main`

### Step 2: Add GitHub Secrets

#### Repository Secrets (Available to all workflows)

Go to Settings → Secrets and variables → Actions → New repository secret

Add the following:

```
Name: SLACK_WEBHOOK_URL
Value: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

#### Environment Secrets

**For `staging` environment:**
```
Name: STAGING_DATABASE_URL
Value: postgresql://user:password@staging-host:5432/database
```

**For `production` environment:**
```
Name: PRODUCTION_DATABASE_URL
Value: postgresql://user:password@production-host:5432/database

Name: SUPABASE_PROJECT_ID
Value: your-supabase-project-id

Name: SUPABASE_SERVICE_KEY
Value: your-supabase-service-role-key
```

### Step 3: Configure Slack Notifications (Optional)

1. Create a Slack App or use incoming webhooks
2. Generate a webhook URL
3. Add to GitHub secrets as `SLACK_WEBHOOK_URL`
4. Test with a dummy workflow run

**Notification Format:**
- ✅ Success: Green attachment with details
- ❌ Failure: Red attachment with alert
- 🚀 Deployment: Yellow attachment with progress

### Step 4: Test the Workflows

#### Test Migration Tests Workflow

1. Create a test branch
2. Make a change to `prisma/schema.prisma`
3. Open a PR to `develop`
4. Check Actions tab for workflow run
5. Verify PR comment with test results

#### Test Staging Deployment

1. Merge PR to `develop` branch
2. Check Actions tab for automatic deployment
3. Verify Slack notification (if configured)
4. Check staging database for applied migrations

#### Test Production Deployment (Dry Run)

1. Use workflow dispatch for testing:
   ```
   Actions → Database Migration - Production → Run workflow
   Branch: main
   Confirm: CONFIRM
   ```
2. Monitor the workflow execution
3. Verify backup creation
4. Check migration application

---

## Usage Guide

### Development Workflow

```mermaid
graph LR
    A[Make Schema Change] --> B[Create Migration]
    B --> C[Open PR]
    C --> D[Tests Run Automatically]
    D --> E{Tests Pass?}
    E -->|Yes| F[Merge to develop]
    E -->|No| G[Fix Issues]
    G --> C
    F --> H[Auto-Deploy to Staging]
```

**Steps:**

1. **Make schema changes** in `prisma/schema.prisma`
   ```bash
   # Edit schema file
   code prisma/schema.prisma
   ```

2. **Create migration locally**
   ```bash
   npm run db:migrate
   # Enter descriptive migration name
   ```

3. **Review generated migration**
   ```bash
   cat prisma/migrations/[timestamp]_[name]/migration.sql
   ```

4. **Commit and push**
   ```bash
   git add prisma/
   git commit -m "feat: add migration for [description]"
   git push origin feature-branch
   ```

5. **Open pull request**
   - Migration tests run automatically
   - Review test results in PR comments
   - Address any failures

6. **Merge to develop**
   - Staging deployment runs automatically
   - Verify in Slack or Actions tab

### Production Deployment Workflow

**Option 1: Release-based (Recommended)**

1. **Create a release**
   ```bash
   git checkout main
   git pull origin main
   git tag -a v1.2.3 -m "Release version 1.2.3"
   git push origin v1.2.3
   ```

2. **Create GitHub Release**
   - Go to Releases → Draft a new release
   - Select the tag you just created
   - Fill in release notes
   - Click "Publish release"

3. **Workflow triggers automatically**
   - Backup is created
   - Migrations are applied
   - Vercel deploys new version
   - Notifications sent

**Option 2: Manual Deployment**

1. **Trigger workflow manually**
   - Go to Actions → Database Migration - Production
   - Click "Run workflow"
   - Select `main` branch
   - Type "CONFIRM" in the input
   - Click "Run workflow"

2. **Approve deployment** (if required reviewers configured)
   - Designated approvers receive notification
   - Review migration details
   - Approve or reject

3. **Monitor execution**
   - Watch workflow progress in Actions tab
   - Check Slack for notifications
   - Verify database health after completion

---

## Monitoring & Alerts

### What Gets Monitored

**During Migration:**
- Migration status (pending, applying, complete)
- Database connection health
- Migration execution time
- SQL errors or warnings

**After Migration:**
- Database health check results
- Schema validation
- Application error rates
- Query performance

### Alert Channels

1. **GitHub Actions UI**
   - Workflow status (✓ or ✗)
   - Detailed logs for each step
   - Error messages and stack traces

2. **Slack Notifications** (if configured)
   - Success/failure messages
   - Deployment progress
   - Error details for failures

3. **PR Comments** (test workflow)
   - Automated test results
   - Pass/fail status
   - Link to full logs

---

## Rollback Procedures

### If Staging Migration Fails

1. **Review error logs**
   ```
   Actions → Failed workflow → View logs
   ```

2. **Fix locally**
   ```bash
   # Fix the issue in your migration
   npm run db:migrate
   ```

3. **Push fix**
   ```bash
   git add prisma/migrations
   git commit -m "fix: resolve migration issue"
   git push
   ```

4. **Re-run staging deployment** (automatic on push)

### If Production Migration Fails

1. **Don't panic** - Backup was created automatically

2. **Review error in Actions logs**
   - Identify the failing step
   - Note the error message

3. **Check Supabase backup**
   - Go to Supabase Dashboard → Database → Backups
   - Verify recent backup exists

4. **Decide on action:**

   **Option A: Fix and retry**
   ```bash
   # Fix the migration issue
   # Create new release with fix
   # Deploy again
   ```

   **Option B: Rollback**
   ```bash
   # Use rollback script
   psql $DATABASE_URL < prisma/migrations/rollbacks/[migration]_rollback.sql
   
   # Mark as rolled back
   npm run db:migrate:resolve -- --rolled-back [migration_name]
   ```

   **Option C: Restore from backup** (last resort)
   ```bash
   # Via Supabase Dashboard:
   # Database → Backups → Select backup → Restore
   ```

5. **Communicate to team**
   - Post in #engineering channel
   - Update status page if applicable
   - Document incident for postmortem

---

## Troubleshooting

### Workflow Not Triggering

**Problem:** Workflow doesn't run on push/PR

**Solutions:**
- Check workflow file is in `.github/workflows/` directory
- Verify file has `.yml` or `.yaml` extension
- Check branch protection rules
- Verify path filters match changed files
- Check Actions are enabled in repo settings

### Secrets Not Found

**Problem:** Workflow fails with "Secret not found" error

**Solutions:**
- Verify secret name matches exactly (case-sensitive)
- Check secret is in correct environment
- Ensure environment is specified in workflow
- Verify secret value is not empty

### Migration Timeout

**Problem:** Migration step times out

**Solutions:**
- Increase workflow timeout:
  ```yaml
  timeout-minutes: 30
  ```
- Run heavy migrations separately
- Use direct connection (not pooled)
- Check for long-running queries blocking migration

### Backup Creation Fails

**Problem:** Supabase backup API call fails

**Solutions:**
- Verify `SUPABASE_PROJECT_ID` is correct
- Check `SUPABASE_SERVICE_KEY` has admin permissions
- Ensure project is on a plan that supports API backups
- Check Supabase API status

---

## Best Practices

### ✅ DO:

1. **Always test in staging first**
   - Merge to develop before production
   - Verify migrations work in staging
   - Monitor application behavior

2. **Use descriptive migration names**
   ```bash
   # Good
   npm run db:migrate -- add_user_preferences_table
   
   # Bad
   npm run db:migrate -- update
   ```

3. **Review migration SQL**
   - Check generated SQL before committing
   - Add comments for complex migrations
   - Verify indexes are created

4. **Monitor after deployment**
   - Watch error rates for 15-30 minutes
   - Check query performance
   - Verify expected data changes

5. **Create rollback plans**
   - Document rollback procedure
   - Test rollback in staging
   - Keep rollback scripts updated

### ❌ DON'T:

1. **Don't skip staging**
   - Never deploy directly to production
   - Always test in staging first

2. **Don't ignore failed tests**
   - Fix test failures before merging
   - Don't disable tests to force merge

3. **Don't manually edit applied migrations**
   - Never change migration files after they're run
   - Create new migration instead

4. **Don't deploy during peak hours**
   - Schedule production migrations for low-traffic periods
   - Consider maintenance windows

5. **Don't forget to communicate**
   - Notify team of production deployments
   - Document changes in release notes

---

## Configuration Reference

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Direct database connection for migrations |
| `DATABASE_URL_POOLED` | No | Pooled connection for application |
| `SUPABASE_PROJECT_ID` | Production only | Supabase project identifier |
| `SUPABASE_SERVICE_KEY` | Production only | Service role key for admin operations |
| `SLACK_WEBHOOK_URL` | Optional | Slack webhook for notifications |

### Workflow Configuration

**Modify trigger conditions:**
```yaml
on:
  push:
    branches:
      - develop
      - staging
      # Add more branches as needed
```

**Change Node.js version:**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'  # Change to desired version
```

**Adjust timeout:**
```yaml
jobs:
  migrate-staging:
    timeout-minutes: 15  # Adjust as needed
```

---

## Support & Resources

### Documentation
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Prisma Migrate Docs](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Supabase API Docs](https://supabase.com/docs/reference/api)

### Internal Resources
- Migration README: `prisma/migrations/README.md`
- Rollback templates: `prisma/migrations/rollbacks/`
- Database docs: `docs/DATABASE_*.md`

### Getting Help
- Check #engineering-database Slack channel
- Review GitHub Actions logs
- Consult with DevOps team for infrastructure issues
- Reference this guide for common scenarios

---

**Last Updated:** October 10, 2025  
**Maintained By:** DevOps & Database Teams  
**Review Schedule:** Quarterly or after major changes
