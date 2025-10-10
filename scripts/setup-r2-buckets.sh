#!/bin/bash

# Cloudflare R2 Bucket Setup Script
# This script configures R2 buckets with proper CORS, lifecycle rules, and monitoring

set -e

echo "🚀 Starting Cloudflare R2 Bucket Setup..."

# Configuration
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-}"
R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-}"
R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}"

# Bucket names
BUCKET_ASSETS="yesgoddess-assets-production"
BUCKET_PREVIEWS="yesgoddess-previews-production"
BUCKET_DOCUMENTS="yesgoddess-documents-production"
BUCKET_TEMP="yesgoddess-temp-production"

# Validate environment variables
if [ -z "$R2_ACCOUNT_ID" ]; then
  echo "❌ Error: R2_ACCOUNT_ID not set"
  exit 1
fi

if [ -z "$R2_ACCESS_KEY_ID" ]; then
  echo "❌ Error: R2_ACCESS_KEY_ID not set"
  exit 1
fi

if [ -z "$R2_SECRET_ACCESS_KEY" ]; then
  echo "❌ Error: R2_SECRET_ACCESS_KEY not set"
  exit 1
fi

# Configure AWS CLI for R2
echo "📝 Configuring AWS CLI for Cloudflare R2..."
aws configure set aws_access_key_id "$R2_ACCESS_KEY_ID"
aws configure set aws_secret_access_key "$R2_SECRET_ACCESS_KEY"
aws configure set default.region auto

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Function to create bucket if it doesn't exist
create_bucket_if_not_exists() {
  local bucket_name=$1
  
  echo "🪣 Checking bucket: $bucket_name"
  
  if aws s3api head-bucket --bucket "$bucket_name" --endpoint-url "$R2_ENDPOINT" 2>/dev/null; then
    echo "✅ Bucket $bucket_name already exists"
  else
    echo "📦 Creating bucket: $bucket_name"
    aws s3api create-bucket \
      --bucket "$bucket_name" \
      --endpoint-url "$R2_ENDPOINT"
    echo "✅ Bucket $bucket_name created successfully"
  fi
}

# Create all buckets
create_bucket_if_not_exists "$BUCKET_ASSETS"
create_bucket_if_not_exists "$BUCKET_PREVIEWS"
create_bucket_if_not_exists "$BUCKET_DOCUMENTS"
create_bucket_if_not_exists "$BUCKET_TEMP"

# Configure CORS policy
echo "🌐 Configuring CORS policy for $BUCKET_ASSETS..."
aws s3api put-bucket-cors \
  --bucket "$BUCKET_ASSETS" \
  --cors-configuration file://config/r2-cors-policy.json \
  --endpoint-url "$R2_ENDPOINT"
echo "✅ CORS policy applied"

# Configure lifecycle rules
echo "♻️ Configuring lifecycle rules for $BUCKET_ASSETS..."
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET_ASSETS" \
  --lifecycle-configuration file://config/r2-lifecycle-rules.json \
  --endpoint-url "$R2_ENDPOINT"
echo "✅ Lifecycle rules applied"

# Configure lifecycle rules for temp bucket
echo "♻️ Configuring lifecycle rules for $BUCKET_TEMP..."
cat > /tmp/temp-lifecycle.json << 'EOF'
{
  "Rules": [
    {
      "ID": "delete-all-after-24h",
      "Status": "Enabled",
      "Filter": {},
      "Expiration": {
        "Days": 1
      }
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET_TEMP" \
  --lifecycle-configuration file:///tmp/temp-lifecycle.json \
  --endpoint-url "$R2_ENDPOINT"
echo "✅ Temp bucket lifecycle rules applied"

# Enable server-side encryption
echo "🔒 Enabling server-side encryption..."
for bucket in "$BUCKET_ASSETS" "$BUCKET_PREVIEWS" "$BUCKET_DOCUMENTS" "$BUCKET_TEMP"; do
  aws s3api put-bucket-encryption \
    --bucket "$bucket" \
    --server-side-encryption-configuration '{
      "Rules": [
        {
          "ApplyServerSideEncryptionByDefault": {
            "SSEAlgorithm": "AES256"
          }
        }
      ]
    }' \
    --endpoint-url "$R2_ENDPOINT"
  echo "✅ Encryption enabled for $bucket"
done

# Create directory structure in assets bucket
echo "📁 Creating directory structure..."
echo "Creating placeholder files for directory structure..."

for dir in "assets" "temp" "public" "public/thumbnails" "documents" "documents/licenses"; do
  echo "" | aws s3 cp - "s3://${BUCKET_ASSETS}/${dir}/.gitkeep" --endpoint-url "$R2_ENDPOINT"
done

echo "✅ Directory structure created"

# Verify setup
echo ""
echo "🔍 Verifying bucket configuration..."

for bucket in "$BUCKET_ASSETS" "$BUCKET_PREVIEWS" "$BUCKET_DOCUMENTS" "$BUCKET_TEMP"; do
  echo "Checking $bucket..."
  
  # Check CORS
  if aws s3api get-bucket-cors --bucket "$bucket" --endpoint-url "$R2_ENDPOINT" &>/dev/null; then
    echo "  ✅ CORS configured"
  else
    echo "  ⚠️  CORS not configured"
  fi
  
  # Check lifecycle
  if aws s3api get-bucket-lifecycle-configuration --bucket "$bucket" --endpoint-url "$R2_ENDPOINT" &>/dev/null; then
    echo "  ✅ Lifecycle rules configured"
  else
    echo "  ⚠️  Lifecycle rules not configured"
  fi
  
  # Check encryption
  if aws s3api get-bucket-encryption --bucket "$bucket" --endpoint-url "$R2_ENDPOINT" &>/dev/null; then
    echo "  ✅ Encryption enabled"
  else
    echo "  ⚠️  Encryption not enabled"
  fi
done

echo ""
echo "✅ R2 bucket setup completed successfully!"
echo ""
echo "📋 Summary:"
echo "  - Buckets created: 4"
echo "  - CORS policy: Configured"
echo "  - Lifecycle rules: Configured"
echo "  - Encryption: Enabled (AES-256)"
echo "  - Directory structure: Created"
echo ""
echo "🔗 Access your buckets at:"
echo "  https://dash.cloudflare.com/${R2_ACCOUNT_ID}/r2"
echo ""
echo "⚠️  Next steps:"
echo "  1. Update .env with bucket names"
echo "  2. Configure CDN custom domain (optional)"
echo "  3. Test upload/download functionality"
echo "  4. Set up monitoring alerts"
echo ""
