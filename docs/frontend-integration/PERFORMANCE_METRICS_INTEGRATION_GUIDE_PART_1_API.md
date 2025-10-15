# Performance Metrics Integration Guide - Part 1: API Endpoints

**Classification**: ⚡ HYBRID
- License performance tracking happens on both website (brand/creator dashboards) and admin backend
- Admins have access to platform-wide analytics and conflict resolution tools
- Brands/creators can view their own license performance metrics

---

## Table of Contents
- [Overview](#overview)
- [API Endpoints](#api-endpoints)
- [Request/Response Examples](#requestresponse-examples)
- [TypeScript Type Definitions](#typescript-type-definitions)
- [Authentication Requirements](#authentication-requirements)

---

## Overview

The Performance Metrics module provides comprehensive analytics for license performance including:
- **ROI Calculations**: Revenue generation, break-even analysis, projections
- **Utilization Tracking**: Usage against scope limits with trend analysis
- **Approval Time Metrics**: Time from creation to approval with bottleneck detection
- **Conflict Rate Analysis**: Platform-wide conflict detection and categorization
- **Renewal Performance**: Integration with renewal analytics system

**Base URL**: `https://ops.yesgoddess.agency/api/trpc`

---

## API Endpoints

### 1. Get License Performance Metrics

Get complete performance metrics for a single license (ROI, utilization, approval time).

**Endpoint**: `licenses.getPerformanceMetrics`  
**Method**: `query` (GET)  
**Access**: Protected (Brand/Creator/Admin with access to license)

#### Request Parameters

```typescript
{
  licenseId: string; // CUID format (e.g., "clx7a2b3c4d5e6f7g8h9i")
}
```

#### Response Schema

```typescript
{
  data: {
    roi: LicenseROIMetrics;
    utilization: LicenseUtilizationMetrics;
    approval: ApprovalTimeMetrics;
  }
}
```

#### cURL Example

```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/licenses.getPerformanceMetrics?input=%7B%22licenseId%22%3A%22clx7a2b3c4d5e6f7g8h9i%22%7D' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Success Response (200 OK)

```json
{
  "data": {
    "roi": {
      "licenseId": "clx7a2b3c4d5e6f7g8h9i",
      "totalRevenueCents": 500000,
      "totalCostCents": 250000,
      "roiPercentage": 100.0,
      "breakEvenDate": "2025-08-15T00:00:00Z",
      "daysToBreakEven": 45,
      "projectedAnnualROI": 150.5,
      "revenueGrowthRate": 15.3
    },
    "utilization": {
      "licenseId": "clx7a2b3c4d5e6f7g8h9i",
      "utilizationPercentage": 85.5,
      "actualUsageCount": 855,
      "scopeLimitCount": 1000,
      "remainingCapacity": 145,
      "utilizationTrend": "increasing",
      "isOverUtilized": false,
      "isUnderUtilized": false,
      "usageByType": {
        "asset_viewed": 500,
        "asset_downloaded": 300,
        "license_clicked": 55
      }
    },
    "approval": {
      "licenseId": "clx7a2b3c4d5e6f7g8h9i",
      "createdAt": "2025-06-01T14:30:00Z",
      "signedAt": "2025-06-03T10:15:00Z",
      "approvalDurationHours": 43.75,
      "approvalDurationDays": 1,
      "status": "ACTIVE",
      "approvalStage": "approved",
      "bottlenecks": []
    }
  }
}
```

#### Error Responses

**404 Not Found** - License doesn't exist
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "License not found"
  }
}
```

**403 Forbidden** - User doesn't have access to this license
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to view this license"
  }
}
```

**401 Unauthorized** - Invalid or missing JWT token
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

---

### 2. Get Performance Dashboard (Admin Only)

Get comprehensive platform-wide performance dashboard for a specified time period.

**Endpoint**: `licenses.getPerformanceDashboard`  
**Method**: `query` (GET)  
**Access**: Admin Only

#### Request Parameters

```typescript
{
  period?: '7d' | '30d' | '90d' | '1y'; // Default: '30d'
}
```

#### Response Schema

```typescript
{
  data: {
    summary: {
      period: string;
      startDate: string; // ISO 8601
      endDate: string;   // ISO 8601
    };
    revenue: {
      totalRevenueCents: number;
      averageRevenuePerLicense: number;
      revenueGrowthPercent: number;
      topRevenueGenerators: Array<{
        licenseId: string;
        brandName: string;
        ipAssetTitle: string;
        revenueCents: number;
      }>;
    };
    roi: {
      averageROI: number;
      medianROI: number;
      topPerformingLicenses: Array<{
        licenseId: string;
        roiPercentage: number;
        revenueCents: number;
      }>;
      underperformingLicenses: Array<{
        licenseId: string;
        roiPercentage: number;
        revenueCents: number;
        reasons: string[];
      }>;
    };
    utilization: {
      averageUtilization: number;
      overUtilizedCount: number;
      underUtilizedCount: number;
      wellUtilizedCount: number;
    };
    conflicts: {
      conflictRate: number;
      averageResolutionTime: number;
      conflictTrend: 'increasing' | 'decreasing' | 'stable';
      details: ConflictRateMetrics;
    };
    approvals: {
      averageApprovalTime: number;
      medianApprovalTime: number;
      bottlenecks: string[];
      approvalsByStage: Record<string, number>;
    };
    renewals: {
      renewalRate: number;
      revenueRetentionRate: number;
    };
  }
}
```

#### cURL Example

```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/licenses.getPerformanceDashboard?input=%7B%22period%22%3A%2230d%22%7D' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Success Response (200 OK)

```json
{
  "data": {
    "summary": {
      "period": "30d",
      "startDate": "2025-09-14T00:00:00Z",
      "endDate": "2025-10-14T00:00:00Z"
    },
    "revenue": {
      "totalRevenueCents": 15000000,
      "averageRevenuePerLicense": 75000,
      "revenueGrowthPercent": 12.5,
      "topRevenueGenerators": [
        {
          "licenseId": "clx7a2b3c4d5e6f7g8h9i",
          "brandName": "Nike",
          "ipAssetTitle": "Swoosh Logo Collection",
          "revenueCents": 2500000
        }
      ]
    },
    "roi": {
      "averageROI": 85.3,
      "medianROI": 72.1,
      "topPerformingLicenses": [
        {
          "licenseId": "clx7a2b3c4d5e6f7g8h9i",
          "roiPercentage": 250.5,
          "revenueCents": 2500000
        }
      ],
      "underperformingLicenses": [
        {
          "licenseId": "clx9z8y7x6w5v4u3t2s1r",
          "roiPercentage": -15.2,
          "revenueCents": 50000,
          "reasons": ["Low usage", "High creator fees"]
        }
      ]
    },
    "utilization": {
      "averageUtilization": 68.5,
      "overUtilizedCount": 12,
      "underUtilizedCount": 35,
      "wellUtilizedCount": 153
    },
    "conflicts": {
      "conflictRate": 3.2,
      "averageResolutionTime": 48,
      "conflictTrend": "decreasing",
      "details": {
        "period": {
          "start": "2025-09-14T00:00:00Z",
          "end": "2025-10-14T00:00:00Z"
        },
        "totalLicensesCreated": 200,
        "totalConflictsDetected": 6,
        "conflictRate": 3.0,
        "conflictsByType": {
          "exclusive_overlap": 3,
          "territory_conflict": 2,
          "competitor_exclusivity": 1
        },
        "conflictsBySeverity": {
          "critical": 1,
          "warning": 3,
          "info": 2
        },
        "topConflictingAssets": [
          {
            "ipAssetId": "clx1a2b3c4d5e6f7g8h9j",
            "ipAssetTitle": "Premium Logo Set",
            "conflictCount": 3
          }
        ],
        "resolutionTimeAvg": 48
      }
    },
    "approvals": {
      "averageApprovalTime": 52.3,
      "medianApprovalTime": 36.0,
      "bottlenecks": [
        "Legal review taking > 72 hours",
        "Creator signature delays"
      ],
      "approvalsByStage": {
        "created": 15,
        "pending_approval": 8,
        "approved": 170,
        "expired": 7
      }
    },
    "renewals": {
      "renewalRate": 72.5,
      "revenueRetentionRate": 85.3
    }
  }
}
```

#### Error Responses

**403 Forbidden** - Non-admin user attempting access
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin access required"
  }
}
```

---

### 3. Get Aggregated Performance Metrics (Admin Only)

Get platform-wide aggregated performance metrics for a custom date range.

**Endpoint**: `licenses.getAggregatedPerformanceMetrics`  
**Method**: `query` (GET)  
**Access**: Admin Only

#### Request Parameters

```typescript
{
  startDate: string;  // ISO 8601 datetime (e.g., "2025-01-01T00:00:00Z")
  endDate: string;    // ISO 8601 datetime
  granularity?: 'daily' | 'weekly' | 'monthly'; // Default: 'monthly'
}
```

#### Response Schema

```typescript
{
  data: AggregatedPerformanceMetrics;
}
```

#### cURL Example

```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/licenses.getAggregatedPerformanceMetrics?input=%7B%22startDate%22%3A%222025-01-01T00%3A00%3A00Z%22%2C%22endDate%22%3A%222025-01-31T23%3A59%3A59Z%22%2C%22granularity%22%3A%22monthly%22%7D' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Success Response (200 OK)

```json
{
  "data": {
    "period": {
      "start": "2025-01-01T00:00:00Z",
      "end": "2025-01-31T23:59:59Z",
      "granularity": "monthly"
    },
    "revenue": {
      "totalRevenueCents": 45000000,
      "averageRevenuePerLicense": 90000,
      "revenueGrowthPercent": 18.2,
      "topRevenueGenerators": [
        {
          "licenseId": "clx7a2b3c4d5e6f7g8h9i",
          "brandName": "Nike",
          "ipAssetTitle": "Swoosh Logo Collection",
          "revenueCents": 5000000
        }
      ]
    },
    "roi": {
      "averageROI": 92.5,
      "medianROI": 78.3,
      "topPerformingLicenses": [],
      "underperformingLicenses": []
    },
    "utilization": {
      "averageUtilization": 71.2,
      "overUtilizedCount": 18,
      "underUtilizedCount": 42,
      "wellUtilizedCount": 440
    },
    "conflicts": {
      "conflictRate": 2.8,
      "averageResolutionTime": 48,
      "conflictTrend": "stable"
    },
    "approvals": {
      "averageApprovalTime": 48.5,
      "medianApprovalTime": 36.0,
      "bottlenecks": [],
      "approvalsByStage": {
        "created": 25,
        "pending_approval": 12,
        "approved": 450,
        "expired": 13
      }
    },
    "renewals": {
      "renewalRate": 75.3,
      "revenueRetentionRate": 88.1
    }
  }
}
```

---

### 4. Get Conflict Rate Metrics (Admin Only)

Get detailed conflict rate analysis for a specific time period.

**Endpoint**: `licenses.getConflictRateMetrics`  
**Method**: `query` (GET)  
**Access**: Admin Only

#### Request Parameters

```typescript
{
  startDate: string;  // ISO 8601 datetime
  endDate: string;    // ISO 8601 datetime
}
```

#### Response Schema

```typescript
{
  data: ConflictRateMetrics;
}
```

#### cURL Example

```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/licenses.getConflictRateMetrics?input=%7B%22startDate%22%3A%222025-01-01T00%3A00%3A00Z%22%2C%22endDate%22%3A%222025-01-31T23%3A59%3A59Z%22%7D' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Success Response (200 OK)

```json
{
  "data": {
    "period": {
      "start": "2025-01-01T00:00:00Z",
      "end": "2025-01-31T23:59:59Z"
    },
    "totalLicensesCreated": 500,
    "totalConflictsDetected": 14,
    "conflictRate": 2.8,
    "conflictsByType": {
      "exclusive_overlap": 6,
      "territory_conflict": 5,
      "competitor_exclusivity": 2,
      "usage_limit_conflict": 1
    },
    "conflictsBySeverity": {
      "critical": 2,
      "warning": 7,
      "info": 5
    },
    "topConflictingAssets": [
      {
        "ipAssetId": "clx1a2b3c4d5e6f7g8h9j",
        "ipAssetTitle": "Premium Logo Set",
        "conflictCount": 4
      },
      {
        "ipAssetId": "clx2b3c4d5e6f7g8h9i0k",
        "ipAssetTitle": "Brand Identity Package",
        "conflictCount": 3
      }
    ],
    "resolutionTimeAvg": 48
  }
}
```

---

### 5. Get Historical Performance Metrics (Admin Only)

Get historical performance data snapshots over time.

**Endpoint**: `licenses.getHistoricalPerformanceMetrics`  
**Method**: `query` (GET)  
**Access**: Admin Only

#### Request Parameters

```typescript
{
  startDate: string;  // ISO 8601 datetime
  endDate: string;    // ISO 8601 datetime
  granularity?: 'daily' | 'weekly' | 'monthly'; // Default: 'daily'
}
```

#### Response Schema

```typescript
{
  data: Array<AggregatedPerformanceMetrics & { date: string }>;
}
```

#### cURL Example

```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/licenses.getHistoricalPerformanceMetrics?input=%7B%22startDate%22%3A%222024-01-01T00%3A00%3A00Z%22%2C%22endDate%22%3A%222025-01-31T23%3A59%3A59Z%22%2C%22granularity%22%3A%22monthly%22%7D' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

#### Success Response (200 OK)

Returns an array of performance snapshots, one for each time period based on granularity.

```json
{
  "data": [
    {
      "date": "2024-01-01T00:00:00Z",
      "period": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-01-31T23:59:59Z",
        "granularity": "monthly"
      },
      "revenue": { /* ... */ },
      "roi": { /* ... */ },
      "utilization": { /* ... */ },
      "conflicts": { /* ... */ },
      "approvals": { /* ... */ },
      "renewals": { /* ... */ }
    },
    {
      "date": "2024-02-01T00:00:00Z",
      "period": {
        "start": "2024-02-01T00:00:00Z",
        "end": "2024-02-29T23:59:59Z",
        "granularity": "monthly"
      },
      "revenue": { /* ... */ },
      /* ... */
    }
    // ... more snapshots
  ]
}
```

---

## TypeScript Type Definitions

Copy these type definitions into your frontend codebase:

```typescript
/**
 * License ROI Metrics
 */
export interface LicenseROIMetrics {
  licenseId: string;
  totalRevenueCents: number;
  totalCostCents: number;
  roiPercentage: number;
  breakEvenDate: Date | null;
  daysToBreakEven: number | null;
  projectedAnnualROI: number;
  revenueGrowthRate: number;
}

/**
 * License Utilization Metrics
 */
export interface LicenseUtilizationMetrics {
  licenseId: string;
  utilizationPercentage: number;
  actualUsageCount: number;
  scopeLimitCount: number | null; // null means unlimited
  remainingCapacity: number | null;
  utilizationTrend: 'increasing' | 'decreasing' | 'stable';
  isOverUtilized: boolean;
  isUnderUtilized: boolean;
  usageByType: Record<string, number>;
}

/**
 * Approval Time Metrics
 */
export interface ApprovalTimeMetrics {
  licenseId: string;
  createdAt: Date;
  signedAt: Date | null;
  approvalDurationHours: number | null;
  approvalDurationDays: number | null;
  status: string;
  approvalStage: 'created' | 'pending_approval' | 'approved' | 'expired';
  bottlenecks: string[];
}

/**
 * Conflict Rate Metrics
 */
export interface ConflictRateMetrics {
  period: {
    start: Date;
    end: Date;
  };
  totalLicensesCreated: number;
  totalConflictsDetected: number;
  conflictRate: number; // Percentage
  conflictsByType: Record<string, number>;
  conflictsBySeverity: {
    critical: number;
    warning: number;
    info: number;
  };
  topConflictingAssets: Array<{
    ipAssetId: string;
    ipAssetTitle: string;
    conflictCount: number;
  }>;
  resolutionTimeAvg: number; // hours
}

/**
 * Aggregated Performance Metrics
 */
export interface AggregatedPerformanceMetrics {
  period: {
    start: Date;
    end: Date;
    granularity: 'daily' | 'weekly' | 'monthly';
  };
  revenue: {
    totalRevenueCents: number;
    averageRevenuePerLicense: number;
    revenueGrowthPercent: number;
    topRevenueGenerators: Array<{
      licenseId: string;
      brandName: string;
      ipAssetTitle: string;
      revenueCents: number;
    }>;
  };
  roi: {
    averageROI: number;
    medianROI: number;
    topPerformingLicenses: Array<{
      licenseId: string;
      roiPercentage: number;
      revenueCents: number;
    }>;
    underperformingLicenses: Array<{
      licenseId: string;
      roiPercentage: number;
      revenueCents: number;
      reasons: string[];
    }>;
  };
  utilization: {
    averageUtilization: number;
    overUtilizedCount: number;
    underUtilizedCount: number;
    wellUtilizedCount: number;
  };
  conflicts: {
    conflictRate: number;
    averageResolutionTime: number;
    conflictTrend: 'increasing' | 'decreasing' | 'stable';
  };
  approvals: {
    averageApprovalTime: number; // hours
    medianApprovalTime: number;
    bottlenecks: string[];
    approvalsByStage: Record<string, number>;
  };
  renewals: {
    renewalRate: number;
    revenueRetentionRate: number;
  };
}

/**
 * Performance Dashboard Response
 */
export interface PerformanceDashboardResponse {
  summary: {
    period: '7d' | '30d' | '90d' | '1y';
    startDate: string;
    endDate: string;
  };
  revenue: AggregatedPerformanceMetrics['revenue'];
  roi: AggregatedPerformanceMetrics['roi'];
  utilization: AggregatedPerformanceMetrics['utilization'];
  conflicts: AggregatedPerformanceMetrics['conflicts'] & {
    details: ConflictRateMetrics;
  };
  approvals: AggregatedPerformanceMetrics['approvals'];
  renewals: AggregatedPerformanceMetrics['renewals'];
}
```

---

## Authentication Requirements

### Authentication Header

All endpoints require JWT authentication via the Authorization header:

```
Authorization: Bearer <JWT_TOKEN>
```

### Access Control Matrix

| Endpoint | ADMIN | BRAND | CREATOR | Notes |
|----------|-------|-------|---------|-------|
| `getPerformanceMetrics` | ✅ | ✅* | ✅* | *Only for own licenses |
| `getPerformanceDashboard` | ✅ | ❌ | ❌ | Admin only |
| `getAggregatedPerformanceMetrics` | ✅ | ❌ | ❌ | Admin only |
| `getConflictRateMetrics` | ✅ | ❌ | ❌ | Admin only |
| `getHistoricalPerformanceMetrics` | ✅ | ❌ | ❌ | Admin only |

### License Access Rules

For `getPerformanceMetrics`, users can access metrics if:

1. **Admin**: Full access to all licenses
2. **Brand**: Access to licenses where `license.brandId === user.brandId`
3. **Creator**: Access to licenses for IP assets they own (via `ipAsset.ownerships`)

---

## Next Steps

Continue to:
- **[Part 2: Business Logic & Validation](./PERFORMANCE_METRICS_INTEGRATION_GUIDE_PART_2_LOGIC.md)** - Metric calculations, thresholds, and business rules
- **[Part 3: Implementation Guide](./PERFORMANCE_METRICS_INTEGRATION_GUIDE_PART_3_IMPLEMENTATION.md)** - Frontend implementation, React Query, and UI components

---

**Document Version**: 1.0  
**Last Updated**: October 14, 2025  
**Backend Module**: License Performance Metrics  
**Status**: ✅ Complete & Production Ready
