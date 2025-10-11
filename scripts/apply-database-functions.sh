#!/bin/bash

# ============================================================================
# Database Functions Migration Application Script
# ============================================================================
# This script applies database functions and search index migrations
# Usage: ./apply-database-functions.sh [--rollback]
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

print_success() {
    echo -e "${GREEN}✓ ${NC}$1"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${NC}$1"
}

print_error() {
    echo -e "${RED}✗ ${NC}$1"
}

print_header() {
    echo ""
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================================${NC}"
}

# Check if rollback flag is set
ROLLBACK=false
if [[ "$1" == "--rollback" ]]; then
    ROLLBACK=true
    print_warning "Rollback mode enabled"
fi

# Check for DATABASE_URL
if [[ -z "${DATABASE_URL}" ]]; then
    print_error "DATABASE_URL environment variable is not set"
    echo "Please set it in your .env file or export it:"
    echo "  export DATABASE_URL='postgresql://user:password@host:5432/database'"
    exit 1
fi

print_success "Database URL found"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    print_error "psql command not found"
    echo "Please install PostgreSQL client tools"
    exit 1
fi

print_success "psql command found"

# Test database connection
print_info "Testing database connection..."
if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
    print_success "Database connection successful"
else
    print_error "Failed to connect to database"
    exit 1
fi

# Get current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MIGRATIONS_DIR="$SCRIPT_DIR/../prisma/migrations"
ROLLBACKS_DIR="$MIGRATIONS_DIR/rollbacks"

if [[ "$ROLLBACK" == true ]]; then
    # ========================================================================
    # ROLLBACK MODE
    # ========================================================================
    
    print_header "ROLLING BACK DATABASE FUNCTIONS"
    
    print_warning "This will remove all database functions and search indexes"
    read -p "Are you sure you want to continue? (yes/no): " confirm
    
    if [[ "$confirm" != "yes" ]]; then
        print_info "Rollback cancelled"
        exit 0
    fi
    
    # Rollback search indexes (008)
    print_info "Rolling back search indexes (008)..."
    if psql "$DATABASE_URL" -f "$ROLLBACKS_DIR/008_rollback_search_indexes.sql"; then
        print_success "Search indexes rollback complete"
    else
        print_error "Failed to rollback search indexes"
        exit 1
    fi
    
    # Rollback database functions (007)
    print_info "Rolling back database functions (007)..."
    if psql "$DATABASE_URL" -f "$ROLLBACKS_DIR/007_rollback_database_functions.sql"; then
        print_success "Database functions rollback complete"
    else
        print_error "Failed to rollback database functions"
        exit 1
    fi
    
    print_header "ROLLBACK COMPLETE"
    print_success "All database functions and indexes have been removed"
    
else
    # ========================================================================
    # APPLY MODE
    # ========================================================================
    
    print_header "APPLYING DATABASE FUNCTIONS"
    
    # Check if migrations exist
    if [[ ! -f "$MIGRATIONS_DIR/007_add_database_functions.sql" ]]; then
        print_error "Migration file not found: 007_add_database_functions.sql"
        exit 1
    fi
    
    if [[ ! -f "$MIGRATIONS_DIR/008_add_search_indexes.sql" ]]; then
        print_error "Migration file not found: 008_add_search_indexes.sql"
        exit 1
    fi
    
    print_success "Migration files found"
    
    # Apply database functions migration (007)
    print_info "Applying database functions (007)..."
    if psql "$DATABASE_URL" -f "$MIGRATIONS_DIR/007_add_database_functions.sql"; then
        print_success "Database functions migration applied"
    else
        print_error "Failed to apply database functions migration"
        exit 1
    fi
    
    # Apply search indexes migration (008)
    print_info "Applying search indexes (008)..."
    print_warning "This may take several minutes on large databases..."
    if psql "$DATABASE_URL" -f "$MIGRATIONS_DIR/008_add_search_indexes.sql"; then
        print_success "Search indexes migration applied"
    else
        print_error "Failed to apply search indexes migration"
        print_warning "You may need to rollback with: $0 --rollback"
        exit 1
    fi
    
    # ========================================================================
    # VERIFICATION
    # ========================================================================
    
    print_header "VERIFYING MIGRATIONS"
    
    # Check functions
    print_info "Checking database functions..."
    FUNCTION_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_proc p LEFT JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname LIKE 'calculate_%'")
    FUNCTION_COUNT=$(echo "$FUNCTION_COUNT" | tr -d '[:space:]')
    
    if [[ "$FUNCTION_COUNT" -ge 3 ]]; then
        print_success "Found $FUNCTION_COUNT calculation functions"
    else
        print_warning "Expected at least 3 calculation functions, found $FUNCTION_COUNT"
    fi
    
    # Check triggers
    print_info "Checking triggers..."
    TRIGGER_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE 'trg_%'")
    TRIGGER_COUNT=$(echo "$TRIGGER_COUNT" | tr -d '[:space:]')
    
    if [[ "$TRIGGER_COUNT" -ge 10 ]]; then
        print_success "Found $TRIGGER_COUNT triggers"
    else
        print_warning "Expected at least 10 triggers, found $TRIGGER_COUNT"
    fi
    
    # Check extensions
    print_info "Checking PostgreSQL extensions..."
    if psql "$DATABASE_URL" -t -c "SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'" | grep -q 1; then
        print_success "pg_trgm extension installed"
    else
        print_warning "pg_trgm extension not found (fuzzy search may not work)"
    fi
    
    # Check indexes
    print_info "Checking full-text search indexes..."
    INDEX_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE '%fulltext%'")
    INDEX_COUNT=$(echo "$INDEX_COUNT" | tr -d '[:space:]')
    
    if [[ "$INDEX_COUNT" -ge 4 ]]; then
        print_success "Found $INDEX_COUNT full-text search indexes"
    else
        print_warning "Expected at least 4 full-text indexes, found $INDEX_COUNT"
    fi
    
    print_header "MIGRATION COMPLETE"
    print_success "All database functions and indexes have been applied successfully"
    
    echo ""
    print_info "Next steps:"
    echo "  1. Test engagement score calculation"
    echo "  2. Test royalty calculations"
    echo "  3. Test full-text search functions"
    echo "  4. Review documentation: docs/infrastructure/database/functions-and-search.md"
    echo ""
    print_info "To rollback: $0 --rollback"
fi

echo ""
