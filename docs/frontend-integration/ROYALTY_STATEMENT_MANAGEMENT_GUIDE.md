# Royalty Statement Management - Frontend Integration Guide

**Classification:** 🌐 SHARED  
- Creators can view their own statements via public website
- Admins can manage all statements via admin backend

## Overview

This guide covers the royalty statement endpoints that serve both creator and admin interfaces, with different permission levels and data access patterns.

---

## 1. Statement API Endpoints

### 1.1 List Statements (Hybrid Access)

#### Endpoint
- **URL:** `GET /api/royalties/statements`
- **Auth:** Required (Admin or Creator)
- **Purpose:** List statements with automatic permission filtering

#### Query Parameters
```typescript
interface ListStatementsQuery {
  page?: string;           // Default: '1'
  limit?: string;          // Default: '20', max: 100
  creatorId?: string;      // Admin only - filter by creator
  runId?: string;          // Filter by specific run
  status?: 'PENDING' | 'REVIEWED' | 'DISPUTED' | 'RESOLVED' | 'PAID';
  sortBy?: 'createdAt' | 'totalEarningsCents' | 'paidAt';
  sortOrder?: 'asc' | 'desc'; // Default: 'desc'
}
```

#### Response Schema
```typescript
interface ListStatementsResponse {
  success: boolean;
  data: Array<{
    id: string;
    royaltyRun: {
      id: string;
      periodStart: string;
      periodEnd: string;
      status: RoyaltyRunStatus;
    };
    creator: {
      id: string;
      name: string;
      email: string;
      stageName?: string;
    };
    totalEarningsCents: number;
    platformFeeCents: number;
    netPayableCents: number;
    status: RoyaltyStatementStatus;
    lineItemCount: number;
    pdfUrl?: string;
    reviewedAt: string | null;
    disputedAt: string | null;
    disputeReason?: string;
    paidAt: string | null;
    paymentReference?: string;
    createdAt: string;
  }>;
  pagination: PaginationMeta;
}
```

### 1.2 Get Statement Details (Hybrid Access)

#### Endpoint
- **URL:** `GET /api/royalties/statements/{id}`
- **Auth:** Required (Creator owns statement OR Admin)
- **Purpose:** Get detailed statement with line items

#### Response Schema
```typescript
interface StatementDetailsResponse {
  success: boolean;
  data: {
    id: string;
    royaltyRun: {
      id: string;
      periodStart: string;
      periodEnd: string;
      status: RoyaltyRunStatus;
      lockedAt: string | null;
      createdBy: {
        id: string;
        name: string;
        email: string;
      };
    };
    creator: {
      id: string;
      name: string;
      email: string;
      stageName?: string;
    };
    totalEarningsCents: number;
    platformFeeCents: number;
    netPayableCents: number;
    status: RoyaltyStatementStatus;
    pdfUrl?: string;
    reviewedAt: string | null;
    disputedAt: string | null;
    disputeReason?: string;
    paidAt: string | null;
    paymentReference?: string;
    createdAt: string;
    // Line items grouped by asset
    linesByAsset: Array<{
      assetId: string;
      assetTitle: string;
      assetType: string;
      totalRevenueCents: number;
      totalRoyaltyCents: number;
      lineCount: number;
      lines: Array<{
        id: string;
        license: {
          id: string;
          brandName: string;
          licenseType: string;
        };
        revenueCents: number;
        shareBps: number;
        calculatedRoyaltyCents: number;
        periodStart: string;
        periodEnd: string;
        metadata?: Record<string, any>;
      }>;
    }>;
    // Special line items (carryover, notes)
    specialLines: Array<{
      id: string;
      type: 'CARRYOVER' | 'THRESHOLD_NOTE' | 'DISPUTE_RESOLUTION';
      description: string;
      amountCents: number;
      metadata?: Record<string, any>;
    }>;
  };
}
```

### 1.3 Statement Line Items (Detailed View)

#### Endpoint
- **URL:** `GET /api/royalties/statements/{id}/lines`
- **Auth:** Required (Creator owns statement OR Admin)
- **Purpose:** Get paginated line items for large statements

#### Query Parameters
```typescript
interface StatementLinesQuery {
  page?: string;
  limit?: string;
  assetId?: string;        // Filter by specific asset
  licenseType?: string;    // Filter by license type
}
```

#### Response Schema
```typescript
interface StatementLinesResponse {
  success: boolean;
  data: Array<{
    id: string;
    ipAsset: {
      id: string;
      title: string;
      type: string;
      thumbnailUrl?: string;
    };
    license: {
      id: string;
      brandName: string;
      licenseType: string;
      startDate: string;
      endDate?: string;
    };
    revenueCents: number;
    shareBps: number;
    sharePercentage: number;  // Calculated field (shareBps / 100)
    calculatedRoyaltyCents: number;
    periodStart: string;
    periodEnd: string;
    metadata?: {
      type?: 'carryover' | 'threshold_note' | 'dispute_resolution';
      description?: string;
      prorated?: boolean;
      daysActive?: number;
      totalDays?: number;
    };
  }>;
  summary: {
    totalRevenueCents: number;
    totalRoyaltyCents: number;
    averageSharePercentage: number;
    lineCount: number;
  };
  pagination: PaginationMeta;
}
```

### 1.4 Review Statement (Creator Only)

#### Endpoint
- **URL:** `POST /api/royalties/statements/{id}/review`
- **Auth:** Required (Creator must own statement)
- **Purpose:** Mark statement as reviewed by creator

#### Request Schema
```typescript
interface ReviewStatementRequest {
  // No body parameters - action is implicit
}
```

#### Response Schema
```typescript
interface ReviewStatementResponse {
  success: boolean;
  data: {
    id: string;
    status: 'REVIEWED';
    reviewedAt: string;
  };
  message: string;
}
```

### 1.5 Dispute Statement (Creator Only)

#### Endpoint
- **URL:** `POST /api/royalties/statements/{id}/dispute`
- **Auth:** Required (Creator must own statement)
- **Purpose:** Raise a dispute about statement calculations

#### Request Schema
```typescript
interface DisputeStatementRequest {
  reason: string;          // Min 20 chars, max 1000 chars
  specificLines?: Array<{  // Optional: dispute specific lines
    lineId: string;
    issue: string;
  }>;
}
```

#### Response Schema
```typescript
interface DisputeStatementResponse {
  success: boolean;
  data: {
    id: string;
    status: 'DISPUTED';
    disputedAt: string;
    disputeReason: string;
  };
  message: string;
}
```

### 1.6 Generate Statement PDF (Hybrid Access)

#### Endpoint
- **URL:** `POST /api/royalties/statements/{id}/pdf`
- **Auth:** Required (Creator owns statement OR Admin)
- **Purpose:** Generate or regenerate PDF statement

#### Response Schema
```typescript
interface GeneratePDFResponse {
  success: boolean;
  data: {
    pdfUrl: string;      // Signed URL for download
    expiresAt: string;   // URL expiration time
  };
  message: string;
}
```

---

## 2. TypeScript Type Definitions

### 2.1 Statement-Specific Types

```typescript
// Statement status with descriptions
export const STATEMENT_STATUS_INFO = {
  PENDING: {
    label: 'Pending Review',
    description: 'Awaiting creator review',
    color: 'yellow',
    canReview: true,
    canDispute: true,
  },
  REVIEWED: {
    label: 'Reviewed',
    description: 'Reviewed by creator',
    color: 'blue',
    canReview: false,
    canDispute: true,
  },
  DISPUTED: {
    label: 'Disputed',
    description: 'Under dispute resolution',
    color: 'red',
    canReview: false,
    canDispute: false,
  },
  RESOLVED: {
    label: 'Resolved',
    description: 'Dispute resolved',
    color: 'green',
    canReview: false,
    canDispute: false,
  },
  PAID: {
    label: 'Paid',
    description: 'Payment completed',
    color: 'green',
    canReview: false,
    canDispute: false,
  },
} as const;

// Line item metadata types
export interface CarryoverMetadata {
  type: 'carryover';
  description: string;
  minimumThreshold: number;
  previousBalance: number;
}

export interface ThresholdNoteMetadata {
  type: 'threshold_note';
  description: string;
  minimumThreshold: number;
  currentBalance: number;
  nextPayoutProjection?: string;
}

export interface ProrationMetadata {
  prorated: true;
  daysActive: number;
  totalDays: number;
  fullPeriodRevenue: number;
}

// Aggregated statement data
export interface StatementSummary {
  totalEarnings: number;
  platformFee: number;
  netPayable: number;
  assetCount: number;
  licenseCount: number;
  averageRevenuePerAsset: number;
  topEarningAsset: {
    id: string;
    title: string;
    earnings: number;
  } | null;
}
```

### 2.2 Validation Schemas

```typescript
import { z } from 'zod';

// Statement filtering
export const statementFiltersSchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  creatorId: z.string().optional(),
  runId: z.string().optional(),
  status: z.enum(['PENDING', 'REVIEWED', 'DISPUTED', 'RESOLVED', 'PAID']).optional(),
  sortBy: z.enum(['createdAt', 'totalEarningsCents', 'paidAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// Dispute submission
export const disputeStatementSchema = z.object({
  reason: z
    .string()
    .min(20, 'Dispute reason must be at least 20 characters')
    .max(1000, 'Dispute reason must be at most 1000 characters'),
  specificLines: z
    .array(
      z.object({
        lineId: z.string().cuid(),
        issue: z.string().min(10).max(500),
      })
    )
    .optional(),
});

export type DisputeStatementInput = z.infer<typeof disputeStatementSchema>;
```

---

## 3. Business Logic & Validation Rules

### 3.1 Statement Status Logic

#### Status Transitions
```
PENDING → REVIEWED → PAID
    ↓         ↓
  DISPUTED → RESOLVED → PAID
```

#### Action Permissions by Status
```typescript
const getStatementActions = (
  status: RoyaltyStatementStatus,
  userRole: 'CREATOR' | 'ADMIN',
  isOwner: boolean
) => {
  const actions = {
    canReview: false,
    canDispute: false,
    canGeneratePDF: false,
    canViewDetails: false,
  };

  // View permissions
  actions.canViewDetails = isOwner || userRole === 'ADMIN';
  actions.canGeneratePDF = isOwner || userRole === 'ADMIN';

  // Creator-specific actions
  if (isOwner && userRole === 'CREATOR') {
    switch (status) {
      case 'PENDING':
        actions.canReview = true;
        actions.canDispute = true;
        break;
      case 'REVIEWED':
        actions.canDispute = true;
        break;
      case 'DISPUTED':
      case 'RESOLVED':
      case 'PAID':
        // No actions available
        break;
    }
  }

  return actions;
};
```

### 3.2 Platform Fee Calculation

```typescript
// Standard platform fee calculation
const PLATFORM_FEE_RATE = 0.05; // 5%
const MIN_FEE_CENTS = 25; // $0.25 minimum

const calculatePlatformFee = (earningsCents: number): number => {
  const feeAmount = Math.round(earningsCents * PLATFORM_FEE_RATE);
  return Math.max(feeAmount, MIN_FEE_CENTS);
};

const calculateNetPayable = (earningsCents: number): number => {
  const platformFee = calculatePlatformFee(earningsCents);
  return earningsCents - platformFee;
};
```

### 3.3 Currency Formatting

```typescript
// Utility functions for money display
export const formatCurrency = (cents: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
};

export const formatPercentage = (basisPoints: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(basisPoints / 10000);
};
```

---

## 4. Error Handling

### 4.1 Statement-Specific Errors

#### Unauthorized Access (403)
```typescript
{
  "success": false,
  "error": "Forbidden",
  "message": "You do not have permission to access statement st_abc123",
  "code": "UNAUTHORIZED_STATEMENT_ACCESS"
}
```

#### Already Reviewed (409)
```typescript
{
  "success": false,
  "error": "Conflict",
  "message": "Statement st_abc123 has already been reviewed",
  "code": "STATEMENT_ALREADY_REVIEWED"
}
```

#### Invalid Dispute (422)
```typescript
{
  "success": false,
  "error": "Unprocessable Entity",
  "message": "Cannot dispute a statement that has already been paid",
  "code": "INVALID_DISPUTE_STATE"
}
```

### 4.2 PDF Generation Errors

#### Generation Failed (500)
```typescript
{
  "success": false,
  "error": "Internal server error",
  "message": "PDF generation failed: Template rendering error",
  "code": "PDF_GENERATION_FAILED"
}
```

---

## 5. Authorization & Permissions

### 5.1 Permission Matrix

| Action | Creator (Own) | Creator (Other) | Admin |
|--------|---------------|-----------------|-------|
| View statement list | ✅ (own only) | ❌ | ✅ (all) |
| View statement details | ✅ | ❌ | ✅ |
| Review statement | ✅ | ❌ | ❌ |
| Dispute statement | ✅ | ❌ | ❌ |
| Generate PDF | ✅ | ❌ | ✅ |
| Resolve dispute | ❌ | ❌ | ✅ |

### 5.2 Resource Ownership Validation

```typescript
// Backend validates ownership for creators
const validateStatementAccess = async (
  statementId: string,
  userId: string,
  userRole: string
): Promise<boolean> => {
  if (userRole === 'ADMIN') {
    return true; // Admins can access all statements
  }

  const statement = await prisma.royaltyStatement.findUnique({
    where: { id: statementId },
    include: {
      creator: {
        select: { userId: true },
      },
    },
  });

  return statement?.creator.userId === userId;
};
```

---

## 6. Real-time Updates

### 6.1 Statement Status Changes

```typescript
// WebSocket events for statement updates
interface StatementWebSocketEvents {
  'statement.status_changed': {
    statementId: string;
    oldStatus: RoyaltyStatementStatus;
    newStatus: RoyaltyStatementStatus;
    timestamp: string;
  };
  
  'statement.disputed': {
    statementId: string;
    creatorId: string;
    reason: string;
    timestamp: string;
  };
  
  'statement.paid': {
    statementId: string;
    amountCents: number;
    paymentReference: string;
    timestamp: string;
  };
  
  'statement.pdf_generated': {
    statementId: string;
    pdfUrl: string;
    expiresAt: string;
  };
}

// Subscribe to statement updates
const subscribeToStatementUpdates = (statementId: string) => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'royalty.statements',
    statementId: statementId,
  }));
};
```

---

## 7. Frontend Implementation Examples

### 7.1 Statement List Component (Creator View)

```typescript
import { useQuery } from '@tanstack/react-query';
import { formatCurrency, formatPercentage } from '@/utils/currency';

interface CreatorStatementsProps {
  creatorId?: string; // Optional for admin view
}

export const CreatorStatements: React.FC<CreatorStatementsProps> = ({ creatorId }) => {
  const [filters, setFilters] = useState({
    page: '1',
    limit: '10',
    status: undefined as RoyaltyStatementStatus | undefined,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['statements', filters, creatorId],
    queryFn: () => statementsAPI.list({ ...filters, creatorId }),
  });

  if (isLoading) return <div>Loading statements...</div>;
  if (error) return <div>Error loading statements</div>;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={filters.status || ''}
          onChange={(e) => setFilters(prev => ({
            ...prev,
            status: e.target.value as RoyaltyStatementStatus || undefined
          }))}
        >
          <option value="">All Status</option>
          <option value="PENDING">Pending Review</option>
          <option value="REVIEWED">Reviewed</option>
          <option value="DISPUTED">Disputed</option>
          <option value="PAID">Paid</option>
        </select>
      </div>

      {/* Statements List */}
      <div className="grid gap-4">
        {data?.data.map((statement) => (
          <StatementCard key={statement.id} statement={statement} />
        ))}
      </div>

      {/* Pagination */}
      {data?.pagination && (
        <Pagination
          pagination={data.pagination}
          onPageChange={(page) => setFilters(prev => ({ ...prev, page: page.toString() }))}
        />
      )}
    </div>
  );
};

const StatementCard: React.FC<{ statement: StatementSummary }> = ({ statement }) => {
  const statusInfo = STATEMENT_STATUS_INFO[statement.status];
  const actions = getStatementActions(statement.status, 'CREATOR', true);

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold">
            {format(new Date(statement.royaltyRun.periodStart), 'MMM yyyy')} Royalties
          </h3>
          <p className="text-sm text-gray-600">
            {format(new Date(statement.royaltyRun.periodStart), 'MMM d')} -{' '}
            {format(new Date(statement.royaltyRun.periodEnd), 'MMM d, yyyy')}
          </p>
        </div>
        
        <div className="text-right">
          <div className="text-2xl font-bold">
            {formatCurrency(statement.totalEarningsCents)}
          </div>
          <div className={`inline-flex px-2 py-1 rounded-full text-xs ${
            statusInfo.color === 'green' ? 'bg-green-100 text-green-800' :
            statusInfo.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
            statusInfo.color === 'red' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {statusInfo.label}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-gray-600">Platform Fee:</span>
          <div>{formatCurrency(statement.platformFeeCents)}</div>
        </div>
        <div>
          <span className="text-gray-600">Net Payable:</span>
          <div className="font-semibold">{formatCurrency(statement.netPayableCents)}</div>
        </div>
        <div>
          <span className="text-gray-600">Line Items:</span>
          <div>{statement.lineItemCount}</div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Link href={`/statements/${statement.id}`} className="btn btn-primary">
          View Details
        </Link>
        
        {actions.canReview && (
          <ReviewStatementButton statementId={statement.id} />
        )}
        
        {actions.canDispute && (
          <DisputeStatementButton statementId={statement.id} />
        )}
        
        {statement.pdfUrl && (
          <a href={statement.pdfUrl} className="btn btn-secondary" target="_blank">
            Download PDF
          </a>
        )}
      </div>
    </div>
  );
};
```

### 7.2 Statement Details View

```typescript
export const StatementDetails: React.FC<{ statementId: string }> = ({ statementId }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['statement', statementId],
    queryFn: () => statementsAPI.getDetails(statementId),
  });

  if (isLoading) return <div>Loading statement details...</div>;
  if (!data?.success) return <div>Statement not found</div>;

  const statement = data.data;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold">
              {format(new Date(statement.royaltyRun.periodStart), 'MMMM yyyy')} Royalty Statement
            </h1>
            <p className="text-gray-600">
              Period: {format(new Date(statement.royaltyRun.periodStart), 'MMM d')} -{' '}
              {format(new Date(statement.royaltyRun.periodEnd), 'MMM d, yyyy')}
            </p>
          </div>
          
          <div className="text-right">
            <div className="text-3xl font-bold text-green-600">
              {formatCurrency(statement.totalEarningsCents)}
            </div>
            <div className="text-sm text-gray-600">Total Earnings</div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 p-4 rounded">
            <div className="text-sm text-gray-600">Gross Earnings</div>
            <div className="text-xl font-semibold">
              {formatCurrency(statement.totalEarningsCents)}
            </div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded">
            <div className="text-sm text-gray-600">Platform Fee (5%)</div>
            <div className="text-xl font-semibold">
              -{formatCurrency(statement.platformFeeCents)}
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded">
            <div className="text-sm text-gray-600">Net Payable</div>
            <div className="text-xl font-semibold text-green-600">
              {formatCurrency(statement.netPayableCents)}
            </div>
          </div>
        </div>
      </div>

      {/* Earnings by Asset */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Earnings by Asset</h2>
        
        <div className="space-y-4">
          {statement.linesByAsset.map((assetGroup) => (
            <AssetEarningsGroup key={assetGroup.assetId} group={assetGroup} />
          ))}
        </div>
      </div>

      {/* Special Items */}
      {statement.specialLines.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Additional Items</h2>
          
          <div className="space-y-3">
            {statement.specialLines.map((line) => (
              <SpecialLineItem key={line.id} line={line} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AssetEarningsGroup: React.FC<{ group: AssetGroup }> = ({ group }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg">
      <div
        className="p-4 cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-medium">{group.assetTitle}</h3>
            <p className="text-sm text-gray-600">
              {group.lineCount} license{group.lineCount !== 1 ? 's' : ''}
            </p>
          </div>
          
          <div className="text-right">
            <div className="font-semibold">
              {formatCurrency(group.totalRoyaltyCents)}
            </div>
            <div className="text-sm text-gray-600">
              from {formatCurrency(group.totalRevenueCents)} revenue
            </div>
          </div>
          
          <ChevronDownIcon 
            className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {expanded && (
        <div className="border-t">
          {group.lines.map((line) => (
            <div key={line.id} className="p-4 border-b last:border-b-0 bg-gray-50">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{line.license.brandName}</div>
                  <div className="text-sm text-gray-600">
                    {line.license.licenseType} License
                  </div>
                  <div className="text-sm text-gray-600">
                    Your share: {formatPercentage(line.shareBps)}
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="font-semibold">
                    {formatCurrency(line.calculatedRoyaltyCents)}
                  </div>
                  <div className="text-sm text-gray-600">
                    from {formatCurrency(line.revenueCents)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

This completes Part 2 of the integration guide focusing on Statement Management. The final document will cover advanced features like validation reports, rollback capabilities, and error handling patterns.
