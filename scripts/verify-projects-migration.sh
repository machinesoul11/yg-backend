#!/bin/bash

# Projects Module - Migration Verification Script
# Run this after applying the database migration to verify everything is set up correctly

echo "🔍 Verifying Projects Module Migration..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter for checks
PASSED=0
FAILED=0

# Function to run SQL query and check result
check_sql() {
    local description=$1
    local query=$2
    local expected=$3
    
    result=$(psql $DATABASE_URL -t -c "$query" 2>&1)
    
    if [[ $result == *"$expected"* ]]; then
        echo -e "${GREEN}✓${NC} $description"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $description"
        echo "  Expected: $expected"
        echo "  Got: $result"
        ((FAILED++))
    fi
}

echo "📊 Checking Database Tables..."
echo ""

# Check if projects table exists
check_sql "Projects table exists" \
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects');" \
    "t"

# Check if events table exists
check_sql "Events table exists" \
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events');" \
    "t"

echo ""
echo "🔑 Checking Enums..."
echo ""

# Check ProjectStatus enum
check_sql "ProjectStatus enum exists" \
    "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectStatus');" \
    "t"

# Check ProjectType enum
check_sql "ProjectType enum exists" \
    "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectType');" \
    "t"

echo ""
echo "📇 Checking Indexes..."
echo ""

# Check key indexes
check_sql "projects_brandId_status_idx exists" \
    "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'projects' AND indexname = 'projects_brandId_status_idx');" \
    "t"

check_sql "projects_createdAt_idx exists" \
    "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'projects' AND indexname = 'projects_createdAt_idx');" \
    "t"

check_sql "projects_deletedAt_idx exists" \
    "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'projects' AND indexname = 'projects_deletedAt_idx');" \
    "t"

check_sql "events_eventType_createdAt_idx exists" \
    "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'events' AND indexname = 'events_eventType_createdAt_idx');" \
    "t"

echo ""
echo "🔗 Checking Foreign Keys..."
echo ""

# Check foreign key constraints
check_sql "projects_brandId_fkey exists" \
    "SELECT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'projects_brandId_fkey');" \
    "t"

check_sql "projects_createdBy_fkey exists" \
    "SELECT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'projects_createdBy_fkey');" \
    "t"

check_sql "events_projectId_fkey exists" \
    "SELECT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'events_projectId_fkey');" \
    "t"

echo ""
echo "📋 Checking Table Columns..."
echo ""

# Check key columns in projects table
check_sql "projects.budgetCents column exists" \
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'budgetCents');" \
    "t"

check_sql "projects.objectives column exists (JSONB)" \
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'objectives' AND data_type = 'jsonb');" \
    "t"

check_sql "projects.requirements column exists (JSONB)" \
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'requirements' AND data_type = 'jsonb');" \
    "t"

check_sql "projects.metadata column exists (JSONB)" \
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'metadata' AND data_type = 'jsonb');" \
    "t"

check_sql "projects.deletedAt column exists" \
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'deletedAt');" \
    "t"

echo ""
echo "═══════════════════════════════════════"
echo ""
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Migration successful.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run: npx prisma generate"
    echo "2. Restart your development server"
    echo "3. Test the projects API endpoints"
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Please review the migration.${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "1. Verify the migration SQL file was applied correctly"
    echo "2. Check database connection string"
    echo "3. Review error messages above"
    exit 1
fi
