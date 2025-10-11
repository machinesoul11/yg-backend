# System Tables Module - Quick Reference

## **Overview**

The System Tables module provides infrastructure for idempotency keys, feature flags, and notifications.

---

## **📁 File Structure**

```
src/modules/system/
├── index.ts                              # Public exports
├── router.ts                             # tRPC router
├── types.ts                              # TypeScript interfaces
├── validation.ts                         # Zod schemas
├── errors.ts                             # Custom errors
└── services/
    ├── idempotency.service.ts            # Idempotency logic
    ├── feature-flag.service.ts           # Feature flag logic
    └── notification.service.ts           # Notification logic

src/jobs/
├── idempotency-cleanup.job.ts            # Cleanup job
└── notification-cleanup.job.ts           # Cleanup job

prisma/
├── schema.prisma                         # Updated with system tables
└── migrations/
    └── create_system_tables.sql          # Migration SQL
```

---

## **🔌 API Endpoints**

### **Idempotency**

```typescript
// Check if operation already performed
trpc.system.idempotency.check.useQuery({ key: 'uuid-here' });
// Returns: { data: IdempotencyResult | null }
```

### **Feature Flags**

```typescript
// Check if flag enabled for current user
trpc.system.featureFlags.isEnabled.useQuery({ flagName: 'enhanced-dashboard' });
// Returns: { data: { enabled: boolean } }

// Admin: List all flags
trpc.system.featureFlags.list.useQuery();
// Returns: { data: FeatureFlagResponse[] }

// Admin: Create flag
trpc.system.featureFlags.create.useMutation({
  name: 'new-feature',
  enabled: false,
  rolloutPercentage: 0
});

// Admin: Update flag
trpc.system.featureFlags.update.useMutation({
  id: 'clf123',
  enabled: true,
  rolloutPercentage: 50
});

// Admin: Delete flag
trpc.system.featureFlags.delete.useMutation({ id: 'clf123' });
```

### **Notifications**

```typescript
// List user notifications (paginated)
trpc.system.notifications.list.useQuery({
  read: false,
  type: 'LICENSE',
  page: 1,
  pageSize: 20
});
// Returns: { data: NotificationResponse[], meta: { pagination } }

// Get unread count
trpc.system.notifications.getUnreadCount.useQuery();
// Returns: { data: { count: number } }

// Mark notification as read
trpc.system.notifications.markAsRead.useMutation({
  notificationId: 'cln123'
});

// Mark all as read
trpc.system.notifications.markAllAsRead.useMutation();

// Delete notification
trpc.system.notifications.delete.useMutation({
  notificationId: 'cln123'
});

// Admin: Create notification
trpc.system.notifications.create.useMutation({
  userId: 'clu123',  // or userIds: [...] or userRole: 'BRAND'
  type: 'SYSTEM',
  title: 'Maintenance Alert',
  message: 'Scheduled maintenance tonight',
  priority: 'HIGH',
  actionUrl: '/system-status'
});
```

---

## **💻 Service Usage**

### **Idempotency Service**

```typescript
import { IdempotencyService } from '@/modules/system';
import { prisma } from '@/lib/db';

const service = new IdempotencyService(prisma);

// Check for existing result
const existing = await service.check('uuid-key');
if (existing) {
  return existing.responseBody; // Return cached response
}

// Start processing
await service.startProcessing({
  key: 'uuid-key',
  entityType: 'license',
  requestHash: hashRequest(data)
});

// Complete successfully
await service.completeProcessing({
  key: 'uuid-key',
  entityId: 'clx123',
  responseStatus: 201,
  responseBody: { id: 'clx123', ... }
});
```

### **Feature Flag Service**

```typescript
import { FeatureFlagService } from '@/modules/system';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

const service = new FeatureFlagService(prisma, redis);

// Check if enabled for user
const enabled = await service.isEnabled('enhanced-analytics', {
  userId: 'clu123',
  userRole: 'BRAND',
  brandId: 'clb456'
});

if (enabled) {
  // Show new feature
}
```

### **Notification Service**

```typescript
import { NotificationService } from '@/modules/system';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

const service = new NotificationService(prisma, redis);

// Create notification
await service.create({
  userId: 'clu123',
  type: 'LICENSE',
  title: 'License Approved',
  message: 'Your license has been approved',
  priority: 'HIGH',
  actionUrl: '/licenses/clx123',
  metadata: { licenseId: 'clx123', brandName: 'Nike' }
});

// Bulk create for role
await service.create({
  userRole: 'BRAND',
  type: 'SYSTEM',
  title: 'New Feature Available',
  message: 'Check out our enhanced analytics dashboard',
  priority: 'MEDIUM'
});
```

---

## **🗄️ Database Schema**

### **idempotency_keys**
```sql
- id: TEXT (PK)
- key: TEXT (UNIQUE)
- entity_type: TEXT
- entity_id: TEXT
- request_hash: TEXT
- response_status: INTEGER
- response_body: JSONB
- processed: BOOLEAN
- processing_at: TIMESTAMP
- created_at: TIMESTAMP
- expires_at: TIMESTAMP

Indexes:
- UNIQUE(key)
- (key)
- (expires_at)
- (entity_type, entity_id)
```

### **feature_flags**
```sql
- id: TEXT (PK)
- name: TEXT (UNIQUE)
- enabled: BOOLEAN
- description: TEXT
- conditions: JSONB
- rollout_percentage: INTEGER
- created_by: TEXT
- updated_by: TEXT
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

Indexes:
- UNIQUE(name)
- (name)
- (enabled)
```

### **notifications**
```sql
- id: TEXT (PK)
- user_id: TEXT (FK -> users.id)
- type: NotificationType ENUM
- title: VARCHAR(255)
- message: TEXT
- action_url: TEXT
- priority: NotificationPriority ENUM
- read: BOOLEAN
- read_at: TIMESTAMP
- metadata: JSONB
- created_at: TIMESTAMP

Indexes:
- (user_id, read, created_at)
- (user_id, type)
- (created_at)
```

---

## **🔐 Security Notes**

- All endpoints require authentication
- Admin endpoints require ADMIN role
- Users can only access their own notifications
- Feature flag conditions not exposed to non-admins
- Idempotency keys scoped to authorized operations

---

## **🚀 Background Jobs**

### **Idempotency Cleanup**
- **Schedule:** Every 6 hours
- **Action:** Delete expired keys (> 24 hours old)
- **Queue:** `idempotency-cleanup`

### **Notification Cleanup**
- **Schedule:** Daily at 3 AM
- **Action:** Delete read notifications > 90 days old
- **Queue:** `notification-cleanup`

---

## **📝 Frontend Examples**

### **Feature Gate Component**

```typescript
// components/FeatureGate.tsx
import { trpc } from '@/lib/trpc';

export function FeatureGate({ flag, children, fallback }) {
  const { data, isLoading } = trpc.system.featureFlags.isEnabled.useQuery({
    flagName: flag
  });
  
  if (isLoading) return null;
  if (!data?.enabled) return fallback || null;
  
  return <>{children}</>;
}

// Usage
<FeatureGate flag="enhanced-analytics">
  <EnhancedDashboard />
</FeatureGate>
```

### **Notification Bell**

```typescript
// components/NotificationBell.tsx
import { trpc } from '@/lib/trpc';

export function NotificationBell() {
  const { data: unreadCount } = trpc.system.notifications.getUnreadCount.useQuery(
    undefined,
    { refetchInterval: 30000 } // Poll every 30s
  );
  
  const { data: notifications } = trpc.system.notifications.list.useQuery({
    read: false,
    page: 1,
    pageSize: 10
  });
  
  const markAsRead = trpc.system.notifications.markAsRead.useMutation({
    onSuccess: () => {
      // Refetch counts
    }
  });
  
  return (
    <div>
      <Bell />
      {unreadCount?.count > 0 && <Badge>{unreadCount.count}</Badge>}
      {/* Notification dropdown */}
    </div>
  );
}
```

---

## **🧪 Testing**

### **Run Tests**
```bash
npm run test:unit -- src/modules/system
npm run test:integration -- src/modules/system
```

### **Test Endpoints**
```bash
# Feature flags
curl http://localhost:3000/api/trpc/system.featureFlags.list

# Notifications
curl http://localhost:3000/api/trpc/system.notifications.getUnreadCount
```

---

## **📦 Dependencies**

- `@prisma/client` - Database ORM
- `ioredis` - Redis caching
- `zod` - Validation
- `@trpc/server` - API framework
- `bullmq` - Background jobs

---

## **🔗 Related Modules**

- **Licensing Module** - Uses idempotency for license creation
- **Payouts Module** - Uses idempotency for Stripe transfers
- **All Modules** - Can send notifications to users

---

**Last Updated:** October 10, 2025  
**Module Status:** ✅ Production Ready
