# Brand Management Module

The Brand Management Module handles all operations related to brand/client accounts on the YES GODDESS platform. Brands are companies that license IP assets from creators, submit project briefs, and manage their campaigns.

## 📂 Module Structure

```
src/modules/brands/
├── index.ts                 # Module exports
├── errors/
│   └── brand.errors.ts      # Custom error classes
├── routers/
│   └── brands.router.ts     # tRPC API endpoints
├── schemas/
│   └── brand.schema.ts      # Zod validation schemas
├── services/
│   └── brand.service.ts     # Business logic
└── types/
    └── brand.types.ts       # TypeScript type definitions
```

## 🚀 Quick Start

### Import the Module

```typescript
import { BrandService, brandsRouter } from '@/modules/brands';
import type { Brand } from '@/modules/brands';
```

### Create a Brand

```typescript
const brand = await trpc.brands.create.mutate({
  companyName: "Acme Corp",
  industry: "Technology",
  contactInfo: {
    primaryContact: {
      name: "John Doe",
      title: "CEO",
      email: "john@acme.com"
    }
  }
});
```

### Get Brand

```typescript
const brand = await trpc.brands.getById.query({ id: "brand_123" });
const myBrand = await trpc.brands.getMyBrand.query();
```

## 🔑 Key Features

- ✅ **Brand Profile Management**: Create, read, update, delete brand profiles
- ✅ **Verification Workflow**: Admin approval/rejection system
- ✅ **Team Management**: Add/remove team members with role-based permissions
- ✅ **Brand Guidelines Upload**: Store brand documents (PDFs, DOCs)
- ✅ **Search & Discovery**: Full-text search for creator marketplace
- ✅ **Email Notifications**: Automated emails for verification, invitations
- ✅ **Audit Logging**: Track all brand-related changes
- ✅ **Soft Delete**: Data retention with safeguards for active licenses
- ✅ **Row-Level Security**: Authorization checks at service layer

## 📊 Database Schema

```prisma
model Brand {
  id                  String    @id @default(cuid())
  userId              String    @unique
  companyName         String
  industry            String?
  companySize         Json?     // JSONB
  targetAudience      Json?     // JSONB
  billingInfo         Json?     // JSONB
  brandGuidelinesUrl  String?
  contactInfo         Json?     // JSONB
  teamMembers         Json?     // JSONB
  verificationStatus  String    @default("pending")
  verifiedAt          DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  deletedAt           DateTime?
}
```

## 🔐 Authorization

### User Roles

- **ADMIN**: Full access to all brands, can verify/reject
- **BRAND**: Owns one brand profile, can manage team
- **CREATOR**: Can view verified brands only
- **VIEWER**: Limited access

### Team Member Roles

- **admin**: Full brand management access
- **manager**: Can create projects, view analytics
- **viewer**: Read-only access

### Permissions

- `create_projects`
- `approve_licenses`
- `view_analytics`
- `manage_team`
- `update_brand_info`

## 🎯 API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `brands.create` | Mutation | Protected | Create brand profile |
| `brands.getById` | Query | Protected | Get brand by ID |
| `brands.getMyBrand` | Query | Protected | Get current user's brand |
| `brands.list` | Query | Protected | List brands with filters |
| `brands.search` | Query | Protected | Search brands |
| `brands.update` | Mutation | Protected | Update brand profile |
| `brands.updateGuidelines` | Mutation | Protected | Update brand guidelines |
| `brands.addTeamMember` | Mutation | Protected | Add team member |
| `brands.removeTeamMember` | Mutation | Protected | Remove team member |
| `brands.verify` | Mutation | Admin | Verify brand |
| `brands.reject` | Mutation | Admin | Reject brand |
| `brands.delete` | Mutation | Protected | Soft delete brand |
| `brands.getStatistics` | Query | Admin | Get brand statistics |

## 📧 Email Templates

1. **BrandVerificationRequest** - Admin notification for new brand
2. **BrandWelcome** - Welcome email to new brand
3. **BrandVerificationComplete** - Approval confirmation
4. **BrandVerificationRejectedEmail** - Rejection with reason
5. **BrandTeamInvitation** - Team member invitation

## ⏰ Background Jobs

### 1. Brand Verification Reminder
- **Schedule**: Daily at 9 AM
- **Purpose**: Remind admins of pending verifications
- **File**: `src/jobs/brand-verification-reminder.job.ts`

### 2. Brand Inactivity Check
- **Schedule**: Weekly on Mondays
- **Purpose**: Re-engage inactive brands
- **File**: `src/jobs/brand-inactivity-check.job.ts`

### 3. Brand Data Cleanup
- **Schedule**: Monthly on 1st
- **Purpose**: Permanently delete old soft-deleted brands
- **File**: `src/jobs/brand-data-cleanup.job.ts`

## 🧪 Testing

```typescript
// Unit test example
describe('BrandService', () => {
  it('should create brand', async () => {
    const brand = await brandService.createBrand(userId, input);
    expect(brand.verificationStatus).toBe('pending');
  });
});

// Integration test example
const response = await caller.brands.create(input);
expect(response.data.id).toBeDefined();
```

## 🔧 Configuration

### Environment Variables

```env
# Required
DATABASE_URL=postgresql://...
NEXT_PUBLIC_APP_URL=https://yesgoddess.com
ADMIN_EMAIL=admin@yesgoddess.com

# Optional
NEXT_PUBLIC_ADMIN_URL=https://admin.yesgoddess.com
SUPPORT_EMAIL=support@yesgoddess.com
NEXT_PUBLIC_STORAGE_URL=https://storage.yesgoddess.com
```

## 📝 Usage Examples

### Service Layer

```typescript
import { BrandService } from '@/modules/brands';
import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { storageProvider } from '@/lib/storage';

const brandService = new BrandService(
  prisma,
  new EmailService(),
  new AuditService(prisma),
  storageProvider
);

// Create brand
const brand = await brandService.createBrand(userId, {
  companyName: "Acme Corp",
  contactInfo: { /* ... */ }
});

// Verify brand (admin only)
await brandService.verifyBrand(brandId, adminId, "Verified after checks");
```

### API Layer

```typescript
// Client-side usage
const { data } = await trpc.brands.create.useMutation({
  onSuccess: (brand) => {
    console.log('Brand created:', brand.id);
  }
});
```

## 🛡️ Security

- Input validation with Zod schemas
- Row-level security in service layer
- Sensitive data filtering based on user role
- Audit logging for all mutations
- Soft delete to prevent data loss
- Active license check before deletion
- Team member permission validation

## 📈 Performance

- Database indexes on frequently queried fields
- Selective field querying
- Pagination support
- Can add Redis caching layer

## 🐛 Troubleshooting

### TypeScript errors about missing fields
- Restart TypeScript server or IDE
- Run `npx prisma generate` again
- Clear node_modules and reinstall

### Authentication errors
- Ensure tRPC context includes user session
- Verify protectedProcedure middleware setup
- Check session token validity

### Email not sending
- Verify Resend API key configured
- Check email service logs
- Confirm template names match

## 📚 Documentation

- **Implementation Summary**: `docs/BRANDS_IMPLEMENTATION_SUMMARY.md`
- **Quick Reference**: `docs/BRANDS_QUICK_REFERENCE.md`
- **Integration Checklist**: `docs/BRANDS_INTEGRATION_CHECKLIST.md`

## 🤝 Contributing

1. Follow existing code patterns
2. Add tests for new features
3. Update documentation
4. Use TypeScript strictly
5. Follow Zod validation patterns

## 📞 Support

- **Issues**: Create GitHub issue with `[brands]` prefix
- **Questions**: #backend-team Slack channel
- **Documentation**: See docs folder

---

**Version**: 1.0.0  
**Last Updated**: January 2025  
**Module Owner**: Backend Team
