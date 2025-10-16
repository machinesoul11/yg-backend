# Payout Processing Module - Frontend Integration Guide (Part 1 of 2)

## Classification: 🔒 ADMIN ONLY
*Payout Processing is internal operations and admin interface only*

---

## Table of Contents - Part 1
1. **API Endpoints Overview**
2. **Authentication & Authorization**  
3. **TypeScript Type Definitions**
4. **Core API Endpoints (TRPC)**
5. **Request/Response Schemas**

---

## 1. API Endpoints Overview

The Payout Processing module uses **tRPC** for type-safe API communication. All endpoints are under the `payouts` namespace.

### Base URL Structure
```typescript
// Frontend API client usage
import { api } from '@/lib/api-client'

// Example endpoint call
const result = await api.payouts.transfer.mutate(payload)
```

### Available Endpoints Summary
| Method | Endpoint | Access Level | Description |
|--------|----------|-------------|-------------|
| `POST` | `payouts.transfer` | Creator/Admin | Initiate new payout |
| `GET` | `payouts.getById` | Creator/Admin | Get payout details |
| `GET` | `payouts.list` | Admin Only | List all payouts with filters |
| `POST` | `payouts.retry` | Creator/Admin | Retry failed payout |
| `GET` | `payouts.getMyPayouts` | Creator Only | Creator's payout history |
| `GET` | `payouts.getPendingBalance` | Creator Only | Creator's pending balance |
| `POST` | `payouts.batchInitiate` | Admin Only | Batch payout processing |

---

## 2. Authentication & Authorization

### JWT Token Required
```typescript
// All requests must include valid JWT token
headers: {
  'Authorization': `Bearer ${userToken}`
}
```

### Role-Based Access Control

**ADMIN Access:**
- Can initiate payouts for any creator
- View all payouts with filtering
- Retry any failed payout
- Execute batch payout operations
- Access financial reporting

**CREATOR Access:**
- Can only initiate payouts for themselves  
- View only their own payout history
- Retry only their own failed payouts
- Check their pending balance

### Security Filters
The backend automatically applies security filters based on user role:

```typescript
// Creators automatically filtered to their own data
// No need to specify creatorId in most cases
```

---

## 3. TypeScript Type Definitions

Copy these interfaces to your frontend codebase:

```typescript
// Payout Status Enum
export enum PayoutStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING', 
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

// Core Payout Interface
export interface Payout {
  id: string
  creatorId: string
  creatorName?: string
  creatorEmail?: string
  amountCents: number
  status: PayoutStatus
  stripeTransferId?: string
  processedAt?: Date
  failedReason?: string
  retryCount: number
  lastRetryAt?: Date
  createdAt: Date
  updatedAt: Date
  royaltyStatement?: RoyaltyStatement
}

// Balance Calculation Interface
export interface BalanceCalculation {
  totalBalanceCents: number
  availableBalanceCents: number
  pendingBalanceCents: number
  reservedBalanceCents: number
  meetsMinimum: boolean
  minimumRequired: number
  breakdown: {
    resolvedUnpaidCents: number
    pendingPayoutsCents: number
    disputedCents: number
  }
}

// Eligibility Check Result
export interface EligibilityCheckResult {
  eligible: boolean
  reasons: string[]
  details: {
    hasStripeAccount: boolean
    stripeOnboardingComplete: boolean
    payoutsEnabled: boolean
    accountInGoodStanding: boolean
    noActiveDDisputes: boolean
    meetsMinimumBalance: boolean
    termsAccepted: boolean
  }
}

// Payout Processing Result
export interface PayoutResult {
  success: boolean
  payoutId?: string
  stripeTransferId?: string
  amountCents?: number
  error?: string
  retryable?: boolean
}

// Batch Payout Interfaces
export interface BatchPayoutInput {
  creatorIds?: string[]
  autoSelectEligible?: boolean
  minAmountCents?: number
}

export interface BatchPayoutResult {
  totalCreators: number
  successfulPayouts: number
  failedPayouts: number
  skippedCreators: number
  payoutIds: string[]
  errors: Array<{
    creatorId: string
    error: string
  }>
}

// Pending Balance Response
export interface PendingBalanceData {
  pendingBalanceCents: number
  currency: string
  meetsMinimum: boolean
  minimumRequiredCents: number
  canInitiatePayout: boolean
  lastPayout?: {
    amountCents: number
    processedAt: Date
  }
  pendingPayouts: Array<{
    id: string
    amountCents: number
    status: PayoutStatus
    createdAt: Date
  }>
  breakdown?: {
    totalBalanceCents: number
    resolvedUnpaidCents: number
    pendingPayoutsCents: number
    disputedCents: number
    reservedBalanceCents: number
  }
}

// API Response Wrappers
export interface ApiResponse<T> {
  success: boolean
  data: T
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    page: number
    limit: number
    totalCount: number
    totalPages: number
    totalAmountCents?: number
  }
}
```

---

## 4. Core API Endpoints (tRPC)

### 4.1 POST `payouts.transfer` - Initiate Payout

**Purpose:** Create a new payout transfer for a creator

**Access:** Creator (own payouts) / Admin (any creator)

#### Input Schema
```typescript
export interface InitiatePayoutInput {
  creatorId?: string              // Optional for creators (auto-filled), required for admins
  amountCents?: number           // Optional - defaults to all available balance
  royaltyStatementIds?: string[] // Optional - specific statements to pay out
}
```

#### Response Schema
```typescript
export interface InitiatePayoutResponse {
  success: boolean
  data: {
    id: string                    // Payout ID
    amountCents: number          // Amount in cents
    stripeTransferId?: string    // Stripe transfer ID (if created)
    status: PayoutStatus         // Current status
    estimatedArrival?: Date      // Estimated completion (1-2 business days)
  }
}
```

#### Usage Example
```typescript
// Creator initiating their own payout
const result = await api.payouts.transfer.mutate({
  // creatorId automatically filled from auth context
  amountCents: 5000 // $50.00 - optional, defaults to all available
})

// Admin initiating payout for specific creator  
const adminResult = await api.payouts.transfer.mutate({
  creatorId: 'creator_abc123',
  amountCents: 10000 // $100.00
})
```

---

### 4.2 GET `payouts.getById` - Payout Details

**Purpose:** Retrieve detailed information about a specific payout

**Access:** Creator (own payouts) / Admin (any payout)

#### Input Schema
```typescript
export interface GetPayoutInput {
  id: string // Payout ID (required)
}
```

#### Response Schema  
```typescript
export interface PayoutDetailsResponse {
  data: {
    id: string
    creatorId: string
    creatorName: string
    creatorEmail: string
    amountCents: number
    status: PayoutStatus
    stripeTransferId?: string
    processedAt?: Date
    failedReason?: string
    retryCount: number
    lastRetryAt?: Date
    createdAt: Date
    updatedAt: Date
    royaltyStatement?: RoyaltyStatement
  }
}
```

#### Usage Example
```typescript
const payout = await api.payouts.getById.query({
  id: 'payout_xyz789'
})

console.log(`Payout: $${payout.data.amountCents / 100} - ${payout.data.status}`)
```

---

### 4.3 GET `payouts.list` - List Payouts (Admin Only)

**Purpose:** Retrieve paginated list of payouts with filtering options

**Access:** Admin Only

#### Input Schema
```typescript
export interface ListPayoutsInput {
  creatorId?: string                    // Filter by creator
  status?: PayoutStatus                 // Filter by status
  startDate?: Date                      // Filter by creation date range
  endDate?: Date
  minAmount?: number                    // Filter by amount range (cents)
  maxAmount?: number
  page?: number                         // Pagination (default: 1)
  limit?: number                        // Items per page (default: 20, max: 100)
  sortBy?: 'createdAt' | 'processedAt' | 'amountCents' // Sort field
  sortOrder?: 'asc' | 'desc'           // Sort direction (default: desc)
}
```

#### Response Schema
```typescript
export interface ListPayoutsResponse {
  data: Array<{
    id: string
    creatorId: string
    creatorName: string
    creatorEmail: string
    amountCents: number
    status: PayoutStatus
    stripeTransferId?: string
    processedAt?: Date
    failedReason?: string
    retryCount: number
    createdAt: Date
  }>
  meta: {
    page: number
    limit: number
    totalCount: number
    totalPages: number
    totalAmountCents: number            // Sum of all payouts in result set
  }
}
```

#### Usage Example
```typescript
// Get failed payouts from last 30 days
const failedPayouts = await api.payouts.list.query({
  status: PayoutStatus.FAILED,
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  page: 1,
  limit: 50,
  sortBy: 'createdAt',
  sortOrder: 'desc'
})

console.log(`Found ${failedPayouts.meta.totalCount} failed payouts`)
```

---

### 4.4 POST `payouts.retry` - Retry Failed Payout  

**Purpose:** Attempt to retry a failed payout

**Access:** Creator (own payouts) / Admin (any payout)

#### Input Schema
```typescript  
export interface RetryPayoutInput {
  id: string // Payout ID to retry
}
```

#### Response Schema
```typescript
export interface RetryPayoutResponse {
  success: boolean
  data: {
    id: string
    canRetry: boolean                   // Whether payout can be retried again
    nextRetryAt?: Date                  // When next retry is allowed
    error?: string                      // Error message if retry failed
  }
}
```

#### Usage Example
```typescript
const retryResult = await api.payouts.retry.mutate({
  id: 'payout_failed_123'
})

if (retryResult.success) {
  console.log('Payout retry initiated successfully')
} else {
  console.log(`Retry failed: ${retryResult.data.error}`)
}
```

---

### 4.5 GET `payouts.getMyPayouts` - Creator Payout History

**Purpose:** Get authenticated creator's payout history

**Access:** Creator Only

#### Input Schema
```typescript
export interface GetMyPayoutsInput {
  status?: PayoutStatus                 // Filter by status (optional)
  page?: number                         // Pagination (default: 1)  
  limit?: number                        // Items per page (default: 20, max: 50)
  sortBy?: 'createdAt' | 'processedAt' | 'amountCents'
  sortOrder?: 'asc' | 'desc'
}
```

#### Response Schema
```typescript
export interface MyPayoutsResponse {
  data: Array<{
    id: string
    amountCents: number
    status: PayoutStatus
    stripeTransferId?: string
    processedAt?: Date
    failedReason?: string
    retryCount: number
    createdAt: Date
    royaltyStatement?: RoyaltyStatement
  }>
  meta: {
    page: number
    limit: number
    totalCount: number
    totalPages: number
  }
  summary: {
    totalPayoutsCents: number           // Lifetime earnings paid out
    totalPayoutsCount: number           // Total number of completed payouts
    lastPayoutAmount?: number           // Amount of most recent payout
    lastPayoutDate?: Date              // Date of most recent payout
  }
}
```

#### Usage Example
```typescript
// Get creator's recent payouts
const myPayouts = await api.payouts.getMyPayouts.query({
  page: 1,
  limit: 10,
  sortBy: 'createdAt',
  sortOrder: 'desc'
})

console.log(`Total earned: $${myPayouts.summary.totalPayoutsCents / 100}`)
```

---

## Next: Part 2 of Integration Guide

**Part 2 will cover:**
- Remaining API endpoints (pending balance, batch operations)
- Business logic & validation rules  
- Error handling & codes
- Rate limiting & quotas
- Real-time updates via webhooks
- Frontend implementation checklist

---

## Important Notes

> ⚠️ **Financial Operations**  
> All amounts are in **cents** to avoid floating-point precision issues. Always divide by 100 for display.

> 🔒 **Security**  
> Never expose Stripe API keys or webhook secrets in frontend code. All sensitive operations happen on the backend.

> 🔄 **Idempotency**  
> The backend handles idempotency automatically. Retrying the same request won't create duplicate payouts.

> 📊 **Minimum Thresholds**  
> Default minimum payout is $50 (5000 cents). This is configurable via environment variables.
