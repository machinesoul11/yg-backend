# Creators/Talent Module - Quick Reference

## Overview

The Creators/Talent module manages creator profiles, Stripe Connect onboarding, verification workflows, and performance tracking for the YES GODDESS IP licensing platform.

## Key Features

- ✅ Creator profile management (CRUD)
- ✅ Stripe Connect integration for payouts
- ✅ Admin verification workflow
- ✅ File uploads (profile images, verification docs)
- ✅ Email notifications
- ✅ Performance metrics tracking
- ✅ Caching with Redis
- ✅ Background jobs for automation

---

## API Endpoints

### Creator Self-Management

```typescript
// Get my creator profile
const profile = await trpc.creators.getMyProfile.useQuery();

// Create creator profile
const creator = await trpc.creators.createProfile.useMutation({
  stageName: "Jane Doe",
  bio: "Professional photographer...",
  specialties: ["photography", "videography"],
  portfolioUrl: "https://janedoe.com",
  socialLinks: {
    instagram: "https://instagram.com/janedoe"
  }
});

// Update profile
await trpc.creators.updateProfile.useMutation({
  bio: "Updated bio...",
  availability: {
    status: "available",
    hoursPerWeek: 20
  }
});

// Delete profile (soft delete)
await trpc.creators.deleteProfile.useMutation();

// Get statistics
const stats = await trpc.creators.getMyStatistics.useQuery();
```

### Stripe Connect

```typescript
// Get onboarding link
const { url } = await trpc.creators.getStripeOnboardingLink.useQuery();
// Redirect user to: url

// Refresh expired link
const { url } = await trpc.creators.refreshStripeOnboardingLink.useMutation();

// Check account status
const status = await trpc.creators.getStripeAccountStatus.useQuery();
// Returns: { hasAccount, onboardingStatus, chargesEnabled, payoutsEnabled, ... }
```

### Public Endpoints

```typescript
// Get creator by ID (public or private profile based on auth)
const creator = await trpc.creators.getCreatorById.useQuery({ id: "..." });

// Browse creators (only approved, public)
const { data, meta } = await trpc.creators.browseCreators.useQuery({
  page: 1,
  pageSize: 20,
  specialties: ["photography"],
  search: "jane",
  sortBy: "verifiedAt",
  sortOrder: "desc"
});
```

### Admin Endpoints

```typescript
// List all creators with filters
const { data, meta } = await trpc.creators.listCreators.useQuery({
  page: 1,
  pageSize: 20,
  verificationStatus: "pending",
  onboardingStatus: "in_progress"
});

// Approve creator
await trpc.creators.approveCreator.useMutation({ id: "..." });

// Reject creator with reason
await trpc.creators.rejectCreator.useMutation({ 
  id: "...",
  reason: "Portfolio samples do not meet quality standards."
});

// Update performance metrics
await trpc.creators.updatePerformanceMetrics.useMutation({ id: "..." });
```

---

## Type Definitions

### Core Types

```typescript
// Creator Specialties
type CreatorSpecialty = 
  | "photography"
  | "videography"
  | "motion-graphics"
  | "illustration"
  | "3d-design"
  | "graphic-design"
  | "copywriting"
  | "music-composition"
  | "sound-design"
  | "brand-strategy"
  | "art-direction"
  | "animation";

// Verification Status
type VerificationStatus = "pending" | "approved" | "rejected";

// Onboarding Status
type OnboardingStatus = "pending" | "in_progress" | "completed" | "failed";

// Social Links
interface SocialLinks {
  instagram?: string;
  behance?: string;
  dribbble?: string;
  linkedin?: string;
  twitter?: string;
  youtube?: string;
  vimeo?: string;
}

// Availability
interface Availability {
  status: "available" | "limited" | "unavailable";
  nextAvailable?: string; // ISO date
  hoursPerWeek?: number;
}

// Preferences
interface Preferences {
  projectTypes?: string[];
  budgetRange?: { min: number; max: number };
  collaborationStyle?: "remote" | "hybrid" | "in-person";
  preferredIndustries?: string[];
}

// Performance Metrics
interface PerformanceMetrics {
  totalEarningsCents: number;
  activeLicenses: number;
  avgRating: number;
  totalProjects?: number;
  completionRate?: number;
}
```

### Profile Types

```typescript
// Public Profile (visible to brands)
interface PublicCreatorProfile {
  id: string;
  stageName: string;
  bio: string | null;
  specialties: CreatorSpecialty[];
  socialLinks: SocialLinks | null;
  portfolioUrl: string | null;
  website: string | null;
  verifiedAt: string | null;
  performanceMetrics: PerformanceMetrics | null;
  createdAt: string;
}

// Private Profile (visible to creator themselves)
interface PrivateCreatorProfile extends PublicCreatorProfile {
  availability: Availability | null;
  preferences: Preferences | null;
  verificationStatus: VerificationStatus;
  onboardingStatus: OnboardingStatus;
  stripeAccountId: string | null;
  updatedAt: string;
}

// Admin Profile (all fields)
interface AdminCreatorProfile extends PrivateCreatorProfile {
  userId: string;
  deletedAt: string | null;
}
```

---

## Service Layer Usage

### Creator Service

```typescript
import { CreatorService } from '@/modules/creators';
import { prisma } from '@/lib/db';
import { auditService } from '@/lib/services/audit.service';

const creatorService = new CreatorService(prisma, auditService);

// Create profile
const creator = await creatorService.createProfile(userId, {
  stageName: "Jane Doe",
  specialties: ["photography"],
  bio: "..."
});

// Get profile (with caching)
const profile = await creatorService.getProfileById(creatorId);

// Update profile
await creatorService.updateProfile(userId, { bio: "Updated" });

// Approve (admin)
await creatorService.approveCreator(creatorId, adminUserId);

// Update metrics
await creatorService.updatePerformanceMetrics(creatorId);
```

### Stripe Connect Service

```typescript
import { StripeConnectService } from '@/modules/creators';

const stripeService = new StripeConnectService(prisma);

// Create account
const accountId = await stripeService.createAccount(creatorId);

// Get onboarding link
const { url, expiresAt } = await stripeService.getOnboardingLink(
  creatorId,
  returnUrl,
  refreshUrl
);

// Check status
const status = await stripeService.getAccountStatus(creatorId);

// Validate payout eligibility
const canPayout = await stripeService.validatePayoutEligibility(creatorId);
```

### Notification Service

```typescript
import { CreatorNotificationsService } from '@/modules/creators';

const notificationService = new CreatorNotificationsService(prisma);

// Send welcome email
await notificationService.sendWelcomeEmail(creatorId);

// Send approval email
await notificationService.sendVerificationApprovedEmail(creatorId);

// Send rejection email
await notificationService.sendVerificationRejectedEmail(creatorId, reason);

// Send Stripe onboarding reminder
await notificationService.sendStripeOnboardingReminder(creatorId);
```

---

## Database Schema

```sql
CREATE TABLE creators (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    stage_name TEXT NOT NULL,
    bio TEXT,
    specialties JSONB NOT NULL DEFAULT '[]',
    social_links JSONB,
    stripe_account_id TEXT UNIQUE,
    onboarding_status TEXT NOT NULL DEFAULT 'pending',
    portfolio_url TEXT,
    website TEXT,
    availability JSONB,
    preferences JSONB,
    verification_status TEXT NOT NULL DEFAULT 'pending',
    verified_at TIMESTAMP WITH TIME ZONE,
    performance_metrics JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
```

### Key Indexes

- `idx_creators_user_id` - Fast lookup by user
- `idx_creators_verification_status` - Filter by status
- `idx_creators_specialties_gin` - JSONB array search
- `idx_creators_deleted_at` - Filter active creators

---

## Background Jobs

### Stripe Status Sync
**Schedule:** Daily at 2 AM  
**Purpose:** Sync Stripe account status for pending/in_progress onboarding

```typescript
// Job: creator-stripe-sync.job.ts
// Syncs all creators with onboarding_status in ['pending', 'in_progress']
```

### Performance Metrics Update
**Schedule:** Daily at 3 AM  
**Purpose:** Aggregate earnings, licenses, ratings

```typescript
// Job: creator-metrics-update.job.ts
// Updates performance_metrics JSONB for all active creators
```

### Onboarding Reminders
**Schedule:** Weekly on Mondays at 10 AM  
**Purpose:** Remind creators to complete Stripe onboarding

```typescript
// Job: creator-onboarding-reminder.job.ts
// Sends emails to approved creators with incomplete onboarding (>7 days old)
```

### Monthly Reports
**Schedule:** 1st of month at 9 AM  
**Purpose:** Send performance reports to creators

```typescript
// Job: creator-monthly-report.job.ts
// Sends monthly earnings, licenses, engagement summary
```

---

## Error Handling

### Custom Errors

```typescript
import {
  CreatorNotFoundError,
  CreatorAlreadyExistsError,
  StripeOnboardingIncompleteError,
  // ... other errors
} from '@/modules/creators';

// Usage
if (!creator) {
  throw new CreatorNotFoundError(creatorId);
}

// Catching
try {
  await creatorService.createProfile(userId, data);
} catch (error) {
  if (error instanceof CreatorAlreadyExistsError) {
    // Handle duplicate
  }
}
```

### Error Codes

- `NOT_FOUND` - Creator not found
- `CONFLICT` - Creator already exists
- `FORBIDDEN` - Not verified or unauthorized
- `PRECONDITION_FAILED` - Stripe onboarding incomplete
- `INTERNAL_SERVER_ERROR` - Stripe/storage failures
- `BAD_REQUEST` - Invalid input

---

## Caching Strategy

### Redis Keys

```typescript
// Creator profile cache
`creator:${creatorId}` // TTL: 5 minutes

// Invalidated on:
// - Profile update
// - Performance metrics update
// - Verification status change
// - Profile deletion
```

### Usage

```typescript
// Check cache
const cached = await redis.get(`creator:${id}`);
if (cached) return JSON.parse(cached);

// Set cache
await redis.setex(`creator:${id}`, 300, JSON.stringify(profile));

// Invalidate
await redis.del(`creator:${id}`);
```

---

## Testing

### Unit Tests

```typescript
import { CreatorService } from '@/modules/creators';

describe('CreatorService', () => {
  it('should create a new creator profile', async () => {
    const creator = await creatorService.createProfile(userId, input);
    expect(creator.stageName).toBe('Jane Doe');
  });

  it('should throw error if creator already exists', async () => {
    await expect(
      creatorService.createProfile(userId, input)
    ).rejects.toThrow(CreatorAlreadyExistsError);
  });
});
```

### Integration Tests

```typescript
import { trpc } from '@/lib/trpc';

describe('Creators API', () => {
  it('should return creator profile for authenticated user', async () => {
    const creator = await trpc.creators.getMyProfile.query();
    expect(creator.userId).toBe(testUserId);
  });
});
```

---

## Environment Variables

```bash
# Required
STRIPE_SECRET_KEY=sk_test_...
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Optional
NEXT_PUBLIC_APP_URL=https://yesgoddess.com
```

---

## Common Workflows

### 1. Creator Onboarding Flow

```
1. User creates account → users table
2. User creates creator profile → creators.createProfile
3. User uploads portfolio samples
4. Admin reviews → creators.approveCreator
5. Email sent: CreatorVerificationApproved
6. User sets up Stripe → creators.getStripeOnboardingLink
7. User completes Stripe → webhook updates onboarding_status
8. Email sent: StripeOnboardingCompleted
9. Creator can now receive royalties
```

### 2. Admin Verification Flow

```
1. Admin views pending creators → creators.listCreators({ verificationStatus: 'pending' })
2. Admin reviews profile + documents
3. Option A: Approve → creators.approveCreator
   - verification_status = 'approved'
   - verified_at = NOW()
   - Email: CreatorVerificationApproved
4. Option B: Reject → creators.rejectCreator
   - verification_status = 'rejected'
   - Email: CreatorVerificationRejected (with reason)
```

### 3. Payout Eligibility Check

```typescript
// Before processing payout
const canPayout = await stripeService.validatePayoutEligibility(creatorId);

if (!canPayout) {
  throw new StripeOnboardingIncompleteError(creatorId);
}

// Proceed with payout...
```

---

## Integration Checklist

- [ ] Run database migration
- [ ] Register router in main tRPC router
- [ ] Configure BullMQ jobs
- [ ] Set up Stripe webhook endpoint
- [ ] Test email delivery
- [ ] Verify Redis caching
- [ ] Test RLS policies
- [ ] Update frontend types

---

## Support

For issues or questions:
- Check `/docs/CREATORS_CHECKLIST.md` for implementation status
- Review `/docs/CREATORS_MODULE.md` for detailed documentation
- Check error logs in BullMQ dashboard
- Verify Stripe webhook logs in Stripe dashboard
