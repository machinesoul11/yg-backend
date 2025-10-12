# LICENSING MODULE QUICK REFERENCE

Quick reference guide for using the Licensing Module.

---

## tRPC API Endpoints

### Create License
```typescript
trpc.licenses.create.mutate({
  ipAssetId: string,
  brandId: string,
  projectId?: string,
  licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY',
  startDate: string, // ISO 8601
  endDate: string,
  feeCents: number,
  revShareBps: number, // 0-10000 (0% - 100%)
  paymentTerms?: string,
  billingFrequency?: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY',
  scope: LicenseScope,
  autoRenew?: boolean,
})
```

### List Licenses
```typescript
trpc.licenses.list.useQuery({
  status?: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'SUSPENDED',
  ipAssetId?: string,
  brandId?: string,
  projectId?: string,
  licenseType?: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY',
  expiringBefore?: string,
  page?: number, // default: 1
  pageSize?: number, // default: 20
})
```

### Get License Details
```typescript
trpc.licenses.getById.useQuery({ id: string })
```

### Approve License (Creator only)
```typescript
trpc.licenses.approve.mutate({ id: string })
```

### Update License
```typescript
trpc.licenses.update.mutate({
  id: string,
  status?: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'SUSPENDED',
  endDate?: string,
  feeCents?: number,
  revShareBps?: number,
  paymentTerms?: string,
  billingFrequency?: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY',
  scope?: LicenseScope,
  autoRenew?: boolean,
})
```

### Terminate License
```typescript
trpc.licenses.terminate.mutate({
  id: string,
  reason: string, // 10-500 characters
  effectiveDate?: string, // Default: now
})
```

### Check Conflicts
```typescript
trpc.licenses.checkConflicts.useQuery({
  ipAssetId: string,
  startDate: string,
  endDate: string,
  licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY',
  scope: LicenseScope,
  excludeLicenseId?: string, // When updating
})
```

### Generate Renewal
```typescript
trpc.licenses.generateRenewal.mutate({
  licenseId: string,
  durationDays?: number, // Override duration
  feeAdjustmentPercent?: number, // e.g., 10 for 10% increase
  revShareAdjustmentBps?: number, // Absolute adjustment
})
```

### Get Statistics
```typescript
trpc.licenses.stats.useQuery({
  brandId?: string, // Optional filter
})

// Returns:
{
  totalActive: number,
  totalRevenueCents: number,
  expiringIn30Days: number,
  expiringIn60Days: number,
  expiringIn90Days: number,
  averageLicenseDurationDays: number,
  exclusiveLicenses: number,
  nonExclusiveLicenses: number,
  renewalRate: number, // Percentage
}
```

### Sign License
```typescript
trpc.licenses.sign.mutate({ id: string })

// Returns:
{
  data: License,
  meta: {
    signatureProof: string,
    allPartiesSigned: boolean,
    executedAt?: string,
    message: string
  }
}
```

### Get License Revenue
```typescript
trpc.licenses.getRevenue.useQuery({ id: string })

// Returns:
{
  data: {
    licenseId: string,
    initialFeeCents: number,
    totalRevenueShareCents: number,
    totalRevenueCents: number,
    projectedRevenueCents: number,
    revenueByPeriod: Array<{
      period: string,
      startDate: string,
      endDate: string,
      revenueCents: number
    }>,
    revenueByCreator: Array<{
      creatorId: string,
      creatorName: string,
      shareBps: number,
      totalRevenueCents: number,
      paidCents: number,
      pendingCents: number
    }>,
    usageMetrics?: {
      totalImpressions: number,
      totalClicks: number,
      averageCostPerImpression: number
    },
    paymentStatus: {
      totalPaid: number,
      totalPending: number,
      nextPaymentDate: string | null
    }
  }
}
```

### Delete License (Admin only)
```typescript
trpc.licenses.delete.mutate({ id: string })
```

### Admin List (Admin only)
```typescript
trpc.licenses.adminList.useQuery({ /* same filters as list */ })
```

---

## License Scope Structure

```typescript
interface LicenseScope {
  media: {
    digital: boolean;
    print: boolean;
    broadcast: boolean;
    ooh: boolean; // Out-of-home (billboards, transit)
  };
  placement: {
    social: boolean;
    website: boolean;
    email: boolean;
    paid_ads: boolean;
    packaging: boolean;
  };
  geographic?: {
    territories: string[]; // ISO country codes or "GLOBAL"
  };
  exclusivity?: {
    category?: string; // e.g., "Fashion", "Beauty"
    competitors?: string[]; // Blocked competitor brand IDs
  };
  cutdowns?: {
    allowEdits: boolean;
    maxDuration?: number; // For video, in seconds
    aspectRatios?: string[]; // e.g., ["16:9", "1:1", "9:16"]
  };
  attribution?: {
    required: boolean;
    format?: string; // e.g., "Photo by @creator"
  };
}
```

### Example Scope
```typescript
const scope: LicenseScope = {
  media: {
    digital: true,
    print: false,
    broadcast: false,
    ooh: false,
  },
  placement: {
    social: true,
    website: true,
    email: true,
    paid_ads: true,
    packaging: false,
  },
  geographic: {
    territories: ['US', 'CA', 'MX'],
  },
  exclusivity: {
    category: 'Fashion',
    competitors: ['brand_competitor1', 'brand_competitor2'],
  },
  cutdowns: {
    allowEdits: true,
    maxDuration: 60, // 60 seconds
    aspectRatios: ['16:9', '1:1', '9:16'],
  },
  attribution: {
    required: true,
    format: 'Photo by @{creatorHandle}',
  },
};
```

---

## License Lifecycle States

```
DRAFT → PENDING_APPROVAL → ACTIVE → EXPIRED
                          ↓
                    TERMINATED
                          ↓
                    SUSPENDED
```

- **DRAFT**: Being negotiated, not visible to creator yet
- **PENDING_APPROVAL**: Creator needs to approve
- **ACTIVE**: Currently valid and in use
- **EXPIRED**: End date passed (auto-transitioned)
- **TERMINATED**: Manually ended early
- **SUSPENDED**: Temporarily paused (e.g., payment issues)

---

## Common Patterns

### Creating an Exclusive Global License
```typescript
const license = await trpc.licenses.create.mutate({
  ipAssetId: 'asset_123',
  brandId: 'brand_456',
  licenseType: 'EXCLUSIVE', // Exclusive globally
  startDate: '2025-02-01T00:00:00Z',
  endDate: '2026-02-01T00:00:00Z',
  feeCents: 100000, // $1,000 upfront
  revShareBps: 0, // No revenue share
  billingFrequency: 'ONE_TIME',
  scope: {
    media: { digital: true, print: true, broadcast: true, ooh: true },
    placement: { social: true, website: true, email: true, paid_ads: true, packaging: true },
    attribution: { required: true },
  },
});
```

### Creating a Territory-Exclusive License
```typescript
const license = await trpc.licenses.create.mutate({
  ipAssetId: 'asset_123',
  brandId: 'brand_456',
  licenseType: 'EXCLUSIVE_TERRITORY',
  startDate: '2025-02-01T00:00:00Z',
  endDate: '2026-02-01T00:00:00Z',
  feeCents: 50000, // $500
  revShareBps: 500, // 5% revenue share
  billingFrequency: 'QUARTERLY',
  scope: {
    media: { digital: true, print: false, broadcast: false, ooh: false },
    placement: { social: true, website: true, email: false, paid_ads: true, packaging: false },
    geographic: { territories: ['US'] }, // Exclusive in US only
    attribution: { required: true },
  },
});
```

### Creating a Non-Exclusive License with Competitor Blocking
```typescript
const license = await trpc.licenses.create.mutate({
  ipAssetId: 'asset_123',
  brandId: 'brand_456',
  licenseType: 'NON_EXCLUSIVE',
  startDate: '2025-02-01T00:00:00Z',
  endDate: '2025-05-01T00:00:00Z',
  feeCents: 25000, // $250
  revShareBps: 0,
  billingFrequency: 'ONE_TIME',
  scope: {
    media: { digital: true, print: false, broadcast: false, ooh: false },
    placement: { social: true, website: false, email: false, paid_ads: false, packaging: false },
    exclusivity: {
      category: 'Beauty',
      competitors: ['brand_competitor1'], // Block specific competitor
    },
    attribution: { required: true },
  },
});
```

---

## Service Layer Direct Access

For background jobs or server-side operations:

```typescript
import { licenseService } from '@/modules/licenses';

// Create license
const license = await licenseService.createLicense(input, userId);

// Check conflicts
const conflicts = await licenseService.checkConflicts({
  ipAssetId,
  startDate,
  endDate,
  licenseType,
  scope,
});

// Generate renewal
const renewal = await licenseService.generateRenewal(
  { licenseId, feeAdjustmentPercent: 10 },
  userId
);

// Get statistics
const stats = await licenseService.getLicenseStats(brandId);
```

---

## Background Jobs

### License Expiry Monitor
- **File**: `src/jobs/license-expiry-monitor.job.ts`
- **Schedule**: Daily at 09:00 UTC
- **Function**: `licenseExpiryMonitorJob()`
- **Actions**:
  - Checks for licenses expiring in 90, 60, 30 days
  - Sends email notifications
  - Auto-generates renewals if `autoRenew = true`

### License Auto-Expiry
- **File**: `src/jobs/license-auto-expiry.job.ts`
- **Schedule**: Every hour
- **Function**: `licenseAutoExpiryJob()`
- **Actions**:
  - Finds `ACTIVE` licenses past `endDate`
  - Updates status to `EXPIRED`

### Scheduling Example (BullMQ)
```typescript
import { Queue } from 'bullmq';
import { licenseExpiryMonitorJob } from '@/jobs/license-expiry-monitor.job';

const licenseQueue = new Queue('license-jobs', { connection: redisConnection });

// Schedule daily at 9 AM UTC
await licenseQueue.add(
  'expiry-monitor',
  {},
  { repeat: { pattern: '0 9 * * *' } }
);

// Worker
const worker = new Worker(
  'license-jobs',
  async (job) => {
    if (job.name === 'expiry-monitor') {
      return await licenseExpiryMonitorJob();
    }
  },
  { connection: redisConnection }
);
```

---

## Financial Calculations

### Converting Dollars to Cents
```typescript
const dollars = 500.00;
const cents = Math.round(dollars * 100); // 50000
```

### Converting Basis Points to Percentage
```typescript
const bps = 1000; // 10%
const percentage = bps / 100; // 10
```

### Example License Fee Structure
```typescript
{
  feeCents: 100000,      // $1,000 upfront
  revShareBps: 1500,     // 15% of revenue
  paymentTerms: "50% upfront, 50% on delivery",
  billingFrequency: "MONTHLY"
}
```

---

## Error Handling

### Common Errors
```typescript
// Conflict detected
catch (error) {
  if (error.code === 'CONFLICT') {
    console.log('Conflicts:', error.cause.conflicts);
  }
}

// Permission denied
catch (error) {
  if (error.code === 'FORBIDDEN') {
    console.log('User does not have permission');
  }
}

// Not found
catch (error) {
  if (error.code === 'NOT_FOUND') {
    console.log('License not found');
  }
}
```

---

## Role-Based Access

### Brand User
- ✅ Create licenses for their brand
- ✅ View their brand's licenses
- ✅ Update their licenses (before approval)
- ✅ Terminate their licenses
- ✅ Generate renewals
- ❌ Cannot create licenses for other brands
- ❌ Cannot view other brands' licenses

### Creator User
- ✅ View licenses for their assets
- ✅ Approve pending licenses
- ❌ Cannot create licenses
- ❌ Cannot terminate licenses (only brands/admins)

### Admin User
- ✅ Full access to all licenses
- ✅ View all licenses
- ✅ Delete licenses
- ✅ Override permissions

---

## Database Queries

### Find Active Licenses for Asset
```typescript
const licenses = await prisma.license.findMany({
  where: {
    ipAssetId: 'asset_123',
    status: 'ACTIVE',
    deletedAt: null,
  },
  include: {
    brand: true,
    ipAsset: true,
  },
});
```

### Find Expiring Licenses
```typescript
const expiringLicenses = await prisma.license.findMany({
  where: {
    status: 'ACTIVE',
    endDate: {
      gte: new Date(),
      lte: addDays(new Date(), 30),
    },
    deletedAt: null,
  },
});
```

### Get Brand's Revenue from Licenses
```typescript
const result = await prisma.license.aggregate({
  where: {
    brandId: 'brand_123',
    status: 'ACTIVE',
  },
  _sum: {
    feeCents: true,
  },
});

console.log('Total spent:', result._sum.feeCents / 100, 'dollars');
```

---

## Best Practices

1. **Always check for conflicts** before creating exclusive licenses
2. **Use cents for all money values** to avoid floating-point errors
3. **Set autoRenew for long-term partnerships** to streamline renewals
4. **Be specific with scope** - clearly define media and placement rights
5. **Add payment terms** for clarity on billing expectations
6. **Use projectId** to associate licenses with campaigns for better tracking
7. **Log termination reasons** for future reference and dispute resolution

---

## Quick Tips

- **Revenue Share**: Use `revShareBps` for ongoing percentage, `feeCents` for upfront payment
- **Expiry Notifications**: System sends notifications at 90, 60, and 30 days before expiry
- **Auto-Renewal**: Enable for stable partnerships to reduce administrative overhead
- **Conflict Detection**: Runs automatically on creation, but can be checked beforehand
- **Soft Deletes**: Licenses are never truly deleted, only marked with `deletedAt`
- **Audit Trail**: All license actions are logged in the `events` table

---

For detailed implementation notes, see `LICENSING_MODULE_COMPLETE.md`
