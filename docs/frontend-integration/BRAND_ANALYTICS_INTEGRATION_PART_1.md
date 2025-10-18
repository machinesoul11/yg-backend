# 🔒 Brand Analytics Frontend Integration Guide - Part 1
## Campaign Analytics & ROI Analysis

**Module**: Brand Analytics  
**Classification**: 🔒 **ADMIN ONLY** (Brand owners, team members with permissions, platform admins)  
**Last Updated**: October 17, 2025  
**Backend Version**: 1.0.0

---

## Table of Contents

1. [Overview](#overview)
2. [Campaign Analytics API](#campaign-analytics-api)
3. [ROI Analysis API](#roi-analysis-api)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Authentication & Authorization](#authentication--authorization)
6. [Error Handling](#error-handling)
7. [Caching Strategy](#caching-strategy)
8. [Frontend Implementation Guide](#frontend-implementation-guide)

---

## Overview

The Brand Analytics module provides comprehensive performance tracking and ROI analysis for brands using the YesGoddess platform. Part 1 covers Campaign Analytics and ROI Analysis endpoints.

### Key Features
- 📊 Campaign performance tracking (impressions, engagement, conversions)
- 💰 ROI calculation with investment and returns breakdown
- 🎯 Cost per click/conversion metrics
- 📈 Timeline analysis with configurable granularity
- 🔝 Top performer identification
- 💾 Redis caching for fast dashboard loads

### Authentication Requirements
All endpoints require JWT authentication. Access is restricted to:
- Brand owners (user who created the brand)
- Team members with `view_analytics` or `admin` permission
- Platform admins (unrestricted access)

---

## Campaign Analytics API

### Endpoint: `trpc.brandAnalytics.getCampaignAnalytics`

**Purpose**: Retrieve comprehensive campaign performance metrics including ROI, engagement rates, and conversion tracking.

**tRPC Call Pattern**:
```typescript
import { trpc } from '@/lib/trpc';

const { data, isLoading, error } = trpc.brandAnalytics.getCampaignAnalytics.useQuery({
  id: 'brand_clxxx123456789',
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-12-31T23:59:59Z',
  status: 'ACTIVE',
  sortBy: 'roi',
  sortOrder: 'desc',
  limit: 20,
  offset: 0,
});
```

### Request Schema

```typescript
interface GetCampaignAnalyticsInput {
  // Required
  id: string; // Brand CUID (format: starts with lowercase letter, alphanumeric)
  
  // Optional - Date Range
  startDate?: string; // ISO 8601 datetime string (default: 90 days ago)
  endDate?: string;   // ISO 8601 datetime string (default: now)
  
  // Optional - Filtering
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  
  // Optional - Sorting
  sortBy?: 'roi' | 'conversions' | 'spent' | 'startDate' | 'name';
  sortOrder?: 'asc' | 'desc'; // Default: 'desc'
  
  // Optional - Pagination
  limit?: number;  // Range: 1-100, default: 20
  offset?: number; // Default: 0
}
```

### Response Schema

```typescript
interface CampaignAnalyticsResponse {
  brandId: string;
  dateRange: {
    start: string; // ISO 8601
    end: string;   // ISO 8601
  };
  
  summary: {
    totalCampaigns: number;
    activeCampaigns: number;
    completedCampaigns: number;
    totalBudgetCents: number;        // All amounts in cents
    totalSpentCents: number;
    avgCampaignBudgetCents: number;
    totalImpressions: number;
    totalConversions: number;
    overallROI: number;              // Percentage (e.g., 125.5 = 125.5%)
  };
  
  campaigns: CampaignPerformanceMetrics[];
  
  topPerformingCampaigns: Array<{
    campaignId: string;
    campaignName: string;
    roi: number;              // Percentage
    conversionRate: number;   // Percentage
  }>;
}

interface CampaignPerformanceMetrics {
  campaignId: string;
  campaignName: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  startDate: string;    // ISO 8601
  endDate: string | null;
  
  // Financial Metrics
  budgetCents: number;
  spentCents: number;
  
  // Performance Metrics
  impressions: number;
  reach: number;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    total: number;
    rate: number;    // Percentage (engagement/impressions * 100)
  };
  clicks: number;
  conversions: number;
  
  // Calculated Metrics
  clickThroughRate: number;     // Percentage (clicks/impressions * 100)
  conversionRate: number;       // Percentage (conversions/clicks * 100)
  costPerClick: number;         // In cents
  costPerConversion: number;    // In cents
  roi: number;                  // Percentage
  
  // Asset Metrics
  activeLicenses: number;
  uniqueAssets: number;
}
```

### Query Parameters Details

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| `id` | string | ✅ Yes | - | Must be valid CUID | Brand identifier |
| `startDate` | string | ❌ No | 90 days ago | ISO 8601 datetime | Filter campaigns created after this date |
| `endDate` | string | ❌ No | Now | ISO 8601 datetime | Filter campaigns created before this date |
| `status` | enum | ❌ No | - | One of: DRAFT, ACTIVE, PAUSED, COMPLETED, CANCELLED | Filter by campaign status |
| `sortBy` | enum | ❌ No | `'startDate'` | One of: roi, conversions, spent, startDate, name | Sort campaigns by this field |
| `sortOrder` | enum | ❌ No | `'desc'` | One of: asc, desc | Sort direction |
| `limit` | number | ❌ No | 20 | 1-100 (inclusive) | Number of campaigns to return |
| `offset` | number | ❌ No | 0 | >= 0 | Pagination offset |

### Business Logic & Calculations

#### ROI Calculation
```typescript
// Backend formula:
const roi = investment > 0 
  ? ((returns - investment) / investment) * 100 
  : 0;

// Example:
// Investment: $5,000 (500000 cents)
// Returns: $8,000 (800000 cents)
// ROI: ((800000 - 500000) / 500000) * 100 = 60%
```

#### Conversion Value Estimation
The backend uses a simplified conversion value of **$100 per conversion** for ROI calculations:
```typescript
// Backend logic:
const estimatedConversionValue = conversions * 10000; // $100 in cents
const totalReturns = directRevenueCents + estimatedConversionValue;
```

⚠️ **Frontend Note**: When displaying ROI, clarify to users that conversion values are estimated. Consider adding a tooltip or disclaimer.

#### Engagement Rate
```typescript
const engagementRate = impressions > 0
  ? (totalEngagement / impressions) * 100
  : 0;

// Where totalEngagement = likes + comments + shares + saves
```

#### Click-Through Rate (CTR)
```typescript
const ctr = impressions > 0
  ? (clicks / impressions) * 100
  : 0;
```

#### Conversion Rate
```typescript
const conversionRate = clicks > 0
  ? (conversions / clicks) * 100
  : 0;
```

### Example Response

```json
{
  "brandId": "brand_clxxx123456789",
  "dateRange": {
    "start": "2024-01-01T00:00:00.000Z",
    "end": "2024-12-31T23:59:59.999Z"
  },
  "summary": {
    "totalCampaigns": 12,
    "activeCampaigns": 5,
    "completedCampaigns": 7,
    "totalBudgetCents": 5000000,
    "totalSpentCents": 4250000,
    "avgCampaignBudgetCents": 416667,
    "totalImpressions": 1250000,
    "totalConversions": 850,
    "overallROI": 145.5
  },
  "campaigns": [
    {
      "campaignId": "project_abc123",
      "campaignName": "Spring 2024 Collection",
      "status": "COMPLETED",
      "startDate": "2024-03-01T00:00:00.000Z",
      "endDate": "2024-05-31T23:59:59.999Z",
      "budgetCents": 750000,
      "spentCents": 720000,
      "impressions": 250000,
      "reach": 180000,
      "engagement": {
        "likes": 12500,
        "comments": 3200,
        "shares": 1800,
        "saves": 4500,
        "total": 22000,
        "rate": 8.8
      },
      "clicks": 8500,
      "conversions": 125,
      "clickThroughRate": 3.4,
      "conversionRate": 1.47,
      "costPerClick": 85,
      "costPerConversion": 5760,
      "roi": 185.2,
      "activeLicenses": 8,
      "uniqueAssets": 15
    }
  ],
  "topPerformingCampaigns": [
    {
      "campaignId": "project_abc123",
      "campaignName": "Spring 2024 Collection",
      "roi": 185.2,
      "conversionRate": 1.47
    }
  ]
}
```

---

## ROI Analysis API

### Endpoint: `trpc.brandAnalytics.getROIAnalysis`

**Purpose**: Detailed return on investment analysis with investment breakdown, returns calculation, and timeline visualization.

**tRPC Call Pattern**:
```typescript
const { data, isLoading, error } = trpc.brandAnalytics.getROIAnalysis.useQuery({
  id: 'brand_clxxx123456789',
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-12-31T23:59:59Z',
  granularity: 'month',
  includeCampaignBreakdown: true,
  compareWithIndustry: false,
});
```

### Request Schema

```typescript
interface GetROIAnalysisInput {
  // Required
  id: string; // Brand CUID
  
  // Optional - Date Range
  startDate?: string; // ISO 8601 datetime (default: 365 days ago / 1 year)
  endDate?: string;   // ISO 8601 datetime (default: now)
  
  // Optional - Configuration
  granularity?: 'day' | 'week' | 'month' | 'quarter'; // Default: 'month'
  includeCampaignBreakdown?: boolean; // Default: true
  compareWithIndustry?: boolean;      // Default: false (not yet implemented)
}
```

### Response Schema

```typescript
interface ROIAnalysisResponse {
  brandId: string;
  dateRange: {
    start: string; // ISO 8601
    end: string;   // ISO 8601
  };
  
  totalInvestment: {
    totalCents: number;
    breakdown: ROIBreakdown[];
  };
  
  totalReturns: {
    totalCents: number;
    breakdown: ROIBreakdown[];
  };
  
  netProfit: {
    amountCents: number;
    margin: number; // Percentage (net profit / total returns * 100)
  };
  
  roi: {
    percentage: number;  // ROI as percentage
    multiplier: number;  // Returns / Investment (e.g., 2.5x)
  };
  
  metrics: {
    customerAcquisitionCostCents: number; // Total investment / conversions
    averageOrderValueCents: number;       // Total revenue / conversions
    returnOnAdSpendCents: number;         // (Revenue / Investment) * 100
  };
  
  timeline: Array<{
    period: string;           // ISO 8601 date or date range
    investmentCents: number;
    returnsCents: number;
    roiPercentage: number;
  }>;
  
  campaignComparison: Array<{
    campaignId: string;
    campaignName: string;
    investmentCents: number;
    returnsCents: number;
    roiPercentage: number;
  }>;
}

interface ROIBreakdown {
  category: string;     // e.g., "License Fees", "Platform Fees", "Direct Revenue"
  amountCents: number;
  percentage: number;   // Percentage of total
}
```

### Query Parameters Details

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| `id` | string | ✅ Yes | - | Must be valid CUID | Brand identifier |
| `startDate` | string | ❌ No | 365 days ago | ISO 8601 datetime | Analysis period start |
| `endDate` | string | ❌ No | Now | ISO 8601 datetime | Analysis period end |
| `granularity` | enum | ❌ No | `'month'` | One of: day, week, month, quarter | Timeline data granularity |
| `includeCampaignBreakdown` | boolean | ❌ No | `true` | - | Include per-campaign ROI comparison |
| `compareWithIndustry` | boolean | ❌ No | `false` | - | ⚠️ Not yet implemented |

### Business Logic & Calculations

#### Total Investment
```typescript
// License fees paid to creators
const licenseFees = sum(all_licenses.feeCents);

// Platform fees (if applicable)
const platformFees = sum(payments.where(type='PLATFORM_FEE').amount);

const totalInvestment = licenseFees + platformFees;
```

#### Total Returns
```typescript
// Direct revenue from metrics
const directRevenue = sum(dailyMetrics.revenueCents);

// Estimated conversion value ($100 per conversion)
const conversionValue = sum(dailyMetrics.conversions) * 10000;

const totalReturns = directRevenue + conversionValue;
```

#### Net Profit & Margin
```typescript
const netProfit = totalReturns - totalInvestment;
const netProfitMargin = totalReturns > 0 
  ? (netProfit / totalReturns) * 100 
  : 0;
```

#### ROI Metrics
```typescript
// ROI Percentage
const roiPercentage = totalInvestment > 0
  ? (netProfit / totalInvestment) * 100
  : 0;

// ROI Multiplier
const roiMultiplier = totalInvestment > 0
  ? totalReturns / totalInvestment
  : 0;

// Customer Acquisition Cost (CAC)
const cac = totalConversions > 0
  ? totalInvestment / totalConversions
  : 0;

// Average Order Value (AOV)
const aov = totalConversions > 0
  ? totalRevenue / totalConversions
  : 0;

// Return on Ad Spend (ROAS)
const roas = totalInvestment > 0
  ? (totalRevenue / totalInvestment) * 100
  : 0;
```

### Example Response

```json
{
  "brandId": "brand_clxxx123456789",
  "dateRange": {
    "start": "2024-01-01T00:00:00.000Z",
    "end": "2024-12-31T23:59:59.999Z"
  },
  "totalInvestment": {
    "totalCents": 4250000,
    "breakdown": [
      {
        "category": "License Fees",
        "amountCents": 3800000,
        "percentage": 89.4
      },
      {
        "category": "Platform Fees",
        "amountCents": 450000,
        "percentage": 10.6
      }
    ]
  },
  "totalReturns": {
    "totalCents": 10350000,
    "breakdown": [
      {
        "category": "Direct Revenue",
        "amountCents": 9500000,
        "percentage": 91.8
      },
      {
        "category": "Estimated Conversion Value",
        "amountCents": 850000,
        "percentage": 8.2
      }
    ]
  },
  "netProfit": {
    "amountCents": 6100000,
    "margin": 58.9
  },
  "roi": {
    "percentage": 143.5,
    "multiplier": 2.435
  },
  "metrics": {
    "customerAcquisitionCostCents": 5000,
    "averageOrderValueCents": 12176,
    "returnOnAdSpendCents": 223
  },
  "timeline": [
    {
      "period": "2024-01",
      "investmentCents": 320000,
      "returnsCents": 780000,
      "roiPercentage": 143.75
    }
  ],
  "campaignComparison": [
    {
      "campaignId": "project_abc123",
      "campaignName": "Spring 2024 Collection",
      "investmentCents": 720000,
      "returnsCents": 2053000,
      "roiPercentage": 185.14
    }
  ]
}
```

---

## TypeScript Type Definitions

Copy these type definitions into your frontend codebase (e.g., `src/types/brand-analytics.ts`):

```typescript
/**
 * Brand Analytics API Type Definitions
 * Generated from yg-backend schema
 * Last updated: October 17, 2025
 */

// ===========================
// Campaign Analytics Types
// ===========================

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type CampaignSortBy = 'roi' | 'conversions' | 'spent' | 'startDate' | 'name';
export type SortOrder = 'asc' | 'desc';

export interface GetCampaignAnalyticsInput {
  id: string;
  startDate?: string;
  endDate?: string;
  status?: CampaignStatus;
  sortBy?: CampaignSortBy;
  sortOrder?: SortOrder;
  limit?: number;
  offset?: number;
}

export interface CampaignEngagement {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  total: number;
  rate: number;
}

export interface CampaignPerformanceMetrics {
  campaignId: string;
  campaignName: string;
  status: CampaignStatus;
  startDate: string;
  endDate: string | null;
  budgetCents: number;
  spentCents: number;
  impressions: number;
  reach: number;
  engagement: CampaignEngagement;
  clicks: number;
  conversions: number;
  clickThroughRate: number;
  conversionRate: number;
  costPerClick: number;
  costPerConversion: number;
  roi: number;
  activeLicenses: number;
  uniqueAssets: number;
}

export interface CampaignAnalyticsSummary {
  totalCampaigns: number;
  activeCampaigns: number;
  completedCampaigns: number;
  totalBudgetCents: number;
  totalSpentCents: number;
  avgCampaignBudgetCents: number;
  totalImpressions: number;
  totalConversions: number;
  overallROI: number;
}

export interface TopPerformingCampaign {
  campaignId: string;
  campaignName: string;
  roi: number;
  conversionRate: number;
}

export interface CampaignAnalyticsResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: CampaignAnalyticsSummary;
  campaigns: CampaignPerformanceMetrics[];
  topPerformingCampaigns: TopPerformingCampaign[];
}

// ===========================
// ROI Analysis Types
// ===========================

export type ROIGranularity = 'day' | 'week' | 'month' | 'quarter';

export interface GetROIAnalysisInput {
  id: string;
  startDate?: string;
  endDate?: string;
  granularity?: ROIGranularity;
  includeCampaignBreakdown?: boolean;
  compareWithIndustry?: boolean;
}

export interface ROIBreakdown {
  category: string;
  amountCents: number;
  percentage: number;
}

export interface ROIMetrics {
  customerAcquisitionCostCents: number;
  averageOrderValueCents: number;
  returnOnAdSpendCents: number;
}

export interface ROITimelinePoint {
  period: string;
  investmentCents: number;
  returnsCents: number;
  roiPercentage: number;
}

export interface ROICampaignComparison {
  campaignId: string;
  campaignName: string;
  investmentCents: number;
  returnsCents: number;
  roiPercentage: number;
}

export interface ROIAnalysisResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  totalInvestment: {
    totalCents: number;
    breakdown: ROIBreakdown[];
  };
  totalReturns: {
    totalCents: number;
    breakdown: ROIBreakdown[];
  };
  netProfit: {
    amountCents: number;
    margin: number;
  };
  roi: {
    percentage: number;
    multiplier: number;
  };
  metrics: ROIMetrics;
  timeline: ROITimelinePoint[];
  campaignComparison: ROICampaignComparison[];
}

// ===========================
// Utility Types
// ===========================

export interface DateRange {
  start: string;
  end: string;
}

// tRPC Response Wrapper
export interface TRPCResponse<T> {
  data: T;
}
```

---

## Authentication & Authorization

### JWT Token Requirements

All endpoints require a valid JWT token in the `Authorization` header:

```typescript
// Automatically handled by tRPC client
import { createTRPCReact, httpBatchLink } from '@trpc/react-query';
import type { AppRouter } from 'yg-backend';

export const trpc = createTRPCReact<AppRouter>();

// In _app.tsx or layout
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'https://ops.yesgoddess.agency/api/trpc',
      headers: async () => {
        const token = await getToken(); // Your auth function
        return {
          authorization: `Bearer ${token}`,
        };
      },
    }),
  ],
});
```

### Permission Levels

#### 1. Brand Owners
- Can access analytics for brands they created
- Determined by: `brand.userId === session.user.id`

#### 2. Team Members
- Must have `view_analytics` OR `admin` permission in brand's `teamMembers` array
- Check performed server-side against `brand.teamMembers` JSONB field

Example brand team structure:
```typescript
{
  teamMembers: [
    {
      userId: "user_xyz789",
      role: "Marketing Manager",
      permissions: ["view_analytics", "create_campaigns"],
      addedAt: "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### 3. Platform Admins
- Users with `role: 'ADMIN'` in session
- Unrestricted access to all brand analytics
- Can use `adminGet*` endpoints (bypass brand ownership checks)

### Access Verification Flow

```typescript
// Pseudo-code of backend authorization
async function verifyBrandAccess(userId: string, userRole: string, brandId: string) {
  // Admins bypass all checks
  if (userRole === 'ADMIN') return true;
  
  // Fetch brand
  const brand = await prisma.brand.findUnique({
    where: { id: brandId, deletedAt: null }
  });
  
  if (!brand) throw new TRPCError({ code: 'NOT_FOUND' });
  
  // Check ownership
  if (brand.userId === userId) return true;
  
  // Check team membership
  const teamMembers = brand.teamMembers || [];
  const member = teamMembers.find(tm => tm.userId === userId);
  
  if (member) {
    const permissions = member.permissions || [];
    if (permissions.includes('view_analytics') || permissions.includes('admin')) {
      return true;
    }
  }
  
  // Access denied
  throw new TRPCError({ 
    code: 'FORBIDDEN',
    message: 'You do not have permission to view analytics for this brand'
  });
}
```

---

## Error Handling

### Error Codes

All errors follow the tRPC error format:

```typescript
interface TRPCError {
  message: string;
  code: TRPCErrorCode;
  data?: {
    code?: string;
    httpStatus?: number;
    path?: string;
    stack?: string; // Only in development
  };
}
```

### Campaign Analytics Errors

| HTTP Status | tRPC Code | Message | When It Occurs | User-Facing Message |
|-------------|-----------|---------|----------------|---------------------|
| 401 | `UNAUTHORIZED` | "Not authenticated" | Missing or invalid JWT token | "Please log in to view analytics" |
| 403 | `FORBIDDEN` | "You do not have permission to view analytics for this brand" | User lacks brand access | "You don't have permission to view this brand's analytics. Contact the brand owner to request access." |
| 404 | `NOT_FOUND` | "Brand not found" | Brand ID doesn't exist or is deleted | "This brand could not be found. It may have been deleted." |
| 400 | `BAD_REQUEST` | Various Zod validation errors | Invalid query parameters | Display specific field error (see Validation Errors below) |
| 500 | `INTERNAL_SERVER_ERROR` | "Failed to fetch campaign analytics" | Database or server error | "Something went wrong loading analytics. Please try again." |

### ROI Analysis Errors

Same error codes as Campaign Analytics, with message variations:
- `INTERNAL_SERVER_ERROR`: "Failed to calculate ROI analysis"

### Validation Errors

Zod validation errors have structured data:

```typescript
// Example validation error response
{
  "code": "BAD_REQUEST",
  "message": "Validation error",
  "data": {
    "zodError": {
      "fieldErrors": {
        "id": ["Invalid brand ID format"],
        "limit": ["Number must be less than or equal to 100"],
        "startDate": ["Invalid datetime format"]
      }
    }
  }
}
```

### Frontend Error Handling Pattern

```typescript
import { TRPCClientError } from '@trpc/client';

function CampaignAnalyticsDashboard({ brandId }: { brandId: string }) {
  const { data, error, isLoading } = trpc.brandAnalytics.getCampaignAnalytics.useQuery({
    id: brandId,
  });
  
  if (isLoading) {
    return <Spinner />;
  }
  
  if (error) {
    // Type-safe error handling
    if (error.data?.code === 'FORBIDDEN') {
      return (
        <ErrorState
          title="Access Denied"
          message="You don't have permission to view this brand's analytics."
          action={<Button>Request Access</Button>}
        />
      );
    }
    
    if (error.data?.code === 'NOT_FOUND') {
      return (
        <ErrorState
          title="Brand Not Found"
          message="This brand doesn't exist or has been deleted."
          action={<Button href="/brands">View All Brands</Button>}
        />
      );
    }
    
    // Generic error
    return (
      <ErrorState
        title="Error Loading Analytics"
        message="Something went wrong. Please try refreshing the page."
        action={<Button onClick={() => window.location.reload()}>Retry</Button>}
      />
    );
  }
  
  return <AnalyticsDashboard data={data.data} />;
}
```

### Handling Stale Data on Error

```typescript
// Keep showing old data while refetching after error
const { data, error, isLoading, refetch } = trpc.brandAnalytics.getCampaignAnalytics.useQuery(
  { id: brandId },
  {
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  }
);

if (error && !data) {
  // No cached data, show error state
  return <ErrorState />;
}

if (error && data) {
  // Show cached data with error banner
  return (
    <>
      <Banner type="warning">
        Unable to refresh data. Showing cached results.
        <Button onClick={() => refetch()}>Retry</Button>
      </Banner>
      <AnalyticsDashboard data={data.data} />
    </>
  );
}
```

---

## Caching Strategy

### Backend Caching (Redis)

All analytics endpoints implement Redis caching:

| Endpoint | Cache TTL | Cache Key Pattern |
|----------|-----------|-------------------|
| Campaign Analytics | **15 minutes** | `brand:{id}:campaigns:{start}:{end}:{status}:{sortBy}:{sortOrder}:{limit}:{offset}` |
| ROI Analysis | **30 minutes** | `brand:{id}:roi:{start}:{end}:{granularity}` |

**Cache Invalidation**: Currently, caches expire based on TTL. Future implementation may invalidate on:
- New license creation
- Campaign status changes
- Payment completion

### Frontend Caching (React Query)

Recommended React Query configuration:

```typescript
import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache analytics data for 10 minutes (backend cache is 15-30 min)
      staleTime: 10 * 60 * 1000,
      
      // Keep cache for 20 minutes (longer than staleTime)
      cacheTime: 20 * 60 * 1000,
      
      // Don't refetch on window focus for analytics (too expensive)
      refetchOnWindowFocus: false,
      
      // Refetch on mount only if data is stale
      refetchOnMount: 'always',
      
      // Retry failed requests (network issues, rate limits)
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});
```

### Prefetching Strategy

Prefetch analytics when user navigates to brands list:

```typescript
import { useRouter } from 'next/router';
import { useEffect } from 'react';

function BrandsList({ brands }: { brands: Brand[] }) {
  const router = useRouter();
  const utils = trpc.useContext();
  
  // Prefetch analytics when hovering over brand card
  const handlePrefetch = (brandId: string) => {
    utils.brandAnalytics.getCampaignAnalytics.prefetch({
      id: brandId,
    });
  };
  
  return (
    <div>
      {brands.map((brand) => (
        <BrandCard
          key={brand.id}
          brand={brand}
          onMouseEnter={() => handlePrefetch(brand.id)}
          onClick={() => router.push(`/brands/${brand.id}/analytics`)}
        />
      ))}
    </div>
  );
}
```

### Manual Cache Invalidation

Invalidate cache after mutations that affect analytics:

```typescript
function CreateCampaignButton({ brandId }: { brandId: string }) {
  const utils = trpc.useContext();
  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: () => {
      // Invalidate brand analytics cache
      utils.brandAnalytics.getCampaignAnalytics.invalidate({ id: brandId });
      utils.brandAnalytics.getROIAnalysis.invalidate({ id: brandId });
    },
  });
  
  return <Button onClick={() => createCampaign.mutate({...})}>Create Campaign</Button>;
}
```

---

## Frontend Implementation Guide

### Step 1: Install Dependencies

```bash
npm install @trpc/client @trpc/server @trpc/react-query @tanstack/react-query
npm install zod  # If not already installed
npm install date-fns  # For date formatting
```

### Step 2: Set Up tRPC Client

```typescript
// src/lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from 'yg-backend'; // Import from backend types

export const trpc = createTRPCReact<AppRouter>();
```

```typescript
// src/pages/_app.tsx (or app/layout.tsx for App Router)
import { trpc } from '@/lib/trpc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import superjson from 'superjson';

function MyApp({ Component, pageProps }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10 * 60 * 1000,
        cacheTime: 20 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));
  
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: process.env.NEXT_PUBLIC_BACKEND_URL + '/api/trpc',
          transformer: superjson,
          headers: async () => {
            const token = await getAuthToken(); // Your auth implementation
            return {
              authorization: token ? `Bearer ${token}` : '',
            };
          },
        }),
      ],
    })
  );
  
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Component {...pageProps} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Step 3: Create Utility Functions

```typescript
// src/utils/analytics-formatting.ts
import { format } from 'date-fns';

/**
 * Format cents to currency string
 */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format large numbers with K/M suffixes
 */
export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

/**
 * Format ISO date to readable string
 */
export function formatDate(isoString: string): string {
  return format(new Date(isoString), 'MMM d, yyyy');
}

/**
 * Get ROI color based on value
 */
export function getROIColor(roi: number): string {
  if (roi >= 100) return 'text-green-600';
  if (roi >= 0) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Calculate date range for presets
 */
export function getDateRangePreset(preset: '7d' | '30d' | '90d' | '1y' | 'ytd'): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const end = now.toISOString();
  
  let start: Date;
  switch (preset) {
    case '7d':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case 'ytd':
      start = new Date(now.getFullYear(), 0, 1); // Jan 1st of current year
      break;
  }
  
  return {
    startDate: start!.toISOString(),
    endDate: end,
  };
}
```

### Step 4: Build Campaign Analytics Component

```typescript
// src/components/analytics/CampaignAnalyticsDashboard.tsx
import { trpc } from '@/lib/trpc';
import { formatCurrency, formatPercentage, formatCompactNumber, getROIColor } from '@/utils/analytics-formatting';
import { useState } from 'react';
import type { CampaignStatus, CampaignSortBy } from '@/types/brand-analytics';

interface Props {
  brandId: string;
}

export function CampaignAnalyticsDashboard({ brandId }: Props) {
  const [filters, setFilters] = useState({
    status: undefined as CampaignStatus | undefined,
    sortBy: 'roi' as CampaignSortBy,
    sortOrder: 'desc' as 'asc' | 'desc',
    limit: 20,
    offset: 0,
  });
  
  const { data, isLoading, error } = trpc.brandAnalytics.getCampaignAnalytics.useQuery({
    id: brandId,
    ...filters,
  });
  
  if (isLoading) return <AnalyticsLoadingSkeleton />;
  if (error) return <AnalyticsErrorState error={error} />;
  if (!data) return null;
  
  const { summary, campaigns, topPerformingCampaigns } = data.data;
  
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Campaigns"
          value={summary.totalCampaigns}
          subtitle={`${summary.activeCampaigns} active`}
        />
        <MetricCard
          label="Total Spent"
          value={formatCurrency(summary.totalSpentCents)}
          subtitle={`of ${formatCurrency(summary.totalBudgetCents)} budgeted`}
        />
        <MetricCard
          label="Total Impressions"
          value={formatCompactNumber(summary.totalImpressions)}
        />
        <MetricCard
          label="Overall ROI"
          value={formatPercentage(summary.overallROI)}
          valueClassName={getROIColor(summary.overallROI)}
        />
      </div>
      
      {/* Top Performers */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Top Performing Campaigns</h3>
        <div className="space-y-3">
          {topPerformingCampaigns.map((campaign) => (
            <div key={campaign.campaignId} className="flex justify-between items-center">
              <span className="font-medium">{campaign.campaignName}</span>
              <div className="flex gap-4">
                <span className={getROIColor(campaign.roi)}>
                  {formatPercentage(campaign.roi)} ROI
                </span>
                <span className="text-gray-600">
                  {formatPercentage(campaign.conversionRate)} CVR
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Campaigns Table */}
      <CampaignsTable
        campaigns={campaigns}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
        onSort={(sortBy, sortOrder) => setFilters({ ...filters, sortBy, sortOrder, offset: 0 })}
      />
      
      {/* Pagination */}
      <Pagination
        currentPage={Math.floor(filters.offset / filters.limit) + 1}
        totalItems={summary.totalCampaigns}
        itemsPerPage={filters.limit}
        onPageChange={(page) => setFilters({ ...filters, offset: (page - 1) * filters.limit })}
      />
    </div>
  );
}
```

### Step 5: Build ROI Analysis Component

```typescript
// src/components/analytics/ROIAnalysisChart.tsx
import { trpc } from '@/lib/trpc';
import { formatCurrency, formatPercentage } from '@/utils/analytics-formatting';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Props {
  brandId: string;
  granularity?: 'month' | 'quarter';
}

export function ROIAnalysisChart({ brandId, granularity = 'month' }: Props) {
  const { data, isLoading } = trpc.brandAnalytics.getROIAnalysis.useQuery({
    id: brandId,
    granularity,
    includeCampaignBreakdown: true,
  });
  
  if (isLoading) return <ChartSkeleton />;
  if (!data) return null;
  
  const { totalInvestment, totalReturns, netProfit, roi, metrics, timeline } = data.data;
  
  // Transform timeline data for chart
  const chartData = timeline.map((point) => ({
    period: point.period.substring(0, 7), // YYYY-MM format
    investment: point.investmentCents / 100,
    returns: point.returnsCents / 100,
    roi: point.roiPercentage,
  }));
  
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Total Investment"
          value={formatCurrency(totalInvestment.totalCents)}
        />
        <MetricCard
          label="Total Returns"
          value={formatCurrency(totalReturns.totalCents)}
          subtitle={`${formatPercentage(netProfit.margin)} margin`}
        />
        <MetricCard
          label="ROI"
          value={formatPercentage(roi.percentage)}
          subtitle={`${roi.multiplier.toFixed(2)}x multiplier`}
          valueClassName={getROIColor(roi.percentage)}
        />
      </div>
      
      {/* Advanced Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="CAC"
          value={formatCurrency(metrics.customerAcquisitionCostCents)}
          tooltip="Customer Acquisition Cost"
        />
        <MetricCard
          label="AOV"
          value={formatCurrency(metrics.averageOrderValueCents)}
          tooltip="Average Order Value"
        />
        <MetricCard
          label="ROAS"
          value={formatPercentage(metrics.returnOnAdSpendCents)}
          tooltip="Return on Ad Spend"
        />
      </div>
      
      {/* Timeline Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">ROI Timeline</h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis yAxisId="left" label={{ value: 'Amount ($)', angle: -90, position: 'insideLeft' }} />
            <YAxis yAxisId="right" orientation="right" label={{ value: 'ROI (%)', angle: 90, position: 'insideRight' }} />
            <Tooltip 
              formatter={(value: number, name: string) => {
                if (name === 'roi') return [formatPercentage(value), 'ROI'];
                return [formatCurrency(value * 100), name === 'investment' ? 'Investment' : 'Returns'];
              }}
            />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="investment" stroke="#8884d8" name="Investment" />
            <Line yAxisId="left" type="monotone" dataKey="returns" stroke="#82ca9d" name="Returns" />
            <Line yAxisId="right" type="monotone" dataKey="roi" stroke="#ff7300" name="ROI %" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Investment & Returns Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BreakdownCard
          title="Investment Breakdown"
          total={totalInvestment.totalCents}
          items={totalInvestment.breakdown}
        />
        <BreakdownCard
          title="Returns Breakdown"
          total={totalReturns.totalCents}
          items={totalReturns.breakdown}
        />
      </div>
    </div>
  );
}
```

### Step 6: Add Loading and Error States

```typescript
// src/components/analytics/AnalyticsLoadingSkeleton.tsx
export function AnalyticsLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-lg" />
        ))}
      </div>
      <div className="h-64 bg-gray-200 rounded-lg" />
      <div className="h-96 bg-gray-200 rounded-lg" />
    </div>
  );
}

// src/components/analytics/AnalyticsErrorState.tsx
import { TRPCClientError } from '@trpc/client';

export function AnalyticsErrorState({ error }: { error: TRPCClientError<any> }) {
  const getErrorMessage = () => {
    if (error.data?.code === 'FORBIDDEN') {
      return {
        title: 'Access Denied',
        message: "You don't have permission to view this brand's analytics.",
        action: 'Contact the brand owner to request access.',
      };
    }
    
    if (error.data?.code === 'NOT_FOUND') {
      return {
        title: 'Brand Not Found',
        message: 'This brand doesn\'t exist or has been deleted.',
        action: null,
      };
    }
    
    return {
      title: 'Error Loading Analytics',
      message: 'Something went wrong. Please try refreshing the page.',
      action: 'Refresh',
    };
  };
  
  const { title, message, action } = getErrorMessage();
  
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <div className="text-red-500 text-5xl mb-4">⚠️</div>
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="text-gray-600 mb-6">{message}</p>
      {action && (
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {action}
        </button>
      )}
    </div>
  );
}
```

---

## Next Steps

After implementing Part 1:

1. ✅ Read **Part 2** for Creator Performance & Asset Usage endpoints
2. ✅ Read **Analytics Data Collection Guide** for event tracking
3. Build UI components for data visualization
4. Implement filters and date range pickers
5. Add export/download functionality
6. Set up error monitoring (Sentry, LogRocket)

---

**Questions or Issues?**  
Contact the backend team or refer to the complete implementation docs:
- `/docs/BRAND_ANALYTICS_IMPLEMENTATION_COMPLETE.md`
- `/docs/BRAND_ANALYTICS_QUICK_REFERENCE.md`
