# 📋 Analytics Event Tracking - Quick Reference

**Classification:** 🌐 SHARED  
**Last Updated:** October 17, 2025

---

## Quick Start

### 1. Install Hook

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';

function MyComponent() {
  const { track } = useAnalytics();
  
  track({
    eventType: 'page_viewed',
    props: { page: '/home' }
  });
}
```

---

## Common Event Types

### User Events
```typescript
'user_signed_up'
'user_logged_in'
'user_logged_out'
'user_profile_updated'
'user_email_verified'
```

### Asset Events
```typescript
'asset_uploaded'
'asset_viewed'          // Required prop: view_duration_ms
'asset_downloaded'
'asset_shared'
'asset_approved'
```

### License Events
```typescript
'license_created'
'license_signed'        // Required prop: license_id (+ idempotency key!)
'license_viewed'
'license_renewed'
```

### Engagement Events
```typescript
'page_viewed'
'cta_clicked'
'search_performed'
'filter_applied'
'form_submitted'
'modal_opened'
'modal_closed'
```

### Post/Blog Events
```typescript
'post_viewed'           // Required prop: post_id
'post_scroll_depth'
'post_engagement_time'
'post_cta_clicked'      // Required props: cta_type, cta_url
'post_shared'
```

---

## API Endpoints

### Track Single Event
```typescript
const result = await trpc.eventIngestion.track.mutate({
  eventType: 'asset_viewed',
  source: 'web',           // Default: 'web'
  entityId: 'cm123...',    // Optional
  entityType: 'asset',     // Required if entityId present
  sessionId: uuid,         // Auto-added by hook
  props: { /* custom */ },
  attribution: { /* utm */ }, // Auto-added by hook
  idempotencyKey: uuid,    // Optional (use for critical events)
});

// Response: { eventId: string | null, tracked: boolean }
```

### Track Batch Events
```typescript
const result = await trpc.eventIngestion.trackBatch.mutate({
  events: [/* 1-50 events */]
});

// Response: { total, successful, failed, results: [...] }
```

### Get Stats (Admin Only)
```typescript
const stats = await trpc.eventIngestion.getStats.query({});

// Response: { bufferSize, isProcessing, config }
```

### Force Flush (Admin Only)
```typescript
const result = await trpc.eventIngestion.forceFlush.mutate({});

// Response: { flushed: boolean, message: string }
```

---

## Entity Types

```typescript
'project' | 'asset' | 'license' | 'creator' | 'brand' | 
'user' | 'royalty' | 'payout' | 'post' | 'category'
```

---

## Event Sources

```typescript
'web'      // Default - browser/web app
'api'      // Backend API calls
'mobile'   // Mobile app
'system'   // Automated system events
'webhook'  // External webhook triggers
```

---

## Validation Rules

| Rule | Description |
|------|-------------|
| **eventType** | Max 100 chars |
| **entityType** | Required if entityId is provided |
| **timestamp** | Cannot be in future or >30 days old |
| **props** | Must match required props for event type |
| **idempotencyKey** | UUID format (if provided) |

---

## Required Props by Event Type

```typescript
const REQUIRED_PROPS = {
  'asset_viewed': ['view_duration_ms'],
  'license_signed': ['license_id'],
  'payout_completed': ['amount_cents', 'payment_method'],
  'post_viewed': ['post_id'],
  'post_cta_clicked': ['cta_type', 'cta_url'],
};
```

---

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `BAD_REQUEST` | Validation failed | Fix data, do NOT retry |
| `UNAUTHORIZED` | Not authenticated | Queue for later |
| `FORBIDDEN` | Permission denied | Log only |
| `TOO_MANY_REQUESTS` | Rate limited | Retry with backoff |
| `INTERNAL_SERVER_ERROR` | Server error | Retry with backoff |

---

## Helper Functions

### Session Management
```typescript
import { getOrCreateSession } from '@/utils/analytics/session';

const sessionId = getOrCreateSession(); // UUID persisted for 30min
```

### Attribution Parsing
```typescript
import { getAttributionData } from '@/utils/analytics/attribution';

const attribution = getAttributionData(); // Parses UTM params, persists 7 days
```

### Offline Queue
```typescript
import { queueEvent, syncQueue } from '@/utils/analytics/offlineQueue';

// Queue event when offline
queueEvent(event);

// Sync when back online
await syncQueue((events) => trackBatch.mutateAsync({ events }));
```

---

## Example Patterns

### Track Page View
```typescript
useEffect(() => {
  track({
    eventType: 'page_viewed',
    props: {
      page: window.location.pathname,
      title: document.title,
    },
  });
}, [pathname]);
```

### Track Asset View with Duration
```typescript
const startTime = useRef(Date.now());

useEffect(() => {
  track({ eventType: 'asset_viewed', entityId: assetId, entityType: 'asset' });
  
  return () => {
    const duration = Date.now() - startTime.current;
    track({ 
      eventType: 'asset_viewed', 
      entityId: assetId,
      entityType: 'asset',
      props: { view_duration_ms: duration } 
    });
  };
}, [assetId]);
```

### Track Form Submission
```typescript
const onSubmit = async (data) => {
  try {
    await submitForm(data);
    track({ eventType: 'form_submitted', props: { formName: 'contact', success: true } });
  } catch (error) {
    track({ eventType: 'form_submitted', props: { formName: 'contact', success: false } });
  }
};
```

### Track CTA Click
```typescript
<button onClick={() => {
  track({
    eventType: 'cta_clicked',
    props: {
      ctaText: 'Get Started',
      ctaLocation: 'homepage_hero',
      ctaDestination: '/signup',
    },
  });
}}>
  Get Started
</button>
```

### Track License Signing (with Idempotency)
```typescript
import { v4 as uuidv4 } from 'uuid';

const handleSign = async () => {
  const idempotencyKey = uuidv4();
  
  await signLicense(licenseId);
  
  track({
    eventType: 'license_signed',
    entityId: licenseId,
    entityType: 'license',
    props: { license_id: licenseId, signedBy: userId },
    idempotencyKey, // Prevents duplicates!
  });
};
```

### Track Scroll Depth with Milestones
```typescript
const [milestones, setMilestones] = useState(new Set());

const handleScroll = debounce(() => {
  const depth = Math.round((scrollY / docHeight) * 100);
  
  if (depth >= 50 && !milestones.has('50')) {
    track({
      eventType: 'post_scroll_depth',
      entityId: postId,
      entityType: 'post',
      props: { scrollDepthPercentage: depth, milestone: '50' },
    });
    setMilestones(prev => new Set(prev).add('50'));
  }
}, 500);
```

---

## Performance Best Practices

### 1. Debounce High-Frequency Events
```typescript
const trackScrollDebounced = debounce(
  (depth) => track({ eventType: 'post_scroll_depth', props: { depth } }),
  1000
);
```

### 2. Lazy Load Analytics
```typescript
const AnalyticsProvider = dynamic(
  () => import('@/components/AnalyticsProvider'),
  { ssr: false }
);
```

### 3. Sample High-Traffic Pages
```typescript
if (Math.random() < 0.1) { // 10% sampling
  track({ eventType: 'page_viewed' });
}
```

### 4. Batch Manual Tracking
```typescript
// Queue 20 events, then flush
if (queuedEvents.length >= 20) {
  trackBatch.mutate({ events: queuedEvents });
}
```

---

## Error Handling

### ✅ DO: Silent Failure
```typescript
track.mutate(event, {
  onError: (error) => {
    console.error('[Analytics] Tracking failed:', error);
    queueEvent(event); // Queue for retry
  }
});
```

### ❌ DON'T: Show User Errors
```typescript
// Never do this!
track.mutate(event, {
  onError: () => toast.error('Tracking failed')
});
```

---

## Testing

### Unit Test
```typescript
it('should track event with session ID', () => {
  const { result } = renderHook(() => useAnalytics());
  
  act(() => {
    result.current.track({ eventType: 'page_viewed' });
  });
  
  expect(mockMutate).toHaveBeenCalledWith(
    expect.objectContaining({
      eventType: 'page_viewed',
      sessionId: expect.any(String),
    })
  );
});
```

### E2E Test
```typescript
test('tracks page view', async ({ page }) => {
  await page.route('**/api/trpc/eventIngestion.track', (route) => {
    route.fulfill({ status: 200, body: JSON.stringify({ tracked: true }) });
  });
  
  await page.goto('/');
  // Verify tracking call
});
```

---

## Monitoring

### Check Buffer Size (Admin)
```typescript
const { data } = trpc.eventIngestion.getStats.useQuery({}, {
  refetchInterval: 10000,
});

console.log(`Buffer: ${data?.bufferSize} events`);
```

### Check Offline Queue
```typescript
import { getQueue } from '@/utils/analytics/offlineQueue';

console.log(`Queued: ${getQueue().length} events`);
```

---

## Configuration

### Backend Batching Config
- **Batch Size:** 100 events
- **Batch Timeout:** 10 seconds
- **Deduplication TTL:** 60 seconds
- **Idempotency TTL:** 1 hour

### Recommended Frontend Limits
- **Individual Events:** Max 10/second
- **Batch Events:** Max 50 events per batch
- **Queue Size:** Max 500 events
- **Session Timeout:** 30 minutes
- **Attribution TTL:** 7 days

---

## Troubleshooting

**Events not appearing?**  
→ Check buffer with `getStats()` - events flush every 10s or at 100 events

**Validation errors?**  
→ Ensure `entityType` is provided when `entityId` is present  
→ Check required props for event type

**Duplicate events?**  
→ Use idempotency keys for critical events  
→ Events deduplicated within 60s window

**High event volume?**  
→ Implement debouncing  
→ Sample high-traffic pages  
→ Review which events are necessary

---

## Related Documentation

- [Full Integration Guide](./ANALYTICS_EVENT_TRACKING_INTEGRATION.md)
- [Helper Utilities & Patterns](./ANALYTICS_EVENT_HELPERS_GUIDE.md)
- Backend Implementation: `/src/modules/analytics/`

---

## Support

**Questions?** Contact backend team or file issue in yg-backend repo.

**Found a bug?** Report in backend issue tracker with:
- Event type
- Request payload
- Error message
- Browser console logs
