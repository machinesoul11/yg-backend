# 🔒 Brand Analytics Frontend Integration Guide - Part 2
## Creator Performance & Asset Usage

**Module**: Brand Analytics  
**Classification**: 🔒 **ADMIN ONLY** (Brand owners, team members with permissions, platform admins)  
**Last Updated**: October 17, 2025  
**Backend Version**: 1.0.0

---

## Table of Contents

1. [Overview](#overview)
2. [Creator Performance API](#creator-performance-api)
3. [Asset Usage API](#asset-usage-api)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Quality Scoring System](#quality-scoring-system)
6. [Filtering & Sorting](#filtering--sorting)
7. [Frontend Implementation Guide](#frontend-implementation-guide)
8. [Complete Implementation Checklist](#complete-implementation-checklist)

---

## Overview

Part 2 covers the remaining Brand Analytics endpoints that help brands evaluate creator effectiveness and track asset utilization across campaigns.

### Key Features
- 👥 Creator collaboration tracking
- 💸 Cost efficiency analysis (CPE, CPC)
- ⭐ Quality scoring (content quality, audience alignment, brand safety)
- 📁 Asset usage statistics
- 🎯 Performance-based recommendations
- 📊 Asset type breakdowns

### Related to Part 1
These endpoints complement Campaign Analytics and ROI Analysis by providing deeper insights into:
- **Who** is performing best (creators)
- **What** content drives results (assets)
- **How** to optimize future campaigns (recommendations)

---

## Creator Performance API

### Endpoint: `trpc.brandAnalytics.getCreatorPerformance`

**Purpose**: Analyze creator effectiveness based on collaboration history, engagement rates, cost efficiency, and quality metrics.

**tRPC Call Pattern**:
```typescript
import { trpc } from '@/lib/trpc';

const { data, isLoading, error } = trpc.brandAnalytics.getCreatorPerformance.useQuery({
  id: 'brand_clxxx123456789',
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-12-31T23:59:59Z',
  sortBy: 'engagementRate',
  sortOrder: 'desc',
  minCollaborations: 2,
  limit: 20,
  offset: 0,
});
```

### Request Schema

```typescript
interface GetCreatorPerformanceInput {
  // Required
  id: string; // Brand CUID
  
  // Optional - Date Range
  startDate?: string; // ISO 8601 datetime (default: 180 days ago)
  endDate?: string;   // ISO 8601 datetime (default: now)
  
  // Optional - Sorting
  sortBy?: 'engagementRate' | 'conversions' | 'costPerEngagement' | 
           'totalSpent' | 'collaborations' | 'name';
  sortOrder?: 'asc' | 'desc'; // Default: 'desc'
  
  // Optional - Filtering
  minCollaborations?: number; // Minimum number of campaigns with creator
  category?: string;          // Creator category/niche (not yet implemented)
  
  // Optional - Pagination
  limit?: number;  // Range: 1-100, default: 20
  offset?: number; // Default: 0
}
```

### Response Schema

```typescript
interface CreatorPerformanceResponse {
  brandId: string;
  dateRange: {
    start: string; // ISO 8601
    end: string;   // ISO 8601
  };
  
  summary: {
    totalCreators: number;
    activeCreators: number;        // Creators with active licenses
    totalCollaborations: number;   // Sum of all campaigns across creators
    totalSpentCents: number;
    avgSpentPerCreatorCents: number;
    avgEngagementRate: number;     // Platform-wide average
  };
  
  creators: CreatorPerformanceMetrics[];
  
  topPerformers: Array<{
    creatorId: string;
    creatorName: string;
    performanceScore: number;   // 0-100 composite score
    engagementRate: number;     // Percentage
    costEfficiency: number;     // Cost per engagement in cents
  }>;
  
  categoryBreakdown: Array<{
    category: string;
    creatorCount: number;
    avgEngagementRate: number;
  }>;
}

interface CreatorPerformanceMetrics {
  creatorId: string;
  creatorName: string;
  stageName: string;
  
  collaborations: {
    totalCampaigns: number;     // Number of campaigns collaborated on
    totalContent: number;       // Number of unique assets licensed
    activeLicenses: number;     // Currently active licenses
  };
  
  performance: {
    totalReach: number;         // Unique visitors
    totalImpressions: number;
    totalEngagement: number;    // Total clicks (simplified)
    avgEngagementRate: number;  // Percentage
    totalConversions: number;
    conversionRate: number;     // Percentage
  };
  
  financial: {
    totalPaidCents: number;           // Total license fees paid to creator
    avgCostPerContentCents: number;   // Total paid / content pieces
    costPerEngagement: number;        // Total paid / total engagement
    costPerConversion: number;        // Total paid / total conversions
  };
  
  quality: {
    contentQualityScore: number;      // 0-100 based on engagement
    audienceAlignmentScore: number;   // 0-100 (placeholder: 75)
    brandSafetyScore: number;         // 0-100 (placeholder: 90)
    deliveryConsistencyScore: number; // 0-100 (placeholder: 85)
  };
  
  lastCollaboration: string | null; // ISO 8601 date of last license creation
}
```

### Query Parameters Details

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| `id` | string | ✅ Yes | - | Must be valid CUID | Brand identifier |
| `startDate` | string | ❌ No | 180 days ago | ISO 8601 datetime | Filter collaborations after this date |
| `endDate` | string | ❌ No | Now | ISO 8601 datetime | Filter collaborations before this date |
| `sortBy` | enum | ❌ No | `'engagementRate'` | One of: engagementRate, conversions, costPerEngagement, totalSpent, collaborations, name | Sort creators by this metric |
| `sortOrder` | enum | ❌ No | `'desc'` | One of: asc, desc | Sort direction |
| `minCollaborations` | number | ❌ No | - | Integer >= 1 | Only show creators with at least this many campaigns |
| `category` | string | ❌ No | - | Any string | ⚠️ Not yet implemented - filter by creator category |
| `limit` | number | ❌ No | 20 | 1-100 (inclusive) | Number of creators to return |
| `offset` | number | ❌ No | 0 | >= 0 | Pagination offset |

### Business Logic & Calculations

#### Engagement Rate
```typescript
const avgEngagementRate = totalImpressions > 0
  ? (totalEngagement / totalImpressions) * 100
  : 0;
```

#### Conversion Rate
```typescript
const conversionRate = totalEngagement > 0
  ? (totalConversions / totalEngagement) * 100
  : 0;
```

#### Cost Metrics
```typescript
// Cost per content piece
const avgCostPerContent = totalContent > 0
  ? totalPaidCents / totalContent
  : 0;

// Cost per engagement
const costPerEngagement = totalEngagement > 0
  ? totalPaidCents / totalEngagement
  : 0;

// Cost per conversion
const costPerConversion = totalConversions > 0
  ? totalPaidCents / totalConversions
  : 0;
```

#### Content Quality Score
```typescript
// Simplified scoring based on engagement rate (0-100 scale)
const contentQualityScore = avgEngagementRate * 10;
// Capped at 100
const finalScore = Math.min(100, contentQualityScore);
```

⚠️ **Note**: `audienceAlignmentScore`, `brandSafetyScore`, and `deliveryConsistencyScore` currently return static placeholder values (75, 90, 85 respectively). Future implementation will calculate these from:
- Audience demographics matching
- Content moderation scores
- On-time delivery tracking

### Example Response

```json
{
  "brandId": "brand_clxxx123456789",
  "dateRange": {
    "start": "2024-06-01T00:00:00.000Z",
    "end": "2024-11-27T23:59:59.999Z"
  },
  "summary": {
    "totalCreators": 24,
    "activeCreators": 15,
    "totalCollaborations": 48,
    "totalSpentCents": 1250000,
    "avgSpentPerCreatorCents": 52083,
    "avgEngagementRate": 6.8
  },
  "creators": [
    {
      "creatorId": "creator_abc123",
      "creatorName": "Jane Smith",
      "stageName": "@janesmithcreates",
      "collaborations": {
        "totalCampaigns": 3,
        "totalContent": 8,
        "activeLicenses": 2
      },
      "performance": {
        "totalReach": 85000,
        "totalImpressions": 320000,
        "totalEngagement": 24500,
        "avgEngagementRate": 7.65,
        "totalConversions": 285,
        "conversionRate": 1.16
      },
      "financial": {
        "totalPaidCents": 150000,
        "avgCostPerContentCents": 18750,
        "costPerEngagement": 6.12,
        "costPerConversion": 526.32
      },
      "quality": {
        "contentQualityScore": 76.5,
        "audienceAlignmentScore": 75,
        "brandSafetyScore": 90,
        "deliveryConsistencyScore": 85
      },
      "lastCollaboration": "2024-10-15T14:23:00.000Z"
    }
  ],
  "topPerformers": [
    {
      "creatorId": "creator_abc123",
      "creatorName": "Jane Smith",
      "performanceScore": 76.5,
      "engagementRate": 7.65,
      "costEfficiency": 6.12
    }
  ],
  "categoryBreakdown": []
}
```

### Use Cases

#### 1. Identify Top Performers
```typescript
// Get creators with highest engagement rates
const { data } = await trpc.brandAnalytics.getCreatorPerformance.useQuery({
  id: brandId,
  sortBy: 'engagementRate',
  sortOrder: 'desc',
  limit: 10,
});

// Display in a leaderboard
data.data.topPerformers.map((creator) => ({
  name: creator.creatorName,
  score: creator.performanceScore,
  efficiency: formatCurrency(creator.costEfficiency),
}));
```

#### 2. Find Cost-Efficient Creators
```typescript
// Sort by cost per engagement (ascending = cheapest first)
const { data } = await trpc.brandAnalytics.getCreatorPerformance.useQuery({
  id: brandId,
  sortBy: 'costPerEngagement',
  sortOrder: 'asc',
  minCollaborations: 2, // Only proven creators
  limit: 20,
});
```

#### 3. Identify Re-engagement Opportunities
```typescript
// Filter in frontend: Creators with good past performance but no recent activity
const inactiveCreators = data.data.creators.filter((creator) => {
  const lastCollab = new Date(creator.lastCollaboration || 0);
  const daysSinceLastCollab = (Date.now() - lastCollab.getTime()) / (1000 * 60 * 60 * 24);
  
  return (
    creator.quality.contentQualityScore > 60 &&
    creator.collaborations.activeLicenses === 0 &&
    daysSinceLastCollab > 90
  );
});
```

---

## Asset Usage API

### Endpoint: `trpc.brandAnalytics.getAssetUsage`

**Purpose**: Track how assets are being used across campaigns, identify top performers, and get optimization recommendations.

**tRPC Call Pattern**:
```typescript
const { data, isLoading, error } = trpc.brandAnalytics.getAssetUsage.useQuery({
  id: 'brand_clxxx123456789',
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-12-31T23:59:59Z',
  assetType: 'IMAGE',
  usageStatus: 'used',
  sortBy: 'performanceScore',
  sortOrder: 'desc',
  minUsageCount: 1,
  limit: 20,
  offset: 0,
});
```

### Request Schema

```typescript
interface GetAssetUsageInput {
  // Required
  id: string; // Brand CUID
  
  // Optional - Date Range
  startDate?: string; // ISO 8601 datetime (default: 365 days ago / 1 year)
  endDate?: string;   // ISO 8601 datetime (default: now)
  
  // Optional - Filtering
  assetType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'THREE_D' | 'OTHER';
  usageStatus?: 'all' | 'used' | 'unused'; // Default: 'all'
  minUsageCount?: number; // Minimum license count
  
  // Optional - Sorting
  sortBy?: 'performanceScore' | 'usageCount' | 'engagementRate' | 
           'uploadedAt' | 'title';
  sortOrder?: 'asc' | 'desc'; // Default: 'desc'
  
  // Optional - Pagination
  limit?: number;  // Range: 1-100, default: 20
  offset?: number; // Default: 0
}
```

### Response Schema

```typescript
interface AssetUsageResponse {
  brandId: string;
  dateRange: {
    start: string; // ISO 8601
    end: string;   // ISO 8601
  };
  
  summary: {
    totalAssets: number;
    usedAssets: number;        // Assets with at least 1 license
    unusedAssets: number;      // Assets with 0 licenses
    avgUsagePerAsset: number;  // Average licenses per asset
    totalImpressions: number;
    avgEngagementRate: number;
  };
  
  assets: AssetUsageMetrics[];
  
  mostEffectiveAssets: Array<{
    assetId: string;
    assetTitle: string;
    performanceScore: number; // 0-100
    usageCount: number;
  }>;
  
  leastUsedAssets: Array<{
    assetId: string;
    assetTitle: string;
    uploadedAt: string; // ISO 8601
    usageCount: number;
  }>;
  
  assetTypeBreakdown: Array<{
    assetType: string;
    count: number;
    avgEngagementRate: number;
    avgPerformanceScore: number;
  }>;
  
  recommendations: Array<{
    type: 'high_performer' | 'underutilized' | 'retire_candidate';
    assetId: string;
    assetTitle: string;
    reason: string;
  }>;
}

interface AssetUsageMetrics {
  assetId: string;
  assetTitle: string;
  assetType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'THREE_D' | 'OTHER';
  uploadedAt: string; // ISO 8601
  
  usage: {
    totalCampaigns: number;  // Number of unique campaigns using this asset
    totalCreators: number;   // Number of unique creators who own this asset
    totalLicenses: number;   // Total licenses created for this asset
    firstUsed: string | null;
    lastUsed: string | null;
  };
  
  performance: {
    totalImpressions: number;
    totalEngagement: number;
    avgEngagementRate: number; // Percentage
    totalConversions: number;
    conversionRate: number;    // Percentage
  };
  
  distribution: {
    geographicReach: Array<{
      region: string;
      impressions: number;
    }>;
    demographicReach: Array<{
      segment: string;
      percentage: number;
    }>;
  };
  
  effectiveness: {
    performanceScore: number;      // 0-100 composite score
    comparisonToAverage: number;   // ⚠️ Placeholder: 0
    topPerformingContext: string | null; // e.g., "Multiple campaigns"
  };
}
```

### Query Parameters Details

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| `id` | string | ✅ Yes | - | Must be valid CUID | Brand identifier |
| `startDate` | string | ❌ No | 365 days ago | ISO 8601 datetime | Filter licenses created after this date |
| `endDate` | string | ❌ No | Now | ISO 8601 datetime | Filter licenses created before this date |
| `assetType` | enum | ❌ No | - | One of: IMAGE, VIDEO, AUDIO, DOCUMENT, THREE_D, OTHER | Filter by asset type |
| `usageStatus` | enum | ❌ No | `'all'` | One of: all, used, unused | Filter by usage (used = has licenses, unused = no licenses) |
| `sortBy` | enum | ❌ No | `'performanceScore'` | One of: performanceScore, usageCount, engagementRate, uploadedAt, title | Sort assets by this metric |
| `sortOrder` | enum | ❌ No | `'desc'` | Sort direction |
| `minUsageCount` | number | ❌ No | - | Integer >= 0 | Only show assets with at least this many licenses |
| `limit` | number | ❌ No | 20 | 1-100 (inclusive) | Number of assets to return |
| `offset` | number | ❌ No | 0 | >= 0 | Pagination offset |

### Business Logic & Calculations

#### Performance Score
```typescript
// Weighted composite score (0-100 scale)
const performanceScore = Math.min(100, (
  (engagementRate * 5) +   // Engagement is 5x weighted
  (conversionRate * 10)     // Conversions are 10x weighted
) / 2);

// Example:
// Engagement Rate: 8% → 8 * 5 = 40
// Conversion Rate: 2% → 2 * 10 = 20
// Performance Score: (40 + 20) / 2 = 30
```

#### Recommendation Logic

##### High Performers
```typescript
// Top 10% by performance score
const highPerformerThreshold = 0.1; // Top 10%
const sortedAssets = assets.sort((a, b) => b.performanceScore - a.performanceScore);
const topCount = Math.ceil(sortedAssets.length * highPerformerThreshold);
const highPerformers = sortedAssets.slice(0, topCount);

// Recommendation message:
`High performance score (${score.toFixed(1)}) - consider using in more campaigns`
```

##### Underutilized
```typescript
// Good performance (>50) but low usage (<3 licenses)
const underutilized = assets.filter((asset) => 
  asset.effectiveness.performanceScore > 50 &&
  asset.usage.totalLicenses < 3
);

// Recommendation message:
'Good performance potential but rarely used - consider promoting'
```

##### Retire Candidates
```typescript
// Poor performance (<20) AND no usage AND old (>90 days)
const retireCandidates = assets.filter((asset) => {
  const daysOld = (Date.now() - new Date(asset.uploadedAt).getTime()) / (1000 * 60 * 60 * 24);
  return (
    asset.effectiveness.performanceScore < 20 &&
    asset.usage.totalLicenses === 0 &&
    daysOld > 90
  );
});

// Recommendation message:
'No usage in 90+ days with poor performance - consider archiving'
```

### Example Response

```json
{
  "brandId": "brand_clxxx123456789",
  "dateRange": {
    "start": "2023-12-01T00:00:00.000Z",
    "end": "2024-11-27T23:59:59.999Z"
  },
  "summary": {
    "totalAssets": 156,
    "usedAssets": 98,
    "unusedAssets": 58,
    "avgUsagePerAsset": 2.3,
    "totalImpressions": 8500000,
    "avgEngagementRate": 5.2
  },
  "assets": [
    {
      "assetId": "asset_xyz789",
      "assetTitle": "Spring Collection Hero Image",
      "assetType": "IMAGE",
      "uploadedAt": "2024-02-15T10:30:00.000Z",
      "usage": {
        "totalCampaigns": 5,
        "totalCreators": 2,
        "totalLicenses": 12,
        "firstUsed": "2024-03-01T08:00:00.000Z",
        "lastUsed": "2024-10-20T14:30:00.000Z"
      },
      "performance": {
        "totalImpressions": 450000,
        "totalEngagement": 32500,
        "avgEngagementRate": 7.22,
        "totalConversions": 380,
        "conversionRate": 1.17
      },
      "distribution": {
        "geographicReach": [],
        "demographicReach": []
      },
      "effectiveness": {
        "performanceScore": 47.8,
        "comparisonToAverage": 0,
        "topPerformingContext": "Multiple campaigns"
      }
    }
  ],
  "mostEffectiveAssets": [
    {
      "assetId": "asset_xyz789",
      "assetTitle": "Spring Collection Hero Image",
      "performanceScore": 47.8,
      "usageCount": 12
    }
  ],
  "leastUsedAssets": [
    {
      "assetId": "asset_unused001",
      "assetTitle": "Unused Product Shot",
      "uploadedAt": "2024-01-10T09:00:00.000Z",
      "usageCount": 0
    }
  ],
  "assetTypeBreakdown": [
    {
      "assetType": "IMAGE",
      "count": 120,
      "avgEngagementRate": 5.8,
      "avgPerformanceScore": 42.3
    },
    {
      "assetType": "VIDEO",
      "count": 30,
      "avgEngagementRate": 8.2,
      "avgPerformanceScore": 68.5
    }
  ],
  "recommendations": [
    {
      "type": "high_performer",
      "assetId": "asset_xyz789",
      "assetTitle": "Spring Collection Hero Image",
      "reason": "High performance score (47.8) - consider using in more campaigns"
    },
    {
      "type": "underutilized",
      "assetId": "asset_good002",
      "assetTitle": "Lifestyle Shot A",
      "reason": "Good performance potential but rarely used - consider promoting"
    },
    {
      "type": "retire_candidate",
      "assetId": "asset_old003",
      "assetTitle": "Outdated Banner",
      "reason": "No usage in 90+ days with poor performance - consider archiving"
    }
  ]
}
```

### Use Cases

#### 1. Identify Best-Performing Content
```typescript
// Get top 20 assets by performance score
const { data } = await trpc.brandAnalytics.getAssetUsage.useQuery({
  id: brandId,
  sortBy: 'performanceScore',
  sortOrder: 'desc',
  usageStatus: 'used',
  limit: 20,
});

// Use for portfolio highlights or new campaign planning
```

#### 2. Find Unused Assets
```typescript
// Get all unused assets uploaded more than 30 days ago
const { data } = await trpc.brandAnalytics.getAssetUsage.useQuery({
  id: brandId,
  usageStatus: 'unused',
  sortBy: 'uploadedAt',
  sortOrder: 'asc',
  limit: 100,
});

// Filter in frontend for age
const oldUnusedAssets = data.data.assets.filter((asset) => {
  const uploadDate = new Date(asset.uploadedAt);
  const daysOld = (Date.now() - uploadDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysOld > 30;
});
```

#### 3. Asset Type Analysis
```typescript
// Compare performance across different asset types
const { data } = await trpc.brandAnalytics.getAssetUsage.useQuery({
  id: brandId,
  limit: 100, // Get enough data for analysis
});

// Use assetTypeBreakdown for visualization
const typeChart = data.data.assetTypeBreakdown.map((type) => ({
  name: type.assetType,
  engagementRate: type.avgEngagementRate,
  performanceScore: type.avgPerformanceScore,
  count: type.count,
}));
```

#### 4. Act on Recommendations
```typescript
// Group recommendations by type
const recommendations = data.data.recommendations.reduce((acc, rec) => {
  if (!acc[rec.type]) acc[rec.type] = [];
  acc[rec.type].push(rec);
  return acc;
}, {});

// Display actionable insights
// High performers: "Promote these assets"
// Underutilized: "Give these assets another chance"
// Retire candidates: "Consider removing to reduce clutter"
```

---

## TypeScript Type Definitions

Add these to your frontend types file (append to Part 1 types):

```typescript
// ===========================
// Creator Performance Types
// ===========================

export type CreatorSortBy = 
  | 'engagementRate' 
  | 'conversions' 
  | 'costPerEngagement' 
  | 'totalSpent' 
  | 'collaborations' 
  | 'name';

export interface GetCreatorPerformanceInput {
  id: string;
  startDate?: string;
  endDate?: string;
  sortBy?: CreatorSortBy;
  sortOrder?: SortOrder;
  minCollaborations?: number;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface CreatorCollaborations {
  totalCampaigns: number;
  totalContent: number;
  activeLicenses: number;
}

export interface CreatorPerformance {
  totalReach: number;
  totalImpressions: number;
  totalEngagement: number;
  avgEngagementRate: number;
  totalConversions: number;
  conversionRate: number;
}

export interface CreatorFinancials {
  totalPaidCents: number;
  avgCostPerContentCents: number;
  costPerEngagement: number;
  costPerConversion: number;
}

export interface CreatorQuality {
  contentQualityScore: number;
  audienceAlignmentScore: number;
  brandSafetyScore: number;
  deliveryConsistencyScore: number;
}

export interface CreatorPerformanceMetrics {
  creatorId: string;
  creatorName: string;
  stageName: string;
  collaborations: CreatorCollaborations;
  performance: CreatorPerformance;
  financial: CreatorFinancials;
  quality: CreatorQuality;
  lastCollaboration: string | null;
}

export interface CreatorPerformanceSummary {
  totalCreators: number;
  activeCreators: number;
  totalCollaborations: number;
  totalSpentCents: number;
  avgSpentPerCreatorCents: number;
  avgEngagementRate: number;
}

export interface TopPerformer {
  creatorId: string;
  creatorName: string;
  performanceScore: number;
  engagementRate: number;
  costEfficiency: number;
}

export interface CategoryBreakdown {
  category: string;
  creatorCount: number;
  avgEngagementRate: number;
}

export interface CreatorPerformanceResponse {
  brandId: string;
  dateRange: DateRange;
  summary: CreatorPerformanceSummary;
  creators: CreatorPerformanceMetrics[];
  topPerformers: TopPerformer[];
  categoryBreakdown: CategoryBreakdown[];
}

// ===========================
// Asset Usage Types
// ===========================

export type AssetType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'THREE_D' | 'OTHER';
export type UsageStatus = 'all' | 'used' | 'unused';
export type AssetSortBy = 
  | 'performanceScore' 
  | 'usageCount' 
  | 'engagementRate' 
  | 'uploadedAt' 
  | 'title';

export interface GetAssetUsageInput {
  id: string;
  startDate?: string;
  endDate?: string;
  assetType?: AssetType;
  usageStatus?: UsageStatus;
  sortBy?: AssetSortBy;
  sortOrder?: SortOrder;
  minUsageCount?: number;
  limit?: number;
  offset?: number;
}

export interface AssetUsage {
  totalCampaigns: number;
  totalCreators: number;
  totalLicenses: number;
  firstUsed: string | null;
  lastUsed: string | null;
}

export interface AssetPerformance {
  totalImpressions: number;
  totalEngagement: number;
  avgEngagementRate: number;
  totalConversions: number;
  conversionRate: number;
}

export interface GeographicReach {
  region: string;
  impressions: number;
}

export interface DemographicReach {
  segment: string;
  percentage: number;
}

export interface AssetDistribution {
  geographicReach: GeographicReach[];
  demographicReach: DemographicReach[];
}

export interface AssetEffectiveness {
  performanceScore: number;
  comparisonToAverage: number;
  topPerformingContext: string | null;
}

export interface AssetUsageMetrics {
  assetId: string;
  assetTitle: string;
  assetType: AssetType;
  uploadedAt: string;
  usage: AssetUsage;
  performance: AssetPerformance;
  distribution: AssetDistribution;
  effectiveness: AssetEffectiveness;
}

export interface AssetUsageSummary {
  totalAssets: number;
  usedAssets: number;
  unusedAssets: number;
  avgUsagePerAsset: number;
  totalImpressions: number;
  avgEngagementRate: number;
}

export interface EffectiveAsset {
  assetId: string;
  assetTitle: string;
  performanceScore: number;
  usageCount: number;
}

export interface AssetTypeBreakdown {
  assetType: string;
  count: number;
  avgEngagementRate: number;
  avgPerformanceScore: number;
}

export type RecommendationType = 'high_performer' | 'underutilized' | 'retire_candidate';

export interface AssetRecommendation {
  type: RecommendationType;
  assetId: string;
  assetTitle: string;
  reason: string;
}

export interface AssetUsageResponse {
  brandId: string;
  dateRange: DateRange;
  summary: AssetUsageSummary;
  assets: AssetUsageMetrics[];
  mostEffectiveAssets: EffectiveAsset[];
  leastUsedAssets: Array<{
    assetId: string;
    assetTitle: string;
    uploadedAt: string;
    usageCount: number;
  }>;
  assetTypeBreakdown: AssetTypeBreakdown[];
  recommendations: AssetRecommendation[];
}
```

---

## Quality Scoring System

### Content Quality Score

**Formula**: `avgEngagementRate * 10` (capped at 100)

**Interpretation**:
- **0-30**: Poor performance, content may not resonate with audience
- **31-60**: Average performance, room for improvement
- **61-85**: Good performance, content engages audience well
- **86-100**: Excellent performance, top-tier content

**Display Recommendation**:
```typescript
function getQualityRating(score: number): { label: string; color: string } {
  if (score >= 86) return { label: 'Excellent', color: 'text-green-600' };
  if (score >= 61) return { label: 'Good', color: 'text-blue-600' };
  if (score >= 31) return { label: 'Average', color: 'text-yellow-600' };
  return { label: 'Needs Improvement', color: 'text-red-600' };
}
```

### Placeholder Scores

⚠️ **Current Implementation Limitations**:

The following scores are **static placeholders** and do not reflect actual data:

| Metric | Current Value | Future Data Source |
|--------|---------------|-------------------|
| `audienceAlignmentScore` | 75 | Demographic matching, audience overlap analysis |
| `brandSafetyScore` | 90 | Content moderation, brand guidelines compliance |
| `deliveryConsistencyScore` | 85 | On-time delivery tracking, revision counts |
| `comparisonToAverage` (assets) | 0 | Platform-wide performance benchmarks |

**Frontend Display Recommendation**:
- Add a visual indicator (e.g., badge or tooltip) noting these are preliminary scores
- Example: "Score based on available data. Full scoring coming soon."

---

## Filtering & Sorting

### Best Practices

#### 1. Combine Filters for Precision
```typescript
// Example: Find cost-efficient creators with proven track record
const { data } = await trpc.brandAnalytics.getCreatorPerformance.useQuery({
  id: brandId,
  minCollaborations: 3,    // At least 3 campaigns
  sortBy: 'costPerEngagement',
  sortOrder: 'asc',        // Cheapest first
  limit: 10,
});
```

#### 2. Use Pagination for Large Datasets
```typescript
// Implement infinite scroll or page-based navigation
function CreatorList({ brandId }: { brandId: string }) {
  const [page, setPage] = useState(0);
  const limit = 20;
  
  const { data, fetchNextPage, hasNextPage } = trpc.brandAnalytics.getCreatorPerformance.useInfiniteQuery(
    {
      id: brandId,
      limit,
    },
    {
      getNextPageParam: (lastPage, pages) => {
        const totalFetched = pages.length * limit;
        if (totalFetched < lastPage.data.summary.totalCreators) {
          return totalFetched; // Return offset for next page
        }
        return undefined; // No more pages
      },
    }
  );
  
  // Render with infinite scroll or "Load More" button
}
```

#### 3. Sort Options UI
```typescript
const sortOptions = [
  { value: 'engagementRate', label: 'Engagement Rate' },
  { value: 'conversions', label: 'Total Conversions' },
  { value: 'costPerEngagement', label: 'Cost Efficiency' },
  { value: 'totalSpent', label: 'Total Spent' },
  { value: 'collaborations', label: 'Number of Campaigns' },
  { value: 'name', label: 'Name' },
];

<Select
  options={sortOptions}
  value={sortBy}
  onChange={(value) => setSortBy(value)}
/>
```

---

## Frontend Implementation Guide

### Step 1: Create Creator Performance Component

```typescript
// src/components/analytics/CreatorPerformanceTable.tsx
import { trpc } from '@/lib/trpc';
import { formatCurrency, formatPercentage } from '@/utils/analytics-formatting';
import { useState } from 'react';

export function CreatorPerformanceTable({ brandId }: { brandId: string }) {
  const [sortBy, setSortBy] = useState<CreatorSortBy>('engagementRate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const { data, isLoading } = trpc.brandAnalytics.getCreatorPerformance.useQuery({
    id: brandId,
    sortBy,
    sortOrder,
    limit: 50,
  });
  
  if (isLoading) return <TableSkeleton />;
  if (!data) return null;
  
  const { summary, creators } = data.data;
  
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label="Total Creators"
          value={summary.totalCreators}
          subtitle={`${summary.activeCreators} active`}
        />
        <MetricCard
          label="Total Spent"
          value={formatCurrency(summary.totalSpentCents)}
        />
        <MetricCard
          label="Avg Engagement"
          value={formatPercentage(summary.avgEngagementRate)}
        />
      </div>
      
      {/* Table */}
      <table className="w-full">
        <thead>
          <tr>
            <SortableHeader
              label="Creator"
              field="name"
              current={sortBy}
              order={sortOrder}
              onSort={(field, order) => { setSortBy(field); setSortOrder(order); }}
            />
            <SortableHeader label="Engagement Rate" field="engagementRate" {...sortProps} />
            <SortableHeader label="Cost/Engagement" field="costPerEngagement" {...sortProps} />
            <th>Quality Score</th>
            <th>Campaigns</th>
          </tr>
        </thead>
        <tbody>
          {creators.map((creator) => (
            <tr key={creator.creatorId}>
              <td>
                <div>
                  <div className="font-medium">{creator.creatorName}</div>
                  <div className="text-sm text-gray-500">{creator.stageName}</div>
                </div>
              </td>
              <td>{formatPercentage(creator.performance.avgEngagementRate)}</td>
              <td>{formatCurrency(creator.financial.costPerEngagement)}</td>
              <td>
                <QualityScoreBadge score={creator.quality.contentQualityScore} />
              </td>
              <td>{creator.collaborations.totalCampaigns}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QualityScoreBadge({ score }: { score: number }) {
  const { label, color } = getQualityRating(score);
  return (
    <span className={`font-semibold ${color}`}>
      {score.toFixed(0)} - {label}
    </span>
  );
}
```

### Step 2: Create Asset Usage Component

```typescript
// src/components/analytics/AssetUsageGallery.tsx
import { trpc } from '@/lib/trpc';
import { formatPercentage, formatCompactNumber } from '@/utils/analytics-formatting';

export function AssetUsageGallery({ brandId }: { brandId: string }) {
  const [assetType, setAssetType] = useState<AssetType | undefined>();
  const [usageStatus, setUsageStatus] = useState<UsageStatus>('all');
  
  const { data, isLoading } = trpc.brandAnalytics.getAssetUsage.useQuery({
    id: brandId,
    assetType,
    usageStatus,
    sortBy: 'performanceScore',
    sortOrder: 'desc',
    limit: 30,
  });
  
  if (isLoading) return <GallerySkeleton />;
  if (!data) return null;
  
  const { summary, assets, recommendations } = data.data;
  
  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex gap-4">
        <AssetTypeFilter value={assetType} onChange={setAssetType} />
        <UsageStatusFilter value={usageStatus} onChange={setUsageStatus} />
      </div>
      
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Total Assets" value={summary.totalAssets} />
        <MetricCard label="Used Assets" value={summary.usedAssets} />
        <MetricCard 
          label="Unused Assets" 
          value={summary.unusedAssets}
          valueClassName={summary.unusedAssets > 50 ? 'text-yellow-600' : undefined}
        />
        <MetricCard 
          label="Avg Usage" 
          value={summary.avgUsagePerAsset.toFixed(1)} 
        />
      </div>
      
      {/* Recommendations */}
      {recommendations.length > 0 && (
        <RecommendationsPanel recommendations={recommendations} />
      )}
      
      {/* Asset Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {assets.map((asset) => (
          <AssetCard key={asset.assetId} asset={asset} />
        ))}
      </div>
    </div>
  );
}

function AssetCard({ asset }: { asset: AssetUsageMetrics }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      {/* Asset Preview/Thumbnail */}
      <div className="aspect-video bg-gray-100 rounded flex items-center justify-center">
        <span className="text-gray-400">{asset.assetType}</span>
      </div>
      
      {/* Title */}
      <h4 className="font-semibold truncate">{asset.assetTitle}</h4>
      
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-gray-500">Performance</span>
          <div className="font-semibold">
            {asset.effectiveness.performanceScore.toFixed(0)}/100
          </div>
        </div>
        <div>
          <span className="text-gray-500">Usage</span>
          <div className="font-semibold">{asset.usage.totalLicenses} licenses</div>
        </div>
        <div>
          <span className="text-gray-500">Engagement</span>
          <div className="font-semibold">
            {formatPercentage(asset.performance.avgEngagementRate)}
          </div>
        </div>
        <div>
          <span className="text-gray-500">Impressions</span>
          <div className="font-semibold">
            {formatCompactNumber(asset.performance.totalImpressions)}
          </div>
        </div>
      </div>
      
      {/* Action Button */}
      <button className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
        View Details
      </button>
    </div>
  );
}

function RecommendationsPanel({ recommendations }: { recommendations: AssetRecommendation[] }) {
  const grouped = recommendations.reduce((acc, rec) => {
    if (!acc[rec.type]) acc[rec.type] = [];
    acc[rec.type].push(rec);
    return acc;
  }, {} as Record<RecommendationType, AssetRecommendation[]>);
  
  return (
    <div className="bg-blue-50 rounded-lg p-6 space-y-4">
      <h3 className="font-semibold text-lg">💡 Recommendations</h3>
      
      {grouped.high_performer && (
        <RecommendationSection
          title="High Performers"
          icon="🌟"
          items={grouped.high_performer}
          color="text-green-600"
        />
      )}
      
      {grouped.underutilized && (
        <RecommendationSection
          title="Underutilized Assets"
          icon="💎"
          items={grouped.underutilized}
          color="text-yellow-600"
        />
      )}
      
      {grouped.retire_candidate && (
        <RecommendationSection
          title="Consider Archiving"
          icon="📦"
          items={grouped.retire_candidate}
          color="text-gray-600"
        />
      )}
    </div>
  );
}
```

### Step 3: Create Unified Analytics Dashboard

```typescript
// src/pages/brands/[id]/analytics.tsx
import { useRouter } from 'next/router';
import { CampaignAnalyticsDashboard } from '@/components/analytics/CampaignAnalyticsDashboard';
import { ROIAnalysisChart } from '@/components/analytics/ROIAnalysisChart';
import { CreatorPerformanceTable } from '@/components/analytics/CreatorPerformanceTable';
import { AssetUsageGallery } from '@/components/analytics/AssetUsageGallery';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '@/components/ui/Tabs';

export default function BrandAnalyticsPage() {
  const router = useRouter();
  const brandId = router.query.id as string;
  
  if (!brandId) return <div>Loading...</div>;
  
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Brand Analytics</h1>
      
      <Tabs>
        <TabList>
          <Tab>Campaigns</Tab>
          <Tab>ROI Analysis</Tab>
          <Tab>Creators</Tab>
          <Tab>Assets</Tab>
        </TabList>
        
        <TabPanels>
          <TabPanel>
            <CampaignAnalyticsDashboard brandId={brandId} />
          </TabPanel>
          
          <TabPanel>
            <ROIAnalysisChart brandId={brandId} />
          </TabPanel>
          
          <TabPanel>
            <CreatorPerformanceTable brandId={brandId} />
          </TabPanel>
          
          <TabPanel>
            <AssetUsageGallery brandId={brandId} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}
```

---

## Complete Implementation Checklist

### Backend Integration
- [ ] Install tRPC and React Query dependencies
- [ ] Set up tRPC client with authentication headers
- [ ] Configure React Query cache settings
- [ ] Add backend type imports (`AppRouter` from yg-backend)

### Type Definitions
- [ ] Copy all TypeScript types from Part 1 and Part 2
- [ ] Create barrel export file (`src/types/brand-analytics.ts`)
- [ ] Verify types match backend schemas

### Utility Functions
- [ ] Implement currency formatting (`formatCurrency`)
- [ ] Implement percentage formatting (`formatPercentage`)
- [ ] Implement compact number formatting (`formatCompactNumber`)
- [ ] Implement date formatting (`formatDate`)
- [ ] Create quality rating helper (`getQualityRating`)
- [ ] Create ROI color helper (`getROIColor`)
- [ ] Create date range preset helper (`getDateRangePreset`)

### UI Components

#### Campaign Analytics
- [ ] Campaign Analytics Dashboard component
- [ ] Campaign summary cards
- [ ] Top performers list
- [ ] Campaigns data table with sorting
- [ ] Pagination controls

#### ROI Analysis
- [ ] ROI Analysis Chart component
- [ ] Key metrics display
- [ ] Timeline visualization (line chart)
- [ ] Investment/Returns breakdown cards
- [ ] Campaign comparison table

#### Creator Performance
- [ ] Creator Performance Table component
- [ ] Creator summary cards
- [ ] Sortable table headers
- [ ] Quality score badges
- [ ] Top performers section

#### Asset Usage
- [ ] Asset Usage Gallery component
- [ ] Asset type and usage filters
- [ ] Asset cards with metrics
- [ ] Recommendations panel
- [ ] Most/Least effective assets lists

#### Shared Components
- [ ] Loading skeletons
- [ ] Error states (403, 404, 500)
- [ ] Metric card component
- [ ] Sortable table header component
- [ ] Pagination component
- [ ] Empty state component

### Error Handling
- [ ] Global error boundary
- [ ] tRPC error type handling
- [ ] Network error retry logic
- [ ] User-friendly error messages
- [ ] Error logging/monitoring integration

### Data Management
- [ ] Implement prefetching strategy
- [ ] Cache invalidation after mutations
- [ ] Optimistic updates (if applicable)
- [ ] Stale data handling

### User Experience
- [ ] Loading states for all queries
- [ ] Skeleton loaders
- [ ] Empty states
- [ ] Filter presets (Last 7/30/90 days, etc.)
- [ ] Export functionality (CSV/PDF)
- [ ] Tooltips for complex metrics
- [ ] Mobile responsive design

### Testing
- [ ] Unit tests for utility functions
- [ ] Component tests for UI elements
- [ ] Integration tests for data fetching
- [ ] E2E tests for critical user flows

### Documentation
- [ ] Add JSDoc comments to components
- [ ] Create usage examples in Storybook
- [ ] Document custom hooks
- [ ] Add README for analytics module

### Performance
- [ ] Implement virtualization for large lists
- [ ] Optimize chart rendering
- [ ] Code splitting for analytics pages
- [ ] Image optimization for asset previews

### Accessibility
- [ ] ARIA labels for interactive elements
- [ ] Keyboard navigation support
- [ ] Screen reader announcements
- [ ] Color contrast compliance
- [ ] Focus management

---

## Next Steps

1. ✅ Implement UI components from this guide
2. ✅ Read **Analytics Data Collection Guide** for event tracking
3. Test with real brand data
4. Gather user feedback
5. Iterate on visualizations and UX
6. Plan Phase 2 features:
   - Real-time updates
   - Advanced filtering
   - Custom reports
   - Predictive analytics

---

**Questions or Issues?**  
Contact the backend team or refer to complete implementation docs:
- `/docs/BRAND_ANALYTICS_IMPLEMENTATION_COMPLETE.md`
- `/docs/BRAND_ANALYTICS_QUICK_REFERENCE.md`
