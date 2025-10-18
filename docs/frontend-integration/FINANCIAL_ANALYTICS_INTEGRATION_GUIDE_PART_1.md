# 🌐 Financial Analytics - Frontend Integration Guide (Part 1 of 2)

**Classification:** 🔒 **ADMIN ONLY** - Internal operations and admin interface only

> **Module:** Analytics Data Collection - Financial Analytics API  
> **Last Updated:** October 17, 2025  
> **Backend Version:** v1.0  
> **Deployment:** ops.yesgoddess.agency

---

## 📋 Table of Contents

- [Overview](#overview)
- [API Endpoints](#api-endpoints)
  - [1. Spend Analysis](#1-spend-analysis)
  - [2. Budget Utilization](#2-budget-utilization)
  - [3. Cost Per Metric](#3-cost-per-metric)
- [TypeScript Type Definitions](#typescript-type-definitions)
- [Authentication & Authorization](#authentication--authorization)

---

## Overview

The Financial Analytics API provides brands with comprehensive financial insights, spend tracking, budget management, and cost-efficiency analysis across their licensed content. This API enables data-driven decision-making by analyzing spending patterns, budget utilization, and the cost-effectiveness of licensing investments.

### Key Features

- **Spend Analysis**: Track all licensing expenses with breakdowns by project, license type, and creator
- **Budget Utilization**: Monitor project budgets in real-time with alerts and projections
- **Cost Per Metric**: Calculate cost-efficiency metrics (CPV, CPC, CPM, CPE) across assets, projects, and creators

### Base URL

```
Production: https://ops.yesgoddess.agency/trpc
```

### Technology Stack

- **Protocol**: tRPC v10 (type-safe RPC)
- **Authentication**: JWT Bearer tokens
- **Response Format**: JSON
- **Caching**: Redis (30-60 minutes per endpoint)

---

## API Endpoints

All endpoints follow the tRPC query pattern and require authentication.

### 1. Spend Analysis

**Get comprehensive spend analysis for a brand**

```typescript
// tRPC Query
brandAnalytics.getSpendAnalysis

// REST-style equivalent
GET /trpc/brandAnalytics.getSpendAnalysis
```

**Access:** Protected - Brand owners, team members with `view_analytics` permission, and admins  
**Cache TTL:** 1 hour  
**Rate Limit:** 100 requests per hour per brand

#### Request Schema

```typescript
interface GetSpendAnalysisInput {
  id: string;                     // Brand CUID (required)
  startDate?: string;              // ISO 8601 datetime (optional)
  endDate?: string;                // ISO 8601 datetime (optional)
  granularity?: 'day' | 'week' | 'month'; // Default: 'month'
  groupBy?: Array<'project' | 'licenseType' | 'creator'>; // Default: all three
}
```

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | ✅ Yes | - | Brand CUID identifier |
| `startDate` | string | ❌ No | 365 days ago | Start date for analysis (ISO 8601) |
| `endDate` | string | ❌ No | Now | End date for analysis (ISO 8601) |
| `granularity` | enum | ❌ No | `'month'` | Time series granularity |
| `groupBy` | array | ❌ No | `['project', 'licenseType', 'creator']` | Breakdown dimensions |

**Validation Rules:**

- `id` must be a valid CUID format
- Date strings must be valid ISO 8601 datetime format
- `startDate` must be before `endDate`
- `granularity` must be one of: `'day'`, `'week'`, `'month'`
- Each `groupBy` item must be one of: `'project'`, `'licenseType'`, `'creator'`

#### Response Schema

```typescript
interface SpendAnalysisResponse {
  brandId: string;
  dateRange: {
    start: string;                // ISO 8601
    end: string;                  // ISO 8601
  };
  totalSpendCents: number;        // Total spend including royalties
  breakdown: {
    byProject: Array<{
      projectId: string;
      projectName: string;
      spentCents: number;
      percentage: number;         // Percentage of total spend
    }>;
    byLicenseType: Array<{
      licenseType: string;        // e.g., 'EXCLUSIVE', 'NON_EXCLUSIVE'
      spentCents: number;
      percentage: number;
      count: number;              // Number of licenses
    }>;
    byCreator: Array<{
      creatorId: string;
      creatorName: string;
      spentCents: number;
      percentage: number;
      licenseCount: number;
    }>;
  };
  timeSeries: Array<{
    date: string;                 // ISO 8601
    spentCents: number;
    licenseCount: number;
  }>;
  trends: {
    averageTransactionCents: number;
    totalTransactions: number;
    periodOverPeriodChange: number;      // Cents difference
    periodOverPeriodPercentage: number;  // Percentage change
    peakSpendingDate: string | null;     // ISO 8601
    peakSpendingAmount: number;          // Cents
  };
  metadata: {
    calculatedAt: string;         // ISO 8601
    dataCompleteness: number;     // Percentage (0-100)
  };
}
```

#### Example Request

```typescript
// Using tRPC client
const result = await trpc.brandAnalytics.getSpendAnalysis.query({
  id: 'clx123brand456',
  startDate: '2025-01-01T00:00:00Z',
  endDate: '2025-10-01T00:00:00Z',
  granularity: 'month',
  groupBy: ['project', 'creator']
});
```

#### Example Response

```json
{
  "brandId": "clx123brand456",
  "dateRange": {
    "start": "2025-01-01T00:00:00.000Z",
    "end": "2025-10-01T00:00:00.000Z"
  },
  "totalSpendCents": 125000000,
  "breakdown": {
    "byProject": [
      {
        "projectId": "clx789proj001",
        "projectName": "Summer Campaign 2025",
        "spentCents": 75000000,
        "percentage": 60.0
      },
      {
        "projectId": "clx789proj002",
        "projectName": "Fall Launch",
        "spentCents": 50000000,
        "percentage": 40.0
      }
    ],
    "byLicenseType": [
      {
        "licenseType": "EXCLUSIVE",
        "spentCents": 100000000,
        "percentage": 80.0,
        "count": 5
      },
      {
        "licenseType": "NON_EXCLUSIVE",
        "spentCents": 25000000,
        "percentage": 20.0,
        "count": 15
      }
    ],
    "byCreator": [
      {
        "creatorId": "clx456creator789",
        "creatorName": "Jane Artist",
        "spentCents": 45000000,
        "percentage": 36.0,
        "licenseCount": 8
      }
    ]
  },
  "timeSeries": [
    {
      "date": "2025-01-01T00:00:00.000Z",
      "spentCents": 12500000,
      "licenseCount": 2
    },
    {
      "date": "2025-02-01T00:00:00.000Z",
      "spentCents": 15000000,
      "licenseCount": 3
    }
  ],
  "trends": {
    "averageTransactionCents": 6250000,
    "totalTransactions": 20,
    "periodOverPeriodChange": 2500000,
    "periodOverPeriodPercentage": 12.5,
    "peakSpendingDate": "2025-06-01T00:00:00.000Z",
    "peakSpendingAmount": 25000000
  },
  "metadata": {
    "calculatedAt": "2025-10-17T10:30:00.000Z",
    "dataCompleteness": 100
  }
}
```

---

### 2. Budget Utilization

**Monitor budget allocation and utilization across all projects**

```typescript
// tRPC Query
brandAnalytics.getBudgetUtilization

// REST-style equivalent
GET /trpc/brandAnalytics.getBudgetUtilization
```

**Access:** Protected - Brand owners, team members with `view_analytics` permission, and admins  
**Cache TTL:** 30 minutes  
**Rate Limit:** 150 requests per hour per brand

#### Request Schema

```typescript
interface GetBudgetUtilizationInput {
  id: string;                     // Brand CUID (required)
  startDate?: string;              // ISO 8601 datetime (optional)
  endDate?: string;                // ISO 8601 datetime (optional)
  projectStatus?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  alertThreshold?: number;         // Default: 90 (percentage)
  includeProjections?: boolean;    // Default: true
}
```

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | ✅ Yes | - | Brand CUID identifier |
| `startDate` | string | ❌ No | 365 days ago | Start date for analysis (ISO 8601) |
| `endDate` | string | ❌ No | Now | End date for analysis (ISO 8601) |
| `projectStatus` | enum | ❌ No | All statuses | Filter by project status |
| `alertThreshold` | number | ❌ No | `90` | Alert when utilization reaches this % |
| `includeProjections` | boolean | ❌ No | `true` | Include budget depletion projections |

**Validation Rules:**

- `id` must be a valid CUID format
- Date strings must be valid ISO 8601 datetime format
- `alertThreshold` must be between 0 and 100
- `projectStatus` must be one of: `DRAFT`, `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED`

#### Response Schema

```typescript
interface BudgetUtilizationResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  portfolio: {
    totalAllocatedBudgetCents: number;
    totalActualSpendCents: number;
    overallUtilizationPercentage: number;
    totalRemainingBudgetCents: number;
    projectsUnderBudget: number;
    projectsOnBudget: number;
    projectsOverBudget: number;
    projectsNoBudget: number;
  };
  projects: Array<{
    projectId: string;
    projectName: string;
    status: string;
    budgetCents: number;
    actualSpendCents: number;
    remainingBudgetCents: number;
    utilizationPercentage: number;
    budgetStatus: 'under_budget' | 'on_budget' | 'over_budget' | 'at_risk' | 'no_budget';
    licenseCount: number;
    timeline: {
      startDate: string | null;
      endDate: string | null;
      daysRemaining: number | null;
    };
  }>;
  trends: {
    monthlyUtilization: Array<{
      month: string;              // YYYY-MM format
      utilizationPercentage: number;
      spentCents: number;
    }>;
    projectedDepletion: Array<{
      projectId: string;
      projectName: string;
      projectedDepletionDate: string | null;
      daysUntilDepletion: number | null;
    }>;
  };
  alerts: Array<{
    severity: 'warning' | 'critical';
    projectId: string;
    projectName: string;
    message: string;
  }>;
}
```

#### Budget Status Logic

| Status | Condition | Description |
|--------|-----------|-------------|
| `no_budget` | `budgetCents === 0` | No budget set for project |
| `over_budget` | `utilization > 100%` | Spending exceeded budget |
| `at_risk` | `utilization >= alertThreshold && < 100%` | Approaching budget limit |
| `on_budget` | `utilization >= 90% && < 100%` | Near full budget utilization |
| `under_budget` | `utilization < 90%` | Spending below budget |

#### Example Request

```typescript
const result = await trpc.brandAnalytics.getBudgetUtilization.query({
  id: 'clx123brand456',
  startDate: '2025-01-01T00:00:00Z',
  endDate: '2025-12-31T23:59:59Z',
  projectStatus: 'ACTIVE',
  alertThreshold: 85,
  includeProjections: true
});
```

#### Example Response

```json
{
  "brandId": "clx123brand456",
  "dateRange": {
    "start": "2025-01-01T00:00:00.000Z",
    "end": "2025-12-31T23:59:59.000Z"
  },
  "portfolio": {
    "totalAllocatedBudgetCents": 200000000,
    "totalActualSpendCents": 145000000,
    "overallUtilizationPercentage": 72.5,
    "totalRemainingBudgetCents": 55000000,
    "projectsUnderBudget": 3,
    "projectsOnBudget": 1,
    "projectsOverBudget": 1,
    "projectsNoBudget": 0
  },
  "projects": [
    {
      "projectId": "clx789proj001",
      "projectName": "Summer Campaign 2025",
      "status": "ACTIVE",
      "budgetCents": 100000000,
      "actualSpendCents": 95000000,
      "remainingBudgetCents": 5000000,
      "utilizationPercentage": 95.0,
      "budgetStatus": "on_budget",
      "licenseCount": 12,
      "timeline": {
        "startDate": "2025-06-01T00:00:00.000Z",
        "endDate": "2025-08-31T23:59:59.000Z",
        "daysRemaining": 45
      }
    },
    {
      "projectId": "clx789proj002",
      "projectName": "Fall Launch",
      "status": "ACTIVE",
      "budgetCents": 50000000,
      "actualSpendCents": 60000000,
      "remainingBudgetCents": -10000000,
      "utilizationPercentage": 120.0,
      "budgetStatus": "over_budget",
      "licenseCount": 8,
      "timeline": {
        "startDate": "2025-09-01T00:00:00.000Z",
        "endDate": "2025-11-30T23:59:59.000Z",
        "daysRemaining": 75
      }
    }
  ],
  "trends": {
    "monthlyUtilization": [
      {
        "month": "2025-01",
        "utilizationPercentage": 45.0,
        "spentCents": 25000000
      },
      {
        "month": "2025-02",
        "utilizationPercentage": 58.0,
        "spentCents": 40000000
      }
    ],
    "projectedDepletion": [
      {
        "projectId": "clx789proj001",
        "projectName": "Summer Campaign 2025",
        "projectedDepletionDate": "2025-08-15T00:00:00.000Z",
        "daysUntilDepletion": 30
      }
    ]
  },
  "alerts": [
    {
      "severity": "critical",
      "projectId": "clx789proj002",
      "projectName": "Fall Launch",
      "message": "Budget exceeded by 20.0% ($100,000.00 over)"
    },
    {
      "severity": "warning",
      "projectId": "clx789proj001",
      "projectName": "Summer Campaign 2025",
      "message": "Budget utilization at 95.0% - approaching limit"
    }
  ]
}
```

---

### 3. Cost Per Metric

**Calculate cost-efficiency metrics across all licensed assets**

```typescript
// tRPC Query
brandAnalytics.getCostPerMetric

// REST-style equivalent
GET /trpc/brandAnalytics.getCostPerMetric
```

**Access:** Protected - Brand owners, team members with `view_analytics` permission, and admins  
**Cache TTL:** 30 minutes  
**Rate Limit:** 100 requests per hour per brand

#### Request Schema

```typescript
interface GetCostPerMetricInput {
  id: string;                     // Brand CUID (required)
  startDate?: string;              // ISO 8601 datetime (optional)
  endDate?: string;                // ISO 8601 datetime (optional)
  metrics?: Array<'view' | 'click' | 'conversion' | 'engagement'>; // Default: all
  groupBy?: 'asset' | 'project' | 'creator' | 'all'; // Default: 'all'
  minThreshold?: number;           // Default: 100 (minimum events)
  includeBenchmarks?: boolean;     // Default: false
}
```

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | string | ✅ Yes | - | Brand CUID identifier |
| `startDate` | string | ❌ No | 365 days ago | Start date for analysis (ISO 8601) |
| `endDate` | string | ❌ No | Now | End date for analysis (ISO 8601) |
| `metrics` | array | ❌ No | `['view', 'click', 'conversion']` | Metrics to calculate |
| `groupBy` | enum | ❌ No | `'all'` | Breakdown dimension |
| `minThreshold` | number | ❌ No | `100` | Minimum events required for calculation |
| `includeBenchmarks` | boolean | ❌ No | `false` | Include platform benchmarks |

**Validation Rules:**

- `id` must be a valid CUID format
- Date strings must be valid ISO 8601 datetime format
- Each `metrics` item must be one of: `'view'`, `'click'`, `'conversion'`, `'engagement'`
- `groupBy` must be one of: `'asset'`, `'project'`, `'creator'`, `'all'`
- `minThreshold` must be >= 0

#### Response Schema

```typescript
interface CostPerMetricResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    totalLicensingCostCents: number;
    costPerView: number | null;           // Cents per view
    costPerClick: number | null;          // Cents per click
    costPerConversion: number | null;     // Cents per conversion
    costPerEngagement: number | null;     // Cents per engagement
    totalViews: number;
    totalClicks: number;
    totalConversions: number;
    totalEngagements: number;
  };
  byAsset: Array<{
    assetId: string;
    assetTitle: string;
    assetType: string;
    licensingCostCents: number;
    views: number;
    clicks: number;
    conversions: number;
    engagements: number;
    costPerView: number | null;
    costPerClick: number | null;
    costPerConversion: number | null;
    costPerEngagement: number | null;
    efficiencyScore: number;              // 0-100 scale
  }>;
  byProject: Array<{
    projectId: string;
    projectName: string;
    licensingCostCents: number;
    views: number;
    clicks: number;
    conversions: number;
    costPerView: number | null;
    costPerClick: number | null;
    costPerConversion: number | null;
    averageEfficiency: number;            // 0-100 scale
  }>;
  byCreator: Array<{
    creatorId: string;
    creatorName: string;
    licensingCostCents: number;
    assetCount: number;
    views: number;
    clicks: number;
    conversions: number;
    costPerView: number | null;
    costPerClick: number | null;
    costPerConversion: number | null;
  }>;
  trends: {
    efficiencyOverTime: Array<{
      date: string;                       // YYYY-MM-DD format
      costPerView: number | null;
      costPerClick: number | null;
      costPerConversion: number | null;
    }>;
    improvementPercentage: number;        // Efficiency improvement over time
  };
  benchmarks: {
    platformAverageCostPerView: number | null;
    platformAverageCostPerClick: number | null;
    platformAverageCostPerConversion: number | null;
    brandPerformancePercentile: number | null; // 0-100
  };
  insights: Array<{
    type: 'top_performer' | 'underperformer' | 'optimal_price_point' | 'tracking_gap';
    title: string;
    description: string;
    assetId?: string;
    projectId?: string;
  }>;
  dataQuality: {
    assetsWithTracking: number;
    assetsWithoutTracking: number;
    trackingCoverage: number;             // Percentage (0-100)
  };
}
```

#### Cost Calculation Logic

- **Cost Per View (CPV)**: `licensingCostCents / totalViews`
- **Cost Per Click (CPC)**: `licensingCostCents / totalClicks`
- **Cost Per Conversion (CPConv)**: `licensingCostCents / totalConversions`
- **Cost Per Engagement (CPE)**: `licensingCostCents / totalEngagements`
- **Efficiency Score**: `max(0, 100 - (CPV * 10))` - Lower cost = higher score

> **Note:** Metrics are only calculated when event count >= `minThreshold` to ensure statistical significance. Returns `null` when threshold not met.

#### Example Request

```typescript
const result = await trpc.brandAnalytics.getCostPerMetric.query({
  id: 'clx123brand456',
  startDate: '2025-01-01T00:00:00Z',
  endDate: '2025-10-01T00:00:00Z',
  metrics: ['view', 'click', 'conversion'],
  groupBy: 'asset',
  minThreshold: 500,
  includeBenchmarks: false
});
```

#### Example Response

```json
{
  "brandId": "clx123brand456",
  "dateRange": {
    "start": "2025-01-01T00:00:00.000Z",
    "end": "2025-10-01T00:00:00.000Z"
  },
  "summary": {
    "totalLicensingCostCents": 125000000,
    "costPerView": 0.125,
    "costPerClick": 12.5,
    "costPerConversion": 2500.0,
    "costPerEngagement": 15.0,
    "totalViews": 1000000000,
    "totalClicks": 10000000,
    "totalConversions": 50000,
    "totalEngagements": 8333333
  },
  "byAsset": [
    {
      "assetId": "clx456asset789",
      "assetTitle": "Summer Collection Hero Image",
      "assetType": "IMAGE",
      "licensingCostCents": 25000000,
      "views": 300000000,
      "clicks": 3000000,
      "conversions": 15000,
      "engagements": 2500000,
      "costPerView": 0.083,
      "costPerClick": 8.33,
      "costPerConversion": 1666.67,
      "costPerEngagement": 10.0,
      "efficiencyScore": 91.7
    },
    {
      "assetId": "clx456asset790",
      "assetTitle": "Fall Video Campaign",
      "assetType": "VIDEO",
      "licensingCostCents": 50000000,
      "views": 200000000,
      "clicks": 2500000,
      "conversions": 12000,
      "engagements": 2000000,
      "costPerView": 0.25,
      "costPerClick": 20.0,
      "costPerConversion": 4166.67,
      "costPerEngagement": 25.0,
      "efficiencyScore": 75.0
    }
  ],
  "byProject": [
    {
      "projectId": "clx789proj001",
      "projectName": "Summer Campaign 2025",
      "licensingCostCents": 75000000,
      "views": 600000000,
      "clicks": 6000000,
      "conversions": 30000,
      "costPerView": 0.125,
      "costPerClick": 12.5,
      "costPerConversion": 2500.0,
      "averageEfficiency": 85.0
    }
  ],
  "byCreator": [
    {
      "creatorId": "clx456creator789",
      "creatorName": "Jane Artist",
      "licensingCostCents": 45000000,
      "assetCount": 5,
      "views": 400000000,
      "clicks": 4500000,
      "conversions": 22000,
      "costPerView": 0.1125,
      "costPerClick": 10.0,
      "costPerConversion": 2045.45
    }
  ],
  "trends": {
    "efficiencyOverTime": [
      {
        "date": "2025-01-01",
        "costPerView": 0.15,
        "costPerClick": 15.0,
        "costPerConversion": 3000.0
      },
      {
        "date": "2025-02-01",
        "costPerView": 0.14,
        "costPerClick": 14.0,
        "costPerConversion": 2800.0
      }
    ],
    "improvementPercentage": 16.67
  },
  "benchmarks": {
    "platformAverageCostPerView": null,
    "platformAverageCostPerClick": null,
    "platformAverageCostPerConversion": null,
    "brandPerformancePercentile": null
  },
  "insights": [
    {
      "type": "top_performer",
      "title": "Highly Efficient Asset",
      "description": "\"Summer Collection Hero Image\" delivers views at 8.33¢ per view - 50% better than average",
      "assetId": "clx456asset789"
    },
    {
      "type": "underperformer",
      "title": "High Cost Asset",
      "description": "\"Fall Video Campaign\" costs 25.00¢ per view - consider re-evaluating usage",
      "assetId": "clx456asset790"
    },
    {
      "type": "tracking_gap",
      "title": "Tracking Coverage Gap",
      "description": "3 assets have insufficient tracking data (< 500 events). Consider improving tracking implementation."
    }
  ],
  "dataQuality": {
    "assetsWithTracking": 12,
    "assetsWithoutTracking": 3,
    "trackingCoverage": 80.0
  }
}
```

---

## TypeScript Type Definitions

### Complete Type Library

Copy these type definitions into your frontend codebase. All types are extracted from the backend implementation.

```typescript
/**
 * Financial Analytics API Types
 * Copy to: src/types/api/financial-analytics.ts
 */

// ============================================================================
// Request Types
// ============================================================================

export interface GetSpendAnalysisInput {
  id: string;
  startDate?: string;
  endDate?: string;
  granularity?: 'day' | 'week' | 'month';
  groupBy?: Array<'project' | 'licenseType' | 'creator'>;
}

export interface GetBudgetUtilizationInput {
  id: string;
  startDate?: string;
  endDate?: string;
  projectStatus?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  alertThreshold?: number;
  includeProjections?: boolean;
}

export interface GetCostPerMetricInput {
  id: string;
  startDate?: string;
  endDate?: string;
  metrics?: Array<'view' | 'click' | 'conversion' | 'engagement'>;
  groupBy?: 'asset' | 'project' | 'creator' | 'all';
  minThreshold?: number;
  includeBenchmarks?: boolean;
}

// ============================================================================
// Response Types
// ============================================================================

export interface SpendAnalysisResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  totalSpendCents: number;
  breakdown: {
    byProject: ProjectSpend[];
    byLicenseType: LicenseTypeSpend[];
    byCreator: CreatorSpend[];
  };
  timeSeries: TimeSeriesSpend[];
  trends: SpendTrends;
  metadata: {
    calculatedAt: string;
    dataCompleteness: number;
  };
}

export interface ProjectSpend {
  projectId: string;
  projectName: string;
  spentCents: number;
  percentage: number;
}

export interface LicenseTypeSpend {
  licenseType: string;
  spentCents: number;
  percentage: number;
  count: number;
}

export interface CreatorSpend {
  creatorId: string;
  creatorName: string;
  spentCents: number;
  percentage: number;
  licenseCount: number;
}

export interface TimeSeriesSpend {
  date: string;
  spentCents: number;
  licenseCount: number;
}

export interface SpendTrends {
  averageTransactionCents: number;
  totalTransactions: number;
  periodOverPeriodChange: number;
  periodOverPeriodPercentage: number;
  peakSpendingDate: string | null;
  peakSpendingAmount: number;
}

export interface BudgetUtilizationResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  portfolio: PortfolioBudget;
  projects: ProjectBudget[];
  trends: BudgetTrends;
  alerts: BudgetAlert[];
}

export interface PortfolioBudget {
  totalAllocatedBudgetCents: number;
  totalActualSpendCents: number;
  overallUtilizationPercentage: number;
  totalRemainingBudgetCents: number;
  projectsUnderBudget: number;
  projectsOnBudget: number;
  projectsOverBudget: number;
  projectsNoBudget: number;
}

export interface ProjectBudget {
  projectId: string;
  projectName: string;
  status: string;
  budgetCents: number;
  actualSpendCents: number;
  remainingBudgetCents: number;
  utilizationPercentage: number;
  budgetStatus: 'under_budget' | 'on_budget' | 'over_budget' | 'at_risk' | 'no_budget';
  licenseCount: number;
  timeline: {
    startDate: string | null;
    endDate: string | null;
    daysRemaining: number | null;
  };
}

export interface BudgetTrends {
  monthlyUtilization: MonthlyUtilization[];
  projectedDepletion: ProjectedDepletion[];
}

export interface MonthlyUtilization {
  month: string;
  utilizationPercentage: number;
  spentCents: number;
}

export interface ProjectedDepletion {
  projectId: string;
  projectName: string;
  projectedDepletionDate: string | null;
  daysUntilDepletion: number | null;
}

export interface BudgetAlert {
  severity: 'warning' | 'critical';
  projectId: string;
  projectName: string;
  message: string;
}

export interface CostPerMetricResponse {
  brandId: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: CostPerMetricSummary;
  byAsset: AssetCostMetrics[];
  byProject: ProjectCostMetrics[];
  byCreator: CreatorCostMetrics[];
  trends: EfficiencyTrends;
  benchmarks: PlatformBenchmarks;
  insights: CostInsight[];
  dataQuality: DataQualityMetrics;
}

export interface CostPerMetricSummary {
  totalLicensingCostCents: number;
  costPerView: number | null;
  costPerClick: number | null;
  costPerConversion: number | null;
  costPerEngagement: number | null;
  totalViews: number;
  totalClicks: number;
  totalConversions: number;
  totalEngagements: number;
}

export interface AssetCostMetrics {
  assetId: string;
  assetTitle: string;
  assetType: string;
  licensingCostCents: number;
  views: number;
  clicks: number;
  conversions: number;
  engagements: number;
  costPerView: number | null;
  costPerClick: number | null;
  costPerConversion: number | null;
  costPerEngagement: number | null;
  efficiencyScore: number;
}

export interface ProjectCostMetrics {
  projectId: string;
  projectName: string;
  licensingCostCents: number;
  views: number;
  clicks: number;
  conversions: number;
  costPerView: number | null;
  costPerClick: number | null;
  costPerConversion: number | null;
  averageEfficiency: number;
}

export interface CreatorCostMetrics {
  creatorId: string;
  creatorName: string;
  licensingCostCents: number;
  assetCount: number;
  views: number;
  clicks: number;
  conversions: number;
  costPerView: number | null;
  costPerClick: number | null;
  costPerConversion: number | null;
}

export interface EfficiencyTrends {
  efficiencyOverTime: EfficiencyDataPoint[];
  improvementPercentage: number;
}

export interface EfficiencyDataPoint {
  date: string;
  costPerView: number | null;
  costPerClick: number | null;
  costPerConversion: number | null;
}

export interface PlatformBenchmarks {
  platformAverageCostPerView: number | null;
  platformAverageCostPerClick: number | null;
  platformAverageCostPerConversion: number | null;
  brandPerformancePercentile: number | null;
}

export interface CostInsight {
  type: 'top_performer' | 'underperformer' | 'optimal_price_point' | 'tracking_gap';
  title: string;
  description: string;
  assetId?: string;
  projectId?: string;
}

export interface DataQualityMetrics {
  assetsWithTracking: number;
  assetsWithoutTracking: number;
  trackingCoverage: number;
}

// ============================================================================
// Enums
// ============================================================================

export enum ProjectStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum BudgetStatus {
  UNDER_BUDGET = 'under_budget',
  ON_BUDGET = 'on_budget',
  OVER_BUDGET = 'over_budget',
  AT_RISK = 'at_risk',
  NO_BUDGET = 'no_budget'
}

export enum MetricType {
  VIEW = 'view',
  CLICK = 'click',
  CONVERSION = 'conversion',
  ENGAGEMENT = 'engagement'
}

export enum GroupByDimension {
  ASSET = 'asset',
  PROJECT = 'project',
  CREATOR = 'creator',
  ALL = 'all'
}

export enum Granularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month'
}

export enum InsightType {
  TOP_PERFORMER = 'top_performer',
  UNDERPERFORMER = 'underperformer',
  OPTIMAL_PRICE_POINT = 'optimal_price_point',
  TRACKING_GAP = 'tracking_gap'
}

export enum AlertSeverity {
  WARNING = 'warning',
  CRITICAL = 'critical'
}
```

---

## Authentication & Authorization

### Authentication Method

All endpoints require JWT authentication via Bearer token in the Authorization header.

```typescript
// HTTP Header
Authorization: Bearer <jwt_token>
```

### User Roles & Permissions

| Role | Access Level | Notes |
|------|-------------|-------|
| **ADMIN** | Full access to all brands | No restrictions |
| **Brand Owner** | Full access to owned brand | User must be brand owner (`brand.userId === user.id`) |
| **Team Member** | Conditional access | Requires `view_analytics` or `admin` permission in team member permissions |

### Permission Verification Flow

```typescript
// Pseudo-code for access verification
async function verifyBrandAccess(userId: string, userRole: string, brandId: string) {
  // 1. Admin bypass
  if (userRole === 'ADMIN') return true;
  
  // 2. Get brand
  const brand = await getBrand(brandId);
  if (!brand) throw NotFoundError;
  
  // 3. Check ownership
  if (brand.userId === userId) return true;
  
  // 4. Check team membership
  const teamMember = brand.teamMembers.find(tm => tm.userId === userId);
  if (teamMember) {
    const hasPermission = teamMember.permissions.includes('view_analytics') ||
                          teamMember.permissions.includes('admin');
    if (hasPermission) return true;
  }
  
  // 5. Access denied
  throw ForbiddenError;
}
```

### Required Permissions

```typescript
// Brand team member permissions schema
interface TeamMember {
  userId: string;
  role: string;
  permissions: string[];  // e.g., ['view_analytics', 'edit_projects', 'admin']
}

// Required permission for analytics access
const REQUIRED_PERMISSIONS = ['view_analytics', 'admin'];
```

### Access Patterns by Endpoint

| Endpoint | Brand Owner | Team w/ `view_analytics` | Team w/ `admin` | ADMIN Role |
|----------|-------------|-------------------------|-----------------|------------|
| `getSpendAnalysis` | ✅ | ✅ | ✅ | ✅ |
| `getBudgetUtilization` | ✅ | ✅ | ✅ | ✅ |
| `getCostPerMetric` | ✅ | ✅ | ✅ | ✅ |

---

**Continue to [Part 2: Business Logic, Error Handling & Implementation](./FINANCIAL_ANALYTICS_INTEGRATION_GUIDE_PART_2.md)**
