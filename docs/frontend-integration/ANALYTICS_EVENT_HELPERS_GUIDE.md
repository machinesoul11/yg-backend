# 🛠️ Analytics Event Tracking - Helper Utilities & Best Practices

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
**Module:** Analytics Event Helpers  
**Last Updated:** October 17, 2025  
**Backend Status:** ✅ Fully Implemented

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-built Event Helpers](#pre-built-event-helpers)
3. [Event Tracking Patterns](#event-tracking-patterns)
4. [Session Management](#session-management)
5. [Attribution Tracking](#attribution-tracking)
6. [Offline Event Queue](#offline-event-queue)
7. [Performance Optimization](#performance-optimization)
8. [Testing Event Tracking](#testing-event-tracking)
9. [Production Monitoring](#production-monitoring)

---

## Overview

This guide provides ready-to-use helper functions, patterns, and best practices for implementing analytics event tracking in the frontend. These utilities are designed to make event tracking **simple, consistent, and maintainable** across your codebase.

### Design Principles

- ✅ **Type-safe** - Full TypeScript support
- ✅ **Non-blocking** - Never disrupts user experience
- ✅ **Declarative** - Clear, readable event tracking code
- ✅ **Consistent** - Standardized event structure
- ✅ **Testable** - Easy to mock and verify

---

## Pre-built Event Helpers

The backend provides typed helper classes for common event types. While not exported as API endpoints, you can replicate this pattern in your frontend for consistency.

### Asset Event Helpers

```typescript
// utils/analytics/assetEvents.ts
import type { TrackEventInput } from '@/types/analytics';
import { EVENT_TYPES, EVENT_SOURCES, ENTITY_TYPES } from '@/types/analytics';

export class AssetEventHelpers {
  /**
   * Track asset upload event
   */
  static trackAssetUpload(
    assetId: string,
    props: {
      fileSize: number;
      mimeType: string;
      assetType: string;
      projectId?: string;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.ASSET_UPLOADED,
      source: EVENT_SOURCES.WEB,
      entityId: assetId,
      entityType: ENTITY_TYPES.ASSET,
      props,
    };
  }

  /**
   * Track asset view event
   */
  static trackAssetView(
    assetId: string,
    props: {
      view_duration_ms?: number;
      referrer?: string;
      assetType?: string;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.ASSET_VIEWED,
      source: EVENT_SOURCES.WEB,
      entityId: assetId,
      entityType: ENTITY_TYPES.ASSET,
      props,
    };
  }

  /**
   * Track asset download event
   */
  static trackAssetDownload(
    assetId: string,
    props: {
      fileSize: number;
      downloadMethod?: string;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.ASSET_DOWNLOADED,
      source: EVENT_SOURCES.WEB,
      entityId: assetId,
      entityType: ENTITY_TYPES.ASSET,
      props,
    };
  }

  /**
   * Track asset share event
   */
  static trackAssetShare(
    assetId: string,
    props: {
      platform: 'twitter' | 'facebook' | 'linkedin' | 'email' | 'copy-link';
      shareUrl: string;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.ASSET_SHARED,
      source: EVENT_SOURCES.WEB,
      entityId: assetId,
      entityType: ENTITY_TYPES.ASSET,
      props,
    };
  }
}
```

### Usage Example

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';
import { AssetEventHelpers } from '@/utils/analytics/assetEvents';

function AssetViewer({ asset }: { asset: Asset }) {
  const { track } = useAnalytics();
  const startTime = useRef(Date.now());

  useEffect(() => {
    // Track view on mount
    track(AssetEventHelpers.trackAssetView(asset.id, {
      assetType: asset.type,
      referrer: document.referrer,
    }));

    // Track view duration on unmount
    return () => {
      const duration = Date.now() - startTime.current;
      track(AssetEventHelpers.trackAssetView(asset.id, {
        view_duration_ms: duration,
        assetType: asset.type,
      }));
    };
  }, [asset.id]);

  return <div>Asset content...</div>;
}
```

---

### License Event Helpers

```typescript
// utils/analytics/licenseEvents.ts
export class LicenseEventHelpers {
  /**
   * Track license creation
   */
  static trackLicenseCreate(
    licenseId: string,
    props: {
      licenseType: string;
      brandId: string;
      assetId: string;
      feeCents?: number;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.LICENSE_CREATED,
      source: EVENT_SOURCES.WEB,
      entityId: licenseId,
      entityType: ENTITY_TYPES.LICENSE,
      props,
    };
  }

  /**
   * Track license signing (IMPORTANT: Use idempotency key!)
   */
  static trackLicenseSigned(
    licenseId: string,
    props: {
      signedBy: string;
      signatureMethod: string;
      ipAddress?: string;
    },
    idempotencyKey: string
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.LICENSE_SIGNED,
      source: EVENT_SOURCES.WEB,
      entityId: licenseId,
      entityType: ENTITY_TYPES.LICENSE,
      props: {
        ...props,
        license_id: licenseId, // Required prop
      },
      idempotencyKey, // Critical: Prevent duplicate tracking
    };
  }

  /**
   * Track license view
   */
  static trackLicenseView(
    licenseId: string,
    props: {
      licenseType: string;
      viewDuration?: number;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.LICENSE_VIEWED,
      source: EVENT_SOURCES.WEB,
      entityId: licenseId,
      entityType: ENTITY_TYPES.LICENSE,
      props,
    };
  }
}
```

### Usage Example with Idempotency

```typescript
import { v4 as uuidv4 } from 'uuid';
import { useAnalytics } from '@/hooks/useAnalytics';
import { LicenseEventHelpers } from '@/utils/analytics/licenseEvents';

function LicenseSigningFlow({ licenseId }: { licenseId: string }) {
  const { track } = useAnalytics();
  
  const handleSign = async () => {
    // Generate idempotency key before signing
    const idempotencyKey = uuidv4();
    
    try {
      // Sign license
      await signLicense(licenseId);
      
      // Track signing with idempotency key
      track(LicenseEventHelpers.trackLicenseSigned(
        licenseId,
        {
          signedBy: userId,
          signatureMethod: 'digital',
        },
        idempotencyKey
      ));
      
      toast.success('License signed successfully!');
    } catch (error) {
      console.error('Signing failed:', error);
      // Event won't be tracked if signing fails
    }
  };
  
  return <button onClick={handleSign}>Sign License</button>;
}
```

---

### User Event Helpers

```typescript
// utils/analytics/userEvents.ts
export class UserEventHelpers {
  /**
   * Track user signup
   */
  static trackUserSignup(
    userId: string,
    props: {
      userRole: string;
      signupMethod: 'email' | 'google' | 'github';
      referralCode?: string;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.USER_SIGNED_UP,
      source: EVENT_SOURCES.WEB,
      entityId: userId,
      entityType: ENTITY_TYPES.USER,
      props,
    };
  }

  /**
   * Track user login
   */
  static trackUserLogin(
    userId: string,
    props: {
      loginMethod: 'email' | 'google' | 'github';
      isFirstLogin?: boolean;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.USER_LOGGED_IN,
      source: EVENT_SOURCES.WEB,
      entityId: userId,
      entityType: ENTITY_TYPES.USER,
      props,
    };
  }

  /**
   * Track user logout
   */
  static trackUserLogout(
    userId: string
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.USER_LOGGED_OUT,
      source: EVENT_SOURCES.WEB,
      entityId: userId,
      entityType: ENTITY_TYPES.USER,
    };
  }
}
```

---

### Engagement Event Helpers

```typescript
// utils/analytics/engagementEvents.ts
export class EngagementEventHelpers {
  /**
   * Track page view
   */
  static trackPageView(
    props: {
      page: string;
      title: string;
      referrer?: string;
      loadTime?: number;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.PAGE_VIEWED,
      source: EVENT_SOURCES.WEB,
      props,
    };
  }

  /**
   * Track CTA click
   */
  static trackCtaClick(
    props: {
      ctaText: string;
      ctaLocation: string;
      ctaDestination: string;
      ctaType?: 'button' | 'link' | 'image';
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.CTA_CLICKED,
      source: EVENT_SOURCES.WEB,
      props,
    };
  }

  /**
   * Track search
   */
  static trackSearch(
    props: {
      query: string;
      filters?: Record<string, any>;
      resultsCount: number;
      searchType?: 'assets' | 'creators' | 'projects' | 'licenses';
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.SEARCH_PERFORMED,
      source: EVENT_SOURCES.WEB,
      props,
    };
  }

  /**
   * Track form submission
   */
  static trackFormSubmit(
    props: {
      formName: string;
      formLocation: string;
      success: boolean;
      errorMessage?: string;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.FORM_SUBMITTED,
      source: EVENT_SOURCES.WEB,
      props,
    };
  }

  /**
   * Track modal interaction
   */
  static trackModalOpen(
    props: {
      modalName: string;
      trigger: string;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.MODAL_OPENED,
      source: EVENT_SOURCES.WEB,
      props,
    };
  }

  static trackModalClose(
    props: {
      modalName: string;
      closeMethod: 'button' | 'overlay' | 'escape';
      timeOpen?: number;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.MODAL_CLOSED,
      source: EVENT_SOURCES.WEB,
      props,
    };
  }
}
```

---

### Post/Blog Event Helpers

```typescript
// utils/analytics/postEvents.ts
export class PostEventHelpers {
  /**
   * Track post view
   */
  static trackPostView(
    postId: string,
    props: {
      postTitle: string;
      postCategory: string;
      authorId?: string;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.POST_VIEWED,
      source: EVENT_SOURCES.WEB,
      entityId: postId,
      entityType: ENTITY_TYPES.POST,
      props: {
        ...props,
        post_id: postId, // Required prop
      },
    };
  }

  /**
   * Track scroll depth
   */
  static trackScrollDepth(
    postId: string,
    props: {
      scrollDepthPercentage: number;
      maxScrollDepth: number;
      milestone?: '25' | '50' | '75' | '100';
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.POST_SCROLL_DEPTH,
      source: EVENT_SOURCES.WEB,
      entityId: postId,
      entityType: ENTITY_TYPES.POST,
      props,
    };
  }

  /**
   * Track engagement time
   */
  static trackEngagementTime(
    postId: string,
    props: {
      engagementTimeSeconds: number;
      cumulativeTime: number;
      isActiveTime?: boolean;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.POST_ENGAGEMENT_TIME,
      source: EVENT_SOURCES.WEB,
      entityId: postId,
      entityType: ENTITY_TYPES.POST,
      props,
    };
  }

  /**
   * Track CTA click on post
   */
  static trackPostCtaClick(
    postId: string,
    props: {
      ctaType: 'button' | 'link' | 'form' | 'download' | 'subscribe' | 'share' | 'comment';
      ctaText: string;
      ctaPosition?: string;
      destinationUrl?: string;
    }
  ): Omit<TrackEventInput, 'sessionId' | 'attribution'> {
    return {
      eventType: EVENT_TYPES.POST_CTA_CLICKED,
      source: EVENT_SOURCES.WEB,
      entityId: postId,
      entityType: ENTITY_TYPES.POST,
      props: {
        ...props,
        cta_type: props.ctaType, // Required prop
        cta_url: props.destinationUrl || '', // Required prop
      },
    };
  }
}
```

---

## Event Tracking Patterns

### Pattern 1: View Tracking with Duration

Track both page entry and exit to calculate view duration.

```typescript
import { useEffect, useRef } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { PostEventHelpers } from '@/utils/analytics/postEvents';

function BlogPost({ post }: { post: Post }) {
  const { track } = useAnalytics();
  const startTime = useRef(Date.now());
  const engagementInterval = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Track view on mount
    track(PostEventHelpers.trackPostView(post.id, {
      postTitle: post.title,
      postCategory: post.category,
      authorId: post.authorId,
    }));

    // Track engagement time every 10 seconds
    engagementInterval.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime.current) / 1000);
      track(PostEventHelpers.trackEngagementTime(post.id, {
        engagementTimeSeconds: 10,
        cumulativeTime: elapsed,
        isActiveTime: document.visibilityState === 'visible',
      }));
    }, 10000);

    // Cleanup on unmount
    return () => {
      if (engagementInterval.current) {
        clearInterval(engagementInterval.current);
      }
      
      const totalDuration = Math.floor((Date.now() - startTime.current) / 1000);
      track(PostEventHelpers.trackEngagementTime(post.id, {
        engagementTimeSeconds: totalDuration,
        cumulativeTime: totalDuration,
      }));
    };
  }, [post.id]);

  return <article>{/* Post content */}</article>;
}
```

---

### Pattern 2: Scroll Depth Tracking

Track scroll milestones (25%, 50%, 75%, 100%).

```typescript
import { useEffect, useState, useCallback } from 'react';
import { debounce } from 'lodash';
import { useAnalytics } from '@/hooks/useAnalytics';
import { PostEventHelpers } from '@/utils/analytics/postEvents';

function useScrollDepthTracking(postId: string) {
  const { track } = useAnalytics();
  const [maxDepth, setMaxDepth] = useState(0);
  const [milestones, setMilestones] = useState<Set<string>>(new Set());

  const handleScroll = useCallback(
    debounce(() => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = Math.min(Math.round((scrollTop / docHeight) * 100), 100);

      if (scrollPercent > maxDepth) {
        setMaxDepth(scrollPercent);
        
        // Check for milestones
        const newMilestones: Array<'25' | '50' | '75' | '100'> = [];
        if (scrollPercent >= 25 && !milestones.has('25')) newMilestones.push('25');
        if (scrollPercent >= 50 && !milestones.has('50')) newMilestones.push('50');
        if (scrollPercent >= 75 && !milestones.has('75')) newMilestones.push('75');
        if (scrollPercent >= 100 && !milestones.has('100')) newMilestones.push('100');

        // Track milestones
        newMilestones.forEach(milestone => {
          setMilestones(prev => new Set(prev).add(milestone));
          track(PostEventHelpers.trackScrollDepth(postId, {
            scrollDepthPercentage: scrollPercent,
            maxScrollDepth: scrollPercent,
            milestone,
          }));
        });
      }
    }, 500),
    [postId, maxDepth, milestones]
  );

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);
}

function BlogPost({ post }: { post: Post }) {
  useScrollDepthTracking(post.id);
  return <article>{/* Post content */}</article>;
}
```

---

### Pattern 3: Form Tracking

Track form interactions and submissions.

```typescript
import { useForm } from 'react-hook-form';
import { useAnalytics } from '@/hooks/useAnalytics';
import { EngagementEventHelpers } from '@/utils/analytics/engagementEvents';

function ContactForm() {
  const { track } = useAnalytics();
  const { register, handleSubmit, formState } = useForm();

  const onSubmit = async (data: any) => {
    try {
      await submitContactForm(data);
      
      track(EngagementEventHelpers.trackFormSubmit({
        formName: 'contact_form',
        formLocation: 'contact_page',
        success: true,
      }));
      
      toast.success('Form submitted successfully!');
    } catch (error) {
      track(EngagementEventHelpers.trackFormSubmit({
        formName: 'contact_form',
        formLocation: 'contact_page',
        success: false,
        errorMessage: error.message,
      }));
      
      toast.error('Submission failed');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Form fields */}
      <button type="submit">Submit</button>
    </form>
  );
}
```

---

### Pattern 4: CTA Tracking

Track all CTA interactions consistently.

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';
import { EngagementEventHelpers } from '@/utils/analytics/engagementEvents';

function CtaButton({ text, href, location }: CtaButtonProps) {
  const { track } = useAnalytics();

  const handleClick = () => {
    track(EngagementEventHelpers.trackCtaClick({
      ctaText: text,
      ctaLocation: location,
      ctaDestination: href,
      ctaType: 'button',
    }));
  };

  return (
    <a href={href} onClick={handleClick}>
      {text}
    </a>
  );
}

// Usage
<CtaButton 
  text="Get Started" 
  href="/signup" 
  location="homepage_hero" 
/>
```

---

## Session Management

### Generating Session IDs

Use a persistent UUID stored in localStorage for session tracking.

```typescript
// utils/analytics/session.ts
import { v4 as uuidv4 } from 'uuid';

const SESSION_STORAGE_KEY = 'yg_analytics_session_id';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface SessionData {
  sessionId: string;
  createdAt: number;
  lastActivityAt: number;
}

export function getOrCreateSession(): string {
  if (typeof window === 'undefined') {
    return uuidv4(); // Server-side: generate ephemeral ID
  }

  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  
  if (stored) {
    try {
      const session: SessionData = JSON.parse(stored);
      const now = Date.now();
      
      // Check if session expired
      if (now - session.lastActivityAt < SESSION_TIMEOUT_MS) {
        // Update last activity
        session.lastActivityAt = now;
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
        return session.sessionId;
      }
    } catch (error) {
      console.error('Failed to parse session data:', error);
    }
  }

  // Create new session
  const newSession: SessionData = {
    sessionId: uuidv4(),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
  return newSession.sessionId;
}

export function updateSessionActivity(): void {
  if (typeof window === 'undefined') return;

  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return;

  try {
    const session: SessionData = JSON.parse(stored);
    session.lastActivityAt = Date.now();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to update session activity:', error);
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}
```

### Usage in Hook

```typescript
// hooks/useAnalytics.ts
import { getOrCreateSession, updateSessionActivity } from '@/utils/analytics/session';

export function useAnalytics() {
  const trackEvent = trpc.eventIngestion.track.useMutation();
  
  const track = (input: Omit<TrackEventInput, 'sessionId' | 'attribution'>) => {
    updateSessionActivity(); // Update session on every event
    
    trackEvent.mutate({
      ...input,
      sessionId: getOrCreateSession(),
      attribution: getAttributionData(),
    });
  };
  
  return { track };
}
```

---

## Attribution Tracking

### Parsing UTM Parameters

```typescript
// utils/analytics/attribution.ts
import type { AttributionData } from '@/types/analytics';

const ATTRIBUTION_STORAGE_KEY = 'yg_attribution_data';
const ATTRIBUTION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface StoredAttribution {
  data: AttributionData;
  expiresAt: number;
}

/**
 * Parse attribution data from URL parameters
 */
export function parseAttributionFromUrl(): AttributionData | undefined {
  if (typeof window === 'undefined') return undefined;

  const params = new URLSearchParams(window.location.search);
  
  const hasUtm = 
    params.has('utm_source') ||
    params.has('utm_medium') ||
    params.has('utm_campaign') ||
    params.has('utm_term') ||
    params.has('utm_content');
  
  const hasReferrer = document.referrer && !document.referrer.includes(window.location.hostname);
  
  if (!hasUtm && !hasReferrer) {
    return undefined;
  }

  return {
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
    utmTerm: params.get('utm_term') || undefined,
    utmContent: params.get('utm_content') || undefined,
    referrer: hasReferrer ? document.referrer : undefined,
    landingPage: window.location.href,
  };
}

/**
 * Get or create attribution data (with persistence)
 */
export function getAttributionData(): AttributionData | undefined {
  if (typeof window === 'undefined') return undefined;

  // Try parsing from current URL
  const currentAttribution = parseAttributionFromUrl();
  if (currentAttribution) {
    // Store for future use
    storeAttribution(currentAttribution);
    return currentAttribution;
  }

  // Fall back to stored attribution
  return getStoredAttribution();
}

/**
 * Store attribution data in localStorage
 */
function storeAttribution(data: AttributionData): void {
  const stored: StoredAttribution = {
    data,
    expiresAt: Date.now() + ATTRIBUTION_TTL_MS,
  };
  
  localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(stored));
}

/**
 * Retrieve stored attribution data
 */
function getStoredAttribution(): AttributionData | undefined {
  const stored = localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
  if (!stored) return undefined;

  try {
    const parsed: StoredAttribution = JSON.parse(stored);
    
    // Check expiration
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return undefined;
    }
    
    return parsed.data;
  } catch (error) {
    console.error('Failed to parse attribution data:', error);
    return undefined;
  }
}

/**
 * Clear attribution data
 */
export function clearAttribution(): void {
  localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
}
```

---

## Offline Event Queue

Implement offline support by queuing events when network is unavailable.

```typescript
// utils/analytics/offlineQueue.ts
import type { TrackEventInput } from '@/types/analytics';

const QUEUE_STORAGE_KEY = 'yg_analytics_queue';
const MAX_QUEUE_SIZE = 500;

export interface QueuedEvent extends TrackEventInput {
  queuedAt: number;
}

/**
 * Add event to offline queue
 */
export function queueEvent(event: TrackEventInput): void {
  if (typeof window === 'undefined') return;

  const queue = getQueue();
  
  // Prevent queue from growing too large
  if (queue.length >= MAX_QUEUE_SIZE) {
    console.warn('[Analytics] Queue is full, dropping oldest event');
    queue.shift();
  }

  queue.push({
    ...event,
    queuedAt: Date.now(),
  });

  saveQueue(queue);
}

/**
 * Get all queued events
 */
export function getQueue(): QueuedEvent[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to parse event queue:', error);
    return [];
  }
}

/**
 * Save queue to storage
 */
function saveQueue(queue: QueuedEvent[]): void {
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

/**
 * Clear queue
 */
export function clearQueue(): void {
  localStorage.removeItem(QUEUE_STORAGE_KEY);
}

/**
 * Remove specific events from queue
 */
export function removeFromQueue(indices: number[]): void {
  const queue = getQueue();
  const filtered = queue.filter((_, i) => !indices.includes(i));
  saveQueue(filtered);
}

/**
 * Sync queued events to backend
 */
export async function syncQueue(
  trackBatch: (events: TrackEventInput[]) => Promise<any>
): Promise<void> {
  const queue = getQueue();
  
  if (queue.length === 0) {
    console.log('[Analytics] Queue is empty, nothing to sync');
    return;
  }

  console.log(`[Analytics] Syncing ${queue.length} queued events`);

  // Split into chunks of 50 (max batch size)
  const chunks = chunkArray(queue, 50);
  const successfulIndices: number[] = [];

  for (const chunk of chunks) {
    try {
      const result = await trackBatch(chunk);
      
      // Track successful events
      result.results.forEach((r: any, i: number) => {
        if (r.status === 'fulfilled') {
          const originalIndex = queue.indexOf(chunk[i]);
          if (originalIndex !== -1) {
            successfulIndices.push(originalIndex);
          }
        }
      });
    } catch (error) {
      console.error('[Analytics] Failed to sync batch:', error);
    }
  }

  // Remove synced events from queue
  if (successfulIndices.length > 0) {
    removeFromQueue(successfulIndices);
    console.log(`[Analytics] Successfully synced ${successfulIndices.length} events`);
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
```

### Usage with Network Detection

```typescript
// hooks/useOfflineAnalytics.ts
import { useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { queueEvent, syncQueue, getQueue } from '@/utils/analytics/offlineQueue';

export function useOfflineAnalytics() {
  const trackBatch = trpc.eventIngestion.trackBatch.useMutation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('[Analytics] Connection restored, syncing queue');
      syncQueue((events) => trackBatch.mutateAsync({ events }));
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log('[Analytics] Connection lost, events will be queued');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Sync on mount if online
    if (isOnline && getQueue().length > 0) {
      syncQueue((events) => trackBatch.mutateAsync({ events }));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, queueSize: getQueue().length };
}

// Modified useAnalytics hook
export function useAnalytics() {
  const trackEvent = trpc.eventIngestion.track.useMutation();
  const isOnline = navigator.onLine;

  const track = (input: Omit<TrackEventInput, 'sessionId' | 'attribution'>) => {
    const event = {
      ...input,
      sessionId: getOrCreateSession(),
      attribution: getAttributionData(),
    };

    if (!isOnline) {
      // Queue event if offline
      queueEvent(event);
      console.log('[Analytics] Event queued (offline)');
      return;
    }

    // Track normally if online
    trackEvent.mutate(event, {
      onError: (error) => {
        // Queue on network error
        if (error.message.includes('fetch')) {
          queueEvent(event);
          console.log('[Analytics] Event queued (network error)');
        } else {
          console.error('[Analytics] Tracking failed:', error);
        }
      },
    });
  };

  return { track, isTracking: trackEvent.isLoading };
}
```

---

## Performance Optimization

### 1. Lazy Loading Analytics

Don't load analytics on initial page load - defer until after critical content loads.

```typescript
// app/layout.tsx
import dynamic from 'next/dynamic';

const AnalyticsProvider = dynamic(
  () => import('@/components/AnalyticsProvider'),
  { ssr: false } // Don't render on server
);

export default function RootLayout({ children }: { children: React.Node }) {
  return (
    <html>
      <body>
        {children}
        <AnalyticsProvider /> {/* Loaded asynchronously */}
      </body>
    </html>
  );
}
```

### 2. Debouncing High-Frequency Events

```typescript
import { debounce } from 'lodash';

const trackScrollDebounced = debounce((depth: number) => {
  track(PostEventHelpers.trackScrollDepth(postId, { scrollDepthPercentage: depth }));
}, 1000);
```

### 3. Request Batching with tRPC

Configure tRPC client to batch requests:

```typescript
// lib/trpc.ts
import { httpBatchLink } from '@trpc/client';

export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: process.env.NEXT_PUBLIC_API_URL + '/api/trpc',
      maxURLLength: 2083, // Batch multiple requests into one
    }),
  ],
});
```

### 4. Sampling for High-Traffic Pages

For pages with very high traffic, sample events to reduce load:

```typescript
function useSampledTracking(sampleRate: number = 0.1) {
  const { track } = useAnalytics();
  
  const sampledTrack = (event: Omit<TrackEventInput, 'sessionId' | 'attribution'>) => {
    if (Math.random() < sampleRate) {
      track(event);
    }
  };
  
  return { track: sampledTrack };
}

// Usage: Track only 10% of page views
const { track } = useSampledTracking(0.1);
```

---

## Testing Event Tracking

### Unit Testing with Vitest

```typescript
// __tests__/analytics.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnalytics } from '@/hooks/useAnalytics';

// Mock tRPC
vi.mock('@/lib/trpc', () => ({
  trpc: {
    eventIngestion: {
      track: {
        useMutation: vi.fn(() => ({
          mutate: vi.fn(),
          isLoading: false,
        })),
      },
    },
  },
}));

describe('useAnalytics', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should track events with session ID', () => {
    const { result } = renderHook(() => useAnalytics());
    
    act(() => {
      result.current.track({
        eventType: 'page_viewed',
        props: { page: '/home' },
      });
    });

    expect(result.current.isTracking).toBe(false);
    // Add more assertions
  });

  it('should queue events when offline', () => {
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
    });

    const { result } = renderHook(() => useAnalytics());
    
    act(() => {
      result.current.track({
        eventType: 'page_viewed',
        props: { page: '/home' },
      });
    });

    // Check localStorage queue
    const queue = JSON.parse(localStorage.getItem('yg_analytics_queue') || '[]');
    expect(queue).toHaveLength(1);
  });
});
```

### E2E Testing with Playwright

```typescript
// e2e/analytics.spec.ts
import { test, expect } from '@playwright/test';

test('should track page view event', async ({ page }) => {
  // Intercept analytics request
  let eventTracked = false;
  await page.route('**/api/trpc/eventIngestion.track', (route) => {
    eventTracked = true;
    route.fulfill({ status: 200, body: JSON.stringify({ eventId: null, tracked: true }) });
  });

  await page.goto('/');
  
  // Wait for event to be tracked
  await page.waitForTimeout(1000);
  
  expect(eventTracked).toBe(true);
});
```

---

## Production Monitoring

### Sentry Integration

Track analytics errors in Sentry:

```typescript
import * as Sentry from '@sentry/nextjs';

export function useAnalytics() {
  const trackEvent = trpc.eventIngestion.track.useMutation({
    onError: (error) => {
      Sentry.captureException(error, {
        tags: {
          component: 'analytics',
          eventType: error.meta?.eventType,
        },
      });
    },
  });

  return { track: trackEvent.mutate };
}
```

### Analytics Health Dashboard

```typescript
function AnalyticsHealthDashboard() {
  const { data: stats } = trpc.eventIngestion.getStats.useQuery(
    {},
    {
      refetchInterval: 10000, // 10 seconds
      enabled: isAdmin,
    }
  );

  const queueSize = getQueue().length;

  return (
    <div>
      <h2>Analytics Health</h2>
      <div>
        <p>Buffer Size: {stats?.bufferSize ?? 0}</p>
        <p>Offline Queue: {queueSize}</p>
        <p>Status: {stats?.isProcessing ? '⚠️ Processing' : '✅ Ready'}</p>
      </div>
    </div>
  );
}
```

---

## Summary

This guide provides production-ready patterns for implementing analytics event tracking in your frontend. Key takeaways:

1. **Use helper classes** for consistent event structure
2. **Track view duration** by measuring mount/unmount time
3. **Implement offline queuing** for network resilience
4. **Debounce high-frequency events** for performance
5. **Never show analytics errors to users** - fail silently
6. **Monitor analytics health** in production

For API reference, see [ANALYTICS_EVENT_TRACKING_INTEGRATION.md](./ANALYTICS_EVENT_TRACKING_INTEGRATION.md).
