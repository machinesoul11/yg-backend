# 🌐 Analytics Event Tracking System - Frontend Integration Guide

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
**Module:** Analytics Data Collection / Event Tracking System  
**Last Updated:** October 17, 2025  
**Backend Status:** ✅ Fully Implemented

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Rate Limiting & Performance](#rate-limiting--performance)
8. [Real-time Considerations](#real-time-considerations)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

The Event Tracking System provides a **high-throughput, batched event ingestion pipeline** for collecting user interactions, system events, and analytics data across the YesGoddess platform.

### Key Features

- ✅ **Public & Protected Endpoints** - Track events for both authenticated and anonymous users
- ✅ **Batch Processing** - Automatic batching for performance (100 events per batch, 10s timeout)
- ✅ **Deduplication** - Prevents duplicate events within 60-second window
- ✅ **Idempotency** - Optional idempotency keys for guaranteed once-only processing
- ✅ **Event Enrichment** - Automatic user agent parsing, session tracking, geo-location
- ✅ **Validation** - Schema validation + business logic + referential integrity checks
- ✅ **Async Processing** - Events written to buffer, flushed asynchronously (non-blocking)

### Architecture

```
Frontend → tRPC API → Event Ingestion Service → Buffer → Database
                                                    ↓
                                            Enrichment Queue
```

**Important:** Event tracking is designed to **never block user actions**. All errors are caught and logged, but the API always returns success to prevent UI disruption.

---

## API Endpoints

### Base URL
- **Development:** `http://localhost:3000/api/trpc`
- **Production:** `https://ops.yesgoddess.agency/api/trpc`

> **Note:** Event ingestion endpoints are **NOT** currently mounted in the main tRPC router. You'll need to add them to `/src/lib/api/root.ts`:
> ```typescript
> import { eventIngestionRouter } from '@/modules/analytics';
> 
> export const appRouter = createTRPCRouter({
>   // ... existing routers
>   eventIngestion: eventIngestionRouter,
> });
> ```

---

### 1. Track Single Event

**Endpoint:** `eventIngestion.track`  
**Method:** `mutation`  
**Authentication:** 🌐 Public (optional authentication)

Track a single analytics event. Use this for individual user interactions.

#### Request Schema

```typescript
{
  eventType: string;           // Required: Event type (see EVENT_TYPES)
  source: 'web' | 'api' | 'mobile' | 'system' | 'webhook';  // Default: 'web'
  entityId?: string;           // CUID of related entity
  entityType?: 'project' | 'asset' | 'license' | 'creator' | 'brand' | 'user' | 'royalty' | 'payout' | 'post' | 'category';
  sessionId?: string;          // UUID session identifier
  props?: Record<string, any>; // Custom event properties
  attribution?: {              // Marketing attribution data
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    referrer?: string;
    landingPage?: string;
  };
  idempotencyKey?: string;     // UUID for guaranteed once-only processing
}
```

#### Response Schema

```typescript
{
  eventId: string | null;      // Event ID (null during buffering)
  tracked: boolean;            // Whether event was accepted
}
```

#### Example Usage (React Query)

```typescript
import { trpc } from '@/lib/trpc';

function useTrackEvent() {
  const trackEvent = trpc.eventIngestion.track.useMutation({
    onSuccess: (data) => {
      console.log('Event tracked:', data);
    },
    onError: (error) => {
      // Event tracking errors should be logged but not shown to users
      console.error('Event tracking failed:', error);
    }
  });

  return trackEvent;
}

// Usage in component
function AssetViewer({ assetId }: { assetId: string }) {
  const trackEvent = useTrackEvent();
  
  useEffect(() => {
    trackEvent.mutate({
      eventType: 'asset_viewed',
      source: 'web',
      entityId: assetId,
      entityType: 'asset',
      sessionId: getSessionId(), // From your session management
      props: {
        view_duration_ms: 0, // Update on unmount
        referrer: document.referrer,
      },
      attribution: getAttributionData(), // From URL params
    });
  }, [assetId]);
  
  return <div>Asset content...</div>;
}
```

---

### 2. Track Batch Events

**Endpoint:** `eventIngestion.trackBatch`  
**Method:** `mutation`  
**Authentication:** 🌐 Public (optional authentication)

Track multiple events in a single request. Useful for:
- Offline sync when connection is restored
- Mobile apps queuing events
- Reducing network requests for high-frequency events

#### Request Schema

```typescript
{
  events: Array<TrackEventInput>;  // 1-50 events (max 50 per batch)
}
```

#### Response Schema

```typescript
{
  total: number;                   // Total events in batch
  successful: number;              // Successfully processed
  failed: number;                  // Failed to process
  results: Array<{
    index: number;                 // Event index in batch
    status: 'fulfilled' | 'rejected';
    data: {
      eventId: string | null;
      tracked: boolean;
    } | null;
    error: string | null;          // Error message if failed
  }>;
}
```

#### Example Usage

```typescript
import { trpc } from '@/lib/trpc';

function useOfflineEventSync() {
  const trackBatch = trpc.eventIngestion.trackBatch.useMutation();
  
  const syncOfflineEvents = async () => {
    const queuedEvents = getQueuedEventsFromStorage();
    
    if (queuedEvents.length === 0) return;
    
    // Split into chunks of 50
    const chunks = chunkArray(queuedEvents, 50);
    
    for (const chunk of chunks) {
      const result = await trackBatch.mutateAsync({ events: chunk });
      
      console.log(`Synced ${result.successful}/${result.total} events`);
      
      // Remove successful events from queue
      result.results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          removeEventFromQueue(chunk[i]);
        }
      });
    }
  };
  
  return { syncOfflineEvents };
}
```

---

### 3. Get Ingestion Stats (Admin Only)

**Endpoint:** `eventIngestion.getStats`  
**Method:** `query`  
**Authentication:** 🔒 ADMIN Only

Get current buffer statistics and configuration.

#### Request Schema

```typescript
{} // Empty object or omit
```

#### Response Schema

```typescript
{
  bufferSize: number;              // Events currently in buffer
  isProcessing: boolean;           // Whether batch is being flushed
  config: {
    batchSize: number;             // 100
    batchTimeoutMs: number;        // 10000 (10 seconds)
    enableDeduplication: boolean;  // true
    enableEnrichment: boolean;     // true
    deduplicationTtlSeconds: number; // 60
  };
}
```

#### Example Usage

```typescript
function AdminDashboard() {
  const { data } = trpc.eventIngestion.getStats.useQuery(
    {},
    {
      refetchInterval: 5000, // Refresh every 5 seconds
      enabled: isAdmin,
    }
  );
  
  return (
    <div>
      <h3>Event Ingestion Pipeline</h3>
      <p>Buffer Size: {data?.bufferSize ?? 0} events</p>
      <p>Status: {data?.isProcessing ? 'Flushing...' : 'Ready'}</p>
    </div>
  );
}
```

---

### 4. Force Flush Buffer (Admin Only)

**Endpoint:** `eventIngestion.forceFlush`  
**Method:** `mutation`  
**Authentication:** 🔒 ADMIN Only

Immediately flush event buffer to database. Use for testing or manual intervention.

#### Request Schema

```typescript
{} // Empty object or omit
```

#### Response Schema

```typescript
{
  flushed: boolean;
  message: string;
}
```

#### Example Usage

```typescript
function AdminControls() {
  const forceFlush = trpc.eventIngestion.forceFlush.useMutation({
    onSuccess: () => {
      toast.success('Event buffer flushed successfully');
    }
  });
  
  return (
    <button onClick={() => forceFlush.mutate({})}>
      Force Flush Buffer
    </button>
  );
}
```

---

## TypeScript Type Definitions

### Core Types

Copy these into your frontend codebase (e.g., `@/types/analytics.ts`):

```typescript
/**
 * Event Types Enum
 */
export const EVENT_TYPES = {
  // User Events
  USER_SIGNED_UP: 'user_signed_up',
  USER_LOGGED_IN: 'user_logged_in',
  USER_LOGGED_OUT: 'user_logged_out',
  USER_PROFILE_UPDATED: 'user_profile_updated',
  USER_PASSWORD_CHANGED: 'user_password_changed',
  USER_EMAIL_VERIFIED: 'user_email_verified',

  // Asset Events
  ASSET_UPLOADED: 'asset_uploaded',
  ASSET_VIEWED: 'asset_viewed',
  ASSET_DOWNLOADED: 'asset_downloaded',
  ASSET_PREVIEW_GENERATED: 'asset_preview_generated',
  ASSET_APPROVED: 'asset_approved',
  ASSET_REJECTED: 'asset_rejected',
  ASSET_UPDATED: 'asset_updated',
  ASSET_DELETED: 'asset_deleted',
  ASSET_SHARED: 'asset_shared',

  // Project Events
  PROJECT_CREATED: 'project_created',
  PROJECT_STARTED: 'project_started',
  PROJECT_COMPLETED: 'project_completed',
  PROJECT_ARCHIVED: 'project_archived',
  PROJECT_UPDATED: 'project_updated',
  PROJECT_DELETED: 'project_deleted',

  // License Events
  LICENSE_CREATED: 'license_created',
  LICENSE_SIGNED: 'license_signed',
  LICENSE_RENEWED: 'license_renewed',
  LICENSE_EXPIRED: 'license_expired',
  LICENSE_TERMINATED: 'license_terminated',
  LICENSE_VIEWED: 'license_viewed',
  LICENSE_CLICKED: 'license_clicked',

  // Royalty Events
  ROYALTY_CALCULATED: 'royalty_calculated',
  ROYALTY_STATEMENT_GENERATED: 'royalty_statement_generated',
  ROYALTY_STATEMENT_REVIEWED: 'royalty_statement_reviewed',
  PAYOUT_COMPLETED: 'payout_completed',
  PAYOUT_FAILED: 'payout_failed',

  // Engagement Events
  PAGE_VIEWED: 'page_viewed',
  CTA_CLICKED: 'cta_clicked',
  SEARCH_PERFORMED: 'search_performed',
  FILTER_APPLIED: 'filter_applied',
  BUTTON_CLICKED: 'button_clicked',
  FORM_SUBMITTED: 'form_submitted',
  MODAL_OPENED: 'modal_opened',
  MODAL_CLOSED: 'modal_closed',

  // Creator Events
  CREATOR_PROFILE_CREATED: 'creator_profile_created',
  CREATOR_PROFILE_UPDATED: 'creator_profile_updated',
  CREATOR_VERIFIED: 'creator_verified',
  CREATOR_PORTFOLIO_VIEWED: 'creator_portfolio_viewed',

  // Brand Events
  BRAND_PROFILE_CREATED: 'brand_profile_created',
  BRAND_PROFILE_UPDATED: 'brand_profile_updated',
  BRAND_VERIFIED: 'brand_verified',
  BRAND_PROJECT_VIEWED: 'brand_project_viewed',

  // System Events
  EMAIL_SENT: 'email_sent',
  EMAIL_OPENED: 'email_opened',
  EMAIL_CLICKED: 'email_clicked',
  EMAIL_BOUNCED: 'email_bounced',
  WEBHOOK_RECEIVED: 'webhook_received',
  JOB_COMPLETED: 'job_completed',
  JOB_FAILED: 'job_failed',
  ERROR_OCCURRED: 'error_occurred',
  API_REQUEST: 'api_request',
  
  // Ownership Events
  OWNERSHIP_CREATED: 'ownership_created',
  OWNERSHIP_TRANSFERRED: 'ownership_transferred',
  OWNERSHIP_VERIFIED: 'ownership_verified',

  // Blog/Post Analytics Events
  POST_VIEWED: 'post_viewed',
  POST_SCROLL_DEPTH: 'post_scroll_depth',
  POST_ENGAGEMENT_TIME: 'post_engagement_time',
  POST_CTA_CLICKED: 'post_cta_clicked',
  POST_SHARED: 'post_shared',
  POST_COMMENT_CLICKED: 'post_comment_clicked',
  POST_LIKE_CLICKED: 'post_like_clicked',
  POST_DOWNLOAD_CLICKED: 'post_download_clicked',
  POST_SUBSCRIBED: 'post_subscribed',
  POST_EXPERIMENT_VIEWED: 'post_experiment_viewed',
  
  // Performance Metrics Events
  POST_SESSION_START: 'post_session_start',
  POST_SESSION_END: 'post_session_end',
  POST_PAGE_EXIT: 'post_page_exit',
  POST_EMAIL_CAPTURE: 'post_email_capture',
  POST_SOCIAL_SHARE_CLICKED: 'post_social_share_clicked',
  POST_BOUNCE: 'post_bounce',
  POST_READ_COMPLETE: 'post_read_complete',
  POST_ENGAGEMENT_MILESTONE: 'post_engagement_milestone',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

/**
 * Event Source Types
 */
export const EVENT_SOURCES = {
  WEB: 'web',
  API: 'api',
  MOBILE: 'mobile',
  SYSTEM: 'system',
  WEBHOOK: 'webhook',
} as const;

export type EventSource = typeof EVENT_SOURCES[keyof typeof EVENT_SOURCES];

/**
 * Entity Types
 */
export const ENTITY_TYPES = {
  PROJECT: 'project',
  ASSET: 'asset',
  LICENSE: 'license',
  CREATOR: 'creator',
  BRAND: 'brand',
  USER: 'user',
  ROYALTY: 'royalty',
  PAYOUT: 'payout',
  POST: 'post',
  CATEGORY: 'category',
} as const;

export type EntityType = typeof ENTITY_TYPES[keyof typeof ENTITY_TYPES];

/**
 * Track Event Input
 */
export interface TrackEventInput {
  eventType: string;
  source?: EventSource;
  entityId?: string;
  entityType?: EntityType;
  sessionId?: string;
  props?: Record<string, any>;
  attribution?: AttributionData;
  idempotencyKey?: string;
}

/**
 * Attribution Data
 */
export interface AttributionData {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
  landingPage?: string;
}

/**
 * Event Response
 */
export interface EventCreated {
  eventId: string | null;
  tracked: boolean;
}

/**
 * Batch Response
 */
export interface BatchTrackResponse {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    index: number;
    status: 'fulfilled' | 'rejected';
    data: EventCreated | null;
    error: string | null;
  }>;
}

/**
 * Ingestion Stats (Admin)
 */
export interface IngestionStats {
  bufferSize: number;
  isProcessing: boolean;
  config: {
    batchSize: number;
    batchTimeoutMs: number;
    enableDeduplication: boolean;
    enableEnrichment: boolean;
    deduplicationTtlSeconds: number;
  };
}
```

---

### Zod Schemas (For Client-Side Validation)

```typescript
import { z } from 'zod';

export const attributionSchema = z.object({
  utmSource: z.string().max(255).optional(),
  utmMedium: z.string().max(255).optional(),
  utmCampaign: z.string().max(255).optional(),
  utmTerm: z.string().max(255).optional(),
  utmContent: z.string().max(255).optional(),
  referrer: z.string().url().optional().or(z.literal('')),
  landingPage: z.string().url().optional().or(z.literal('')),
});

export const trackEventSchema = z.object({
  eventType: z.string().max(100),
  source: z.enum(['web', 'api', 'mobile', 'system', 'webhook']).default('web'),
  entityId: z.string().cuid().optional(),
  entityType: z.enum(['project', 'asset', 'license', 'creator', 'brand', 'user', 'royalty', 'payout', 'post', 'category']).optional(),
  sessionId: z.string().uuid().optional(),
  props: z.record(z.string(), z.any()).optional(),
  attribution: attributionSchema.optional(),
  idempotencyKey: z.string().uuid().optional(),
}).refine(
  (data) => {
    // If entityId is provided, entityType must also be provided
    if (data.entityId && !data.entityType) return false;
    return true;
  },
  { message: "entityType is required when entityId is provided" }
);
```

---

## Business Logic & Validation Rules

### Field Validation

| Field | Required | Format | Max Length | Notes |
|-------|----------|--------|------------|-------|
| `eventType` | ✅ Yes | String | 100 chars | Should match EVENT_TYPES enum |
| `source` | No | Enum | - | Defaults to 'web' |
| `entityId` | No | CUID | - | If provided, entityType is required |
| `entityType` | Conditional | Enum | - | Required if entityId is provided |
| `sessionId` | No | UUID | - | Recommended for session tracking |
| `props` | No | JSON Object | - | Arbitrary key-value pairs |
| `attribution` | No | Object | - | Marketing attribution data |
| `idempotencyKey` | No | UUID | - | For guaranteed once-only processing |

### Business Rules

#### 1. Timestamp Validation (if provided in props)

```typescript
// If props.occurred_at is provided:
const occurredAt = new Date(props.occurred_at);
const now = new Date();
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

// Rules:
- occurredAt must NOT be in the future
- occurredAt must NOT be more than 30 days old
```

**Frontend Implementation:**
```typescript
function validateEventTimestamp(timestamp: Date): boolean {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  if (timestamp > now) {
    console.warn('Event timestamp is in the future');
    return false;
  }
  
  if (timestamp < thirtyDaysAgo) {
    console.warn('Event timestamp is too old (>30 days)');
    return false;
  }
  
  return true;
}
```

#### 2. Required Props by Event Type

Certain event types require specific properties:

| Event Type | Required Props |
|------------|----------------|
| `asset_viewed` | `view_duration_ms` |
| `license_signed` | `license_id` |
| `payout_completed` | `amount_cents`, `payment_method` |
| `post_viewed` | `post_id` |
| `post_cta_clicked` | `cta_type`, `cta_url` |

**Frontend Implementation:**
```typescript
const EVENT_REQUIRED_PROPS: Record<string, string[]> = {
  'asset_viewed': ['view_duration_ms'],
  'license_signed': ['license_id'],
  'payout_completed': ['amount_cents', 'payment_method'],
  'post_viewed': ['post_id'],
  'post_cta_clicked': ['cta_type', 'cta_url'],
};

function validateEventProps(
  eventType: string, 
  props?: Record<string, any>
): boolean {
  const requiredProps = EVENT_REQUIRED_PROPS[eventType];
  
  if (!requiredProps) return true; // No requirements
  
  if (!props) {
    console.error(`Event ${eventType} requires props: ${requiredProps.join(', ')}`);
    return false;
  }
  
  for (const prop of requiredProps) {
    if (!(prop in props)) {
      console.error(`Event ${eventType} missing required prop: ${prop}`);
      return false;
    }
  }
  
  return true;
}
```

#### 3. Entity Reference Validation

If `entityId` and `entityType` are provided, the backend will validate that the referenced entity exists. However, **this validation happens asynchronously** and won't block the event from being tracked.

**Frontend Best Practice:**
```typescript
// Only track events for entities that exist in your local state
function trackAssetView(asset: Asset) {
  if (!asset || !asset.id) {
    console.warn('Cannot track view for non-existent asset');
    return;
  }
  
  trackEvent.mutate({
    eventType: EVENT_TYPES.ASSET_VIEWED,
    entityId: asset.id,
    entityType: ENTITY_TYPES.ASSET,
    // ...
  });
}
```

#### 4. Deduplication Strategy

Events are deduplicated using a fingerprint based on:
- Event type
- User ID (or 'anonymous')
- Entity ID
- Session ID
- Timestamp (rounded to nearest second)

**TTL:** 60 seconds

**Frontend Implications:**
- Rapid duplicate clicks within 60 seconds will be ignored
- Use debouncing for high-frequency events
- For intentional re-tracking (e.g., page refresh), wait 1 second or use a new session ID

```typescript
import { debounce } from 'lodash';

// Debounce high-frequency events
const trackScrollDebounced = debounce((depth: number) => {
  trackEvent.mutate({
    eventType: EVENT_TYPES.POST_SCROLL_DEPTH,
    props: { scrollDepthPercentage: depth },
  });
}, 1000); // 1 second debounce
```

#### 5. Idempotency Keys

Use idempotency keys for critical events that **must not be duplicated** (e.g., payment completions, license signings).

```typescript
import { v4 as uuidv4 } from 'uuid';

function trackLicenseSigned(licenseId: string) {
  const idempotencyKey = uuidv4();
  
  // Store key locally to retry if network fails
  localStorage.setItem(`license_signed_${licenseId}`, idempotencyKey);
  
  trackEvent.mutate({
    eventType: EVENT_TYPES.LICENSE_SIGNED,
    entityId: licenseId,
    entityType: ENTITY_TYPES.LICENSE,
    idempotencyKey,
    props: {
      license_id: licenseId,
    },
  });
}
```

---

## Error Handling

### HTTP Status Codes

| Status | Meaning | Frontend Action |
|--------|---------|-----------------|
| `200` | Event tracked successfully | Continue normal operation |
| `400` | Bad Request (validation failed) | Log error, do NOT retry |
| `401` | Unauthorized (for protected endpoints) | Redirect to login |
| `403` | Forbidden (insufficient permissions) | Show error message |
| `429` | Rate Limit Exceeded | Retry with exponential backoff |
| `500` | Internal Server Error | Retry with exponential backoff |

### tRPC Error Codes

The backend uses standard tRPC error codes:

```typescript
type TRPCErrorCode =
  | 'BAD_REQUEST'           // Validation error
  | 'UNAUTHORIZED'          // Not authenticated
  | 'FORBIDDEN'             // Not authorized
  | 'NOT_FOUND'             // Entity not found
  | 'TIMEOUT'               // Request timeout
  | 'CONFLICT'              // Duplicate request
  | 'PRECONDITION_FAILED'   // Business rule violation
  | 'PAYLOAD_TOO_LARGE'     // Batch too large
  | 'TOO_MANY_REQUESTS'     // Rate limited
  | 'INTERNAL_SERVER_ERROR' // Server error
```

### Error Response Schema

```typescript
interface TRPCError {
  code: TRPCErrorCode;
  message: string;
  data?: {
    zodError?: {
      fieldErrors: Record<string, string[]>;
      formErrors: string[];
    };
  };
}
```

### Frontend Error Handling

```typescript
import { TRPCClientError } from '@trpc/client';

function useAnalyticsTracking() {
  const trackEvent = trpc.eventIngestion.track.useMutation({
    onError: (error) => {
      if (error instanceof TRPCClientError) {
        switch (error.data?.code) {
          case 'BAD_REQUEST':
            // Validation error - log and do NOT retry
            console.error('Invalid event data:', error.message);
            if (error.data?.zodError) {
              console.error('Validation errors:', error.data.zodError);
            }
            break;
            
          case 'UNAUTHORIZED':
            // Not authenticated - queue for later
            queueEventForLater();
            break;
            
          case 'FORBIDDEN':
            // Permission denied - log only
            console.warn('Permission denied for event tracking');
            break;
            
          case 'TOO_MANY_REQUESTS':
            // Rate limited - retry with backoff
            retryWithBackoff();
            break;
            
          case 'INTERNAL_SERVER_ERROR':
          case 'TIMEOUT':
            // Server error - retry with backoff
            retryWithBackoff();
            break;
            
          default:
            console.error('Unknown error tracking event:', error);
        }
      }
    },
  });
  
  return trackEvent;
}
```

### User-Facing Error Messages

**Rule:** Event tracking errors should **NEVER** be shown to users. Always fail silently and log errors.

```typescript
// ❌ BAD - Don't do this
trackEvent.mutate(eventData, {
  onError: (error) => {
    toast.error('Failed to track event'); // NO!
  }
});

// ✅ GOOD - Silent failure with logging
trackEvent.mutate(eventData, {
  onError: (error) => {
    console.error('[Analytics] Event tracking failed:', error);
    // Optionally queue for retry
    queueFailedEvent(eventData);
  }
});
```

---

## Authorization & Permissions

### Endpoint Permissions

| Endpoint | Public | Creator | Brand | Admin |
|----------|--------|---------|-------|-------|
| `track` | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| `trackBatch` | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| `getStats` | ❌ No | ❌ No | ❌ No | ✅ Yes |
| `forceFlush` | ❌ No | ❌ No | ❌ No | ✅ Yes |

### Authentication Context

The backend automatically enriches events with authenticated user context:

```typescript
// If user is logged in, the backend adds:
{
  actorId: session.user.id,
  actorType: session.user.role,
  userId: session.user.id,        // For user events
  creatorId: session.user.creatorId,  // If user is a creator
  brandId: session.user.brandId,      // If user is a brand
}
```

**Frontend:** You don't need to manually include user IDs - the backend handles this automatically based on the session.

### Anonymous Tracking

Events can be tracked without authentication. The backend will:
- Set `actorType` to `null`
- Set `actorId` to `null`
- Still track the event with session ID for cohort analysis

```typescript
// This works even if not logged in
trackEvent.mutate({
  eventType: EVENT_TYPES.PAGE_VIEWED,
  sessionId: getAnonymousSessionId(),
  props: {
    page: window.location.pathname,
  },
});
```

---

## Rate Limiting & Performance

### Rate Limits

**Currently:** No rate limiting is enforced at the API level.

**Recommended Frontend Limits:**
- **Individual Events:** Max 10 events per second per user
- **Batch Events:** Max 1 batch per 5 seconds per user

### Performance Considerations

#### 1. Batching Strategy

The backend automatically batches events (100 per batch, 10s timeout). However, you can optimize by:

```typescript
// Option A: Batch manually for offline sync
const queuedEvents = [];

function queueEvent(event: TrackEventInput) {
  queuedEvents.push(event);
  
  if (queuedEvents.length >= 20) {
    flushQueue();
  }
}

function flushQueue() {
  if (queuedEvents.length === 0) return;
  
  trackBatch.mutate({ events: [...queuedEvents] });
  queuedEvents.length = 0;
}

// Option B: Use individual tracking (backend handles batching)
function trackEvent(event: TrackEventInput) {
  track.mutate(event); // Backend batches automatically
}
```

#### 2. Debouncing High-Frequency Events

```typescript
import { useCallback } from 'react';
import { debounce } from 'lodash';

function useDebounced EventTracking() {
  const trackEvent = trpc.eventIngestion.track.useMutation();
  
  const trackScrollDepth = useCallback(
    debounce((depth: number) => {
      trackEvent.mutate({
        eventType: EVENT_TYPES.POST_SCROLL_DEPTH,
        props: { scrollDepthPercentage: depth },
      });
    }, 1000),
    []
  );
  
  return { trackScrollDepth };
}
```

#### 3. Network Optimization

```typescript
// Use tRPC's built-in batching for parallel requests
const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api/trpc',
      maxURLLength: 2083,
    }),
  ],
});
```

---

## Real-time Considerations

### Webhooks

**Not implemented yet.** The current system does NOT emit webhooks for tracked events.

**Future:** When implemented, webhooks will be sent for:
- High-value events (license signed, payout completed)
- Error events (job failed, payout failed)

### Polling Recommendations

If you need real-time analytics dashboards:

```typescript
// Poll every 30 seconds (admin only)
const { data } = trpc.eventIngestion.getStats.useQuery(
  {},
  {
    refetchInterval: 30000,
    enabled: isAdmin,
  }
);
```

### Server-Sent Events (SSE)

**Not implemented.** Consider using polling for now.

---

## Frontend Implementation Checklist

### Phase 1: Core Integration (Week 1)

- [ ] Add `eventIngestionRouter` to main tRPC router
- [ ] Copy TypeScript types to frontend codebase
- [ ] Create `useAnalyticsTracking` hook
- [ ] Implement session ID management (`getSessionId()`)
- [ ] Implement attribution data parsing (`getAttributionData()`)
- [ ] Test single event tracking on one page

### Phase 2: Common Events (Week 2)

- [ ] Track `page_viewed` on all pages
- [ ] Track `user_logged_in` / `user_logged_out`
- [ ] Track `asset_viewed` on asset detail pages
- [ ] Track `license_created` on license creation flow
- [ ] Track `search_performed` in search interface
- [ ] Track `cta_clicked` on key CTA buttons

### Phase 3: Offline & Error Handling (Week 3)

- [ ] Implement offline event queue (localStorage)
- [ ] Implement sync on reconnect
- [ ] Add retry logic with exponential backoff
- [ ] Add error logging (Sentry/LogRocket)
- [ ] Test batch event tracking

### Phase 4: Advanced Features (Week 4)

- [ ] Implement debouncing for high-frequency events
- [ ] Add idempotency keys for critical events
- [ ] Build admin dashboard for ingestion stats
- [ ] Optimize batching strategy
- [ ] Add E2E tests for event tracking

### Phase 5: Monitoring & Optimization (Week 5)

- [ ] Set up analytics dashboard
- [ ] Monitor error rates
- [ ] Optimize bundle size (lazy load analytics)
- [ ] Add performance monitoring
- [ ] Document internal tracking guidelines

---

## Example: Complete Implementation

### 1. Create Analytics Hook

```typescript
// hooks/useAnalytics.ts
import { trpc } from '@/lib/trpc';
import { v4 as uuidv4 } from 'uuid';
import type { TrackEventInput } from '@/types/analytics';

let sessionId: string | null = null;

export function getSessionId(): string {
  if (!sessionId) {
    sessionId = localStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = uuidv4();
      localStorage.setItem('analytics_session_id', sessionId);
    }
  }
  return sessionId;
}

export function getAttributionData() {
  if (typeof window === 'undefined') return undefined;
  
  const params = new URLSearchParams(window.location.search);
  
  const hasAttribution = 
    params.has('utm_source') ||
    params.has('utm_medium') ||
    params.has('utm_campaign') ||
    document.referrer;
  
  if (!hasAttribution) return undefined;
  
  return {
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
    utmTerm: params.get('utm_term') || undefined,
    utmContent: params.get('utm_content') || undefined,
    referrer: document.referrer || undefined,
    landingPage: window.location.href,
  };
}

export function useAnalytics() {
  const trackEvent = trpc.eventIngestion.track.useMutation({
    onError: (error) => {
      console.error('[Analytics] Tracking failed:', error);
    },
  });
  
  const track = (input: Omit<TrackEventInput, 'sessionId' | 'attribution'>) => {
    trackEvent.mutate({
      ...input,
      sessionId: getSessionId(),
      attribution: getAttributionData(),
    });
  };
  
  return { track, isTracking: trackEvent.isLoading };
}
```

### 2. Use in Components

```typescript
// components/AssetCard.tsx
import { useAnalytics } from '@/hooks/useAnalytics';
import { EVENT_TYPES, ENTITY_TYPES } from '@/types/analytics';

export function AssetCard({ asset }: { asset: Asset }) {
  const { track } = useAnalytics();
  
  const handleView = () => {
    track({
      eventType: EVENT_TYPES.ASSET_VIEWED,
      source: 'web',
      entityId: asset.id,
      entityType: ENTITY_TYPES.ASSET,
      props: {
        view_duration_ms: 0, // Update on unmount
        assetType: asset.type,
        assetCategory: asset.category,
      },
    });
  };
  
  return (
    <div onClick={handleView}>
      {/* Asset content */}
    </div>
  );
}
```

---

## Support & Troubleshooting

### Common Issues

**Issue:** Events not appearing in database  
**Solution:** Check buffer size with `getStats()` - events may be in buffer waiting to flush

**Issue:** Validation errors  
**Solution:** Ensure `entityType` is provided when `entityId` is present

**Issue:** Events duplicated  
**Solution:** Use idempotency keys for critical events

**Issue:** High event volume causing performance issues  
**Solution:** Implement debouncing and review what events are truly necessary

---

## Next Steps

1. Review [POST_ANALYTICS_INTEGRATION.md](./POST_ANALYTICS_INTEGRATION.md) for blog-specific event tracking
2. Review [EVENT_ENRICHMENT_INTEGRATION.md](./EVENT_ENRICHMENT_INTEGRATION.md) for enrichment details
3. Check backend logs for ingestion statistics
4. Set up monitoring dashboard for event tracking health

---

**Questions?** Contact the backend team or file an issue in the backend repo.
