# Post Analytics - Frontend Integration Guide

**📋 Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
**🎯 Module:** Post Analytics (Views, Engagement, Referrers, CTA Tracking, A/B Testing)  
**📅 Generated:** October 16, 2025

> This guide provides everything the frontend team needs to implement post analytics UI without clarification questions.

---

## 📖 Table of Contents

1. [API Endpoints](#1-api-endpoints)
2. [TypeScript Type Definitions](#2-typescript-type-definitions)
3. [Business Logic & Validation Rules](#3-business-logic--validation-rules)
4. [Error Handling](#4-error-handling)
5. [Authorization & Permissions](#5-authorization--permissions)
6. [Rate Limiting & Performance](#6-rate-limiting--performance)
7. [Real-time Updates](#7-real-time-updates)
8. [Pagination & Filtering](#8-pagination--filtering)
9. [Client SDK Integration](#9-client-sdk-integration)
10. [Frontend Implementation Checklist](#10-frontend-implementation-checklist)

---

## 1. API Endpoints

### 📊 Analytics Retrieval Endpoints

#### Get Post Analytics Overview
```typescript
// 🔒 ADMIN ONLY: Comprehensive analytics dashboard
GET /trpc/postAnalytics.getAnalytics
```
**Authentication:** Required (JWT) - Author, Admin, or Public post only  
**Purpose:** Main analytics dashboard data

**Request Schema:**
```typescript
{
  postId: string;           // CUID format
  dateRange?: {             // Optional, defaults to last 30 days
    start: string;          // ISO datetime
    end: string;            // ISO datetime
  };
  granularity?: 'hour' | 'day' | 'week' | 'month'; // Default: 'day'
  includeExperiments?: boolean; // Default: false
}
```

**Response Schema:**
```typescript
{
  postId: string;
  dateRange: {
    start: string;
    end: string;
  };
  metrics: {
    totalViews: number;
    uniqueVisitors: number;
    avgEngagementTimeSeconds: number;
    avgScrollDepthPercentage: number;
    ctaClicks: number;
    bounceRate: number;                    // Percentage
    conversionRate: number;                // Percentage
    topReferrers: Array<{
      domain: string;
      visits: number;
      percentage: number;
    }>;
    topCtaTypes: Array<{
      type: string;
      clicks: number;
      conversionRate: number;
    }>;
    deviceBreakdown: {
      desktop: number;
      mobile: number;
      tablet: number;
    };
    sourceBreakdown: {
      organic: number;
      social: number;
      direct: number;
      referral: number;
      email: number;
    };
  };
  trends: {
    viewsGrowth: number;        // Percentage change vs previous period
    engagementGrowth: number;   // Percentage change vs previous period
    conversionGrowth: number;   // Percentage change vs previous period
  };
  experiments?: {              // Only if includeExperiments: true
    active: boolean;
    experimentId?: string;
    variants?: Array<{
      id: string;
      name: string;
      views: number;
      conversionRate: number;
    }>;
  };
}
```

#### Get Time Series Data
```typescript
// 🔒 ADMIN ONLY: Chart data for analytics dashboard
GET /trpc/postAnalytics.getTimeSeries
```
**Authentication:** Required (JWT) - Author, Admin, or Public post only

**Request Schema:**
```typescript
{
  postId: string;
  dateRange?: {
    start: string;
    end: string;
  };
  granularity?: 'hour' | 'day' | 'week'; // Default: 'day'
  metrics?: Array<'views' | 'unique_visitors' | 'engagement_time' | 'scroll_depth' | 'cta_clicks' | 'bounce_rate' | 'conversion_rate'>;
  // Default: ['views', 'unique_visitors']
}
```

**Response Schema:**
```typescript
{
  postId: string;
  dateRange: {
    start: string;
    end: string;
  };
  granularity: 'hour' | 'day' | 'week';
  data: Array<{
    timestamp: string;          // ISO datetime
    views: number;
    uniqueVisitors: number;
    engagementTime: number;     // Average seconds
    scrollDepth: number;        // Average percentage
    ctaClicks: number;
    bounceRate: number;         // Percentage
    conversionRate: number;     // Percentage
  }>;
}
```

#### Get Referrer Analysis
```typescript
// 🔒 ADMIN ONLY: Traffic source breakdown
GET /trpc/postAnalytics.getReferrers
```

**Request Schema:**
```typescript
{
  postId: string;
  dateRange?: {
    start: string;
    end: string;
  };
  limit?: number;                              // 1-100, default: 20
  groupBy?: 'domain' | 'source' | 'campaign' | 'medium'; // Default: 'domain'
}
```

**Response Schema:**
```typescript
{
  postId: string;
  dateRange: {
    start: string;
    end: string;
  };
  referrers: Array<{
    source: string;
    visits: number;
    percentage: number;
    growthRate: number;         // Percentage vs previous period
    conversionRate: number;     // Percentage
  }>;
  categories: {
    organic: number;
    social: number;
    direct: number;
    referral: number;
    email: number;
  };
}
```

#### Compare Posts Performance
```typescript
// 🔒 ADMIN ONLY: Multi-post comparison
GET /trpc/postAnalytics.comparePosts
```

**Request Schema:**
```typescript
{
  postIds: string[];           // 2-10 post IDs
  dateRange?: {
    start: string;
    end: string;
  };
  metrics?: Array<'views' | 'unique_visitors' | 'avg_engagement_time' | 'avg_scroll_depth' | 'cta_clicks' | 'bounce_rate' | 'conversion_rate'>;
  // Default: ['views', 'unique_visitors', 'avg_engagement_time']
}
```

### 📈 Event Tracking Endpoints (Public)

> ⚠️ **Important:** These endpoints are public and don't require authentication for basic tracking

#### Track Post View
```typescript
// 🌐 PUBLIC: Track when someone views a post
POST /trpc/postAnalytics.trackView
```

**Request Schema:**
```typescript
{
  postId: string;              // CUID
  sessionId: string;           // UUID v4
  userId?: string;             // CUID (if logged in)
  experimentId?: string;       // CUID (for A/B testing)
  variantId?: string;          // CUID (for A/B testing)
  attribution?: {
    referrer?: string;         // Full referrer URL
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    deviceType?: 'desktop' | 'mobile' | 'tablet';
    browser?: string;
    os?: string;
  };
  metadata?: Record<string, any>; // Additional tracking data
}
```

**Response Schema:**
```typescript
{
  eventId: string;             // Generated event ID
  tracked: boolean;            // Success indicator
}
```

#### Track Engagement Time
```typescript
// 🌐 PUBLIC: Track how long users actively engage
POST /trpc/postAnalytics.trackEngagement
```

**Request Schema:**
```typescript
{
  postId: string;
  sessionId: string;
  userId?: string;
  engagementTimeSeconds: number;    // 0-86400 (max 24 hours)
  cumulativeTime: number;           // Total time on page
  isActiveTime: boolean;            // Was user actively viewing?
  metadata?: Record<string, any>;
}
```

#### Track Scroll Depth
```typescript
// 🌐 PUBLIC: Track reading progress
POST /trpc/postAnalytics.trackScrollDepth
```

**Request Schema:**
```typescript
{
  postId: string;
  sessionId: string;
  userId?: string;
  scrollDepthPercentage: number;    // 0-100
  maxScrollDepth: number;           // 0-100 (highest reached)
  milestone?: '25' | '50' | '75' | '100'; // Specific milestones
  metadata?: Record<string, any>;
}
```

#### Track CTA Clicks
```typescript
// 🌐 PUBLIC: Track call-to-action interactions
POST /trpc/postAnalytics.trackCtaClick
```

**Request Schema:**
```typescript
{
  postId: string;
  sessionId: string;
  userId?: string;
  ctaId: string;                    // Unique identifier for the CTA
  ctaType: 'button' | 'link' | 'form' | 'download' | 'subscribe' | 'share' | 'comment';
  ctaText: string;                  // Max 255 characters
  ctaPosition?: string;             // e.g., "header", "sidebar", "inline", "footer"
  destinationUrl?: string;          // Where the CTA leads (must be valid URL)
  conversionValue?: number;         // Monetary value of conversion
  metadata?: Record<string, any>;
}
```

### 🧪 A/B Testing Endpoints

#### Create Experiment
```typescript
// 🔒 ADMIN ONLY: Set up A/B tests for headlines
POST /trpc/postExperiment.create
```

**Request Schema:**
```typescript
{
  name: string;                     // 1-255 chars
  description?: string;             // Max 1000 chars
  postIds: string[];               // 1+ post IDs to include
  variants: Array<{
    id: string;                    // CUID
    name: string;                  // 1-100 chars
    description?: string;          // Max 500 chars
    trafficAllocation: number;     // 0-100 percentage
    content: Record<string, any>;  // headline, image, etc.
  }>;                             // 2-5 variants
  startDate: string;              // ISO datetime
  endDate: string;                // ISO datetime
  successMetrics: Array<'views' | 'engagement_time' | 'scroll_depth' | 'cta_clicks' | 'conversion_rate'>; // 1+ metrics
  trafficAllocation: number;      // 10-100, default: 50
  status: 'draft' | 'active' | 'paused' | 'completed'; // Default: 'draft'
}
```

#### Get Experiment Results
```typescript
// 🔒 ADMIN ONLY: A/B test performance data
GET /trpc/postExperiment.getResults
```

**Request Schema:**
```typescript
{
  experimentId: string;
  includeStatistics?: boolean;     // Default: true
  confidenceLevel?: number;        // 0.8-0.99, default: 0.95
}
```

---

## 2. TypeScript Type Definitions

### Core Analytics Types
```typescript
// Copy these to your frontend types file
export interface PostAnalyticsOverview {
  postId: string;
  dateRange: {
    start: string;
    end: string;
  };
  metrics: {
    totalViews: number;
    uniqueVisitors: number;
    avgEngagementTimeSeconds: number;
    avgScrollDepthPercentage: number;
    ctaClicks: number;
    bounceRate: number;
    conversionRate: number;
    topReferrers: Array<{
      domain: string;
      visits: number;
      percentage: number;
    }>;
    topCtaTypes: Array<{
      type: string;
      clicks: number;
      conversionRate: number;
    }>;
    deviceBreakdown: {
      desktop: number;
      mobile: number;
      tablet: number;
    };
    sourceBreakdown: {
      organic: number;
      social: number;
      direct: number;
      referral: number;
      email: number;
    };
  };
  trends: {
    viewsGrowth: number;
    engagementGrowth: number;
    conversionGrowth: number;
  };
  experiments?: {
    active: boolean;
    experimentId?: string;
    variants?: Array<{
      id: string;
      name: string;
      views: number;
      conversionRate: number;
    }>;
  };
}

export interface PostTimeSeriesData {
  postId: string;
  dateRange: {
    start: string;
    end: string;
  };
  granularity: 'hour' | 'day' | 'week';
  data: Array<{
    timestamp: string;
    views: number;
    uniqueVisitors: number;
    engagementTime: number;
    scrollDepth: number;
    ctaClicks: number;
    bounceRate: number;
    conversionRate: number;
  }>;
}

export interface PostReferrersData {
  postId: string;
  dateRange: {
    start: string;
    end: string;
  };
  referrers: Array<{
    source: string;
    visits: number;
    percentage: number;
    growthRate: number;
    conversionRate: number;
  }>;
  categories: {
    organic: number;
    social: number;
    direct: number;
    referral: number;
    email: number;
  };
}

export interface TrackingEvent {
  eventId: string;
  tracked: boolean;
}

export interface AttributionData {
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  browser?: string;
  os?: string;
}

// Event tracking input types
export interface TrackPostViewInput {
  postId: string;
  sessionId: string;
  userId?: string;
  experimentId?: string;
  variantId?: string;
  attribution?: AttributionData;
  metadata?: Record<string, any>;
}

export interface TrackEngagementTimeInput {
  postId: string;
  sessionId: string;
  userId?: string;
  engagementTimeSeconds: number;
  cumulativeTime: number;
  isActiveTime: boolean;
  metadata?: Record<string, any>;
}

export interface TrackScrollDepthInput {
  postId: string;
  sessionId: string;
  userId?: string;
  scrollDepthPercentage: number;
  maxScrollDepth: number;
  milestone?: '25' | '50' | '75' | '100';
  metadata?: Record<string, any>;
}

export interface TrackCtaClickInput {
  postId: string;
  sessionId: string;
  userId?: string;
  ctaId: string;
  ctaType: 'button' | 'link' | 'form' | 'download' | 'subscribe' | 'share' | 'comment';
  ctaText: string;
  ctaPosition?: string;
  destinationUrl?: string;
  conversionValue?: number;
  metadata?: Record<string, any>;
}
```

### Date Range and Filtering Types
```typescript
export interface DateRangeFilter {
  start: string; // ISO datetime
  end: string;   // ISO datetime
}

export type AnalyticsGranularity = 'hour' | 'day' | 'week' | 'month';

export type AnalyticsMetric = 
  | 'views'
  | 'unique_visitors'
  | 'engagement_time'
  | 'scroll_depth'
  | 'cta_clicks'
  | 'bounce_rate'
  | 'conversion_rate';

export type ReferrerGroupBy = 'domain' | 'source' | 'campaign' | 'medium';

export type CtaType = 'button' | 'link' | 'form' | 'download' | 'subscribe' | 'share' | 'comment';

export type DeviceType = 'desktop' | 'mobile' | 'tablet';
```

### Zod Validation Schemas
```typescript
import { z } from 'zod';

// Use these for form validation on the frontend
export const dateRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
}).refine(
  (data) => new Date(data.start) < new Date(data.end),
  { message: "Start date must be before end date" }
);

export const trackPostViewSchema = z.object({
  postId: z.string().cuid(),
  sessionId: z.string().uuid(),
  userId: z.string().cuid().optional(),
  experimentId: z.string().cuid().optional(),
  variantId: z.string().cuid().optional(),
  attribution: z.object({
    referrer: z.string().optional(),
    utmSource: z.string().optional(),
    utmMedium: z.string().optional(),
    utmCampaign: z.string().optional(),
    utmTerm: z.string().optional(),
    utmContent: z.string().optional(),
    deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional(),
    browser: z.string().optional(),
    os: z.string().optional(),
  }).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const trackEngagementTimeSchema = z.object({
  postId: z.string().cuid(),
  sessionId: z.string().uuid(),
  userId: z.string().cuid().optional(),
  engagementTimeSeconds: z.number().min(0).max(86400),
  cumulativeTime: z.number().min(0),
  isActiveTime: z.boolean().default(true),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const trackScrollDepthSchema = z.object({
  postId: z.string().cuid(),
  sessionId: z.string().uuid(),
  userId: z.string().cuid().optional(),
  scrollDepthPercentage: z.number().min(0).max(100),
  maxScrollDepth: z.number().min(0).max(100),
  milestone: z.enum(['25', '50', '75', '100']).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const trackCtaClickSchema = z.object({
  postId: z.string().cuid(),
  sessionId: z.string().uuid(),
  userId: z.string().cuid().optional(),
  ctaId: z.string(),
  ctaType: z.enum(['button', 'link', 'form', 'download', 'subscribe', 'share', 'comment']),
  ctaText: z.string().max(255),
  ctaPosition: z.string().optional(),
  destinationUrl: z.string().url().optional(),
  conversionValue: z.number().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
```

---

## 3. Business Logic & Validation Rules

### Post Analytics Access Rules
```typescript
// Who can view analytics for a post
interface AnalyticsAccessRules {
  canViewAnalytics(postId: string, userId: string, userRole: string): boolean {
    // 1. Post author can always view their own analytics
    // 2. Admins can view any post analytics
    // 3. Published posts analytics can be viewed by anyone (limited data)
    // 4. Draft/private posts only by author or admin
  }
}
```

### Event Tracking Validation

#### Post Views
- **Deduplication:** Same sessionId + postId within 30 minutes = 1 unique view
- **Unique Visitors:** Count unique sessionIds per day
- **Public Posts Only:** Only published posts can be tracked
- **Session Requirements:** sessionId must be valid UUID v4

#### Engagement Time
- **Minimum Tracking:** Only track if `engagementTimeSeconds >= 5`
- **Maximum Time:** Cap at 86400 seconds (24 hours)
- **Active Time Only:** `isActiveTime: true` means user was actively viewing page
- **Page Visibility:** Track only when page is visible (not in background tab)

#### Scroll Depth
- **Milestones:** Track 25%, 50%, 75%, 100% automatically
- **Deduplication:** Only track each milestone once per session
- **Max Depth:** Always store the maximum scroll depth reached
- **Percentage Calculation:** Based on document.documentElement.scrollHeight

#### CTA Click Tracking
- **Required Fields:** ctaId, ctaType, ctaText are required
- **CTA ID Format:** Should be unique within the post (e.g., 'header-subscribe', 'inline-cta-1')
- **Text Limits:** ctaText max 255 characters
- **URL Validation:** destinationUrl must be valid URL if provided
- **Conversion Value:** Optional monetary value for ROI tracking

### A/B Testing Rules
- **Variant Assignment:** Deterministic based on sessionId hash
- **Traffic Allocation:** Must sum to 100% across all variants
- **Minimum Duration:** Experiments should run at least 7 days
- **Statistical Significance:** Need minimum 100 conversions per variant
- **Experiment States:** draft → active → (paused) → completed

### Data Retention
- **Raw Events:** Stored for 2 years
- **Daily Aggregates:** Stored permanently
- **Personal Data:** SessionId and userId anonymized after 90 days
- **Export Capability:** Users can export their data

---

## 4. Error Handling

### HTTP Status Codes Used

| Status Code | Meaning | When It Occurs |
|------------|---------|----------------|
| `200` | Success | Request completed successfully |
| `400` | Bad Request | Invalid request data, validation failed |
| `401` | Unauthorized | Missing or invalid JWT token |
| `403` | Forbidden | User lacks permission for this resource |
| `404` | Not Found | Post not found or not published |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Server error, log and retry |

### Error Response Format

All errors follow tRPC format:
```typescript
interface TRPCError {
  error: {
    code: number;
    message: string;
    data: {
      code: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INTERNAL_SERVER_ERROR';
      httpStatus: number;
      stack?: string; // Only in development
      path: string;
    };
  };
}
```

### Specific Error Scenarios

#### Analytics Access Errors
```typescript
// When user lacks permission to view analytics
{
  error: {
    code: -32604,
    message: "You do not have permission to view analytics for this post",
    data: {
      code: "FORBIDDEN",
      httpStatus: 403,
      path: "postAnalytics.getAnalytics"
    }
  }
}
```

#### Post Not Found
```typescript
{
  error: {
    code: -32604,
    message: "Post not found",
    data: {
      code: "NOT_FOUND", 
      httpStatus: 404,
      path: "postAnalytics.trackView"
    }
  }
}
```

#### Validation Errors
```typescript
{
  error: {
    code: -32602,
    message: "Invalid input: engagementTimeSeconds must be at least 0",
    data: {
      code: "BAD_REQUEST",
      httpStatus: 400,
      path: "postAnalytics.trackEngagement"
    }
  }
}
```

#### Rate Limiting
```typescript
{
  error: {
    code: -32604,
    message: "Too many requests. Please try again later.",
    data: {
      code: "TOO_MANY_REQUESTS",
      httpStatus: 429,
      path: "postAnalytics.trackView"
    }
  }
}
```

### Error Handling Best Practices

#### For Analytics Dashboards (Admin UI)
```typescript
// Show user-friendly error messages
const handleAnalyticsError = (error: TRPCError) => {
  switch (error.data?.code) {
    case 'NOT_FOUND':
      return 'Post not found. It may have been deleted.';
    case 'FORBIDDEN':
      return 'You don\'t have permission to view these analytics.';
    case 'INTERNAL_SERVER_ERROR':
      return 'Unable to load analytics. Please try again later.';
    default:
      return 'Something went wrong. Please refresh the page.';
  }
};
```

#### For Event Tracking (Public UI)
```typescript
// Silently fail for tracking events - don't disrupt user experience
const trackEvent = async (eventData: any) => {
  try {
    await trpc.postAnalytics.trackView.mutate(eventData);
  } catch (error) {
    // Log error but don't show to user
    console.warn('Analytics tracking failed:', error);
    
    // Optionally queue for retry
    queueForRetry(eventData);
  }
};
```

### When to Show vs Hide Errors

**Show to User:**
- Analytics dashboard loading failures
- Permission errors for protected data
- Form validation errors

**Hide from User (Log Only):**
- Event tracking failures
- Network timeouts for analytics
- Non-critical background processes

---

## 5. Authorization & Permissions

### User Roles & Access Levels

| Role | Analytics Access | Event Tracking | A/B Testing |
|------|------------------|----------------|-------------|
| **Anonymous** | ❌ None | ✅ Public posts only | ❌ None |
| **User** | ❌ None | ✅ Public posts only | ❌ None |
| **Creator** | ✅ Own posts only | ✅ All posts | ❌ None |
| **Admin** | ✅ All posts | ✅ All posts | ✅ Full access |

### Detailed Permission Matrix

#### Analytics Viewing (`getAnalytics`, `getTimeSeries`, `getReferrers`)
```typescript
interface AnalyticsPermission {
  postId: string;
  userId: string;
  userRole: 'USER' | 'CREATOR' | 'ADMIN';
  
  canView(): boolean {
    // 1. Admin can view all analytics
    if (userRole === 'ADMIN') return true;
    
    // 2. Post author can view their own analytics
    if (post.authorId === userId) return true;
    
    // 3. Published posts have limited public analytics
    if (post.status === 'PUBLISHED') {
      return isPublicAnalyticsEndpoint(); // Limited metrics only
    }
    
    return false;
  }
}
```

#### Event Tracking (`trackView`, `trackEngagement`, etc.)
```typescript
interface TrackingPermission {
  postId: string;
  
  canTrack(): boolean {
    // Only published posts can be tracked
    return post.status === 'PUBLISHED';
  }
}
```

#### A/B Testing (`createExperiment`, `getResults`)
```typescript
interface ExperimentPermission {
  userId: string;
  userRole: 'USER' | 'CREATOR' | 'ADMIN';
  
  canManageExperiments(): boolean {
    // Only admins can create/manage A/B tests
    return userRole === 'ADMIN';
  }
  
  canViewResults(experimentId: string): boolean {
    // Admins and experiment creators can view results
    return userRole === 'ADMIN' || experiment.createdBy === userId;
  }
}
```

### Field-Level Permissions

#### Public Analytics (Limited Data)
When `post.status === 'PUBLISHED'` and user is not author/admin:
```typescript
interface PublicAnalyticsView {
  // ✅ Allowed fields
  totalViews: number;
  avgEngagementTime: number; // Rounded to nearest 30 seconds
  
  // ❌ Restricted fields (not returned)
  uniqueVisitors: never;     // Sensitive user data
  topReferrers: never;       // Could reveal private traffic
  deviceBreakdown: never;    // Detailed user behavior
  experiments: never;        // Internal testing data
}
```

#### Author/Admin Analytics (Full Data)
Post authors and admins get complete analytics access:
```typescript
interface FullAnalyticsView extends PostAnalyticsOverview {
  // All fields available including sensitive data
}
```

### JWT Token Requirements

#### Required Claims
```typescript
interface JWTPayload {
  sub: string;        // User ID (required)
  role: string;       // User role (required)
  exp: number;        // Expiry (required)
  iat: number;        // Issued at (required)
}
```

#### Token Validation
```typescript
// How the backend validates tokens
const validateToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Must have valid user ID and role
    if (!decoded.sub || !decoded.role) return null;
    
    return decoded as JWTPayload;
  } catch {
    return null; // Invalid token
  }
};
```

### Session Management

#### Session ID Requirements
- **Format:** UUID v4 (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- **Generation:** Client-side on first visit
- **Storage:** localStorage or sessionStorage
- **Lifetime:** No server-side expiry, client manages
- **Privacy:** Not linked to user accounts for privacy

#### User ID Handling
- **Optional:** Only required if user is logged in
- **Format:** CUID (e.g., `ckxyz123abc`)
- **Privacy:** Anonymized in analytics after 90 days
- **Linking:** Links events to user account for personalization

---

## 6. Rate Limiting & Performance

### Rate Limits by Endpoint Type

#### Event Tracking Endpoints (High Volume)
```typescript
interface TrackingRateLimits {
  'postAnalytics.trackView': {
    limit: '100 requests per minute per IP';
    window: '1 minute';
    strategy: 'sliding window';
  };
  'postAnalytics.trackEngagement': {
    limit: '200 requests per minute per IP';
    window: '1 minute'; 
    strategy: 'sliding window';
  };
  'postAnalytics.trackScrollDepth': {
    limit: '50 requests per minute per session';
    window: '1 minute';
    strategy: 'fixed window';
  };
  'postAnalytics.trackCtaClick': {
    limit: '20 requests per minute per session';
    window: '1 minute';
    strategy: 'fixed window';
  };
}
```

#### Analytics Dashboard Endpoints (Lower Volume)
```typescript
interface AnalyticsRateLimits {
  'postAnalytics.getAnalytics': {
    limit: '30 requests per minute per user';
    window: '1 minute';
    strategy: 'token bucket';
  };
  'postAnalytics.getTimeSeries': {
    limit: '60 requests per minute per user';  // Charts need frequent updates
    window: '1 minute';
    strategy: 'token bucket';
  };
  'postAnalytics.getReferrers': {
    limit: '30 requests per minute per user';
    window: '1 minute';
    strategy: 'token bucket';
  };
}
```

### Rate Limit Headers

The API returns these headers to help frontend manage requests:
```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;      // "100" - requests allowed per window
  'X-RateLimit-Remaining': string;  // "85" - requests remaining
  'X-RateLimit-Reset': string;      // "1640995200" - unix timestamp when limit resets
  'X-RateLimit-Policy': string;     // "100;w=60" - rate limit policy
}
```

### Performance Optimizations

#### Caching Strategy
```typescript
interface CachingPolicy {
  // Analytics dashboard data
  'getAnalytics': {
    serverCache: '5 minutes';     // Redis cache
    clientCache: '2 minutes';     // React Query
    staleWhileRevalidate: true;
  };
  
  // Time series chart data  
  'getTimeSeries': {
    serverCache: '10 minutes';    // Less frequent updates for charts
    clientCache: '5 minutes';
    staleWhileRevalidate: true;
  };
  
  // Referrer analysis
  'getReferrers': {
    serverCache: '15 minutes';    // Traffic sources change slowly
    clientCache: '10 minutes';
    staleWhileRevalidate: true;
  };
}
```

#### Batch Event Tracking
```typescript
// Frontend should batch tracking events to reduce requests
interface BatchTracking {
  maxBatchSize: 10;               // Events per batch
  maxWaitTime: 5000;              // 5 seconds max delay
  criticalEvents: ['trackView'];   // Send immediately
  batchableEvents: ['trackEngagement', 'trackScrollDepth'];
}
```

#### Data Limits
```typescript
interface DataLimits {
  timeSeries: {
    maxDataPoints: 100;           // Prevent overly large responses
    maxDateRange: '1 year';       // Limit historical queries
  };
  
  referrers: {
    maxResults: 100;              // Configurable via limit parameter
    defaultResults: 20;
  };
  
  comparePosts: {
    maxPosts: 10;                 // Prevent expensive queries
    minPosts: 2;
  };
}
```

### Frontend Implementation Guidelines

#### React Query Configuration
```typescript
// Recommended React Query settings
const analyticsQueryOptions = {
  staleTime: 2 * 60 * 1000,      // 2 minutes
  cacheTime: 10 * 60 * 1000,     // 10 minutes
  refetchOnWindowFocus: false,    // Don't refetch on focus for analytics
  retry: 3,                       // Retry failed requests
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
};

// For real-time dashboards
const realtimeQueryOptions = {
  refetchInterval: 30000,         // Refresh every 30 seconds
  refetchIntervalInBackground: false,
};
```

#### Event Batching Example
```typescript
class AnalyticsTracker {
  private eventQueue: TrackingEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  
  track(event: TrackingEvent) {
    // Critical events (views) send immediately
    if (event.type === 'view') {
      this.sendEvent(event);
      return;
    }
    
    // Batch other events
    this.eventQueue.push(event);
    
    if (this.eventQueue.length >= 10) {
      this.flush(); // Send when batch is full
    } else {
      this.scheduleFlush(); // Or send after timeout
    }
  }
  
  private scheduleFlush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), 5000);
  }
}
```

---

## 7. Real-time Updates

### Webhook Events

The backend can send webhook notifications for analytics events:

```typescript
interface AnalyticsWebhook {
  event: 'analytics.milestone_reached' | 'analytics.experiment_completed';
  postId: string;
  data: {
    milestone?: {
      type: 'views' | 'conversions' | 'engagement';
      value: number;
      threshold: number;
    };
    experiment?: {
      experimentId: string;
      status: 'completed';
      winner: string;
      confidence: number;
    };
  };
  timestamp: string;
}
```

### WebSocket Support (Future)

> 🚧 **Not Yet Implemented** - Planned for future release

Real-time analytics updates will be available via WebSocket:
```typescript
// Future WebSocket implementation
interface RealtimeAnalytics {
  endpoint: 'wss://api.yesgoddess.agency/ws/analytics';
  events: [
    'post.view_count_updated',
    'post.milestone_reached', 
    'experiment.variant_leading'
  ];
}
```

### Polling Recommendations

For now, use polling for real-time updates:

```typescript
interface PollingStrategy {
  // Dashboard overview
  overviewMetrics: {
    interval: 30000;              // 30 seconds
    when: 'dashboard_visible';    // Only when user viewing
  };
  
  // Live experiment monitoring
  experimentResults: {
    interval: 60000;              // 1 minute
    when: 'experiment_active';
  };
  
  // Post performance tracking
  postMetrics: {
    interval: 120000;             // 2 minutes
    when: 'post_published_recently'; // First 24 hours
  };
}
```

#### Smart Polling Implementation
```typescript
const useRealtimeAnalytics = (postId: string) => {
  const [isVisible, setIsVisible] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  
  // Adjust polling based on page visibility
  const pollingInterval = useMemo(() => {
    if (!isVisible) return false;           // Stop when not visible
    
    const timeSinceUpdate = Date.now() - lastUpdate;
    if (timeSinceUpdate < 60000) return 10000;  // 10s for first minute
    if (timeSinceUpdate < 300000) return 30000; // 30s for first 5 minutes
    return 60000;                               // 1 minute thereafter
  }, [isVisible, lastUpdate]);
  
  return useQuery({
    queryKey: ['analytics', postId],
    queryFn: () => getPostAnalytics({ postId }),
    refetchInterval: pollingInterval,
  });
};
```

---

## 8. Pagination & Filtering

### Time Series Data

Time series endpoints handle large datasets efficiently:

```typescript
interface TimeSeriesQuery {
  postId: string;
  dateRange: {
    start: string;
    end: string;
  };
  granularity: 'hour' | 'day' | 'week';
  
  // Automatic data point limiting
  maxDataPoints: 100;         // Backend enforces this limit
  
  // Data aggregation based on range
  autoGranularity: {
    '1-7 days': 'hour';       // Hourly for recent data
    '8-90 days': 'day';       // Daily for medium range
    '91+ days': 'week';       // Weekly for long range
  };
}
```

### Referrer Analysis Pagination

```typescript
interface ReferrerQuery {
  postId: string;
  dateRange?: DateRangeFilter;
  
  // Pagination
  limit: number;              // 1-100, default 20
  offset?: number;            // For future pagination support
  
  // Filtering/Grouping
  groupBy: 'domain' | 'source' | 'campaign' | 'medium';
  
  // Sorting
  sortBy: 'visits' | 'percentage' | 'growth_rate' | 'conversion_rate';
  sortOrder: 'desc' | 'asc';  // Default: 'desc'
}
```

### Search and Filtering

#### Post Comparison Filtering
```typescript
interface PostComparisonFilters {
  postIds: string[];          // 2-10 posts max
  
  // Date filtering
  dateRange?: DateRangeFilter;
  
  // Metric selection
  metrics: AnalyticsMetric[]; // Select which metrics to compare
  
  // Post filtering
  categories?: string[];      // Filter by post categories
  authors?: string[];         // Filter by authors
  status?: 'PUBLISHED';       // Only published posts supported
}
```

#### Analytics Dashboard Filters
```typescript
interface DashboardFilters {
  // Time period presets
  period: 'today' | '7d' | '30d' | '90d' | 'custom';
  
  // Custom date range (when period = 'custom')
  customRange?: DateRangeFilter;
  
  // Segment filtering
  segment?: {
    deviceType?: DeviceType[];
    trafficSource?: ('organic' | 'social' | 'direct' | 'referral' | 'email')[];
    geographic?: string[];      // Country codes
  };
  
  // Experiment filtering
  experimentStatus?: ('active' | 'completed' | 'paused')[];
}
```

### Data Aggregation Rules

#### Granularity Auto-Selection
```typescript
const getOptimalGranularity = (dateRange: DateRangeFilter): AnalyticsGranularity => {
  const daysDiff = differenceInDays(new Date(dateRange.end), new Date(dateRange.start));
  
  if (daysDiff <= 7) return 'hour';      // Hourly for week or less
  if (daysDiff <= 90) return 'day';      // Daily for 3 months or less  
  if (daysDiff <= 365) return 'week';    // Weekly for year or less
  return 'month';                        // Monthly for longer periods
};
```

#### Data Point Limits
```typescript
interface DataLimits {
  timeSeries: {
    maxPoints: 100;           // Prevent huge payloads
    minGranularity: 'hour';   // Most granular allowed
  };
  
  topReferrers: {
    maxResults: 100;          // Configurable limit
    defaultResults: 20;
  };
  
  deviceBreakdown: {
    categories: ['desktop', 'mobile', 'tablet']; // Fixed categories
  };
}
```

---

## 9. Client SDK Integration

The backend provides a JavaScript client SDK for seamless tracking integration:

### Installation & Setup

```typescript
// Install the analytics client (hypothetical npm package)
npm install @yesgoddess/analytics-client

// Initialize in your app
import { PostAnalyticsClient } from '@yesgoddess/analytics-client';

const analytics = new PostAnalyticsClient({
  apiBaseUrl: 'https://ops.yesgoddess.agency',
  trackingEnabled: true,
  batchSize: 10,
  flushInterval: 5000,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
});
```

### Client Configuration Options

```typescript
interface PostAnalyticsConfig {
  apiBaseUrl: string;           // Backend API URL
  trackingEnabled?: boolean;    // Global tracking toggle (default: true)
  batchSize?: number;          // Events per batch (default: 10)
  flushInterval?: number;      // Max ms to wait before sending (default: 5000)
  sessionTimeout?: number;     // Session expiry ms (default: 30 mins)
  debug?: boolean;             // Console logging (default: false)
  retryAttempts?: number;      // Failed request retries (default: 3)
}
```

### Basic Usage Example

```typescript
// Initialize tracking for a blog post
analytics.initializePost('post-123', 'user-456', {
  experimentId: 'exp-789',     // Optional A/B test
  variantId: 'variant-a'
});

// Manual tracking (SDK handles most automatically)
analytics.trackCtaClick({
  ctaId: 'subscribe-button',
  ctaType: 'button',
  ctaText: 'Subscribe to Newsletter',
  ctaPosition: 'header'
});

// Clean up when leaving page
analytics.cleanup();
```

### Automatic Tracking Features

The SDK automatically tracks:

#### 📄 Page Views
- Triggers on `initializePost()`
- Includes referrer and UTM parameters
- Device and browser detection

#### ⏱️ Engagement Time
- Tracks active reading time
- Pauses when page not visible
- Accounts for user interactions

#### 📏 Scroll Depth
- Milestone tracking (25%, 50%, 75%, 100%)
- Intersection Observer for performance
- Maximum scroll depth per session

#### 🔗 CTA Clicks
- Set up via `data-analytics` attributes
- Automatic click listener attachment
- Position and context detection

### Advanced Configuration

#### Custom Event Metadata
```typescript
// Add custom data to all events
analytics.setGlobalMetadata({
  userSegment: 'premium',
  campaignSource: 'email-newsletter',
  abTestGroup: 'variant-b'
});

// Add metadata to specific events
analytics.trackEngagementTime({
  postId: 'post-123',
  engagementTimeSeconds: 120,
  metadata: {
    scrollPosition: 0.75,
    interactionType: 'reading'
  }
});
```

#### Privacy Controls
```typescript
// Respect user privacy preferences
analytics.configure({
  trackingEnabled: !userOptedOut,
  anonymizeData: true,           // Don't send personal identifiers
  respectDoNotTrack: true        // Honor browser DNT header
});

// Manual privacy controls
analytics.pauseTracking();       // Temporarily stop
analytics.resumeTracking();      // Resume tracking
analytics.clearSession();       // Reset session data
```

### HTML Integration

#### Automatic CTA Tracking
```html
<!-- Automatic tracking via data attributes -->
<button 
  data-analytics-cta-id="header-subscribe"
  data-analytics-cta-type="button" 
  data-analytics-cta-text="Subscribe Now"
  data-analytics-cta-position="header"
  data-analytics-destination-url="https://example.com/subscribe"
>
  Subscribe Now
</button>

<!-- Form submission tracking -->
<form 
  data-analytics-cta-id="contact-form"
  data-analytics-cta-type="form"
  data-analytics-conversion-value="25"
>
  <!-- form fields -->
</form>
```

#### Script Loading
```html
<!-- Add to blog post pages -->
<script>
window.analyticsConfig = {
  apiBaseUrl: 'https://ops.yesgoddess.agency',
  postId: '{{ post.id }}',
  userId: '{{ user?.id }}',      // Optional if logged in
  experimentData: {              // Optional A/B test data
    experimentId: '{{ experiment?.id }}',
    variantId: '{{ variant?.id }}'
  }
};
</script>
<script src="https://ops.yesgoddess.agency/js/analytics.js" async></script>
```

### React Hooks Integration

```typescript
// Custom hook for React applications
const usePostAnalytics = (postId: string, userId?: string) => {
  useEffect(() => {
    analytics.initializePost(postId, userId);
    
    return () => {
      analytics.cleanup(); // Clean up on unmount
    };
  }, [postId, userId]);
  
  const trackCta = useCallback((ctaData: TrackCtaClickInput) => {
    analytics.trackCtaClick(ctaData);
  }, []);
  
  return { trackCta };
};

// Usage in component
const BlogPost = ({ post, user }) => {
  const { trackCta } = usePostAnalytics(post.id, user?.id);
  
  return (
    <article>
      <h1>{post.title}</h1>
      <div>{post.content}</div>
      
      <button onClick={() => trackCta({
        ctaId: 'share-twitter',
        ctaType: 'share',
        ctaText: 'Share on Twitter'
      })}>
        Share on Twitter
      </button>
    </article>
  );
};
```

---

## 10. Frontend Implementation Checklist

### 🎯 Phase 1: Basic Analytics Dashboard

#### Analytics Overview Page
- [ ] **Create Analytics Route**
  - [ ] Add `/admin/posts/[id]/analytics` route
  - [ ] Implement route protection (auth required)
  - [ ] Add breadcrumb navigation

- [ ] **Overview Metrics Cards**
  - [ ] Total views with trend indicator
  - [ ] Unique visitors with growth percentage  
  - [ ] Average engagement time (format as MM:SS)
  - [ ] Bounce rate with color coding (green < 40%, yellow 40-60%, red > 60%)
  - [ ] Conversion rate with trend

- [ ] **Time Series Chart**
  - [ ] Line chart for views and unique visitors over time
  - [ ] Date range picker (7d, 30d, 90d, custom)
  - [ ] Granularity selector (hour, day, week)
  - [ ] Export chart data as CSV

- [ ] **Device & Source Breakdown**
  - [ ] Pie chart for device types (desktop, mobile, tablet)
  - [ ] Bar chart for traffic sources (organic, social, direct, etc.)
  - [ ] Top referrers table with links

#### API Integration
- [ ] **Set up tRPC Client**
  - [ ] Configure tRPC with proper base URL
  - [ ] Add authentication headers
  - [ ] Set up React Query with caching

- [ ] **Implement Data Fetching**
  - [ ] `usePostAnalytics` hook for overview data
  - [ ] `usePostTimeSeries` hook for chart data  
  - [ ] `usePostReferrers` hook for traffic analysis
  - [ ] Error boundaries for failed requests

- [ ] **Loading States**
  - [ ] Skeleton loading for metrics cards
  - [ ] Chart loading spinners
  - [ ] Table loading placeholders

### 🎯 Phase 2: Event Tracking Integration

#### Client-Side Tracking Setup
- [ ] **Install Analytics SDK**
  - [ ] Add analytics client to dependencies
  - [ ] Initialize client with configuration
  - [ ] Set up global error handling

- [ ] **Session Management**
  - [ ] Generate UUID v4 session ID
  - [ ] Store session ID in localStorage
  - [ ] Handle session expiry (30 minutes)

- [ ] **Automatic Tracking**
  - [ ] Track page views on blog post load
  - [ ] Set up scroll depth tracking
  - [ ] Implement engagement time measurement
  - [ ] Add page visibility API integration

#### CTA Click Tracking
- [ ] **Manual Tracking**
  - [ ] Create `trackCta` utility function
  - [ ] Add tracking to subscription buttons
  - [ ] Track social share clicks
  - [ ] Track download/form submissions

- [ ] **Automatic Tracking**
  - [ ] Scan for `data-analytics-*` attributes
  - [ ] Attach click listeners automatically
  - [ ] Handle form submission events
  - [ ] Track external link clicks

#### Privacy & Consent
- [ ] **GDPR Compliance**
  - [ ] Cookie consent banner integration
  - [ ] Respect "Do Not Track" headers
  - [ ] Provide opt-out mechanism
  - [ ] Data export/deletion requests

### 🎯 Phase 3: Advanced Analytics Features

#### Referrer Analysis
- [ ] **Traffic Sources Page**
  - [ ] Detailed referrer breakdown table
  - [ ] UTM campaign performance
  - [ ] Organic keyword tracking (if available)
  - [ ] Geographic traffic distribution

- [ ] **Filtering & Sorting**
  - [ ] Date range filters
  - [ ] Source type filters (organic, social, etc.)
  - [ ] Sort by visits, conversion rate, growth
  - [ ] Search/filter referrer domains

#### Post Comparison
- [ ] **Multi-Post Analysis**
  - [ ] Post selector with search
  - [ ] Side-by-side metrics comparison
  - [ ] Comparison chart visualization
  - [ ] Export comparison report

### 🎯 Phase 4: A/B Testing Interface

#### Experiment Management
- [ ] **Experiment Creation**
  - [ ] Create experiment form
  - [ ] Variant configuration UI
  - [ ] Traffic allocation sliders
  - [ ] Success metrics selection

- [ ] **Active Experiment Dashboard**
  - [ ] List of running experiments
  - [ ] Real-time performance indicators
  - [ ] Statistical significance badges
  - [ ] Pause/resume controls

#### Results Analysis
- [ ] **Results Dashboard**
  - [ ] Variant performance comparison
  - [ ] Confidence interval displays
  - [ ] Winner declaration logic
  - [ ] Detailed statistics view

### 🎯 Edge Cases to Handle

#### Error Scenarios
- [ ] **Network Failures**
  - [ ] Offline detection and queuing
  - [ ] Retry logic for failed requests
  - [ ] Graceful degradation for analytics

- [ ] **Data Anomalies**
  - [ ] Handle missing data points
  - [ ] Zero-state illustrations
  - [ ] Large number formatting (1K, 1M, etc.)

- [ ] **Permission Issues**
  - [ ] Post not found handling
  - [ ] Access denied messages
  - [ ] Redirect to appropriate pages

#### Performance Considerations
- [ ] **Large Datasets**
  - [ ] Pagination for large referrer lists
  - [ ] Chart data point limiting
  - [ ] Lazy loading for heavy components

- [ ] **Real-time Updates**
  - [ ] Polling interval management
  - [ ] Background refresh prevention
  - [ ] Smart cache invalidation

### 🎯 UX Considerations

#### Dashboard Design
- [ ] **Visual Hierarchy**
  - [ ] Most important metrics prominently displayed
  - [ ] Clear section separation
  - [ ] Consistent color scheme
  - [ ] Mobile-responsive layout

- [ ] **Interactivity**
  - [ ] Hover states for chart elements
  - [ ] Click-through from metrics to details
  - [ ] Keyboard navigation support
  - [ ] Screen reader compatibility

#### User Guidance
- [ ] **Tooltips & Help**
  - [ ] Metric definition tooltips
  - [ ] Help documentation links
  - [ ] Onboarding tour for first-time users
  - [ ] Empty state guidance

### 🎯 Testing Strategy

#### Unit Tests
- [ ] **Component Testing**
  - [ ] Metrics card rendering
  - [ ] Chart component functionality
  - [ ] Date picker interactions
  - [ ] API hook behavior

#### Integration Tests
- [ ] **API Integration**
  - [ ] tRPC client configuration
  - [ ] Error handling scenarios
  - [ ] Authentication flow
  - [ ] Data transformation logic

#### E2E Tests
- [ ] **User Workflows**
  - [ ] View analytics dashboard
  - [ ] Filter data by date range
  - [ ] Create A/B experiment
  - [ ] Track CTA clicks

### 🎯 Performance Monitoring

#### Client-Side Tracking
- [ ] **Analytics Performance**
  - [ ] Track SDK bundle size impact
  - [ ] Monitor tracking request failures
  - [ ] Measure dashboard load times
  - [ ] Set up error reporting

---

## 🎉 Ready to Build!

This comprehensive guide provides everything needed to implement post analytics in the frontend. The backend is fully implemented and tested, ready for frontend integration.

### 📞 Next Steps

1. **Set up development environment** with tRPC client
2. **Start with Phase 1** (basic dashboard) 
3. **Test thoroughly** with the provided error scenarios
4. **Implement tracking gradually** to avoid overwhelming users
5. **Monitor performance** and user adoption

### 🔗 Additional Resources

- **Backend API Documentation:** `/docs/api` (when available)
- **Database Schema:** See migration files for data structure
- **Example Implementation:** Check `src/modules/analytics/client/` for reference
- **Testing Data:** Use `scripts/generate-blog-analytics-test-data.js` for development

---

*Generated for yg-backend → yesgoddess-web integration*  
*Last Updated: October 16, 2025*
