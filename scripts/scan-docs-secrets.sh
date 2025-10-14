#!/bin/bash

# Secret Scanner for Documentation
# Run this before committing docs to check for exposed secrets

echo "🔍 Scanning for secrets in documentation files..."
echo ""

FOUND_ISSUES=0

# Define patterns to search for
declare -a PATTERNS=(
    "re_[A-Za-z0-9]{30,}:Resend API Key"
    "whsec_[A-Za-z0-9]{30,}:Webhook Secret"
    "sk_[A-Za-z0-9]{30,}:Secret Key"
    "pk_live_[A-Za-z0-9]+:Live Public Key"
    "clerk_[A-Za-z0-9]{30,}:Clerk Key"
    "eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+:JWT Token"
    "postgresql://[^:]+:[^@]+@[a-z0-9-]+\.supabase\.co:Supabase Connection String"
    "postgres://[^:]+:[^@]+@[a-z0-9-]+\.:Database Connection String"
)

# Check if docs directory exists
if [ ! -d "docs" ]; then
    echo "❌ docs directory not found"
    exit 1
fi

# Scan each pattern
for pattern_entry in "${PATTERNS[@]}"; do
    IFS=':' read -r pattern name <<< "$pattern_entry"
    
    echo "Checking for: $name"
    
    # Search for the pattern in docs, excluding the summary file
    matches=$(grep -rn -E "$pattern" docs/ --exclude="SECRETS_CLEANUP_SUMMARY.md" 2>/dev/null || true)
    
    if [ -n "$matches" ]; then
        echo "  ⚠️  FOUND: $name"
        echo "$matches" | while read -r line; do
            echo "      $line"
        done
        echo ""
        FOUND_ISSUES=$((FOUND_ISSUES + 1))
    fi
done

# Additional checks for specific project IDs (add your own if needed)
echo "Checking for specific project identifiers..."

# Check for common project ID patterns that might be sensitive (excluding summary)
if grep -rn "ivndiftujdjwyqaidiea" docs/ --exclude="SECRETS_CLEANUP_SUMMARY.md" 2>/dev/null; then
    echo "  ⚠️  FOUND: Supabase Project ID"
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
fi

# Summary
echo ""
echo "═══════════════════════════════════════"
if [ $FOUND_ISSUES -eq 0 ]; then
    echo "✅ No secrets found in documentation!"
    echo "═══════════════════════════════════════"
    exit 0
else
    echo "❌ Found $FOUND_ISSUES potential secret(s)!"
    echo "═══════════════════════════════════════"
    echo ""
    echo "Please replace real values with placeholders:"
    echo "  - API Keys: re_xxxxxxxxxxxxx"
    echo "  - Secrets: whsec_xxxxxxxxxxxxx"
    echo "  - Project IDs: [YOUR-PROJECT-REF]"
    echo "  - Passwords: [YOUR-PASSWORD]"
    echo ""
    exit 1
fi
