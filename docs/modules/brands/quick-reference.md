# Brand Management Module - Quick Reference

## Import Paths

```typescript
// Service
import { BrandService } from '@/modules/brands/services/brand.service';

// Router
import { brandsRouter } from '@/modules/brands/routers/brands.router';

// Schemas
import { createBrandSchema, updateBrandSchema } from '@/modules/brands/schemas/brand.schema';

// Types
import type { Brand, BrandWithUser, TeamMember } from '@/modules/brands/types/brand.types';

// Errors
import { BrandNotFoundError, BrandAlreadyExistsError } from '@/modules/brands/errors/brand.errors';
```

## API Usage Examples

### Create Brand

```typescript
const result = await trpc.brands.create.mutate({
  companyName: "Acme Corp",
  industry: "Technology",
  contactInfo: {
    primaryContact: {
      name: "John Doe",
      title: "CEO",
      email: "john@acme.com"
    },
    website: "https://acme.com"
  },
  companySize: {
    employeeCount: "51-200",
    revenueRange: "$10M-$50M"
  }
});
```

### Get Brand

```typescript
const brand = await trpc.brands.getById.query({ id: "brand_123" });
const myBrand = await trpc.brands.getMyBrand.query();
```

### Update Brand

```typescript
const updated = await trpc.brands.update.mutate({
  id: "brand_123",
  data: {
    industry: "Fintech",
    targetAudience: {
      demographics: {
        ageRanges: ["25-34", "35-44"],
        genders: ["all"],
        locations: ["us", "uk"]
      }
    }
  }
});
```

### Search Brands

```typescript
const results = await trpc.brands.search.query({
  query: "tech",
  filters: { industry: "Technology" },
  page: 1,
  limit: 20
});
```

### Team Management

```typescript
// Add team member
await trpc.brands.addTeamMember.mutate({
  brandId: "brand_123",
  email: "jane@acme.com",
  role: "manager",
  permissions: ["create_projects", "view_analytics"]
});

// Remove team member
await trpc.brands.removeTeamMember.mutate({
  brandId: "brand_123",
  userId: "user_456"
});
```

### Admin Operations

```typescript
// Verify brand
await trpc.brands.verify.mutate({
  id: "brand_123",
  notes: "Verified after checking business registration"
});

// Reject brand
await trpc.brands.reject.mutate({
  id: "brand_123",
  reason: "Unable to verify business registration",
  notes: "Requested documents not provided"
});
```

## Database Queries

### Direct Prisma Usage

```typescript
// Find brand by ID
const brand = await prisma.brand.findUnique({
  where: { id: brandId },
  include: { user: true }
});

// List verified brands
const brands = await prisma.brand.findMany({
  where: {
    verificationStatus: 'verified',
    deletedAt: null
  },
  orderBy: { companyName: 'asc' }
});

// Search by company name
const results = await prisma.brand.findMany({
  where: {
    companyName: {
      contains: searchQuery,
      mode: 'insensitive'
    }
  }
});
```

## Environment Variables

```env
# Required
DATABASE_URL=postgresql://...
DATABASE_URL_POOLED=postgresql://...
NEXT_PUBLIC_APP_URL=https://yesgoddess.com
ADMIN_EMAIL=admin@yesgoddess.com

# Optional
NEXT_PUBLIC_ADMIN_URL=https://admin.yesgoddess.com
SUPPORT_EMAIL=support@yesgoddess.com
NEXT_PUBLIC_STORAGE_URL=https://storage.yesgoddess.com
```

## Common Validation Rules

### Company Name
- Min: 2 characters
- Max: 255 characters
- Required

### Industry
- Max: 100 characters
- Optional

### Contact Email
- Must be valid email format
- Required for primary contact

### Team Member Roles
- `admin`: Full access
- `manager`: Create projects, view analytics
- `viewer`: Read-only access

### Verification Status
- `pending`: Default for new brands
- `verified`: Admin approved
- `rejected`: Admin declined

## Error Handling

```typescript
try {
  await trpc.brands.create.mutate(data);
} catch (error) {
  if (error instanceof BrandAlreadyExistsError) {
    // User already has a brand
  } else if (error instanceof BrandNotFoundError) {
    // Brand doesn't exist
  } else {
    // Handle other errors
  }
}
```

## Background Jobs

### Register Jobs

```typescript
// In your job scheduler setup
import {
  brandVerificationReminderJobConfig,
  brandInactivityCheckJobConfig,
  brandDataCleanupJobConfig
} from '@/jobs/brand-*.job';

scheduler.register(brandVerificationReminderJobConfig);
scheduler.register(brandInactivityCheckJobConfig);
scheduler.register(brandDataCleanupJobConfig);
```

### Job Schedules

- **Verification Reminder**: Daily at 9 AM (`0 9 * * *`)
- **Inactivity Check**: Weekly on Mondays (`0 0 * * 1`)
- **Data Cleanup**: Monthly on 1st (`0 0 1 * *`)

## Testing

### Unit Test Example

```typescript
import { BrandService } from '@/modules/brands/services/brand.service';

describe('BrandService', () => {
  it('should create brand successfully', async () => {
    const brand = await brandService.createBrand(userId, {
      companyName: "Test Corp",
      contactInfo: { /* ... */ }
    });
    
    expect(brand.companyName).toBe("Test Corp");
    expect(brand.verificationStatus).toBe("pending");
  });
});
```

### Integration Test Example

```typescript
const response = await caller.brands.create({
  companyName: "Test Corp",
  contactInfo: { /* ... */ }
});

expect(response.data.verificationStatus).toBe('pending');
```

## Common JSONB Structures

### Company Size

```json
{
  "employeeCount": "51-200",
  "revenueRange": "$10M-$50M",
  "fundingStage": "series_a"
}
```

### Target Audience

```json
{
  "demographics": {
    "ageRanges": ["18-24", "25-34"],
    "genders": ["all"],
    "locations": ["us", "uk"]
  },
  "interests": ["tech", "sustainability"],
  "psychographics": ["early_adopters"]
}
```

### Contact Info

```json
{
  "primaryContact": {
    "name": "John Doe",
    "title": "CEO",
    "email": "john@acme.com",
    "phone": "+1-555-0100"
  },
  "companyPhone": "+1-555-0101",
  "website": "https://acme.com",
  "socialLinks": {
    "linkedin": "https://linkedin.com/company/acme",
    "instagram": "@acme"
  }
}
```

### Team Member

```json
{
  "userId": "user_123",
  "role": "manager",
  "permissions": ["create_projects", "view_analytics"],
  "addedAt": "2025-01-10T10:00:00Z",
  "addedBy": "user_456"
}
```

## Useful SQL Queries

### Brand Statistics

```sql
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE verification_status = 'verified') as verified,
  COUNT(*) FILTER (WHERE verification_status = 'pending') as pending,
  COUNT(*) FILTER (WHERE deleted_at IS NULL) as active
FROM brands;
```

### Brands Awaiting Verification

```sql
SELECT id, "companyName", "createdAt"
FROM brands
WHERE verification_status = 'pending'
  AND deleted_at IS NULL
ORDER BY "createdAt" DESC;
```

---

**Quick Reference Version**: 1.0  
**Last Updated**: January 2025
