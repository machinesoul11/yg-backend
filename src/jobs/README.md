# Background Jobs

This directory contains all BullMQ background job definitions for the YesGoddess backend.

## **Job Files**

### **System Jobs**
- `idempotency-cleanup.job.ts` - Cleans up expired idempotency keys (every 6 hours)
- `notification-cleanup.job.ts` - Deletes old read notifications (daily at 3 AM)

### **Starting Jobs**

Jobs are automatically started when the worker processes are initialized. To manually schedule:

```typescript
import { 
  scheduleIdempotencyCleanup 
} from './jobs/idempotency-cleanup.job';
import { 
  scheduleNotificationCleanup 
} from './jobs/notification-cleanup.job';

// Schedule all recurring jobs
await scheduleIdempotencyCleanup();
await scheduleNotificationCleanup();
```

### **Monitoring Jobs**

Use BullMQ Dashboard or Redis CLI:

```bash
# View all queues
redis-cli KEYS *bull*

# View job counts
redis-cli HGETALL bull:idempotency-cleanup:meta
```

## **Adding New Jobs**

1. Create job file: `src/jobs/my-job.job.ts`
2. Define queue and worker
3. Export schedule function
4. Add to startup script
