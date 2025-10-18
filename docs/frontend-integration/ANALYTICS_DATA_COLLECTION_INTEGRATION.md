# 🌐 Analytics Data Collection Frontend Integration Guide
## Event Tracking & Attribution System

**Module**: Analytics & Events  
**Classification**: 🌐 **SHARED** (Public-facing website + Admin backend)  
**Last Updated**: October 17, 2025  
**Backend Version**: 1.0.0

---

## Table of Contents

1. [Overview](#overview)
2. [Event Tracking API](#event-tracking-api)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Event Types Registry](#event-types-registry)
5. [Attribution Tracking](#attribution-tracking)
6. [Frontend Implementation Guide](#frontend-implementation-guide)
7. [Real-Time Patterns](#real-time-patterns)
8. [Best Practices](#best-practices)
9. [Complete Implementation Checklist](#complete-implementation-checklist)

---

## Overview

The Analytics Data Collection module provides a robust event tracking system for capturing user interactions, page views, conversions, and marketing attribution data across the YesGoddess platform.

### Key Features
- 📊 Real-time event ingestion with batching
- 🔍 UTM parameter tracking for marketing attribution
- 🎯 Session-based analytics
- 🚀 Non-blocking, fail-safe tracking (errors don't break UX)
- 🔄 Idempotency support for duplicate prevention
- 📦 Batch event upload for offline-first apps
- 🎨 Flexible JSONB properties for custom data

### Data Flow
```
Frontend Event → tRPC API → Event Validation → Database Storage
                                          ↓
                                    Background Jobs
                                          ↓
                              (User Agent Parsing, Enrichment)
                                          ↓
                                   Daily Aggregation
                                          ↓
                              Analytics Dashboards (Part 1 & 2)
```

---

## Event Tracking API

### Endpoint: `trpc.analytics.track` (Public)

**Purpose**: Track a single analytics event. This endpoint is **public** and can be called without authentication for anonymous tracking.

**Classification**: 🌐 **SHARED** - Used by both public website and admin backend

**tRPC Call Pattern**:
```typescript
import { trpc } from '@/lib/trpc';

// No authentication required for public tracking
const trackEvent = trpc.analytics.track.useMutation();

await trackEvent.mutateAsync({
  eventType: 'asset_viewed',
  source: 'web',
  entityId: 'asset_abc123',
  entityType: 'asset',
  sessionId: getSessionId(), // From your session management
  props: {
    assetTitle: 'Hero Image',
    category: 'photography',
    viewDuration: 5000,
  },
  attribution: {
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'spring-2024',
  },
  idempotencyKey: crypto.randomUUID(), // Prevent duplicates
});
```

### Request Schema

```typescript
interface TrackEventInput {
  // Required
  eventType: string; // Max 100 characters (see Event Types Registry)
  
  // Optional - Source
  source?: 'web' | 'api' | 'mobile' | 'system' | 'webhook'; // Default: 'web'
  
  // Optional - Entity Reference
  entityId?: string;  // CUID of related entity
  entityType?: 'project' | 'asset' | 'license' | 'creator' | 
               'brand' | 'user' | 'royalty' | 'payout' | 'post' | 'category';
  // NOTE: If entityId is provided, entityType MUST also be provided
  
  // Optional - Session
  sessionId?: string; // UUID for session grouping
  
  // Optional - Custom Properties
  props?: Record<string, any>; // Flexible JSONB data
  
  // Optional - Attribution
  attribution?: {
    utmSource?: string;      // Max 255 chars (e.g., 'google', 'facebook')
    utmMedium?: string;      // Max 255 chars (e.g., 'cpc', 'email', 'social')
    utmCampaign?: string;    // Max 255 chars (e.g., 'spring-sale-2024')
    utmTerm?: string;        // Max 255 chars (e.g., 'luxury+fashion')
    utmContent?: string;     // Max 255 chars (e.g., 'banner-ad-v2')
    referrer?: string;       // Full URL or empty string
    landingPage?: string;    // Full URL or empty string
  };
  
  // Optional - Idempotency
  idempotencyKey?: string; // UUID to prevent duplicate events
}
```

### Response Schema

```typescript
interface TrackEventResponse {
  data: {
    eventId: string;      // Created event CUID
    occurredAt: string;   // ISO 8601 timestamp
    deduplicated: boolean; // True if idempotency key matched existing event
  };
}
```

### Validation Rules

| Field | Validation | Error Message |
|-------|-----------|---------------|
| `eventType` | Required, max 100 chars | "Event type is required" |
| `source` | Must be one of: web, api, mobile, system, webhook | "Invalid source" |
| `entityId` | Must be valid CUID if provided | "Invalid entity ID format" |
| `entityType` | Required if `entityId` provided | "entityType is required when entityId is provided" |
| `sessionId` | Must be valid UUID if provided | "Invalid session ID format" |
| `attribution.referrer` | Must be valid URL or empty string | "Invalid referrer URL" |
| `attribution.landingPage` | Must be valid URL or empty string | "Invalid landing page URL" |
| `idempotencyKey` | Must be valid UUID if provided | "Invalid idempotency key format" |

---

### Endpoint: `trpc.analytics.trackBatch` (Public)

**Purpose**: Track multiple events in a single request. Useful for offline-first applications or bulk analytics.

**tRPC Call Pattern**:
```typescript
const trackBatch = trpc.analytics.trackBatch.useMutation();

await trackBatch.mutateAsync({
  events: [
    {
      eventType: 'page_viewed',
      sessionId: sessionId,
      props: { path: '/creators' },
    },
    {
      eventType: 'search_performed',
      sessionId: sessionId,
      props: { query: 'luxury fashion', resultsCount: 42 },
    },
    {
      eventType: 'asset_viewed',
      entityId: 'asset_xyz789',
      entityType: 'asset',
      sessionId: sessionId,
    },
  ],
});
```

### Request Schema

```typescript
interface TrackBatchInput {
  events: TrackEventInput[]; // Min: 1, Max: 50 events
}
```

### Response Schema

```typescript
interface TrackBatchResponse {
  data: {
    total: number;       // Total events in batch
    successful: number;  // Successfully tracked events
    failed: number;      // Failed events
    results: Array<{
      index: number;                 // Index in input array
      status: 'fulfilled' | 'rejected';
      data: TrackEventResponse | null;
      error: string | null;
    }>;
  };
}
```

### Batch Behavior
- Events are processed in parallel using `Promise.allSettled()`
- Individual event failures don't block the entire batch
- Response includes per-event success/failure status
- Max 50 events per batch to prevent timeouts

---

## TypeScript Type Definitions

Create a new file for analytics types:

```typescript
// src/types/analytics.ts

/**
 * Analytics Event Tracking Type Definitions
 * Generated from yg-backend schema
 * Last updated: October 17, 2025
 */

// ===========================
// Event Tracking Types
// ===========================

export type EventSource = 'web' | 'api' | 'mobile' | 'system' | 'webhook';

export type EntityType = 
  | 'project' 
  | 'asset' 
  | 'license' 
  | 'creator' 
  | 'brand' 
  | 'user' 
  | 'royalty' 
  | 'payout' 
  | 'post' 
  | 'category';

export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
  landingPage?: string;
}

export interface TrackEventInput {
  eventType: string;
  source?: EventSource;
  entityId?: string;
  entityType?: EntityType;
  sessionId?: string;
  props?: Record<string, any>;
  attribution?: Attribution;
  idempotencyKey?: string;
}

export interface TrackEventResponse {
  eventId: string;
  occurredAt: string;
  deduplicated: boolean;
}

export interface TrackBatchInput {
  events: TrackEventInput[];
}

export interface BatchEventResult {
  index: number;
  status: 'fulfilled' | 'rejected';
  data: TrackEventResponse | null;
  error: string | null;
}

export interface TrackBatchResponse {
  total: number;
  successful: number;
  failed: number;
  results: BatchEventResult[];
}

// ===========================
// Event Types Registry
// (Copy from backend constants)
// ===========================

export const EVENT_TYPES = {
  // User Events
  USER_SIGNED_UP: 'user_signed_up',
  USER_LOGGED_IN: 'user_logged_in',
  USER_LOGGED_OUT: 'user_logged_out',
  USER_PROFILE_UPDATED: 'user_profile_updated',
  
  // Asset Events
  ASSET_UPLOADED: 'asset_uploaded',
  ASSET_VIEWED: 'asset_viewed',
  ASSET_DOWNLOADED: 'asset_downloaded',
  ASSET_SHARED: 'asset_shared',
  
  // Project Events
  PROJECT_CREATED: 'project_created',
  PROJECT_STARTED: 'project_started',
  PROJECT_COMPLETED: 'project_completed',
  
  // License Events
  LICENSE_CREATED: 'license_created',
  LICENSE_SIGNED: 'license_signed',
  LICENSE_VIEWED: 'license_viewed',
  LICENSE_CLICKED: 'license_clicked',
  
  // Engagement Events
  PAGE_VIEWED: 'page_viewed',
  CTA_CLICKED: 'cta_clicked',
  SEARCH_PERFORMED: 'search_performed',
  FILTER_APPLIED: 'filter_applied',
  BUTTON_CLICKED: 'button_clicked',
  FORM_SUBMITTED: 'form_submitted',
  MODAL_OPENED: 'modal_opened',
  MODAL_CLOSED: 'modal_closed',
  
  // Blog/Post Events
  POST_VIEWED: 'post_viewed',
  POST_SCROLL_DEPTH: 'post_scroll_depth',
  POST_ENGAGEMENT_TIME: 'post_engagement_time',
  POST_CTA_CLICKED: 'post_cta_clicked',
  POST_SHARED: 'post_shared',
  POST_SUBSCRIBED: 'post_subscribed',
  POST_READ_COMPLETE: 'post_read_complete',
  
  // Email Events
  EMAIL_SENT: 'email_sent',
  EMAIL_OPENED: 'email_opened',
  EMAIL_CLICKED: 'email_clicked',
  EMAIL_BOUNCED: 'email_bounced',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];
```

---

## Event Types Registry

### Standard Event Types

Use these constants from the backend to ensure consistency:

#### 🧑 User Events
| Event Type | When to Track | Required Props |
|-----------|---------------|----------------|
| `user_signed_up` | New user registration | `{ method: 'email' \| 'google' \| 'github' }` |
| `user_logged_in` | Successful login | `{ method: string }` |
| `user_logged_out` | User logs out | - |
| `user_profile_updated` | Profile changes saved | `{ fields: string[] }` |

#### 🖼️ Asset Events
| Event Type | When to Track | Required Props |
|-----------|---------------|----------------|
| `asset_uploaded` | Asset upload complete | `{ assetType: string, sizeBytes: number }` |
| `asset_viewed` | Asset detail page view | `{ assetTitle: string, category?: string }` |
| `asset_downloaded` | Asset download initiated | `{ format: string }` |
| `asset_shared` | Share button clicked | `{ platform: 'email' \| 'twitter' \| 'facebook' }` |

#### 📁 Project Events
| Event Type | When to Track | Required Props |
|-----------|---------------|----------------|
| `project_created` | New project/campaign created | `{ projectName: string }` |
| `project_started` | Project status → ACTIVE | - |
| `project_completed` | Project status → COMPLETED | `{ durationDays: number }` |

#### 📄 License Events
| Event Type | When to Track | Required Props |
|-----------|---------------|----------------|
| `license_created` | New license created | `{ licenseType: string, feeCents: number }` |
| `license_signed` | License digitally signed | - |
| `license_viewed` | License document viewed | - |
| `license_clicked` | License card clicked | - |

#### 🔍 Engagement Events
| Event Type | When to Track | Required Props |
|-----------|---------------|----------------|
| `page_viewed` | Any page load | `{ path: string, title?: string }` |
| `cta_clicked` | Call-to-action clicked | `{ ctaText: string, location: string }` |
| `search_performed` | Search submitted | `{ query: string, resultsCount?: number }` |
| `filter_applied` | Filters changed | `{ filterType: string, value: any }` |
| `button_clicked` | Generic button click | `{ buttonText: string, action: string }` |
| `form_submitted` | Form submission | `{ formName: string, success: boolean }` |
| `modal_opened` | Modal displayed | `{ modalName: string }` |
| `modal_closed` | Modal dismissed | `{ modalName: string, action?: string }` |

#### 📝 Blog/Post Events
| Event Type | When to Track | Required Props |
|-----------|---------------|----------------|
| `post_viewed` | Blog post page view | `{ postId: string, postTitle: string }` |
| `post_scroll_depth` | User scrolls to milestone | `{ depth: 25 \| 50 \| 75 \| 100 }` |
| `post_engagement_time` | Periodic time tracking | `{ seconds: number, cumulative: number }` |
| `post_cta_clicked` | Post CTA clicked | `{ ctaType: string, ctaText: string }` |
| `post_shared` | Post share button | `{ platform: string }` |
| `post_subscribed` | Newsletter signup | `{ source: 'inline' \| 'popup' }` |
| `post_read_complete` | User read entire post | `{ readTimeSec: number }` |

### Custom Event Types

You can create custom event types for specific features:

```typescript
// Custom events should follow naming convention: noun_verb
const CUSTOM_EVENTS = {
  CREATOR_PORTFOLIO_VIEWED: 'creator_portfolio_viewed',
  BRAND_DASHBOARD_VISITED: 'brand_dashboard_visited',
  PRICING_CALCULATOR_USED: 'pricing_calculator_used',
  ASSET_FAVORITED: 'asset_favorited',
  LICENSE_PROPOSAL_SENT: 'license_proposal_sent',
};

// Track custom event
await trackEvent.mutateAsync({
  eventType: CUSTOM_EVENTS.CREATOR_PORTFOLIO_VIEWED,
  entityId: creatorId,
  entityType: 'creator',
  props: {
    portfolioSize: 42,
    topCategory: 'fashion',
  },
});
```

---

## Attribution Tracking

### UTM Parameters

UTM parameters are automatically captured from URL query strings and stored with events for marketing attribution.

#### Standard UTM Parameters

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `utm_source` | Traffic source | `google`, `facebook`, `newsletter` |
| `utm_medium` | Marketing medium | `cpc`, `email`, `social`, `organic` |
| `utm_campaign` | Campaign name | `spring-sale-2024`, `product-launch` |
| `utm_term` | Paid search keywords | `luxury+fashion`, `ip+licensing` |
| `utm_content` | Content variant | `banner-ad`, `text-link`, `cta-button` |

### Capturing Attribution in Frontend

#### Method 1: Automatic URL Parsing

```typescript
// src/lib/analytics/attribution.ts

export function getAttributionFromURL(): Attribution | undefined {
  if (typeof window === 'undefined') return undefined;
  
  const params = new URLSearchParams(window.location.search);
  
  const attribution: Attribution = {
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
    utmTerm: params.get('utm_term') || undefined,
    utmContent: params.get('utm_content') || undefined,
    referrer: document.referrer || undefined,
    landingPage: window.location.href,
  };
  
  // Only return if at least one UTM parameter exists
  const hasUTM = Object.values(attribution).some(v => v !== undefined);
  return hasUTM ? attribution : undefined;
}
```

#### Method 2: Persistent Attribution (First Touch)

Store attribution data in localStorage to track the user's original source:

```typescript
// src/lib/analytics/attribution.ts

const ATTRIBUTION_KEY = 'yg_attribution';
const ATTRIBUTION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

export function getPersistedAttribution(): Attribution | undefined {
  if (typeof window === 'undefined') return undefined;
  
  const stored = localStorage.getItem(ATTRIBUTION_KEY);
  if (!stored) return undefined;
  
  try {
    const { attribution, timestamp } = JSON.parse(stored);
    const isExpired = Date.now() - timestamp > ATTRIBUTION_TTL;
    
    if (isExpired) {
      localStorage.removeItem(ATTRIBUTION_KEY);
      return undefined;
    }
    
    return attribution;
  } catch {
    return undefined;
  }
}

export function persistAttribution(attribution: Attribution): void {
  if (typeof window === 'undefined') return;
  
  // Don't overwrite existing attribution (first-touch model)
  if (localStorage.getItem(ATTRIBUTION_KEY)) return;
  
  localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({
    attribution,
    timestamp: Date.now(),
  }));
}

// Usage: Call on app initialization
const attribution = getAttributionFromURL();
if (attribution) {
  persistAttribution(attribution);
}
```

### Attribution Models

#### 1. First-Touch Attribution
Attributes conversion to the user's first visit source:

```typescript
// Always use persisted attribution for conversion events
await trackEvent.mutateAsync({
  eventType: 'license_created',
  attribution: getPersistedAttribution(),
  // ...
});
```

#### 2. Last-Touch Attribution
Attributes conversion to the user's most recent visit source:

```typescript
// Use current attribution for conversion events
await trackEvent.mutateAsync({
  eventType: 'license_created',
  attribution: getAttributionFromURL(),
  // ...
});
```

#### 3. Multi-Touch Attribution
Send both first and last touch in props:

```typescript
await trackEvent.mutateAsync({
  eventType: 'license_created',
  attribution: getAttributionFromURL(), // Last touch
  props: {
    firstTouchAttribution: getPersistedAttribution(),
  },
  // ...
});
```

---

## Frontend Implementation Guide

### Step 1: Create Analytics Service

```typescript
// src/lib/analytics/analytics-service.ts

import { trpc } from '@/lib/trpc';
import { v4 as uuidv4 } from 'uuid';
import { getAttributionFromURL, persistAttribution } from './attribution';
import type { TrackEventInput, EventType } from '@/types/analytics';

class AnalyticsService {
  private sessionId: string;
  private trackEvent: ReturnType<typeof trpc.analytics.track.useMutation>;
  
  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    
    // Capture attribution on first load
    const attribution = getAttributionFromURL();
    if (attribution) {
      persistAttribution(attribution);
    }
  }
  
  /**
   * Get or create session ID
   */
  private getOrCreateSessionId(): string {
    if (typeof window === 'undefined') return uuidv4();
    
    const stored = sessionStorage.getItem('yg_session_id');
    if (stored) return stored;
    
    const newSessionId = uuidv4();
    sessionStorage.setItem('yg_session_id', newSessionId);
    return newSessionId;
  }
  
  /**
   * Track an event
   */
  async track(event: Omit<TrackEventInput, 'sessionId' | 'idempotencyKey'>): Promise<void> {
    try {
      const trackMutation = trpc.analytics.track.useMutation();
      
      await trackMutation.mutateAsync({
        ...event,
        sessionId: this.sessionId,
        idempotencyKey: uuidv4(),
        source: event.source || 'web',
        attribution: event.attribution || getAttributionFromURL(),
      });
    } catch (error) {
      // Silent failure - analytics errors shouldn't break UX
      console.error('Analytics tracking error:', error);
    }
  }
  
  /**
   * Track page view
   */
  async trackPageView(path: string, title?: string): Promise<void> {
    await this.track({
      eventType: 'page_viewed',
      props: { path, title: title || document.title },
    });
  }
  
  /**
   * Track asset view
   */
  async trackAssetView(assetId: string, assetTitle: string, category?: string): Promise<void> {
    await this.track({
      eventType: 'asset_viewed',
      entityId: assetId,
      entityType: 'asset',
      props: { assetTitle, category },
    });
  }
  
  /**
   * Track CTA click
   */
  async trackCTAClick(ctaText: string, location: string, destination?: string): Promise<void> {
    await this.track({
      eventType: 'cta_clicked',
      props: { ctaText, location, destination },
    });
  }
  
  /**
   * Track search
   */
  async trackSearch(query: string, resultsCount?: number, filters?: Record<string, any>): Promise<void> {
    await this.track({
      eventType: 'search_performed',
      props: { query, resultsCount, filters },
    });
  }
  
  /**
   * Track form submission
   */
  async trackFormSubmit(formName: string, success: boolean, errorMessage?: string): Promise<void> {
    await this.track({
      eventType: 'form_submitted',
      props: { formName, success, errorMessage },
    });
  }
}

// Export singleton instance
export const analytics = new AnalyticsService();
```

### Step 2: Integrate with Next.js App Router

```typescript
// app/layout.tsx (Next.js 15 App Router)

'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { analytics } from '@/lib/analytics/analytics-service';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Track page views on navigation
  useEffect(() => {
    if (pathname) {
      analytics.trackPageView(pathname);
    }
  }, [pathname, searchParams]);
  
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

### Step 3: Track Component Interactions

```typescript
// components/AssetCard.tsx

import { analytics } from '@/lib/analytics/analytics-service';
import { EVENT_TYPES } from '@/types/analytics';

export function AssetCard({ asset }: { asset: Asset }) {
  const handleClick = () => {
    // Track asset view
    analytics.trackAssetView(asset.id, asset.title, asset.category);
    
    // Navigate to asset page
    router.push(`/assets/${asset.id}`);
  };
  
  const handleDownload = async () => {
    // Track download
    await analytics.track({
      eventType: EVENT_TYPES.ASSET_DOWNLOADED,
      entityId: asset.id,
      entityType: 'asset',
      props: {
        assetTitle: asset.title,
        format: asset.format,
        sizeBytes: asset.sizeBytes,
      },
    });
    
    // Trigger download
    downloadAsset(asset.id);
  };
  
  return (
    <div onClick={handleClick} className="cursor-pointer">
      <img src={asset.thumbnailUrl} alt={asset.title} />
      <h3>{asset.title}</h3>
      <button onClick={handleDownload}>Download</button>
    </div>
  );
}
```

### Step 4: Track Form Submissions

```typescript
// components/ContactForm.tsx

import { analytics } from '@/lib/analytics/analytics-service';
import { useState } from 'react';

export function ContactForm() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Submit form
      const response = await fetch('/api/contact', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      
      // Track success
      if (response.ok) {
        await analytics.trackFormSubmit('contact-form', true);
        alert('Message sent!');
      } else {
        await analytics.trackFormSubmit('contact-form', false, 'API error');
        alert('Failed to send message');
      }
    } catch (error) {
      await analytics.trackFormSubmit('contact-form', false, error.message);
      alert('Network error');
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  );
}
```

---

## Real-Time Patterns

### Debounced Event Tracking

For high-frequency events (scroll, mouse move), use debouncing:

```typescript
// src/lib/analytics/debounced-tracking.ts

import { debounce } from 'lodash';
import { analytics } from './analytics-service';

export const trackScrollDepth = debounce((depth: number) => {
  analytics.track({
    eventType: 'post_scroll_depth',
    props: { depth },
  });
}, 1000); // Track at most once per second

// Usage in component
useEffect(() => {
  const handleScroll = () => {
    const scrollPercentage = (window.scrollY / document.body.scrollHeight) * 100;
    trackScrollDepth(Math.round(scrollPercentage));
  };
  
  window.addEventListener('scroll', handleScroll);
  return () => window.removeEventListener('scroll', handleScroll);
}, []);
```

### Time-Based Tracking

Track engagement time:

```typescript
// components/BlogPost.tsx

import { useEffect, useRef } from 'react';
import { analytics } from '@/lib/analytics/analytics-service';

export function BlogPost({ postId }: { postId: string }) {
  const startTime = useRef(Date.now());
  const intervalRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    // Track every 10 seconds
    intervalRef.current = setInterval(() => {
      const engagementTime = Math.floor((Date.now() - startTime.current) / 1000);
      
      analytics.track({
        eventType: 'post_engagement_time',
        entityId: postId,
        entityType: 'post',
        props: {
          seconds: 10,
          cumulative: engagementTime,
          isActiveTime: document.visibilityState === 'visible',
        },
      });
    }, 10000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [postId]);
  
  return <article>{/* Post content */}</article>;
}
```

### Batch Queue for Offline Support

Queue events when offline and send in batch when online:

```typescript
// src/lib/analytics/offline-queue.ts

import { trpc } from '@/lib/trpc';
import type { TrackEventInput } from '@/types/analytics';

const QUEUE_KEY = 'yg_analytics_queue';
const MAX_QUEUE_SIZE = 100;

export class OfflineQueue {
  private queue: TrackEventInput[] = [];
  
  constructor() {
    this.loadQueue();
    this.setupOnlineListener();
  }
  
  private loadQueue(): void {
    if (typeof window === 'undefined') return;
    
    const stored = localStorage.getItem(QUEUE_KEY);
    if (stored) {
      try {
        this.queue = JSON.parse(stored);
      } catch {}
    }
  }
  
  private saveQueue(): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
  }
  
  private setupOnlineListener(): void {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('online', () => {
      this.flush();
    });
  }
  
  enqueue(event: TrackEventInput): void {
    this.queue.push(event);
    
    // Limit queue size
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue.shift();
    }
    
    this.saveQueue();
    
    // Try to flush immediately if online
    if (navigator.onLine) {
      this.flush();
    }
  }
  
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    
    const events = [...this.queue];
    this.queue = [];
    this.saveQueue();
    
    try {
      const trackBatch = trpc.analytics.trackBatch.useMutation();
      await trackBatch.mutateAsync({ events });
    } catch (error) {
      // Re-queue failed events
      this.queue = [...events, ...this.queue];
      this.saveQueue();
      console.error('Failed to flush analytics queue:', error);
    }
  }
}

export const offlineQueue = new OfflineQueue();
```

---

## Best Practices

### 1. Non-Blocking Tracking
Never let analytics failures break user experience:

```typescript
// ✅ Good - Async with error handling
async function handleButtonClick() {
  // Track click (non-blocking)
  analytics.track({
    eventType: 'button_clicked',
    props: { buttonText: 'Sign Up' },
  }).catch(console.error);
  
  // Continue with business logic
  await signUp();
}

// ❌ Bad - Blocking await
async function handleButtonClick() {
  await analytics.track({ /* ... */ }); // Blocks UI if slow
  await signUp();
}
```

### 2. Idempotency Keys
Always use idempotency keys for critical events:

```typescript
// ✅ Good - Prevents duplicate conversion tracking
await analytics.track({
  eventType: 'license_created',
  entityId: licenseId,
  entityType: 'license',
  idempotencyKey: licenseId, // Use license ID as idempotency key
  props: { feeCents: 50000 },
});
```

### 3. Structured Props
Use consistent prop naming:

```typescript
// ✅ Good - Structured, queryable
await analytics.track({
  eventType: 'search_performed',
  props: {
    query: 'luxury fashion',
    resultsCount: 42,
    filters: {
      category: 'photography',
      priceRange: '1000-5000',
    },
    sortBy: 'relevance',
  },
});

// ❌ Bad - Unstructured, hard to analyze
await analytics.track({
  eventType: 'search',
  props: {
    data: 'luxury fashion, 42 results, photography, $1000-$5000',
  },
});
```

### 4. Privacy & GDPR Compliance

```typescript
// Check user consent before tracking
function shouldTrackAnalytics(): boolean {
  if (typeof window === 'undefined') return false;
  
  const consent = localStorage.getItem('analytics_consent');
  return consent === 'granted';
}

// Wrapper for privacy-compliant tracking
async function trackIfConsented(event: TrackEventInput): Promise<void> {
  if (shouldTrackAnalytics()) {
    await analytics.track(event);
  }
}
```

### 5. Testing Analytics

```typescript
// src/lib/analytics/__tests__/analytics-service.test.ts

import { analytics } from '../analytics-service';
import { trpc } from '@/lib/trpc';

jest.mock('@/lib/trpc');

describe('AnalyticsService', () => {
  it('should track page views', async () => {
    const mockMutate = jest.fn();
    (trpc.analytics.track.useMutation as jest.Mock).mockReturnValue({
      mutateAsync: mockMutate,
    });
    
    await analytics.trackPageView('/test-page', 'Test Page');
    
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'page_viewed',
        props: { path: '/test-page', title: 'Test Page' },
      })
    );
  });
});
```

---

## Complete Implementation Checklist

### Setup
- [ ] Install dependencies (uuid, lodash)
- [ ] Copy TypeScript types to frontend
- [ ] Create analytics service class
- [ ] Set up session management (sessionStorage)
- [ ] Implement attribution tracking
- [ ] Configure error handling

### Core Tracking
- [ ] Page view tracking (App Router integration)
- [ ] Asset view tracking
- [ ] CTA click tracking
- [ ] Search tracking
- [ ] Form submission tracking
- [ ] Custom event tracking

### Advanced Features
- [ ] Offline queue implementation
- [ ] Batch tracking for bulk events
- [ ] Debounced tracking for high-frequency events
- [ ] Time-based engagement tracking
- [ ] Scroll depth tracking
- [ ] Multi-touch attribution

### Privacy & Compliance
- [ ] Cookie consent banner
- [ ] Analytics opt-out functionality
- [ ] GDPR-compliant tracking
- [ ] Data retention policy
- [ ] Privacy policy updates

### Testing
- [ ] Unit tests for analytics service
- [ ] Integration tests for tracking flows
- [ ] E2E tests for critical events
- [ ] Test offline queue behavior
- [ ] Test idempotency

### Monitoring
- [ ] Set up error logging (Sentry)
- [ ] Monitor tracking failure rates
- [ ] Dashboard for event volume
- [ ] Alerts for anomalies

### Documentation
- [ ] Document custom event types
- [ ] Create tracking guidelines for team
- [ ] Update API documentation
- [ ] Add inline code comments

---

## Next Steps

1. ✅ Implement event tracking throughout your app
2. ✅ Test with browser DevTools Network tab
3. Verify events appear in backend database
4. Build custom dashboards using collected data
5. Set up alerts for critical events (conversions, errors)
6. Iterate based on data insights

---

## Related Documentation

- **Part 1**: Brand Analytics (Campaign Analytics & ROI Analysis)
- **Part 2**: Brand Analytics (Creator Performance & Asset Usage)
- **Backend Docs**: `/docs/modules/analytics/overview.md`
- **Event Types**: `/src/lib/constants/event-types.ts`

---

**Questions or Issues?**  
Contact the backend team or refer to implementation docs:
- `/docs/modules/analytics/overview.md`
- `/src/modules/analytics/routers/event-ingestion.router.ts`
