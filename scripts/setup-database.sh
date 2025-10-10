#!/bin/bash

# =================================================================
# YesGoddess Backend - Database Setup Script
# =================================================================
# This script initializes the database with required configuration
# =================================================================

set -e

echo "🚀 YesGoddess Database Setup"
echo "===================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${RED}✗ Error: .env.local file not found${NC}"
    echo "Please copy .env.example to .env.local and configure it:"
    echo "  cp .env.example .env.local"
    exit 1
fi

# Load environment variables
export $(grep -v '^#' .env.local | xargs)

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}✗ Error: DATABASE_URL is not set in .env.local${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Installing dependencies...${NC}"
npm install

echo ""
echo -e "${YELLOW}Step 2: Generating Prisma Client...${NC}"
npm run db:generate

echo ""
echo -e "${YELLOW}Step 3: Running database migrations...${NC}"
npm run db:migrate

echo ""
echo -e "${YELLOW}Step 4: Running database health check...${NC}"
npm run db:health

echo ""
echo -e "${YELLOW}Step 5: Verifying backup configuration...${NC}"
npm run db:backup:verify

echo ""
echo -e "${GREEN}✓ Database setup completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. Verify your Supabase backup settings at:"
echo "     https://app.supabase.com/project/_/settings/database"
echo ""
echo "  2. Set up monitoring alerts in Supabase dashboard"
echo ""
echo "  3. Configure read replica (if using Pro+ plan):"
echo "     Update DATABASE_REPLICA_URL in .env.local"
echo ""
echo "  4. Start the development server:"
echo "     npm run dev"
echo ""
