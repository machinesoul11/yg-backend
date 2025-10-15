#!/bin/bash

# Technical SEO Migration Script
# Applies database migrations for Technical SEO features

echo "🚀 Starting Technical SEO migration..."

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check if .env file exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo "❌ Error: .env file not found in project root"
    exit 1
fi

# Load environment variables
source "$PROJECT_ROOT/.env"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL not found in environment variables"
    exit 1
fi

echo "📋 Applying blog redirects table migration..."
psql "$DATABASE_URL" -f "$PROJECT_ROOT/migrations/add_blog_redirects_table.sql"

if [ $? -eq 0 ]; then
    echo "✅ Blog redirects table migration completed"
else
    echo "❌ Blog redirects table migration failed"
    exit 1
fi

echo "📋 Applying robots config table migration..."
psql "$DATABASE_URL" -f "$PROJECT_ROOT/migrations/add_robots_config_table.sql"

if [ $? -eq 0 ]; then
    echo "✅ Robots config table migration completed"
else
    echo "❌ Robots config table migration failed"
    exit 1
fi

echo "🔄 Generating Prisma client..."
cd "$PROJECT_ROOT"
npx prisma generate

if [ $? -eq 0 ]; then
    echo "✅ Prisma client generation completed"
else
    echo "❌ Prisma client generation failed"
    exit 1
fi

echo "🎉 Technical SEO migration completed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Restart your development server"
echo "2. Test the new SEO endpoints:"
echo "   - GET /api/blog/sitemap.xml"
echo "   - GET /api/robots.txt"
echo "3. Access admin SEO features:"
echo "   - POST /api/admin/seo (sitemap submission)"
echo "   - POST /api/admin/seo/cleanup-redirects"
echo ""
echo "📚 Documentation: docs/TECHNICAL_SEO_IMPLEMENTATION_COMPLETE.md"
