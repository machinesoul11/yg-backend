# Prisma Migration Best Practices

## Overview
This document outlines best practices to prevent migration and Prisma-related issues in the YesGoddess backend project.

## ✅ What Was Fixed (October 19, 2025)

### Issues Resolved
1. **Corrupted root.ts file** - Import statements were mangled with comments and BullMQ queue code
2. **Resource fork files** - macOS generated `._` files in migrations directory
3. **Loose SQL migration files** - 17+ loose `.sql` files not in Prisma migration format
4. **Missing .env file** - Prisma requires `.env`, only `.env.local` existed
5. **Duplicate/inconsistent migration naming** - Mixed naming conventions
6. **Out-of-sync migration state** - Database had tables but Prisma didn't know about them

### Actions Taken
- Fixed `/src/lib/api/root.ts` by cleaning up imports and removing queue code
- Removed resource fork files (`._*`)
- Moved loose SQL files to `/prisma/_archive_loose_migrations/`
- Created clean `.env` file from `.env.local`
- Renamed migrations to follow timestamp format: `YYYYMMDDHHMMSS_description`
- Baselined all existing migrations with `prisma migrate resolve --applied`
- Validated schema and regenerated Prisma client

## 📋 Migration Best Practices

### 1. Always Use Prisma Migrate Commands

**✅ DO:**
```bash
# Create a new migration
npx prisma migrate dev --name descriptive_migration_name

# Apply migrations in production
npx prisma migrate deploy

# Check migration status
npx prisma migrate status

# Generate Prisma client after schema changes
npx prisma generate
```

**❌ DON'T:**
- Manually create SQL files in the migrations directory
- Run raw SQL migrations outside of Prisma
- Edit migration files after they've been applied
- Create migrations with non-timestamp names

### 2. Migration Naming Convention

**Always let Prisma generate the timestamp:**
```bash
npx prisma migrate dev --name add_user_preferences
# Creates: 20251019143022_add_user_preferences/
```

**Format:** `YYYYMMDDHHMMSS_description`
- ✅ `20251019000000_add_two_factor_authentication`
- ❌ `001_users_authentication.sql`
- ❌ `add_users_table.sql`
- ❌ `migration_v2.sql`

### 3. Migration Directory Structure

**Correct structure:**
```
prisma/
├── schema.prisma
├── migrations/
│   ├── 20241012000001_add_license_usage_tracking/
│   │   └── migration.sql
│   ├── 20251010000000_add_audit_entity_fields/
│   │   └── migration.sql
│   └── 20251019000001_add_multistep_login/
│       └── migration.sql
└── _archive_loose_migrations/  # For archived legacy migrations
```

**❌ Avoid:**
- Loose `.sql` files in migrations directory
- Folders without timestamps
- Files named `rollback`, `indexes`, `test-functions`

### 4. Environment File Management

**Required files:**
- `.env` - Used by Prisma CLI (checked into git with placeholder values)
- `.env.local` - Local development (gitignored, real values)
- `.env.production` - Production values (never commit)

**Prisma requires these variables:**
```bash
DATABASE_URL="postgresql://..."           # For migrations
DATABASE_URL_POOLED="postgresql://..."    # For app queries (optional)
```

### 5. Handling Existing Databases

When connecting Prisma to an existing database:

```bash
# 1. Pull the schema from database
npx prisma db pull

# 2. Create initial migration without applying
npx prisma migrate dev --name init --create-only

# 3. Mark as applied (baseline)
npx prisma migrate resolve --applied init

# 4. Verify status
npx prisma migrate status
```

### 6. Making Schema Changes

**Workflow:**
```bash
# 1. Edit prisma/schema.prisma
# 2. Create migration
npx prisma migrate dev --name your_change_description

# 3. Verify migration was created
ls -la prisma/migrations/

# 4. Test the migration
npx prisma migrate status

# 5. Regenerate client
npx prisma generate

# 6. Commit migration files
git add prisma/migrations/
git commit -m "Add migration: your_change_description"
```

### 7. Preventing Resource Fork Files (macOS)

Resource fork files (`._filename`) are created by macOS on external drives or network shares.

**Prevention script (already implemented):**
```bash
# Run this regularly on macOS
node scripts/cleanup-resource-forks.js --clean-only
```

**Or add to .gitignore:**
```
._*
.DS_Store
```

**Automated cleanup with git hook:**
```bash
# .git/hooks/pre-commit
#!/bin/bash
find . -name "._*" -type f -delete
```

### 8. Migration Rollback Strategy

**If a migration fails:**

```bash
# 1. Check status
npx prisma migrate status

# 2. Mark failed migration as rolled back
npx prisma migrate resolve --rolled-back MIGRATION_NAME

# 3. Fix the issue in schema.prisma

# 4. Create new migration
npx prisma migrate dev --name fix_previous_migration
```

### 9. Team Collaboration Guidelines

**Before pulling code:**
```bash
git pull
npx prisma migrate dev  # Applies new migrations
npx prisma generate     # Updates client
```

**Before pushing migrations:**
```bash
# Ensure migrations work
npx prisma migrate status
npx prisma validate
npm run build  # or your build command

git add prisma/migrations/
git commit -m "Add migration: descriptive_name"
git push
```

**Communication:**
- Always announce database schema changes to the team
- Include migration details in PR descriptions
- Test migrations on staging before production

### 10. Production Deployment Checklist

```bash
# 1. Backup database
# Do this before running migrations!

# 2. Apply migrations
npx prisma migrate deploy

# 3. Generate client
npx prisma generate

# 4. Restart application
# Your deployment process

# 5. Verify
npx prisma migrate status
```

### 11. Common Issues and Solutions

#### Issue: "Migration already applied"
```bash
# Solution: Mark as applied
npx prisma migrate resolve --applied MIGRATION_NAME
```

#### Issue: "Migration failed"
```bash
# Solution: Mark as rolled back and fix
npx prisma migrate resolve --rolled-back MIGRATION_NAME
# Fix schema, then create new migration
```

#### Issue: "Out of sync"
```bash
# Solution: Check what's different
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma
```

#### Issue: Resource fork files in migrations
```bash
# Solution: Clean and prevent
find prisma/migrations -name "._*" -delete
echo "._*" >> .gitignore
```

#### Issue: "Environment variable not found"
```bash
# Solution: Ensure .env exists with required variables
cp .env.local .env
# Or check that DATABASE_URL is set
```

### 12. Code Quality Checks

**Before committing:**
```bash
# Validate schema
npx prisma validate

# Format schema
npx prisma format

# Check for errors
npm run type-check  # or tsc --noEmit

# Run tests
npm test
```

### 13. Monitoring Migration Health

**Regular checks:**
```bash
# Weekly or before major deployments
npx prisma migrate status
npx prisma validate
```

**Keep track of:**
- Number of pending migrations
- Migration file sizes (large ones need review)
- Failed migrations in logs
- Database schema drift

## 🚨 Warning Signs

Watch for these issues:
- ❌ Loose `.sql` files in migrations directory
- ❌ Migrations without timestamps
- ❌ `._` files appearing in migrations
- ❌ Merge conflicts in `schema.prisma`
- ❌ Different migration states between environments
- ❌ Manual database changes not reflected in schema
- ❌ Import errors in TypeScript after schema changes

## 📚 Additional Resources

- [Prisma Migrate Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [Troubleshooting Migrations](https://www.prisma.io/docs/guides/database/troubleshooting-orm)

## 🔄 Regular Maintenance Tasks

**Daily (during active development):**
- Pull latest migrations: `git pull && npx prisma migrate dev`
- Generate client after pulling: `npx prisma generate`

**Weekly:**
- Check migration status: `npx prisma migrate status`
- Clean resource forks: `node scripts/cleanup-resource-forks.js --clean-only`
- Validate schema: `npx prisma validate`

**Before deployment:**
- Backup database
- Test migrations on staging
- Review all pending migrations
- Ensure team is notified

## ✅ Current State (Post-Cleanup)

```
✓ All migrations properly named with timestamps
✓ Migration state synced with database
✓ .env file created
✓ Prisma client generated
✓ Schema validated
✓ No TypeScript errors
✓ Resource fork files removed
✓ Legacy migrations archived
```

**Last Updated:** October 19, 2025
**Status:** All Prisma and migration issues resolved ✅
