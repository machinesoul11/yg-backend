# Asset Quality Validation & Derivative Creation - Implementation

## Overview

This document describes the newly implemented asset quality validation and derivative asset creation features for the YES GODDESS IP licensing platform.

## Quality Validation System

### Purpose

Automated quality validation ensures that all assets meet platform standards before being approved for licensing. The system performs technical checks aligned with YES GODDESS brand guidelines:

- **High contrast, sharp focus** - Brand requirement for visual assets
- **Minimal processing** - Authentic, unfiltered content preferred
- **Architectural precision** - Professional technical quality
- **Monastic restraint** - Clean, purposeful assets

### Architecture

```
Upload → Virus Scan → Metadata Extraction → Quality Validation
                                                    ↓
                            ┌──────────────────────┼──────────────────────┐
                            ↓                      ↓                      ↓
                    Auto-Approved          Review Needed           Auto-Rejected
                    (Score ≥ 90)          (Score 70-89)           (Score < 70)
                            ↓                      ↓                      ↓
                    Status: APPROVED         Status: REVIEW         Status: REJECTED
```

### Quality Checks

#### Image Assets

1. **Minimum Resolution** (Critical)
   - Requirement: 2000px on longest edge
   - Ensures professional licensing quality

2. **Megapixel Count** (Warning)
   - Minimum: 3MP
   - Flags low-resolution images

3. **Color Space** (Warning)
   - Preferred: sRGB for web consistency
   - Warns on other color spaces

4. **Contrast** (Warning - Brand Guideline)
   - Minimum: 30% contrast ratio
   - YES GODDESS emphasizes high contrast

5. **Compression Quality** (Critical/Warning)
   - Detects heavy compression artifacts
   - Prevents poor quality uploads

6. **Upscaling Detection** (Warning)
   - Identifies artificially enlarged images
   - Flags for manual review

#### Video Assets

1. **Minimum Resolution** (Critical)
   - Requirement: 1920x1080 (1080p)
   - 1280x720 (720p) allowed with warning

2. **Frame Rate** (Warning)
   - Minimum: 24 FPS
   - Preferred: 30-60 FPS

3. **Bitrate** (Warning)
   - 1080p: ≥ 5 Mbps
   - 720p: ≥ 2.5 Mbps

4. **Audio Quality** (Warning)
   - Minimum bitrate: 128 kbps when audio present

5. **Aspect Ratio** (Info)
   - Validates standard ratios (16:9, 21:9, etc.)
   - Flags non-standard for review

#### Audio Assets

1. **Sample Rate** (Warning)
   - Minimum: 44.1 kHz (CD quality)
   - Professional: 48 kHz preferred

2. **Bit Depth** (Warning)
   - Minimum: 16-bit
   - Preferred: 24-bit

3. **Bitrate** (Warning)
   - Minimum: 128 kbps
   - Professional: 192-320 kbps

4. **Duration** (Critical)
   - Validates file isn't corrupted

#### Document Assets

1. **Page Count** (Warning)
   - Maximum: 100 pages
   - Larger documents flagged for review

2. **File Size** (Warning)
   - Validates reasonable size per page
   - Flags extremely small or large files

### Scoring System

**Score Range**: 0-100

- **90-100**: Auto-approved - High quality, meets all standards
- **70-89**: Manual review - Acceptable quality with warnings
- **Below 70**: Auto-rejected - Critical quality issues

**Severity Levels**:
- **Critical**: Must pass for auto-approval
- **Warning**: Affects score but doesn't block approval
- **Info**: Informational, minimal score impact

### Integration

Quality validation runs as a background job after metadata extraction:

```typescript
import { validateAssetQuality } from '@/lib/services/asset-processing/quality-validation.service';

// Validate an image
const result = await validateAssetQuality(imageBuffer, 'IMAGE');

// Check results
console.log(`Quality Score: ${result.overallScore}/100`);
console.log(`Status: ${result.overallStatus}`);
console.log(`Auto-approve: ${result.autoApprove}`);

// Review specific checks
for (const check of result.checks) {
  console.log(`${check.check}: ${check.passed ? 'PASS' : 'FAIL'} - ${check.message}`);
}

// Get recommendations
result.recommendations.forEach(rec => console.log(`- ${rec}`));
```

### API Response

The quality validation result is stored in the asset's metadata:

```json
{
  "qualityValidation": {
    "score": 85,
    "status": "review_needed",
    "autoApproved": false,
    "checks": [
      {
        "check": "minimum_resolution",
        "passed": true,
        "score": 100,
        "severity": "info",
        "message": "Resolution 3000x2000 meets platform minimum"
      },
      {
        "check": "contrast",
        "passed": false,
        "score": 60,
        "severity": "warning",
        "message": "Low contrast: 25%. YES GODDESS brand emphasizes high contrast images."
      }
    ],
    "recommendations": [
      "Increase image contrast to align with brand guidelines"
    ],
    "validatedAt": "2024-01-15T10:30:00Z"
  }
}
```

---

## Derivative Asset Creation

### Purpose

Enables creators to build upon existing assets while maintaining proper attribution and royalty distribution across the derivative chain.

### Features

1. **Parent-Child Relationships** - Track derivative lineage
2. **Automatic Ownership Splits** - Fair royalty distribution
3. **Derivative Type Classification** - Understand contribution type
4. **Lineage Tracking** - Complete ancestry visualization
5. **Permission Control** - Original creators can disable derivatives

### Derivative Types

- **remix**: Musical or audio remixing
- **adaptation**: Modified for different use case
- **combination**: Multiple assets combined
- **edit**: Visual or content editing
- **variant**: Alternative version
- **compilation**: Collection of works
- **mashup**: Creative combination
- **sample**: Portion used in new work

### Ownership Splits

**Default Distribution**:
- Derivative Creator: 60% (6000 basis points)
- Original Contributors: 40% (4000 basis points)

The original contributor share is proportionally distributed among all owners of the parent asset based on their ownership percentages.

**Example**:
```
Parent Asset Ownership:
- Creator A: 70% (7000 bps)
- Creator B: 30% (3000 bps)

Derivative Asset Ownership:
- Derivative Creator: 60% (6000 bps)
- Creator A: 28% (2800 bps) - 70% of 40%
- Creator B: 12% (1200 bps) - 30% of 40%
```

### Creating a Derivative

```typescript
import { DerivativeAssetService } from '@/lib/services/asset-processing/derivative.service';
import { prisma } from '@/lib/db';

const derivativeService = new DerivativeAssetService(prisma);

// Create derivative asset
const result = await derivativeService.createDerivative({
  parentAssetId: 'parent-asset-id',
  newAssetId: 'new-asset-id',
  creatorId: 'creator-id',
  derivativeType: 'remix',
  modificationsDescription: 'Added new bassline and adjusted tempo',
  toolsUsed: ['Ableton Live', 'FL Studio'],
  creativeContribution: 'Complete musical rearrangement with new instrumentation',
  ownershipSplits: {
    derivativeCreator: 6000, // 60%
    originalContributors: 4000, // 40%
  },
});

console.log('Derivative created:', result.derivativeAsset.id);
console.log('Lineage:', result.lineage);
console.log('Ownership records:', result.ownerships.length);
```

### Derivative Metadata

Stored in asset's metadata field:

```json
{
  "derivative": {
    "derivativeType": "remix",
    "parentAssetId": "parent-asset-id",
    "modificationsDescription": "Added new bassline and adjusted tempo",
    "toolsUsed": ["Ableton Live", "FL Studio"],
    "creativeContribution": "Complete musical rearrangement",
    "createdAt": "2024-01-15T10:30:00Z",
    "derivationLevel": 1,
    "lineage": ["original-asset-id", "parent-asset-id"]
  }
}
```

### Querying Derivatives

```typescript
// Get all direct derivatives
const derivatives = await derivativeService.getDerivatives(assetId);

// Get all derivatives including indirect (derivatives of derivatives)
const allDerivatives = await derivativeService.getDerivatives(assetId, {
  includeIndirect: true,
  limit: 50,
});

// Get complete lineage (ancestry)
const lineage = await derivativeService.getLineage(derivativeAssetId);

// Check if derivatives are allowed
const allowed = await derivativeService.areDerivativesAllowed(assetId);
```

### Derivative Permissions

Original creators can control whether derivatives are allowed:

```typescript
// Disable derivatives
await derivativeService.setDerivativePermission(assetId, false);

// Enable derivatives
await derivativeService.setDerivativePermission(assetId, true);
```

When derivatives are disabled, attempts to create derivatives will throw an error.

### Royalty Distribution

Calculate how royalties are distributed across a derivative chain:

```typescript
const distribution = await derivativeService.calculateDerivativeRoyaltyDistribution(
  derivativeAssetId,
  10000 // Total royalty in cents ($100.00)
);

// Returns:
// [
//   { creatorId: 'creator-1', shareBps: 6000, amountCents: 6000, role: 'Derivative Creator' },
//   { creatorId: 'creator-2', shareBps: 2800, amountCents: 2800, role: 'Original Contributor' },
//   { creatorId: 'creator-3', shareBps: 1200, amountCents: 1200, role: 'Original Contributor' }
// ]
```

### Lineage Visualization

The system tracks complete derivative chains up to 20 levels deep with automatic loop prevention.

```
Original Work (Level 0)
    └── Derivative v1 (Level 1)
        ├── Derivative v1.1 (Level 2)
        │   └── Derivative v1.1.1 (Level 3)
        └── Derivative v1.2 (Level 2)
```

### Database Schema

The parent-child relationship is stored directly in the `ip_assets` table:

```prisma
model IpAsset {
  id            String   @id
  parentAssetId String?  @map("parent_asset_id")
  metadata      Json?    // Contains derivative metadata
  
  parentAsset   IpAsset? @relation("AssetDerivatives", fields: [parentAssetId], references: [id])
  derivatives   IpAsset[] @relation("AssetDerivatives")
}
```

Ownership splits use the existing `ip_ownerships` table with `ownershipType`:
- `PRIMARY`: Derivative creator
- `CONTRIBUTOR`: Original contributors

---

## Background Jobs

### Quality Validation Job

**Queue**: `asset-quality-validation`
**Priority**: 3 (High, after thumbnails and metadata)
**Retry**: 2 attempts with exponential backoff

Runs automatically 2 seconds after metadata extraction completes to ensure metadata is available for validation.

### Job Configuration

Quality validation is enabled by default in the asset processing pipeline:

```typescript
import { enqueueAssetProcessing } from '@/jobs/asset-processing-pipeline';

// Enqueue with quality validation enabled (default)
await enqueueAssetProcessing(assetId, storageKey, 'IMAGE', mimeType, {
  enableQualityValidation: true, // Default: true
});

// Disable quality validation if needed
await enqueueAssetProcessing(assetId, storageKey, 'IMAGE', mimeType, {
  enableQualityValidation: false,
});
```

---

## Admin Operations

### Manual Quality Review

For assets flagged for review (score 70-89):

1. View quality validation results in asset metadata
2. Review specific check failures and recommendations
3. Manually approve or reject based on brand guidelines
4. Document reasoning for future reference

### Handling Rejections

For auto-rejected assets (score < 70):

1. Creator receives detailed feedback
2. Specific recommendations provided
3. Creator can upload improved version
4. Revalidation occurs automatically

### Derivative Management

Admins can:
- View complete derivative chains
- Audit ownership distributions
- Resolve derivative disputes
- Override derivative permissions when needed
- Track royalty flows across derivative networks

---

## Monitoring & Metrics

### Quality Validation Metrics

Track:
- Auto-approval rate (target: ≥ 70%)
- Average quality scores by asset type
- Common failure reasons
- Manual review queue depth

### Derivative Metrics

Track:
- Derivative creation rate
- Average derivative chain depth
- Derivative royalty distribution accuracy
- Permission denial rate

---

## Integration Examples

### Complete Upload Flow

```typescript
// 1. Upload asset
const asset = await uploadAsset(file);

// 2. Confirm upload (triggers processing pipeline)
await confirmUpload(asset.id);

// Processing pipeline runs:
// - Virus scan
// - Thumbnail generation
// - Metadata extraction
// - Quality validation ← NEW
// - Status updated based on quality

// 3. Check quality results
const assetDetails = await getAsset(asset.id);
const qualityResult = assetDetails.metadata.qualityValidation;

if (qualityResult.autoApproved) {
  // Ready for licensing
} else if (qualityResult.status === 'review_needed') {
  // Awaiting manual review
} else {
  // Rejected - show recommendations
  displayRecommendations(qualityResult.recommendations);
}
```

### Creating Derivative Workflow

```typescript
// 1. Check if derivatives are allowed
const allowed = await derivativeService.areDerivativesAllowed(parentAssetId);

if (!allowed) {
  throw new Error('Original creator has disabled derivatives');
}

// 2. Upload new asset
const newAsset = await uploadAsset(derivativeFile);

// 3. Create derivative relationship
const derivative = await derivativeService.createDerivative({
  parentAssetId,
  newAssetId: newAsset.id,
  creatorId: currentUser.creatorId,
  derivativeType: 'remix',
  modificationsDescription: userInput.description,
  toolsUsed: userInput.tools,
  creativeContribution: userInput.contribution,
});

// 4. Normal processing continues
// Quality validation runs automatically
```

---

## File References

### Services
- `src/lib/services/asset-processing/quality-validation.service.ts`
- `src/lib/services/asset-processing/derivative.service.ts`

### Jobs
- `src/jobs/asset-quality-validation.job.ts`
- `src/jobs/asset-processing-pipeline.ts` (updated)

### Documentation
- This file

---

## Next Steps

1. **Worker Registration**: Register quality validation worker in production
2. **Admin UI**: Build interfaces for quality review and derivative management
3. **Metrics Dashboard**: Implement monitoring dashboards
4. **Creator Education**: Document quality standards and derivative guidelines
5. **Testing**: Comprehensive testing with real-world assets
