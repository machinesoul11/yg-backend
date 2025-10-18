# Content Analytics API - Frontend Integration Guide

> **Classification:** 🔒 **ADMIN ONLY** - Internal operations and admin interface only  
> **Status:** ✅ Complete and Production-Ready  
> **Last Updated:** October 17, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Rate Limiting & Quotas](#rate-limiting--quotas)
8. [Caching Strategy](#caching-strategy)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)
10. [Testing & Debugging](#testing--debugging)

---

## Overview

The Content Analytics API provides platform-wide analytics for **administrators only** to monitor:
- **Asset uploads** - Trends, popular types, and storage metrics
- **License activity** - Active counts, renewal rates, and revenue
- **Project progress** - Completion rates, timelines, and budget metrics

### Architecture

- **Backend Base URL:** `https://ops.yesgoddess.agency` (production) or `http://localhost:3000` (development)
- **Authentication:** JWT Bearer tokens via Authorization header
- **Response Format:** JSON
- **Caching:** Redis-backed with 10-minute TTL
- **Performance:** All queries optimized with database indexes

### Key Characteristics

- ✅ **Admin-only access** - Requires `ADMIN` role
- ✅ **Date-bounded queries** - Max 2-year range, no future dates
- ✅ **Automatic caching** - 10-minute Redis cache for performance
- ✅ **Flexible granularity** - Daily, weekly, or monthly aggregation
- ✅ **Rich filtering** - By type, status, project, brand
- ✅ **Growth comparisons** - Automatic period-over-period comparisons

---

## API Endpoints

### 1. Platform Asset Analytics

**Endpoint:** `GET /api/analytics/platform/assets`

**Purpose:** Provides upload trends, popular asset types, storage metrics, and status breakdowns.

#### Request

**Headers:**
```typescript
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startDate` | string | ✅ Yes | - | Start date in `YYYY-MM-DD` format |
| `endDate` | string | ✅ Yes | - | End date in `YYYY-MM-DD` format |
| `granularity` | enum | ❌ No | `daily` | Time bucket: `daily`, `weekly`, `monthly` |
| `assetType` | enum | ❌ No | - | Filter by: `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT`, `THREE_D`, `OTHER` |
| `projectId` | string | ❌ No | - | Filter by specific project (CUID) |
| `status` | enum | ❌ No | - | Filter by: `DRAFT`, `PROCESSING`, `REVIEW`, `APPROVED`, `PUBLISHED`, `REJECTED`, `ARCHIVED` |

**Example Request:**
```bash
curl -X GET "https://ops.yesgoddess.agency/api/analytics/platform/assets?startDate=2024-10-01&endDate=2024-10-31&granularity=weekly" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### Response

**Success (200):**
```json
{
  "dateRange": {
    "start": "2024-10-01T00:00:00.000Z",
    "end": "2024-10-31T23:59:59.999Z"
  },
  "granularity": "weekly",
  "uploadTrends": [
    {
      "date": "2024-10-01",
      "count": 45,
      "byType": {
        "IMAGE": 20,
        "VIDEO": 15,
        "AUDIO": 10
      }
    },
    {
      "date": "2024-10-08",
      "count": 52,
      "byType": {
        "IMAGE": 25,
        "VIDEO": 18,
        "AUDIO": 9
      }
    }
  ],
  "popularTypes": [
    {
      "type": "IMAGE",
      "count": 120,
      "percentage": 45.5,
      "averageFileSizeBytes": 2048576,
      "totalStorageBytes": 245923200,
      "topMimeTypes": [
        {
          "mimeType": "image/jpeg",
          "count": 80
        },
        {
          "mimeType": "image/png",
          "count": 40
        }
      ]
    },
    {
      "type": "VIDEO",
      "count": 85,
      "percentage": 32.2,
      "averageFileSizeBytes": 15728640,
      "totalStorageBytes": 1336934400,
      "topMimeTypes": [
        {
          "mimeType": "video/mp4",
          "count": 65
        },
        {
          "mimeType": "video/quicktime",
          "count": 20
        }
      ]
    }
  ],
  "summary": {
    "totalUploads": 264,
    "growthRate": 12.5,
    "totalStorageBytes": 1073741824,
    "averageFileSizeBytes": 4067200,
    "uploadsByStatus": {
      "PUBLISHED": 200,
      "DRAFT": 30,
      "REVIEW": 20,
      "PROCESSING": 14
    }
  },
  "metadata": {
    "cached": false,
    "queryExecutionTimeMs": 145
  }
}
```

---

### 2. Platform License Analytics

**Endpoint:** `GET /api/analytics/platform/licenses`

**Purpose:** Provides active license counts, renewal rates, expiration forecasts, and revenue metrics.

#### Request

**Headers:**
```typescript
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startDate` | string | ✅ Yes | - | Start date in `YYYY-MM-DD` format |
| `endDate` | string | ✅ Yes | - | End date in `YYYY-MM-DD` format |
| `granularity` | enum | ❌ No | `daily` | Time bucket: `daily`, `weekly`, `monthly` |
| `licenseType` | enum | ❌ No | - | Filter by: `EXCLUSIVE`, `NON_EXCLUSIVE`, `EXCLUSIVE_TERRITORY` |
| `brandId` | string | ❌ No | - | Filter by specific brand (CUID) |
| `projectId` | string | ❌ No | - | Filter by specific project (CUID) |

**Example Request:**
```bash
curl -X GET "https://ops.yesgoddess.agency/api/analytics/platform/licenses?startDate=2024-10-01&endDate=2024-10-31&granularity=monthly" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### Response

**Success (200):**
```json
{
  "dateRange": {
    "start": "2024-10-01T00:00:00.000Z",
    "end": "2024-10-31T23:59:59.999Z"
  },
  "granularity": "monthly",
  "activeCount": 156,
  "statusBreakdown": [
    {
      "status": "ACTIVE",
      "count": 120,
      "percentage": 65.2
    },
    {
      "status": "EXPIRING_SOON",
      "count": 36,
      "percentage": 19.6
    },
    {
      "status": "EXPIRED",
      "count": 28,
      "percentage": 15.2
    }
  ],
  "renewalRates": [
    {
      "date": "2024-10-01",
      "totalExpired": 15,
      "renewed": 12,
      "renewalRate": 80.0,
      "earlyRenewals": 8,
      "lateRenewals": 4
    }
  ],
  "expirationForecast": [
    {
      "period": "Next 30 Days",
      "daysFromNow": 30,
      "expiringCount": 45,
      "licenses": [
        {
          "id": "clx123abc",
          "endDate": "2024-11-15T00:00:00.000Z",
          "type": "EXCLUSIVE",
          "feeCents": 500000,
          "autoRenew": true
        }
      ]
    },
    {
      "period": "31-60 Days",
      "daysFromNow": 60,
      "expiringCount": 28,
      "licenses": []
    },
    {
      "period": "61-90 Days",
      "daysFromNow": 90,
      "expiringCount": 19,
      "licenses": []
    }
  ],
  "revenueMetrics": {
    "totalRevenueCents": 15000000,
    "averageLicenseValueCents": 250000,
    "medianLicenseValueCents": 180000,
    "revenueByType": {
      "EXCLUSIVE": 9000000,
      "NON_EXCLUSIVE": 4500000,
      "EXCLUSIVE_TERRITORY": 1500000
    },
    "projectedAnnualRevenueCents": 180000000
  },
  "summary": {
    "totalLicenses": 184,
    "activePercentage": 84.8,
    "averageRenewalRate": 78.5,
    "averageLicenseDurationDays": 365,
    "autoRenewPercentage": 65.2,
    "comparisonToPreviousPeriod": {
      "activeLicensesChange": 8.5,
      "renewalRateChange": 2.3,
      "revenueChange": 12.8
    }
  },
  "metadata": {
    "cached": false,
    "queryExecutionTimeMs": 238
  }
}
```

---

### 3. Platform Project Analytics

**Endpoint:** `GET /api/analytics/platform/projects`

**Purpose:** Provides project completion rates, timeline metrics, budget utilization, and trend data.

#### Request

**Headers:**
```typescript
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startDate` | string | ✅ Yes | - | Start date in `YYYY-MM-DD` format |
| `endDate` | string | ✅ Yes | - | End date in `YYYY-MM-DD` format |
| `granularity` | enum | ❌ No | `daily` | Time bucket: `daily`, `weekly`, `monthly` |
| `projectType` | enum | ❌ No | - | Filter by: `CAMPAIGN`, `CONTENT`, `LICENSING` |
| `brandId` | string | ❌ No | - | Filter by specific brand (CUID) |
| `status` | enum | ❌ No | - | Filter by: `DRAFT`, `ACTIVE`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `ARCHIVED` |

**Example Request:**
```bash
curl -X GET "https://ops.yesgoddess.agency/api/analytics/platform/projects?startDate=2024-10-01&endDate=2024-10-31&granularity=weekly" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### Response

**Success (200):**
```json
{
  "dateRange": {
    "start": "2024-10-01T00:00:00.000Z",
    "end": "2024-10-31T23:59:59.999Z"
  },
  "granularity": "weekly",
  "completionRates": {
    "overall": 75.5,
    "onTime": 68.2,
    "late": 7.3,
    "early": 24.5,
    "byType": {
      "CAMPAIGN": 80.0,
      "CONTENT": 72.5,
      "LICENSING": 70.0
    },
    "timeline": [
      {
        "date": "2024-10-01",
        "completed": 12,
        "onTime": 10,
        "late": 2
      },
      {
        "date": "2024-10-08",
        "completed": 15,
        "onTime": 13,
        "late": 2
      }
    ]
  },
  "timelineMetrics": {
    "averageDurationDays": 45,
    "medianDurationDays": 38,
    "onTimePercentage": 68.2,
    "averageDelayDays": 8,
    "averageEarlyCompletionDays": 5,
    "byStatus": [
      {
        "status": "COMPLETED",
        "count": 85,
        "averageDurationDays": 42
      },
      {
        "status": "IN_PROGRESS",
        "count": 45,
        "averageDurationDays": 28
      }
    ]
  },
  "activeProjects": {
    "draft": 12,
    "active": 35,
    "inProgress": 45,
    "completed": 85,
    "cancelled": 8,
    "archived": 15,
    "byType": {
      "CAMPAIGN": 90,
      "CONTENT": 65,
      "LICENSING": 45
    }
  },
  "budgetMetrics": {
    "averageBudgetCents": 5000000,
    "medianBudgetCents": 3500000,
    "totalBudgetCents": 1000000000,
    "utilizationRate": 82.5,
    "overBudgetCount": 12,
    "underBudgetCount": 73,
    "byType": {
      "CAMPAIGN": {
        "averageBudgetCents": 7500000,
        "totalBudgetCents": 675000000
      },
      "CONTENT": {
        "averageBudgetCents": 3500000,
        "totalBudgetCents": 227500000
      },
      "LICENSING": {
        "averageBudgetCents": 2500000,
        "totalBudgetCents": 112500000
      }
    }
  },
  "trendData": [
    {
      "date": "2024-10-01",
      "created": 8,
      "completed": 12,
      "active": 130,
      "completionRate": 75.0
    },
    {
      "date": "2024-10-08",
      "created": 10,
      "completed": 15,
      "active": 125,
      "completionRate": 76.5
    }
  ],
  "summary": {
    "totalProjects": 200,
    "completionRate": 75.5,
    "averageAssetsPerProject": 15,
    "averageLicensesPerProject": 3,
    "averageTeamSize": 5,
    "comparisonToPreviousPeriod": {
      "projectsCreatedChange": 15.2,
      "completionRateChange": 3.5,
      "averageDurationChange": -8.2
    }
  },
  "metadata": {
    "cached": false,
    "queryExecutionTimeMs": 312
  }
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
// ============================================
// Shared Types
// ============================================

/**
 * Date range for analytics queries
 */
export interface DateRange {
  start: string; // ISO 8601 format
  end: string;   // ISO 8601 format
}

/**
 * Time granularity for aggregation
 */
export type Granularity = 'daily' | 'weekly' | 'monthly';

/**
 * Metadata attached to all analytics responses
 */
export interface AnalyticsMetadata {
  cached: boolean;
  cacheTimestamp?: string; // ISO 8601 format
  queryExecutionTimeMs?: number;
}

// ============================================
// Asset Analytics Types
// ============================================

/**
 * Asset type enum
 */
export enum AssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
  THREE_D = 'THREE_D',
  OTHER = 'OTHER',
}

/**
 * Asset status enum
 */
export enum AssetStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  REJECTED = 'REJECTED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Query parameters for asset analytics endpoint
 */
export interface AssetAnalyticsQuery {
  startDate: string;         // Required: YYYY-MM-DD
  endDate: string;           // Required: YYYY-MM-DD
  granularity?: Granularity; // Optional: defaults to 'daily'
  assetType?: AssetType;     // Optional filter
  projectId?: string;        // Optional filter (CUID)
  status?: AssetStatus;      // Optional filter
}

/**
 * Single data point in upload trends timeline
 */
export interface UploadTrendPoint {
  date: string; // YYYY-MM-DD format
  count: number;
  byType: Record<AssetType, number>;
}

/**
 * Popular asset type with detailed metrics
 */
export interface PopularAssetType {
  type: AssetType;
  count: number;
  percentage: number; // 0-100
  averageFileSizeBytes: number;
  totalStorageBytes: number;
  topMimeTypes: Array<{
    mimeType: string;
    count: number;
  }>;
}

/**
 * Asset analytics summary statistics
 */
export interface AssetAnalyticsSummary {
  totalUploads: number;
  growthRate: number; // Percentage change vs previous period
  totalStorageBytes: number;
  averageFileSizeBytes: number;
  uploadsByStatus: Record<AssetStatus, number>;
}

/**
 * Complete asset analytics response
 */
export interface AssetAnalytics {
  dateRange: DateRange;
  granularity: Granularity;
  uploadTrends: UploadTrendPoint[];
  popularTypes: PopularAssetType[];
  summary: AssetAnalyticsSummary;
  metadata: AnalyticsMetadata;
}

// ============================================
// License Analytics Types
// ============================================

/**
 * License type enum
 */
export enum LicenseType {
  EXCLUSIVE = 'EXCLUSIVE',
  NON_EXCLUSIVE = 'NON_EXCLUSIVE',
  EXCLUSIVE_TERRITORY = 'EXCLUSIVE_TERRITORY',
}

/**
 * License status enum
 */
export enum LicenseStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  PENDING_SIGNATURE = 'PENDING_SIGNATURE',
  ACTIVE = 'ACTIVE',
  EXPIRING_SOON = 'EXPIRING_SOON',
  EXPIRED = 'EXPIRED',
  RENEWED = 'RENEWED',
  TERMINATED = 'TERMINATED',
  DISPUTED = 'DISPUTED',
  CANCELED = 'CANCELED',
  SUSPENDED = 'SUSPENDED',
}

/**
 * Query parameters for license analytics endpoint
 */
export interface LicenseAnalyticsQuery {
  startDate: string;         // Required: YYYY-MM-DD
  endDate: string;           // Required: YYYY-MM-DD
  granularity?: Granularity; // Optional: defaults to 'daily'
  licenseType?: LicenseType; // Optional filter
  brandId?: string;          // Optional filter (CUID)
  projectId?: string;        // Optional filter (CUID)
}

/**
 * License count breakdown by status
 */
export interface LicenseStatusCount {
  status: LicenseStatus;
  count: number;
  percentage: number; // 0-100
}

/**
 * Renewal rate data point
 */
export interface RenewalRatePoint {
  date: string; // YYYY-MM-DD format
  totalExpired: number;
  renewed: number;
  renewalRate: number; // 0-100 percentage
  earlyRenewals: number;
  lateRenewals: number;
}

/**
 * License in expiration forecast
 */
export interface ExpiringLicense {
  id: string; // CUID
  endDate: string; // ISO 8601
  type: LicenseType;
  feeCents: number;
  autoRenew: boolean;
}

/**
 * Expiration forecast by time period
 */
export interface ExpirationForecast {
  period: string; // e.g., "Next 30 Days"
  daysFromNow: number;
  expiringCount: number;
  licenses: ExpiringLicense[];
}

/**
 * Revenue metrics breakdown
 */
export interface RevenueMetrics {
  totalRevenueCents: number;
  averageLicenseValueCents: number;
  medianLicenseValueCents: number;
  revenueByType: Record<LicenseType, number>;
  projectedAnnualRevenueCents: number;
}

/**
 * Period-over-period comparison metrics
 */
export interface LicenseComparisonMetrics {
  activeLicensesChange: number; // Percentage
  renewalRateChange: number;    // Percentage points
  revenueChange: number;        // Percentage
}

/**
 * License analytics summary statistics
 */
export interface LicenseAnalyticsSummary {
  totalLicenses: number;
  activePercentage: number; // 0-100
  averageRenewalRate: number; // 0-100
  averageLicenseDurationDays: number;
  autoRenewPercentage: number; // 0-100
  comparisonToPreviousPeriod: LicenseComparisonMetrics;
}

/**
 * Complete license analytics response
 */
export interface LicenseAnalytics {
  dateRange: DateRange;
  granularity: Granularity;
  activeCount: number;
  statusBreakdown: LicenseStatusCount[];
  renewalRates: RenewalRatePoint[];
  expirationForecast: ExpirationForecast[];
  revenueMetrics: RevenueMetrics;
  summary: LicenseAnalyticsSummary;
  metadata: AnalyticsMetadata;
}

// ============================================
// Project Analytics Types
// ============================================

/**
 * Project type enum
 */
export enum ProjectType {
  CAMPAIGN = 'CAMPAIGN',
  CONTENT = 'CONTENT',
  LICENSING = 'LICENSING',
}

/**
 * Project status enum
 */
export enum ProjectStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Query parameters for project analytics endpoint
 */
export interface ProjectAnalyticsQuery {
  startDate: string;         // Required: YYYY-MM-DD
  endDate: string;           // Required: YYYY-MM-DD
  granularity?: Granularity; // Optional: defaults to 'daily'
  projectType?: ProjectType; // Optional filter
  brandId?: string;          // Optional filter (CUID)
  status?: ProjectStatus;    // Optional filter
}

/**
 * Completion timeline data point
 */
export interface CompletionTimelinePoint {
  date: string; // YYYY-MM-DD format
  completed: number;
  onTime: number;
  late: number;
}

/**
 * Completion rate breakdown
 */
export interface CompletionRateData {
  overall: number; // Percentage 0-100
  onTime: number;  // Percentage 0-100
  late: number;    // Percentage 0-100
  early: number;   // Percentage 0-100
  byType: Record<ProjectType, number>;
  timeline: CompletionTimelinePoint[];
}

/**
 * Status-based timeline metrics
 */
export interface StatusTimelineMetrics {
  status: ProjectStatus;
  count: number;
  averageDurationDays: number;
}

/**
 * Timeline performance metrics
 */
export interface TimelineMetrics {
  averageDurationDays: number;
  medianDurationDays: number;
  onTimePercentage: number; // 0-100
  averageDelayDays: number;
  averageEarlyCompletionDays: number;
  byStatus: StatusTimelineMetrics[];
}

/**
 * Active projects breakdown by status
 */
export interface ActiveProjectsBreakdown {
  draft: number;
  active: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  archived: number;
  byType: Record<ProjectType, number>;
}

/**
 * Budget metrics by type
 */
export interface BudgetByType {
  averageBudgetCents: number;
  totalBudgetCents: number;
}

/**
 * Budget utilization metrics
 */
export interface BudgetMetrics {
  averageBudgetCents: number;
  medianBudgetCents: number;
  totalBudgetCents: number;
  utilizationRate: number; // 0-100 percentage
  overBudgetCount: number;
  underBudgetCount: number;
  byType: Record<ProjectType, BudgetByType>;
}

/**
 * Trend data point
 */
export interface TrendDataPoint {
  date: string; // YYYY-MM-DD format
  created: number;
  completed: number;
  active: number;
  completionRate: number; // 0-100 percentage
}

/**
 * Period-over-period project comparison
 */
export interface ProjectComparisonMetrics {
  projectsCreatedChange: number; // Percentage
  completionRateChange: number;  // Percentage points
  averageDurationChange: number; // Percentage
}

/**
 * Project analytics summary statistics
 */
export interface ProjectAnalyticsSummary {
  totalProjects: number;
  completionRate: number; // 0-100
  averageAssetsPerProject: number;
  averageLicensesPerProject: number;
  averageTeamSize: number;
  comparisonToPreviousPeriod: ProjectComparisonMetrics;
}

/**
 * Complete project analytics response
 */
export interface ProjectAnalytics {
  dateRange: DateRange;
  granularity: Granularity;
  completionRates: CompletionRateData;
  timelineMetrics: TimelineMetrics;
  activeProjects: ActiveProjectsBreakdown;
  budgetMetrics: BudgetMetrics;
  trendData: TrendDataPoint[];
  summary: ProjectAnalyticsSummary;
  metadata: AnalyticsMetadata;
}

// ============================================
// Error Response Types
// ============================================

/**
 * Validation error detail from Zod
 */
export interface ValidationErrorDetail {
  code: string;
  expected?: string;
  received?: string;
  path: (string | number)[];
  message: string;
}

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: ValidationErrorDetail[];
}
```

### Zod Validation Schemas

If you want to use Zod for client-side validation, here are the schemas:

```typescript
import { z } from 'zod';

// Date validation: YYYY-MM-DD format
const dateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in YYYY-MM-DD format'
);

// Shared query schema components
const baseQuerySchema = {
  startDate: dateSchema,
  endDate: dateSchema,
  granularity: z.enum(['daily', 'weekly', 'monthly']).optional().default('daily'),
};

// Asset analytics query schema
export const assetAnalyticsQuerySchema = z.object({
  ...baseQuerySchema,
  assetType: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'THREE_D', 'OTHER']).optional(),
  projectId: z.string().optional(),
  status: z.enum(['DRAFT', 'PROCESSING', 'REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED']).optional(),
});

// License analytics query schema
export const licenseAnalyticsQuerySchema = z.object({
  ...baseQuerySchema,
  licenseType: z.enum(['EXCLUSIVE', 'NON_EXCLUSIVE', 'EXCLUSIVE_TERRITORY']).optional(),
  brandId: z.string().optional(),
  projectId: z.string().optional(),
});

// Project analytics query schema
export const projectAnalyticsQuerySchema = z.object({
  ...baseQuerySchema,
  projectType: z.enum(['CAMPAIGN', 'CONTENT', 'LICENSING']).optional(),
  brandId: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED']).optional(),
});
```

---

## Business Logic & Validation Rules

### Date Validation

#### Date Format
- **Format:** `YYYY-MM-DD` (ISO 8601 date only)
- **Example:** `2024-10-17`
- **Regex:** `/^\d{4}-\d{2}-\d{2}$/`

#### Date Range Rules
1. **Start date must be before or equal to end date**
   - Error: `"Start date must be before or equal to end date"`
   - Status: `400 Bad Request`

2. **End date cannot be in the future**
   - Error: `"End date cannot be in the future"`
   - Status: `400 Bad Request`
   - Compare against: `new Date()` (server time)

3. **Maximum date range: 730 days (2 years)**
   - Error: `"Date range cannot exceed 730 days"`
   - Status: `400 Bad Request`
   - Calculation: `Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))`

### Filter Validation

#### Asset Type
- **Valid values:** `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT`, `THREE_D`, `OTHER`
- **Case sensitive:** Yes
- **When invalid:** Returns `400` with validation error

#### License Type
- **Valid values:** `EXCLUSIVE`, `NON_EXCLUSIVE`, `EXCLUSIVE_TERRITORY`
- **Case sensitive:** Yes
- **When invalid:** Returns `400` with validation error

#### Project Type
- **Valid values:** `CAMPAIGN`, `CONTENT`, `LICENSING`
- **Case sensitive:** Yes
- **When invalid:** Returns `400` with validation error

#### Status Filters
Each entity has its own status enum - see TypeScript definitions above for complete lists.

### Granularity Rules

- **Valid values:** `daily`, `weekly`, `monthly`
- **Default:** `daily`
- **Case sensitive:** Yes (lowercase only)
- **Effect:**
  - `daily`: Groups by calendar day
  - `weekly`: Groups by ISO week (Monday-Sunday)
  - `monthly`: Groups by calendar month

### ID Validation

- **Format:** CUID (Collision-resistant Unique Identifier)
- **Pattern:** Starts with `cl` followed by alphanumeric characters
- **Example:** `clx123abc456def789`
- **When invalid:** No error thrown, but will return empty results

### Caching Logic

#### Cache Key Generation
```typescript
const cacheKey = `analytics:platform:{entity}:{startDate}:{endDate}:{granularity}:{filterHash}`;
```

#### Cache Behavior
- **TTL:** 600 seconds (10 minutes)
- **Storage:** Redis
- **Invalidation:** Automatic expiration only (no manual invalidation endpoint exposed)
- **Cache Hit:** Response includes `metadata.cached = true` and `metadata.cacheTimestamp`

### Growth Rate Calculation

Growth rates compare the current period to the **previous period of equal length**:

```typescript
const rangeDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
const previousStart = new Date(startDate.getTime() - (rangeDays * 24 * 60 * 60 * 1000));
const previousEnd = new Date(startDate.getTime() - (24 * 60 * 60 * 1000));

const growthRate = ((currentValue - previousValue) / previousValue) * 100;
```

**Example:**
- Query: Oct 1-31 (31 days)
- Previous period: Sep 1-30 (31 days)
- Current uploads: 264, Previous uploads: 235
- Growth rate: `((264 - 235) / 235) * 100 = 12.34%`

### Percentage Calculations

All percentages are rounded to 2 decimal places:

```typescript
const percentage = Math.round(value * 100) / 100;
```

---

## Error Handling

### HTTP Status Codes

| Status Code | Meaning | When It Occurs |
|-------------|---------|----------------|
| `200` | Success | Valid request, data returned |
| `400` | Bad Request | Invalid query parameters, date validation failed |
| `401` | Unauthorized | Missing or invalid JWT token |
| `403` | Forbidden | User is not an ADMIN |
| `500` | Internal Server Error | Database error, Redis error, unexpected exception |

### Error Response Format

All errors follow this structure:

```typescript
{
  "error": string,      // Error type (e.g., "Validation Error")
  "message": string,    // Human-readable message
  "details"?: object[]  // Optional: Zod validation details
}
```

### Specific Error Scenarios

#### 1. Authentication Errors (401)

**Missing Token:**
```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

**Invalid/Expired Token:**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

**Frontend Handling:**
```typescript
if (response.status === 401) {
  // Clear stored token
  localStorage.removeItem('authToken');
  
  // Redirect to login
  router.push('/login');
  
  // Show user-friendly message
  toast.error('Your session has expired. Please log in again.');
}
```

#### 2. Authorization Errors (403)

**Non-Admin User:**
```json
{
  "error": "Forbidden",
  "message": "This endpoint requires administrator privileges"
}
```

**Frontend Handling:**
```typescript
if (response.status === 403) {
  // Show error message
  toast.error('You do not have permission to access this feature.');
  
  // Optionally redirect to dashboard
  router.push('/dashboard');
}
```

#### 3. Validation Errors (400)

**Invalid Date Format:**
```json
{
  "error": "Validation Error",
  "message": "Invalid query parameters",
  "details": [
    {
      "code": "invalid_string",
      "path": ["startDate"],
      "message": "Start date must be in YYYY-MM-DD format",
      "validation": "regex"
    }
  ]
}
```

**Date Range Exceeded:**
```json
{
  "error": "Invalid Date Range",
  "message": "Date range cannot exceed 730 days"
}
```

**Future Date:**
```json
{
  "error": "Invalid Date Range",
  "message": "End date cannot be in the future"
}
```

**Start After End:**
```json
{
  "error": "Invalid Date Range",
  "message": "Start date must be before or equal to end date"
}
```

**Frontend Handling:**
```typescript
if (response.status === 400) {
  const error = await response.json();
  
  // Handle validation errors
  if (error.details && Array.isArray(error.details)) {
    error.details.forEach((detail: ValidationErrorDetail) => {
      // Show error next to form field
      setFieldError(detail.path[0], detail.message);
    });
  } else {
    // Show general error message
    toast.error(error.message);
  }
}
```

#### 4. Server Errors (500)

**Generic Server Error:**
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```

**Specific Error (when available):**
```json
{
  "error": "Internal Server Error",
  "message": "Database connection failed"
}
```

**Frontend Handling:**
```typescript
if (response.status === 500) {
  // Log error for debugging
  console.error('Server error:', await response.json());
  
  // Show user-friendly message
  toast.error('Something went wrong. Please try again later.');
  
  // Optionally report to error tracking service
  errorTracker.captureException(error);
}
```

### Error Display Guidelines

#### When to Show Specific vs Generic Errors

**Show Specific Error:**
- Validation errors (user can fix)
- Date range issues (user can adjust)
- Permission errors (explain limitation)

**Show Generic Error:**
- Server errors (user can't fix)
- Network errors (temporary issue)
- Unexpected errors (avoid technical details)

#### User-Friendly Error Messages

Map technical errors to user-friendly messages:

```typescript
const USER_FRIENDLY_ERRORS: Record<string, string> = {
  // Authentication
  'Unauthorized': 'Please log in to continue',
  'Invalid or expired token': 'Your session expired. Please log in again.',
  
  // Authorization
  'This endpoint requires administrator privileges': 
    'You need administrator access to view this page.',
  
  // Validation
  'Start date must be in YYYY-MM-DD format': 
    'Please enter dates in the format YYYY-MM-DD (e.g., 2024-10-17)',
  'Date range cannot exceed 730 days': 
    'Please select a date range of 2 years or less',
  'End date cannot be in the future': 
    'You can only view data up to today',
  'Start date must be before or equal to end date': 
    'The start date must come before the end date',
  
  // Server
  'Internal Server Error': 
    'Something went wrong on our end. Please try again in a few moments.',
};
```

---

## Authorization & Permissions

### Required Role

**All endpoints require:** `ADMIN` role

### Authentication Flow

1. **JWT Token Required**
   - Token must be included in `Authorization` header
   - Format: `Bearer <token>`

2. **Token Validation**
   - Token signature verified using Auth.js secret
   - Token expiration checked
   - User ID extracted from token payload

3. **User Lookup**
   - User fetched from database using token's `userId`
   - User must exist and not be soft-deleted

4. **Role Check**
   - User's `role` field must equal `'ADMIN'`
   - If not admin: `403 Forbidden`

### User Roles

```typescript
enum UserRole {
  ADMIN = 'ADMIN',      // ✅ Can access analytics endpoints
  CREATOR = 'CREATOR',  // ❌ Cannot access
  BRAND = 'BRAND',      // ❌ Cannot access
  VIEWER = 'VIEWER',    // ❌ Cannot access
}
```

### Implementation Example

**API Client with Auth:**
```typescript
class AnalyticsApiClient {
  private baseUrl: string;
  private getAuthToken: () => string | null;

  constructor(baseUrl: string, getAuthToken: () => string | null) {
    this.baseUrl = baseUrl;
    this.getAuthToken = getAuthToken;
  }

  private async request<T>(endpoint: string, params: Record<string, any>): Promise<T> {
    const token = this.getAuthToken();
    
    if (!token) {
      throw new Error('No authentication token available');
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ApiError(response.status, error);
    }

    return response.json();
  }

  async getAssetAnalytics(params: AssetAnalyticsQuery): Promise<AssetAnalytics> {
    return this.request('/api/analytics/platform/assets', params);
  }

  async getLicenseAnalytics(params: LicenseAnalyticsQuery): Promise<LicenseAnalytics> {
    return this.request('/api/analytics/platform/licenses', params);
  }

  async getProjectAnalytics(params: ProjectAnalyticsQuery): Promise<ProjectAnalytics> {
    return this.request('/api/analytics/platform/projects', params);
  }
}
```

**React Query Hook:**
```typescript
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

export function useAssetAnalytics(params: AssetAnalyticsQuery) {
  const { token } = useAuth();

  return useQuery({
    queryKey: ['asset-analytics', params],
    queryFn: async () => {
      const response = await fetch(
        `/api/analytics/platform/assets?${new URLSearchParams(params as any)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch asset analytics');
      }

      return response.json();
    },
    enabled: !!token,
    staleTime: 10 * 60 * 1000, // 10 minutes (matches backend cache)
  });
}
```

### Field-Level Permissions

**No field-level restrictions** - Admins have full access to all fields in the response.

### Resource Ownership

**Not applicable** - These are platform-wide aggregate analytics, not user-specific resources.

---

## Rate Limiting & Quotas

### Rate Limits

**Current Implementation:** No explicit rate limiting is enforced at the endpoint level.

**Recommended Client-Side Throttling:**
- Debounce filter changes: 500ms
- Cache query results: 10 minutes (matches backend cache)
- Avoid concurrent requests: Use React Query or SWR

### Best Practices

```typescript
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

function AnalyticsDashboard() {
  const [filters, setFilters] = useState<AssetAnalyticsQuery>({
    startDate: '2024-10-01',
    endDate: '2024-10-31',
    granularity: 'daily',
  });

  // Debounce filters to avoid excessive requests
  const debouncedFilters = useDebouncedValue(filters, 500);

  const { data, isLoading } = useQuery({
    queryKey: ['asset-analytics', debouncedFilters],
    queryFn: () => fetchAssetAnalytics(debouncedFilters),
    staleTime: 10 * 60 * 1000, // Match backend cache TTL
    cacheTime: 15 * 60 * 1000, // Keep in memory slightly longer
  });

  return (
    // UI implementation
  );
}
```

### Headers to Monitor

While not enforced, monitor these headers for potential future implementation:

| Header | Purpose | Example Value |
|--------|---------|---------------|
| `X-RateLimit-Limit` | Max requests per window | `100` |
| `X-RateLimit-Remaining` | Remaining requests | `95` |
| `X-RateLimit-Reset` | Window reset time | `1697548800` |
| `Retry-After` | Seconds until retry allowed | `60` |

---

## Caching Strategy

### Backend Caching

#### Redis Configuration
- **Storage:** Redis (via `ioredis`)
- **TTL:** 600 seconds (10 minutes)
- **Key Pattern:** `analytics:platform:{entity}:{startDate}:{endDate}:{granularity}:{filterHash}`
- **Invalidation:** Automatic expiration only

#### Cache Key Examples

```typescript
// Assets endpoint
"analytics:platform:assets:2024-10-01:2024-10-31:weekly:image"

// Licenses endpoint with filters
"analytics:platform:licenses:2024-10-01:2024-10-31:monthly:exclusive:clxBrand123"

// Projects endpoint
"analytics:platform:projects:2024-10-01:2024-10-31:daily:campaign"
```

#### Cache Metadata

Every response includes cache information:

```typescript
{
  "metadata": {
    "cached": boolean,           // true if served from cache
    "cacheTimestamp"?: string,   // ISO 8601 timestamp when cached
    "queryExecutionTimeMs"?: number  // Only present if not cached
  }
}
```

### Frontend Caching

#### React Query Configuration

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Match backend cache TTL
      staleTime: 10 * 60 * 1000, // 10 minutes
      
      // Keep in memory for 15 minutes
      cacheTime: 15 * 60 * 1000,
      
      // Don't refetch on window focus (data changes slowly)
      refetchOnWindowFocus: false,
      
      // Don't refetch on reconnect
      refetchOnReconnect: false,
      
      // Retry failed requests once
      retry: 1,
    },
  },
});
```

#### Cache Invalidation Strategies

**Manual Invalidation (when data changes):**
```typescript
import { useQueryClient } from '@tanstack/react-query';

function AdminActions() {
  const queryClient = useQueryClient();

  const handleDataChange = async () => {
    // After creating/updating entities, invalidate relevant queries
    await queryClient.invalidateQueries(['asset-analytics']);
    await queryClient.invalidateQueries(['license-analytics']);
    await queryClient.invalidateQueries(['project-analytics']);
  };
}
```

**Prefetching (anticipate user needs):**
```typescript
function AnalyticsDashboard() {
  const queryClient = useQueryClient();

  // Prefetch related data when user hovers over tabs
  const handleTabHover = (tab: 'assets' | 'licenses' | 'projects') => {
    queryClient.prefetchQuery({
      queryKey: [`${tab}-analytics`, filters],
      queryFn: () => fetchAnalytics(tab, filters),
    });
  };
}
```

### Cache Warming (Optional)

For frequently accessed date ranges, consider warming the cache on dashboard load:

```typescript
useEffect(() => {
  // Warm cache for common date ranges
  const commonRanges = [
    { start: getLastMonthStart(), end: getLastMonthEnd() },
    { start: getLastQuarterStart(), end: getLastQuarterEnd() },
    { start: getYearStart(), end: getYearEnd() },
  ];

  commonRanges.forEach((range) => {
    queryClient.prefetchQuery({
      queryKey: ['asset-analytics', range],
      queryFn: () => fetchAssetAnalytics(range),
    });
  });
}, []);
```

---

## Frontend Implementation Checklist

### 1. Setup & Configuration

- [ ] Install dependencies
  ```bash
  npm install @tanstack/react-query axios date-fns zod
  ```

- [ ] Create API client class
  - [ ] Base URL configuration
  - [ ] Auth token management
  - [ ] Request/response interceptors
  - [ ] Error handling

- [ ] Configure React Query
  - [ ] Set up QueryClient with caching options
  - [ ] Add QueryClientProvider to app root

### 2. Type Definitions

- [ ] Copy TypeScript types from this document
- [ ] Create type definition files:
  - [ ] `types/analytics.ts` - All analytics types
  - [ ] `types/api.ts` - Error response types
  - [ ] `types/enums.ts` - All enum types

- [ ] Add Zod schemas (if using client-side validation)

### 3. API Client Implementation

- [ ] Create `lib/api/analytics.ts`
  - [ ] `getAssetAnalytics()` function
  - [ ] `getLicenseAnalytics()` function
  - [ ] `getProjectAnalytics()` function
  - [ ] Proper error handling and type safety

### 4. React Query Hooks

- [ ] Create `hooks/useAssetAnalytics.ts`
- [ ] Create `hooks/useLicenseAnalytics.ts`
- [ ] Create `hooks/useProjectAnalytics.ts`
- [ ] Add proper query keys for caching
- [ ] Configure stale time and cache time

### 5. Date Utilities

- [ ] Create date formatting utilities
  - [ ] `formatDateToYYYYMMDD()` - For API queries
  - [ ] `parseDateRange()` - Validate and parse user input
  - [ ] `getDefaultDateRange()` - Last 30 days default
  - [ ] `calculateDateRangeDays()` - Validate max range

- [ ] Date picker configuration
  - [ ] Max range: 730 days
  - [ ] Disable future dates
  - [ ] Default to last 30 days

### 6. UI Components

- [ ] **Date Range Selector**
  - [ ] Start date picker
  - [ ] End date picker
  - [ ] Preset options (Last 7 days, Last 30 days, Last 90 days, etc.)
  - [ ] Validation and error messages

- [ ] **Granularity Selector**
  - [ ] Radio buttons or dropdown
  - [ ] Options: Daily, Weekly, Monthly

- [ ] **Filter Components**
  - [ ] Asset type multi-select
  - [ ] License type multi-select
  - [ ] Project type multi-select
  - [ ] Status dropdowns
  - [ ] Project/Brand ID search

- [ ] **Chart Components**
  - [ ] Upload trends line chart
  - [ ] Popular types bar chart
  - [ ] Status breakdown pie chart
  - [ ] Timeline metrics area chart
  - [ ] Revenue metrics cards

- [ ] **Summary Cards**
  - [ ] Total count
  - [ ] Growth rate (with trend indicator)
  - [ ] Average metrics
  - [ ] Period comparison

- [ ] **Loading States**
  - [ ] Skeleton loaders for charts
  - [ ] Loading spinners for cards
  - [ ] Shimmer effects

- [ ] **Error States**
  - [ ] Empty state (no data)
  - [ ] Error message display
  - [ ] Retry button

### 7. Data Visualization

- [ ] Choose charting library (e.g., Recharts, Chart.js, D3)
- [ ] Implement chart components:
  - [ ] Time series line charts
  - [ ] Bar charts for comparisons
  - [ ] Pie/donut charts for breakdowns
  - [ ] Area charts for cumulative data

- [ ] Add chart interactivity:
  - [ ] Tooltips with detailed information
  - [ ] Click-through to filtered views
  - [ ] Zoom and pan controls (optional)
  - [ ] Export to image (optional)

### 8. Formatting Utilities

- [ ] **Number Formatting**
  ```typescript
  - formatNumber(123456) -> "123,456"
  - formatPercentage(0.1234) -> "12.34%"
  - formatCurrency(500000) -> "$5,000.00"
  - formatBytes(1073741824) -> "1.00 GB"
  ```

- [ ] **Date Formatting**
  ```typescript
  - formatDate("2024-10-17") -> "Oct 17, 2024"
  - formatDateRange(start, end) -> "Oct 1-31, 2024"
  ```

### 9. Error Handling

- [ ] Create error boundary component
- [ ] Implement toast notifications
- [ ] Handle specific error codes:
  - [ ] 401: Redirect to login
  - [ ] 403: Show permission error
  - [ ] 400: Display validation errors
  - [ ] 500: Show generic error

- [ ] Error logging (optional)
  - [ ] Sentry/Rollbar integration
  - [ ] Console logging in development

### 10. Testing

- [ ] **Unit Tests**
  - [ ] Date validation logic
  - [ ] API client functions
  - [ ] Data formatting utilities

- [ ] **Integration Tests**
  - [ ] API endpoints with mock server
  - [ ] React Query hooks

- [ ] **Component Tests**
  - [ ] Date range selector
  - [ ] Filter components
  - [ ] Chart components

### 11. Performance Optimization

- [ ] Implement virtualization for large lists
- [ ] Debounce filter changes (500ms)
- [ ] Memoize expensive calculations
- [ ] Code splitting for chart library
- [ ] Lazy load chart components

### 12. Accessibility

- [ ] Keyboard navigation for filters
- [ ] ARIA labels for charts
- [ ] Screen reader announcements for data changes
- [ ] High contrast mode support
- [ ] Focus indicators

### 13. Documentation

- [ ] Add JSDoc comments to API functions
- [ ] Create component documentation (Storybook)
- [ ] Write usage examples
- [ ] Document common patterns

---

## Testing & Debugging

### Test Endpoints

**Development:**
```bash
# Asset Analytics
curl -X GET "http://localhost:3000/api/analytics/platform/assets?startDate=2024-10-01&endDate=2024-10-31&granularity=weekly" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# License Analytics
curl -X GET "http://localhost:3000/api/analytics/platform/licenses?startDate=2024-10-01&endDate=2024-10-31&granularity=monthly" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Project Analytics
curl -X GET "http://localhost:3000/api/analytics/platform/projects?startDate=2024-10-01&endDate=2024-10-31&granularity=daily" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Production:**
```bash
# Asset Analytics
curl -X GET "https://ops.yesgoddess.agency/api/analytics/platform/assets?startDate=2024-10-01&endDate=2024-10-31&granularity=weekly" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Debugging Tips

#### 1. Check Authentication

```typescript
// Verify token is valid
const token = localStorage.getItem('authToken');
console.log('Token:', token);

// Decode JWT to inspect payload (use jwt-decode library)
import jwtDecode from 'jwt-decode';
const payload = jwtDecode(token);
console.log('Token payload:', payload);
console.log('User role:', payload.role); // Should be 'ADMIN'
```

#### 2. Inspect Network Requests

Open browser DevTools → Network tab:
- Check request URL and query parameters
- Verify Authorization header is present
- Inspect response status and body
- Check cache headers

#### 3. Cache Debugging

```typescript
// Check if response is cached
const response = await fetch(url, { headers });
const data = await response.json();
console.log('Cached:', data.metadata.cached);
console.log('Cache timestamp:', data.metadata.cacheTimestamp);
console.log('Execution time:', data.metadata.queryExecutionTimeMs);
```

#### 4. Date Validation

```typescript
// Test date validation locally
function validateDateRange(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();
  
  // Check format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    console.error('Invalid start date format');
  }
  
  // Check future date
  if (end > now) {
    console.error('End date is in the future');
  }
  
  // Check range order
  if (start > end) {
    console.error('Start date is after end date');
  }
  
  // Check max range
  const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (rangeDays > 730) {
    console.error('Date range exceeds 730 days');
  }
  
  console.log('✅ Date validation passed');
}
```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Missing/invalid token | Check token storage and refresh mechanism |
| 403 Forbidden | User is not ADMIN | Verify user role in database |
| 400 Bad Request | Invalid date format | Ensure dates are in YYYY-MM-DD format |
| Empty response | No data in date range | Try different date range or check database |
| Slow response | Large date range | Reduce date range or increase granularity |
| Cached data not updating | Cache not expired | Wait 10 minutes or clear Redis cache manually |

### Postman Collection

Create a Postman collection for testing:

```json
{
  "info": {
    "name": "Content Analytics API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Asset Analytics",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{adminToken}}",
            "type": "text"
          }
        ],
        "url": {
          "raw": "{{baseUrl}}/api/analytics/platform/assets?startDate=2024-10-01&endDate=2024-10-31&granularity=weekly",
          "host": ["{{baseUrl}}"],
          "path": ["api", "analytics", "platform", "assets"],
          "query": [
            { "key": "startDate", "value": "2024-10-01" },
            { "key": "endDate", "value": "2024-10-31" },
            { "key": "granularity", "value": "weekly" }
          ]
        }
      }
    }
  ]
}
```

---

## Additional Resources

### Backend Files Reference

**API Route Files:**
- `src/app/api/analytics/platform/assets/route.ts`
- `src/app/api/analytics/platform/licenses/route.ts`
- `src/app/api/analytics/platform/projects/route.ts`

**Service Files:**
- `src/modules/analytics/services/platform-assets-analytics.service.ts`
- `src/modules/analytics/services/platform-licenses-analytics.service.ts`
- `src/modules/analytics/services/platform-projects-analytics.service.ts`

**Middleware:**
- `src/lib/middleware/auth.middleware.ts`

**Database Schema:**
- `prisma/schema.prisma`

### Related Documentation

- [Content Analytics Implementation](./CONTENT_ANALYTICS_API_IMPLEMENTATION.md)
- [Content Analytics Quick Reference](./CONTENT_ANALYTICS_API_QUICK_REFERENCE.md)
- [Authentication Implementation](./AUTH_IMPLEMENTATION.md)

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Oct 17, 2025 | Initial frontend integration guide |

---

## Support

For questions or issues with this integration:
- Backend repository: `yg-backend` (ops.yesgoddess.agency)
- Frontend repository: `yesgoddess-web`
- Contact: Backend development team

---

**End of Document**
