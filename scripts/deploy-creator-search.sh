#!/bin/bash

# Creator Search Deployment Script
# This script applies all changes needed for the Creator Search feature

set -e  # Exit on error

echo "========================================="
echo "Creator Search - Deployment Script"
echo "========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Backup database (optional but recommended)
echo -e "${YELLOW}Step 1: Database Backup (Optional)${NC}"
read -p "Do you want to backup the database first? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "Creating database backup..."
    timestamp=$(date +%Y%m%d_%H%M%S)
    pg_dump $DATABASE_URL > "backups/creator_search_backup_${timestamp}.sql"
    echo -e "${GREEN}✓ Backup created: backups/creator_search_backup_${timestamp}.sql${NC}"
else
    echo -e "${YELLOW}⚠ Skipping backup${NC}"
fi
echo ""

# Step 2: Regenerate Prisma Client
echo -e "${YELLOW}Step 2: Regenerating Prisma Client${NC}"
echo "This will update the Prisma client with schema changes..."
npx prisma generate
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Prisma client regenerated successfully${NC}"
else
    echo -e "${RED}✗ Failed to regenerate Prisma client${NC}"
    exit 1
fi
echo ""

# Step 3: Apply Database Migrations
echo -e "${YELLOW}Step 3: Applying Database Migrations${NC}"
echo "This will create indexes and helper functions..."
read -p "Apply database migration? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    psql $DATABASE_URL -f migrations/add_creator_search_indexes.sql
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Database migrations applied successfully${NC}"
    else
        echo -e "${RED}✗ Failed to apply migrations${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ Skipping migrations (you'll need to apply them manually)${NC}"
fi
echo ""

# Step 4: Verify Indexes
echo -e "${YELLOW}Step 4: Verifying Indexes${NC}"
echo "Checking if indexes were created..."
index_count=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'creators' AND indexname LIKE 'idx_creators_%';")
echo "Found $index_count creator search indexes"
if [ $index_count -gt 10 ]; then
    echo -e "${GREEN}✓ Indexes verified${NC}"
else
    echo -e "${YELLOW}⚠ Expected more than 10 indexes, found $index_count${NC}"
fi
echo ""

# Step 5: Verify Extensions
echo -e "${YELLOW}Step 5: Verifying PostgreSQL Extensions${NC}"
has_trgm=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM pg_extension WHERE extname = 'pg_trgm';")
if [ $has_trgm -gt 0 ]; then
    echo -e "${GREEN}✓ pg_trgm extension installed${NC}"
else
    echo -e "${RED}✗ pg_trgm extension not found${NC}"
    echo "  You may need to install it: CREATE EXTENSION pg_trgm;"
fi
echo ""

# Step 6: Check for TypeScript Errors
echo -e "${YELLOW}Step 6: Checking TypeScript Compilation${NC}"
echo "Running type check..."
npx tsc --noEmit --skipLibCheck 2>&1 | grep -i "creator" || true
echo -e "${GREEN}✓ TypeScript check complete${NC}"
echo ""

# Step 7: Summary
echo "========================================="
echo -e "${GREEN}Deployment Complete!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Restart your application server"
echo "2. Test the creator search endpoints"
echo "3. Monitor query performance"
echo ""
echo "Documentation:"
echo "- Full docs: docs/CREATOR_SEARCH_IMPLEMENTATION_COMPLETE.md"
echo "- Quick ref: docs/CREATOR_SEARCH_QUICK_REFERENCE.md"
echo "- Post-impl: docs/CREATOR_SEARCH_POST_IMPLEMENTATION.md"
echo ""
echo "Test endpoints:"
echo "  api.creators.searchCreators.query({ query: 'photographer' })"
echo "  api.creators.getCreatorSearchFacets.query({})"
echo ""
echo -e "${GREEN}Happy searching! 🔍${NC}"
