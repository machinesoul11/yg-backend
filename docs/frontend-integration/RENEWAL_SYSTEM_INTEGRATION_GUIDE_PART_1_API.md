# Frontend Integration Guide: License Renewal System - Part 1: API Endpoints

**Classification:** ⚡ HYBRID  
**Target Audience:** Frontend developers building UI for YesGoddess  
**Backend API:** tRPC endpoints at `ops.yesgoddess.agency`  
**Last Updated:** October 14, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Examples](#requestresponse-examples)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Pagination & Filtering](#pagination--filtering)

---

## Overview

The License Renewal System automates the entire renewal lifecycle for IP licenses approaching expiration. The system handles:

- **Renewal Eligibility Checks** - Validates if a license can be renewed
- **Renewal Offer Generation** - Creates pricing proposals with breakdown
- **Renewal Acceptance** - Processes brand acceptance and creates new licenses
- **Renewal Analytics** - Tracks performance metrics and forecasting
- **Automated Notifications** - Multi-stage email reminders (90d, 60d, 30d, 7d)
- **Auto-Renewal** - Automatic processing for enabled licenses

### Key Concepts

- **Renewal Window:** Licenses can be renewed 90 days before expiration
- **Grace Period:** 30 days after expiration for late renewals
- **Offer Expiry:** Renewal offers expire 30 days after generation
- **Notification Stages:** 4 automated stages (Initial Offer, First Reminder, Second Reminder, Final Notice)
- **Pricing Strategies:** 6 strategies (FLAT_RENEWAL, USAGE_BASED, MARKET_RATE, PERFORMANCE_BASED, NEGOTIATED, AUTOMATIC)

### User Roles & Access

- **🌐 Brands (BRAND role):** Check eligibility, generate offers, accept renewals for their licenses
- **🌐 Creators (CREATOR role):** Approve renewal licenses (workflow approval)
- **🔒 Admins (ADMIN role):** View analytics, pipeline snapshots, force renewals, manage configuration
- **⚡ Hybrid Access:** Core renewal data visible to both brands and admins with different permissions

---

## API Endpoints

All endpoints use **tRPC** and are accessed via the `licenses` namespace.

### 1. Check Renewal Eligibility

**tRPC Procedure:** `licenses.checkRenewalEligibility`  
**Type:** Query  
**Auth Required:** Yes (Protected)  
**Roles:** BRAND (own licenses), ADMIN (all licenses)

#### Purpose
Validates whether a license is eligible for renewal and provides detailed context including blocking issues, warnings, and suggested actions.

#### Input Schema
```typescript
{
  licenseId: string; // CUID of the license
}
```

#### Output Schema
```typescript
{
  data: {
    eligible: boolean;
    reasons: string[];
    blockingIssues: string[];
    warnings: string[];
    metadata: {
      daysUntilExpiration: number;
      currentLicenseValue: number; // in cents
      historicalRenewalRate?: number; // 0-1 (percentage)
      renewalLikelihood?: 'HIGH' | 'MEDIUM' | 'LOW';
      lastRenewalDate?: Date;
      renewalCount: number;
      brandRelationshipLength: number; // in days
      hasAutoRenew: boolean;
      hasPaymentIssues: boolean;
      hasActiveDisputes: boolean;
      conflictCount: number;
    };
    suggestedAction?: string;
  };
}
```

---

### 2. Generate Renewal Offer

**tRPC Procedure:** `licenses.generateRenewalOffer`  
**Type:** Mutation  
**Auth Required:** Yes (Protected)  
**Roles:** BRAND (own licenses), ADMIN (all licenses)

#### Purpose
Creates a formal renewal offer with detailed pricing breakdown. Stores offer in license metadata and triggers email notification to brand.

#### Input Schema
```typescript
{
  licenseId: string; // CUID of the license
  pricingStrategy?: 'FLAT_RENEWAL' | 'USAGE_BASED' | 'MARKET_RATE' | 'PERFORMANCE_BASED' | 'NEGOTIATED' | 'AUTOMATIC';
  customAdjustmentPercent?: number; // For NEGOTIATED strategy only (-100 to 100)
}
```

#### Output Schema
```typescript
{
  data: {
    offerId: string; // Unique offer identifier
    pricing: {
      originalFeeCents: number;
      baseRenewalFeeCents: number;
      adjustments: Array<{
        type: string; // 'INFLATION' | 'LOYALTY' | 'EARLY_RENEWAL' | 'USAGE_BASED' | 'MARKET_RATE' | 'PERFORMANCE'
        label: string;
        amountCents: number; // Can be negative for discounts
        percentChange: number;
        reason: string;
      }>;
      subtotalCents: number;
      finalFeeCents: number;
      finalRevShareBps: number; // Basis points (10000 = 100%)
      strategy: string; // The strategy used
      confidenceScore: number; // 0-100
      metadata: {
        loyaltyDiscountApplied: boolean;
        performanceBonusApplied: boolean;
        marketAdjustmentApplied: boolean;
        earlyRenewalDiscountApplied: boolean;
        capApplied: boolean;
        minimumEnforced: boolean;
        historicalRenewalCount: number;
        brandRelationshipMonths: number;
        expectedCreatorRevenueCents: number;
      };
      comparison: {
        percentChange: number; // Total % change from original
        absoluteChangeCents: number;
        projectedAnnualValue: number;
      };
      reasoning: string[]; // Human-readable explanations
    };
  };
}
```

---

### 3. Accept Renewal Offer

**tRPC Procedure:** `licenses.acceptRenewalOffer`  
**Type:** Mutation  
**Auth Required:** Yes (Protected)  
**Roles:** BRAND (own licenses only)

#### Purpose
Accepts a renewal offer and creates a new license with PENDING_APPROVAL status. Triggers creator approval workflow and sends confirmation emails.

#### Input Schema
```typescript
{
  licenseId: string; // CUID of the original license
  offerId: string; // Offer ID from generateRenewalOffer
}
```

#### Output Schema
```typescript
{
  data: License; // Full license object (see TypeScript definitions)
}
```

---

### 4. Get Renewal Analytics

**tRPC Procedure:** `licenses.getRenewalAnalytics`  
**Type:** Query  
**Auth Required:** Yes (Admin only)  
**Roles:** ADMIN

#### Purpose
Returns comprehensive renewal performance metrics for a specified time period. Used for admin dashboards and reporting.

#### Input Schema
```typescript
{
  startDate?: string; // ISO datetime, defaults to 30 days ago
  endDate?: string; // ISO datetime, defaults to now
}
```

#### Output Schema
```typescript
{
  data: {
    period: {
      start: Date;
      end: Date;
    };
    renewalRate: number; // Percentage (0-100)
    totalLicensesExpiring: number;
    totalRenewalsSuccessful: number;
    totalRenewalsFailed: number;
    averageTimeToRenewal: number; // Days from offer to acceptance
    revenueRetentionRate: number; // Percentage (0-100)
    totalRenewalRevenueCents: number;
    byPricingStrategy: Array<{
      strategy: string;
      count: number;
      averageFeeCents: number;
      acceptanceRate: number;
    }>;
    byNotificationStage: Array<{
      stage: string;
      sent: number;
      opened: number;
      clicked: number;
      converted: number;
    }>;
    topPerformingAssets: Array<{
      ipAssetId: string;
      ipAssetTitle: string;
      renewalCount: number;
      totalRevenueCents: number;
    }>;
    atRiskLicenses: Array<{
      licenseId: string;
      brandName: string;
      ipAssetTitle: string;
      daysUntilExpiration: number;
      reason: string;
    }>;
  };
}
```

---

### 5. Get Renewal Pipeline

**tRPC Procedure:** `licenses.getRenewalPipeline`  
**Type:** Query  
**Auth Required:** Yes (Admin only)  
**Roles:** ADMIN

#### Purpose
Provides a snapshot of the current renewal pipeline with stage breakdowns and revenue forecasting.

#### Input Schema
```typescript
// No input parameters
```

#### Output Schema
```typescript
{
  data: {
    timestamp: Date;
    stages: {
      eligible: number; // Licenses in 90-day window
      offerGenerated: number; // Offers sent to brands
      underReview: number; // Currently 0 (future implementation)
      approved: number; // Currently 0 (future implementation)
      inNegotiation: number; // Currently 0 (future implementation)
      rejected: number; // Currently 0 (future implementation)
    };
    forecastedRevenueCents: number; // Expected revenue from pipeline
    atRiskRevenueCents: number; // Revenue from licenses without offers
  };
}
```

---

## Request/Response Examples

### Example 1: Check Renewal Eligibility

**Using tRPC Client:**
```typescript
import { trpc } from '@/lib/trpc';

// In your component or hook
const { data, isLoading, error } = trpc.licenses.checkRenewalEligibility.useQuery({
  licenseId: 'clx123abc'
});

if (isLoading) return <Spinner />;
if (error) return <ErrorMessage error={error} />;

if (data?.data.eligible) {
  console.log('License is eligible for renewal');
  console.log('Suggested action:', data.data.suggestedAction);
  console.log('Days until expiration:', data.data.metadata.daysUntilExpiration);
} else {
  console.log('Blocking issues:', data?.data.blockingIssues);
}
```

**Success Response (Eligible):**
```json
{
  "data": {
    "eligible": true,
    "reasons": ["License meets all renewal criteria"],
    "blockingIssues": [],
    "warnings": ["Brand has no billing information on file. Payment setup required."],
    "metadata": {
      "daysUntilExpiration": 75,
      "currentLicenseValue": 500000,
      "historicalRenewalRate": 0.85,
      "renewalLikelihood": "HIGH",
      "lastRenewalDate": "2024-01-15T00:00:00.000Z",
      "renewalCount": 2,
      "brandRelationshipLength": 730,
      "hasAutoRenew": false,
      "hasPaymentIssues": false,
      "hasActiveDisputes": false,
      "conflictCount": 0
    },
    "suggestedAction": "Generate renewal offer and notify brand for manual approval."
  }
}
```

**Error Response (Not Eligible):**
```json
{
  "data": {
    "eligible": false,
    "reasons": [
      "Too early for renewal",
      "Invalid license status for renewal"
    ],
    "blockingIssues": [
      "License is outside renewal window (120 days remaining, window opens at 90 days)",
      "License status is PENDING_APPROVAL, must be ACTIVE, EXPIRING_SOON, or EXPIRED"
    ],
    "warnings": [],
    "metadata": {
      "daysUntilExpiration": 120,
      "currentLicenseValue": 300000,
      "renewalCount": 0,
      "brandRelationshipLength": 90,
      "hasAutoRenew": false,
      "hasPaymentIssues": false,
      "hasActiveDisputes": false,
      "conflictCount": 0
    },
    "suggestedAction": "Resolve blocking issues: License is outside renewal window (120 days remaining, window opens at 90 days); License status is PENDING_APPROVAL..."
  }
}
```

---

### Example 2: Generate Renewal Offer with AUTOMATIC Strategy

**Using tRPC Client:**
```typescript
import { trpc } from '@/lib/trpc';

// In your component
const generateOffer = trpc.licenses.generateRenewalOffer.useMutation();

const handleGenerateOffer = async (licenseId: string) => {
  try {
    const result = await generateOffer.mutateAsync({
      licenseId,
      pricingStrategy: 'AUTOMATIC' // Optional, defaults to AUTOMATIC
    });

    console.log('Offer ID:', result.data.offerId);
    console.log('Final price:', result.data.pricing.finalFeeCents / 100);
    console.log('Price change:', result.data.pricing.comparison.percentChange + '%');
    
    // Show pricing breakdown to user
    result.data.pricing.adjustments.forEach(adj => {
      console.log(`${adj.label}: ${adj.amountCents / 100} (${adj.percentChange}%)`);
    });
  } catch (error) {
    console.error('Failed to generate offer:', error);
  }
};
```

**Success Response:**
```json
{
  "data": {
    "offerId": "renewal-offer-1729123456789",
    "pricing": {
      "originalFeeCents": 500000,
      "baseRenewalFeeCents": 525000,
      "adjustments": [
        {
          "type": "INFLATION",
          "label": "Base Rate Adjustment",
          "amountCents": 25000,
          "percentChange": 5,
          "reason": "Standard 5% annual rate adjustment"
        },
        {
          "type": "LOYALTY",
          "label": "Loyalty Discount",
          "amountCents": -26250,
          "percentChange": -5,
          "reason": "5% loyalty discount for 2 previous renewals"
        },
        {
          "type": "EARLY_RENEWAL",
          "label": "Early Renewal Discount",
          "amountCents": -24937,
          "percentChange": -5,
          "reason": "5% discount for renewing 75 days early"
        }
      ],
      "subtotalCents": 473813,
      "finalFeeCents": 473813,
      "finalRevShareBps": 2000,
      "strategy": "AUTOMATIC",
      "confidenceScore": 85,
      "metadata": {
        "loyaltyDiscountApplied": true,
        "performanceBonusApplied": false,
        "marketAdjustmentApplied": false,
        "earlyRenewalDiscountApplied": true,
        "capApplied": false,
        "minimumEnforced": false,
        "historicalRenewalCount": 2,
        "brandRelationshipMonths": 24,
        "expectedCreatorRevenueCents": 426432
      },
      "comparison": {
        "percentChange": -5.24,
        "absoluteChangeCents": -26187,
        "projectedAnnualValue": 519450
      },
      "reasoning": [
        "Standard 5% annual rate adjustment",
        "5% loyalty discount for 2 previous renewals",
        "Early renewal discount applied"
      ]
    }
  }
}
```

---

### Example 3: Accept Renewal Offer

**Using tRPC Client:**
```typescript
import { trpc } from '@/lib/trpc';

const acceptOffer = trpc.licenses.acceptRenewalOffer.useMutation();

const handleAcceptOffer = async (licenseId: string, offerId: string) => {
  try {
    const result = await acceptOffer.mutateAsync({
      licenseId,
      offerId
    });

    console.log('Renewal license created:', result.data.id);
    console.log('Status:', result.data.status); // PENDING_APPROVAL
    console.log('Creators will be notified for approval');
    
    // Redirect to renewal confirmation page
    router.push(`/licenses/${result.data.id}?renewal=success`);
  } catch (error: any) {
    if (error.message.includes('expired')) {
      alert('This renewal offer has expired. Please generate a new offer.');
    } else {
      console.error('Failed to accept offer:', error);
    }
  }
};
```

**Success Response:**
```json
{
  "data": {
    "id": "clx789xyz",
    "status": "PENDING_APPROVAL",
    "ipAssetId": "clx456def",
    "brandId": "clx123abc",
    "licenseType": "COMMERCIAL",
    "startDate": "2026-01-15T00:00:00.000Z",
    "endDate": "2027-01-14T23:59:59.999Z",
    "feeCents": 473813,
    "revShareBps": 2000,
    "parentLicenseId": "clx123abc",
    "autoRenew": false,
    "createdAt": "2025-10-14T12:00:00.000Z",
    "updatedAt": "2025-10-14T12:00:00.000Z",
    "metadata": {
      "renewalFrom": "clx123abc",
      "renewalOfferId": "renewal-offer-1729123456789",
      "renewalAdjustments": {
        "feeAdjustmentPercent": -5.24,
        "revShareAdjustmentBps": 0,
        "loyaltyDiscount": 5,
        "performanceBonus": 0
      }
    }
  }
}
```

---

### Example 4: Get Renewal Analytics (Admin Only)

**Using tRPC Client:**
```typescript
import { trpc } from '@/lib/trpc';
import { subDays } from 'date-fns';

// In admin dashboard
const { data, isLoading } = trpc.licenses.getRenewalAnalytics.useQuery({
  startDate: subDays(new Date(), 30).toISOString(),
  endDate: new Date().toISOString()
});

if (!isLoading && data) {
  console.log('Renewal rate:', data.data.renewalRate + '%');
  console.log('Revenue retention:', data.data.revenueRetentionRate + '%');
  console.log('Total renewal revenue:', data.data.totalRenewalRevenueCents / 100);
}
```

**Success Response:** *(See Output Schema above for full structure)*

---

### Example 5: Get Renewal Pipeline (Admin Only)

**Using tRPC Client:**
```typescript
import { trpc } from '@/lib/trpc';

const { data, isLoading } = trpc.licenses.getRenewalPipeline.useQuery();

if (!isLoading && data) {
  console.log('Eligible licenses:', data.data.stages.eligible);
  console.log('Offers generated:', data.data.stages.offerGenerated);
  console.log('Forecasted revenue:', data.data.forecastedRevenueCents / 100);
  console.log('At-risk revenue:', data.data.atRiskRevenueCents / 100);
  
  const conversionRate = data.data.stages.eligible > 0 
    ? (data.data.stages.offerGenerated / data.data.stages.eligible) * 100
    : 0;
  console.log('Offer generation rate:', conversionRate + '%');
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
// ============================================
// Renewal Eligibility Types
// ============================================

export interface RenewalEligibilityContext {
  eligible: boolean;
  reasons: string[];
  blockingIssues: string[];
  warnings: string[];
  metadata: {
    daysUntilExpiration: number;
    currentLicenseValue: number;
    historicalRenewalRate?: number;
    renewalLikelihood?: 'HIGH' | 'MEDIUM' | 'LOW';
    lastRenewalDate?: Date;
    renewalCount: number;
    brandRelationshipLength: number;
    hasAutoRenew: boolean;
    hasPaymentIssues: boolean;
    hasActiveDisputes: boolean;
    conflictCount: number;
  };
  suggestedAction?: string;
}

// ============================================
// Renewal Pricing Types
// ============================================

export type PricingStrategy =
  | 'FLAT_RENEWAL'      // Same price as original
  | 'USAGE_BASED'       // Adjust based on tracked usage
  | 'MARKET_RATE'       // Align to current market rates
  | 'PERFORMANCE_BASED' // Adjust based on ROI/performance
  | 'NEGOTIATED'        // Custom negotiated pricing
  | 'AUTOMATIC';        // Let system decide best strategy

export interface PricingAdjustment {
  type: string;
  label: string;
  amountCents: number;
  percentChange: number;
  reason: string;
}

export interface RenewalPricingBreakdown {
  originalFeeCents: number;
  baseRenewalFeeCents: number;
  adjustments: PricingAdjustment[];
  subtotalCents: number;
  finalFeeCents: number;
  finalRevShareBps: number;
  strategy: PricingStrategy;
  confidenceScore: number;
  metadata: {
    loyaltyDiscountApplied: boolean;
    performanceBonusApplied: boolean;
    marketAdjustmentApplied: boolean;
    earlyRenewalDiscountApplied: boolean;
    capApplied: boolean;
    minimumEnforced: boolean;
    historicalRenewalCount: number;
    brandRelationshipMonths: number;
    expectedCreatorRevenueCents: number;
  };
  comparison: {
    percentChange: number;
    absoluteChangeCents: number;
    projectedAnnualValue: number;
  };
  reasoning: string[];
}

// ============================================
// Renewal Analytics Types
// ============================================

export interface RenewalMetrics {
  period: {
    start: Date;
    end: Date;
  };
  renewalRate: number;
  totalLicensesExpiring: number;
  totalRenewalsSuccessful: number;
  totalRenewalsFailed: number;
  averageTimeToRenewal: number;
  revenueRetentionRate: number;
  totalRenewalRevenueCents: number;
  byPricingStrategy: Array<{
    strategy: string;
    count: number;
    averageFeeCents: number;
    acceptanceRate: number;
  }>;
  byNotificationStage: Array<{
    stage: string;
    sent: number;
    opened: number;
    clicked: number;
    converted: number;
  }>;
  topPerformingAssets: Array<{
    ipAssetId: string;
    ipAssetTitle: string;
    renewalCount: number;
    totalRevenueCents: number;
  }>;
  atRiskLicenses: Array<{
    licenseId: string;
    brandName: string;
    ipAssetTitle: string;
    daysUntilExpiration: number;
    reason: string;
  }>;
}

export interface RenewalPipelineSnapshot {
  timestamp: Date;
  stages: {
    eligible: number;
    offerGenerated: number;
    underReview: number;
    approved: number;
    inNegotiation: number;
    rejected: number;
  };
  forecastedRevenueCents: number;
  atRiskRevenueCents: number;
}

// ============================================
// License Type (Simplified)
// ============================================

export interface License {
  id: string;
  status: LicenseStatus;
  ipAssetId: string;
  brandId: string;
  projectId: string | null;
  licenseType: LicenseType;
  startDate: Date;
  endDate: Date;
  feeCents: number;
  revShareBps: number;
  paymentTerms: string;
  billingFrequency: BillingFrequency;
  scopeJson: any;
  autoRenew: boolean;
  parentLicenseId: string | null;
  createdBy: string;
  renewalNotifiedAt: Date | null;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export enum LicenseStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  PENDING_SIGNATURE = 'PENDING_SIGNATURE',
  ACTIVE = 'ACTIVE',
  EXPIRING_SOON = 'EXPIRING_SOON',
  EXPIRED = 'EXPIRED',
  RENEWED = 'RENEWED',
  TERMINATED = 'TERMINATED',
  SUSPENDED = 'SUSPENDED'
}

export enum LicenseType {
  COMMERCIAL = 'COMMERCIAL',
  EXCLUSIVE = 'EXCLUSIVE',
  NON_EXCLUSIVE = 'NON_EXCLUSIVE',
  ROYALTY_FREE = 'ROYALTY_FREE'
}

export enum BillingFrequency {
  ONE_TIME = 'ONE_TIME',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUALLY = 'ANNUALLY'
}
```

---

## Pagination & Filtering

### Analytics Endpoints
Analytics endpoints (getRenewalAnalytics, getRenewalPipeline) return aggregated data and do not support pagination. They accept date range filters.

**Date Range Filtering:**
```typescript
// Last 7 days
const weekAgo = subDays(new Date(), 7);
const { data } = trpc.licenses.getRenewalAnalytics.useQuery({
  startDate: weekAgo.toISOString(),
  endDate: new Date().toISOString()
});

// Last quarter
const quarterAgo = subMonths(new Date(), 3);
const { data } = trpc.licenses.getRenewalAnalytics.useQuery({
  startDate: quarterAgo.toISOString(),
  endDate: new Date().toISOString()
});

// Custom range
const { data } = trpc.licenses.getRenewalAnalytics.useQuery({
  startDate: '2025-01-01T00:00:00.000Z',
  endDate: '2025-03-31T23:59:59.999Z'
});
```

### License List Endpoints
To get lists of licenses eligible for renewal, use the existing license list endpoints with filters:

```typescript
// Get licenses expiring soon (within 90 days)
const { data } = trpc.licenses.list.useQuery({
  filters: {
    status: ['ACTIVE', 'EXPIRING_SOON'],
    expiringWithinDays: 90
  },
  pagination: {
    page: 1,
    pageSize: 20
  },
  sort: {
    field: 'endDate',
    direction: 'asc'
  }
});
```

---

## Next Steps

Continue to:
- **[Part 2: Business Logic & Workflows](./RENEWAL_SYSTEM_INTEGRATION_GUIDE_PART_2_LOGIC.md)** - Business rules, validation, state machines, and workflows
- **[Part 3: Advanced Features](./RENEWAL_SYSTEM_INTEGRATION_GUIDE_PART_3_ADVANCED.md)** - Error handling, notifications, real-time updates, and implementation checklist
