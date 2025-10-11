#!/bin/bash
# Script to apply IP ownership database constraints
# This adds the critical 10,000 BPS sum validation

set -e

echo "🔧 Applying IP Ownership database constraints..."

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Execute the SQL file
psql "$DATABASE_URL" -f prisma/migrations/add_ownership_constraint.sql

echo "✅ IP Ownership constraints applied successfully!"
