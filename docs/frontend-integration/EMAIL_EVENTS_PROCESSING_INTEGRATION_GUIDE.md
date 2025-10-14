# Email Events Processing - Frontend Integration Guide

**Classification:** 🔒 ADMIN ONLY  
**Module:** Email Events Processing  
**Last Updated:** October 13, 2025

---

## Overview

This guide provides complete integration documentation for the **Email Events Processing System**, which tracks and monitors email deliverability, engagement, bounces, complaints, and generates alerts when thresholds are exceeded.

### Key Features
- ✅ Real-time webhook event processing from Resend
- ✅ Bounce handling with automatic suppression
- ✅ Spam complaint tracking and immediate blocking
- ✅ Engagement scoring (opens/clicks)
- ✅ Deliverability monitoring with alert system
- ✅ Background job processing with retry logic

### Architecture
```
Resend → Webhook → API Endpoint → Database → Background Worker → Metrics/Alerts
```

---

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [Request/Response Examples](#requestresponse-examples)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Webhooks & Real-time Updates](#webhooks--realtime-updates)
8. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## API Endpoints

> **Note:** This module is primarily **backend-internal**. The webhook endpoint receives events from Resend (external service), and frontend will primarily query metrics and alerts rather than trigger events directly.

### 1. Webhook Receiver (External - Resend)

**Endpoint:** `POST /api/webhooks/resend`  
**Authentication:** Webhook signature verification (HMAC-SHA256)  
**Purpose:** Receives email event notifications from Resend

**Request Headers:**
```typescript
{
  'Content-Type': 'application/json',
  'svix-signature': string, // or 'resend-signature'
}
```

**Request Body:**
```typescript
{
  type: 'email.sent' | 'email.delivered' | 'email.opened' | 'email.clicked' | 'email.bounced' | 'email.complained',
  created_at: string, // ISO 8601 timestamp
  data: {
    email_id: string,
    message_id: string,
    to: string,
    from: string,
    subject: string,
    created_at: string,
    // Event-specific fields
    bounce_type?: 'hard' | 'soft',
    bounce_reason?: string,
    complaint_type?: string,
    user_agent?: string,
    ip_address?: string,
    click?: {
      link: string,
      timestamp: string
    },
    metadata?: {
      userId?: string,
      template?: string,
      campaignId?: string,
      testId?: string
    }
  }
}
```

**Response:**
```typescript
{
  success: boolean,
  message?: string
}
```

**Status Codes:**
- `200` - Event processed successfully
- `401` - Invalid or missing signature
- `500` - Internal processing error

---

### 2. Get Deliverability Metrics (Admin)

> **Note:** This endpoint needs to be created for frontend integration

**Recommended Endpoint:** `GET /api/admin/email/deliverability/metrics`  
**Authentication:** Required (Admin only)  
**Purpose:** Retrieve deliverability metrics for monitoring

**Query Parameters:**
```typescript
{
  period?: 'hour' | 'day' | 'week', // Default: 'hour'
  startDate?: string, // ISO 8601
  endDate?: string    // ISO 8601
}
```

**Response:**
```typescript
{
  period: 'hour' | 'day' | 'week',
  startTime: string, // ISO 8601
  endTime: string,   // ISO 8601
  totalSent: number,
  totalDelivered: number,
  totalBounced: number,
  totalFailed: number,
  totalComplained: number,
  deliveryRate: number,    // 0.0 to 1.0
  bounceRate: number,      // 0.0 to 1.0
  complaintRate: number,   // 0.0 to 1.0
  failureRate: number,     // 0.0 to 1.0
  bouncesByType: {
    hard: number,
    soft: number,
    unknown: number
  }
}
```

---

### 3. Get Deliverability Alerts (Admin)

> **Note:** This endpoint needs to be created

**Recommended Endpoint:** `GET /api/admin/email/deliverability/alerts`  
**Authentication:** Required (Admin only)  
**Purpose:** Retrieve active and historical alerts

**Query Parameters:**
```typescript
{
  severity?: 'info' | 'warning' | 'critical' | 'urgent',
  acknowledged?: boolean,
  limit?: number,     // Default: 50
  offset?: number     // Default: 0
}
```

**Response:**
```typescript
{
  alerts: Array<{
    id: string,
    severity: 'info' | 'warning' | 'critical' | 'urgent',
    type: 'delivery_rate' | 'bounce_rate' | 'complaint_rate' | 'failure_spike' | 'reputation',
    metric: string,
    currentValue: number,
    threshold: number,
    period: string,
    message: string,
    recommendation: string,
    affectedEmails?: number,
    triggeredAt: string, // ISO 8601
    acknowledged: boolean,
    acknowledgedAt?: string,
    acknowledgedBy?: string
  }>,
  total: number,
  limit: number,
  offset: number
}
```

---

### 4. Acknowledge Alert (Admin)

> **Note:** This endpoint needs to be created

**Recommended Endpoint:** `POST /api/admin/email/deliverability/alerts/:alertId/acknowledge`  
**Authentication:** Required (Admin only)  
**Purpose:** Mark an alert as acknowledged

**Request Body:**
```typescript
{
  notes?: string
}
```

**Response:**
```typescript
{
  success: boolean,
  alert: {
    id: string,
    acknowledged: boolean,
    acknowledgedAt: string,
    acknowledgedBy: string
  }
}
```

---

### 5. Get Engagement Scores (Admin)

> **Note:** This endpoint needs to be created

**Recommended Endpoint:** `GET /api/admin/email/engagement/scores`  
**Authentication:** Required (Admin only)  
**Purpose:** Retrieve engagement scores for email recipients

**Query Parameters:**
```typescript
{
  email?: string,      // Filter by specific email
  segment?: 'highly-engaged' | 'moderately-engaged' | 'low-engagement' | 'disengaged',
  minScore?: number,   // 0-100
  maxScore?: number,   // 0-100
  limit?: number,      // Default: 50
  offset?: number      // Default: 0
}
```

**Response:**
```typescript
{
  scores: Array<{
    email: string,
    userId?: string,
    score: number,           // 0-100
    segment: 'highly-engaged' | 'moderately-engaged' | 'low-engagement' | 'disengaged',
    totalEmailsSent: number,
    totalOpens: number,
    totalClicks: number,
    uniqueOpens: number,
    lastEngagedAt?: string,  // ISO 8601
    daysSinceLastEngagement?: number,
    calculatedAt: string     // ISO 8601
  }>,
  total: number,
  limit: number,
  offset: number
}
```

---

### 6. Get Suppression List (Admin)

> **Note:** This endpoint needs to be created

**Recommended Endpoint:** `GET /api/admin/email/suppression`  
**Authentication:** Required (Admin only)  
**Purpose:** Retrieve suppressed email addresses

**Query Parameters:**
```typescript
{
  reason?: 'BOUNCE' | 'COMPLAINT' | 'UNSUBSCRIBE' | 'MANUAL',
  bounceType?: 'hard' | 'soft',
  search?: string,     // Search by email
  limit?: number,      // Default: 50
  offset?: number      // Default: 0
}
```

**Response:**
```typescript
{
  suppressions: Array<{
    id: string,
    email: string,
    reason: 'BOUNCE' | 'COMPLAINT' | 'UNSUBSCRIBE' | 'MANUAL',
    suppressedAt: string,    // ISO 8601
    bounceType?: 'hard' | 'soft',
    bounceReason?: string
  }>,
  total: number,
  limit: number,
  offset: number
}
```

---

### 7. Remove from Suppression List (Admin)

> **Note:** This endpoint needs to be created

**Recommended Endpoint:** `DELETE /api/admin/email/suppression/:email`  
**Authentication:** Required (Admin only)  
**Purpose:** Remove an email from suppression list

**Response:**
```typescript
{
  success: boolean,
  message: string
}
```

---

### 8. Get Deliverability Trend (Admin)

> **Note:** This endpoint needs to be created

**Recommended Endpoint:** `GET /api/admin/email/deliverability/trend`  
**Authentication:** Required (Admin only)  
**Purpose:** Get historical deliverability trend

**Query Parameters:**
```typescript
{
  days?: number  // Default: 7, Max: 90
}
```

**Response:**
```typescript
{
  trend: Array<{
    date: string,           // YYYY-MM-DD
    deliveryRate: number,   // 0.0 to 1.0
    bounceRate: number,     // 0.0 to 1.0
    complaintRate: number   // 0.0 to 1.0
  }>
}
```

---

## Request/Response Examples

### Example 1: Query Current Deliverability Metrics

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/admin/email/deliverability/metrics?period=day' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

**Response (200 OK):**
```json
{
  "period": "day",
  "startTime": "2025-10-12T00:00:00.000Z",
  "endTime": "2025-10-13T00:00:00.000Z",
  "totalSent": 15432,
  "totalDelivered": 14897,
  "totalBounced": 412,
  "totalFailed": 98,
  "totalComplained": 25,
  "deliveryRate": 0.9653,
  "bounceRate": 0.0267,
  "complaintRate": 0.0016,
  "failureRate": 0.0063,
  "bouncesByType": {
    "hard": 301,
    "soft": 98,
    "unknown": 13
  }
}
```

---

### Example 2: Retrieve Active Alerts

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/admin/email/deliverability/alerts?acknowledged=false&severity=critical' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

**Response (200 OK):**
```json
{
  "alerts": [
    {
      "id": "bounce-rate-hour-1728839400000",
      "severity": "critical",
      "type": "bounce_rate",
      "metric": "bounce_rate",
      "currentValue": 0.0632,
      "threshold": 0.05,
      "period": "hour",
      "message": "Critical bounce rate: 6.32% (threshold: 5%)",
      "recommendation": "URGENT: Pause all sending immediately. Clean email list, remove hard bounces, and implement email validation.",
      "affectedEmails": 412,
      "triggeredAt": "2025-10-13T14:30:00.000Z",
      "acknowledged": false
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

### Example 3: Acknowledge an Alert

**Request:**
```bash
curl -X POST 'https://ops.yesgoddess.agency/api/admin/email/deliverability/alerts/bounce-rate-hour-1728839400000/acknowledge' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "notes": "Investigated - caused by old imported list. List cleaned and re-validated."
  }'
```

**Response (200 OK):**
```json
{
  "success": true,
  "alert": {
    "id": "bounce-rate-hour-1728839400000",
    "acknowledged": true,
    "acknowledgedAt": "2025-10-13T15:45:00.000Z",
    "acknowledgedBy": "admin@yesgoddess.agency"
  }
}
```

---

### Example 4: Get Engagement Scores

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/admin/email/engagement/scores?segment=highly-engaged&limit=10' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

**Response (200 OK):**
```json
{
  "scores": [
    {
      "email": "active.user@example.com",
      "userId": "cltx1234567890abc",
      "score": 92,
      "segment": "highly-engaged",
      "totalEmailsSent": 45,
      "totalOpens": 38,
      "totalClicks": 23,
      "uniqueOpens": 35,
      "lastEngagedAt": "2025-10-13T10:30:00.000Z",
      "daysSinceLastEngagement": 0,
      "calculatedAt": "2025-10-13T12:00:00.000Z"
    }
  ],
  "total": 1247,
  "limit": 10,
  "offset": 0
}
```

---

### Example 5: View Suppression List

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/admin/email/suppression?reason=BOUNCE&bounceType=hard&limit=5' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

**Response (200 OK):**
```json
{
  "suppressions": [
    {
      "id": "clty9876543210xyz",
      "email": "invalid@nonexistent-domain.com",
      "reason": "BOUNCE",
      "suppressedAt": "2025-10-13T08:15:00.000Z",
      "bounceType": "hard",
      "bounceReason": "Mailbox does not exist (550 5.1.1)"
    },
    {
      "id": "clty9876543211abc",
      "email": "old-account@example.com",
      "reason": "BOUNCE",
      "suppressedAt": "2025-10-13T09:22:00.000Z",
      "bounceType": "hard",
      "bounceReason": "Domain not found (550 5.4.1)"
    }
  ],
  "total": 1823,
  "limit": 5,
  "offset": 0
}
```

---

### Example 6: Get Deliverability Trend

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/admin/email/deliverability/trend?days=7' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

**Response (200 OK):**
```json
{
  "trend": [
    {
      "date": "2025-10-07",
      "deliveryRate": 0.9712,
      "bounceRate": 0.0198,
      "complaintRate": 0.0009
    },
    {
      "date": "2025-10-08",
      "deliveryRate": 0.9689,
      "bounceRate": 0.0223,
      "complaintRate": 0.0012
    },
    {
      "date": "2025-10-09",
      "deliveryRate": 0.9701,
      "bounceRate": 0.0211,
      "complaintRate": 0.0008
    }
  ]
}
```

---

### Error Response Examples

#### 401 Unauthorized (Invalid/Missing Token)
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing authentication token"
}
```

#### 403 Forbidden (Insufficient Permissions)
```json
{
  "error": "Forbidden",
  "message": "Admin access required"
}
```

#### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Alert not found"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "Failed to fetch deliverability metrics",
  "details": "Database connection timeout"
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * Email event types tracked in the system
 */
export enum EmailEventType {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  CLICKED = 'CLICKED',
  BOUNCED = 'BOUNCED',
  COMPLAINED = 'COMPLAINED',
  FAILED = 'FAILED'
}

/**
 * Reasons for suppressing an email address
 */
export enum SuppressionReason {
  BOUNCE = 'BOUNCE',
  COMPLAINT = 'COMPLAINT',
  UNSUBSCRIBE = 'UNSUBSCRIBE',
  MANUAL = 'MANUAL'
}

/**
 * Bounce type classification
 */
export type BounceType = 'hard' | 'soft';

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'critical' | 'urgent';

/**
 * Alert types
 */
export type AlertType = 
  | 'delivery_rate' 
  | 'bounce_rate' 
  | 'complaint_rate' 
  | 'failure_spike' 
  | 'reputation';

/**
 * Engagement segments
 */
export type EngagementSegment = 
  | 'highly-engaged'    // Score: 80-100
  | 'moderately-engaged' // Score: 40-79
  | 'low-engagement'    // Score: 10-39
  | 'disengaged';       // Score: 0-9

/**
 * Time period for metrics
 */
export type MetricsPeriod = 'hour' | 'day' | 'week';
```

---

### Interface Definitions

```typescript
/**
 * Email event record
 */
export interface EmailEvent {
  id: string;
  userId?: string;
  email: string;
  eventType: EmailEventType;
  messageId: string;
  subject?: string;
  templateName?: string;
  metadata?: Record<string, any>;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  bouncedAt?: Date;
  complainedAt?: Date;
  bounceReason?: string;
  clickedUrl?: string;
  userAgent?: string;
  ipAddress?: string;
  uniqueOpen?: boolean;
  linkPosition?: number;
  geographicData?: Record<string, any>;
  deviceType?: string;
  emailClient?: string;
  createdAt: Date;
}

/**
 * Email suppression record
 */
export interface EmailSuppression {
  id: string;
  email: string;
  reason: SuppressionReason;
  suppressedAt: Date;
  bounceType?: BounceType;
  bounceReason?: string;
}

/**
 * Deliverability metrics
 */
export interface DeliverabilityMetrics {
  period: MetricsPeriod;
  startTime: Date;
  endTime: Date;
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalFailed: number;
  totalComplained: number;
  deliveryRate: number;      // 0.0 to 1.0
  bounceRate: number;        // 0.0 to 1.0
  complaintRate: number;     // 0.0 to 1.0
  failureRate: number;       // 0.0 to 1.0
  bouncesByType?: {
    hard: number;
    soft: number;
    unknown: number;
  };
}

/**
 * Deliverability alert
 */
export interface DeliverabilityAlert {
  id: string;
  severity: AlertSeverity;
  type: AlertType;
  metric: string;
  currentValue: number;
  threshold: number;
  period: string;
  message: string;
  recommendation: string;
  affectedEmails?: number;
  triggeredAt: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

/**
 * Engagement score for an email recipient
 */
export interface EngagementScore {
  email: string;
  userId?: string;
  score: number;             // 0-100
  segment: EngagementSegment;
  totalEmailsSent: number;
  totalOpens: number;
  totalClicks: number;
  uniqueOpens: number;
  lastEngagedAt?: Date;
  daysSinceLastEngagement?: number;
  calculatedAt: Date;
}

/**
 * Deliverability trend data point
 */
export interface DeliverabilityTrendPoint {
  date: string;              // YYYY-MM-DD
  deliveryRate: number;      // 0.0 to 1.0
  bounceRate: number;        // 0.0 to 1.0
  complaintRate: number;     // 0.0 to 1.0
}

/**
 * Domain-level deliverability metrics
 */
export interface DomainDeliverability {
  domain: string;
  totalSent: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
  issues: string[];
}
```

---

### API Response Types

```typescript
/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Standard success response
 */
export interface SuccessResponse {
  success: boolean;
  message?: string;
}

/**
 * Standard error response
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: string;
  code?: string;
}

/**
 * GET /api/admin/email/deliverability/metrics response
 */
export type DeliverabilityMetricsResponse = DeliverabilityMetrics;

/**
 * GET /api/admin/email/deliverability/alerts response
 */
export type AlertsResponse = PaginatedResponse<DeliverabilityAlert>;

/**
 * POST /api/admin/email/deliverability/alerts/:id/acknowledge response
 */
export interface AcknowledgeAlertResponse extends SuccessResponse {
  alert: Pick<DeliverabilityAlert, 'id' | 'acknowledged' | 'acknowledgedAt' | 'acknowledgedBy'>;
}

/**
 * GET /api/admin/email/engagement/scores response
 */
export type EngagementScoresResponse = PaginatedResponse<EngagementScore>;

/**
 * GET /api/admin/email/suppression response
 */
export type SuppressionListResponse = PaginatedResponse<EmailSuppression>;

/**
 * GET /api/admin/email/deliverability/trend response
 */
export interface DeliverabilityTrendResponse {
  trend: DeliverabilityTrendPoint[];
}
```

---

### Zod Validation Schemas

```typescript
import { z } from 'zod';

/**
 * Query params for deliverability metrics endpoint
 */
export const deliverabilityMetricsQuerySchema = z.object({
  period: z.enum(['hour', 'day', 'week']).optional().default('hour'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Query params for alerts endpoint
 */
export const alertsQuerySchema = z.object({
  severity: z.enum(['info', 'warning', 'critical', 'urgent']).optional(),
  acknowledged: z.string().transform(val => val === 'true').optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional().default('50'),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional().default('0'),
});

/**
 * Request body for acknowledging alert
 */
export const acknowledgeAlertSchema = z.object({
  notes: z.string().max(500).optional(),
});

/**
 * Query params for engagement scores endpoint
 */
export const engagementScoresQuerySchema = z.object({
  email: z.string().email().optional(),
  segment: z.enum(['highly-engaged', 'moderately-engaged', 'low-engagement', 'disengaged']).optional(),
  minScore: z.string().transform(Number).pipe(z.number().min(0).max(100)).optional(),
  maxScore: z.string().transform(Number).pipe(z.number().min(0).max(100)).optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional().default('50'),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional().default('0'),
});

/**
 * Query params for suppression list endpoint
 */
export const suppressionListQuerySchema = z.object({
  reason: z.enum(['BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE', 'MANUAL']).optional(),
  bounceType: z.enum(['hard', 'soft']).optional(),
  search: z.string().max(255).optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional().default('50'),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional().default('0'),
});

/**
 * Query params for deliverability trend endpoint
 */
export const deliverabilityTrendQuerySchema = z.object({
  days: z.string().transform(Number).pipe(z.number().min(1).max(90)).optional().default('7'),
});
```

---

## Business Logic & Validation Rules

### Alert Thresholds

| Metric | Warning Threshold | Critical Threshold | Urgent Threshold |
|--------|------------------|-------------------|------------------|
| **Delivery Rate** | < 95% | < 90% | N/A |
| **Bounce Rate** | > 2% | > 5% | N/A |
| **Complaint Rate** | > 0.1% | > 0.3% | > 0.5% |
| **Failure Spike** | N/A | > 100 failures/hour | N/A |

### Alert Suppression

- **Suppression Window:** 4 hours
- **Purpose:** Prevent notification fatigue by not re-alerting for the same issue within 4 hours
- **Implementation:** Alerts of the same type+period are suppressed in Redis cache

### Bounce Handling Rules

#### Hard Bounces
- **Definition:** Permanent delivery failures (invalid address, domain doesn't exist)
- **Action:** Immediate suppression on first occurrence
- **SMTP Codes:** 5.1.1 (user unknown), 5.4.1 (no answer from host)
- **Keywords:** "permanent", "invalid", "does not exist", "user unknown", "address rejected"

#### Soft Bounces
- **Definition:** Temporary delivery failures (mailbox full, server down, timeout)
- **Action:** Suppress after 3 soft bounces within 30 days
- **SMTP Codes:** 4.x.x series
- **Keywords:** "temporary", "mailbox full", "server down", "timeout", "try again"

#### Technical Bounces
- **Definition:** Content or technical issues (message too large, content rejected)
- **Action:** Log for monitoring, do not suppress
- **Keywords:** "too large", "content rejected", "message blocked"

### Complaint (Spam Report) Handling

- **Action:** Immediate suppression on first complaint
- **Alert Trigger:** Complaint rate > 0.1% (warning), > 0.3% (critical)
- **Industry Standard:** Keep complaint rate below 0.1%
- **Compliance:** CAN-SPAM Act, GDPR requirements

### Engagement Scoring Algorithm

```typescript
// Base formula
score = (opens * 5 + clicks * 15) * recencyMultiplier

// Recency multiplier (decays over 180 days)
recencyMultiplier = Math.max(0, 1 - (daysSinceLastEngagement / 180))

// Segment classification
if (score >= 80) segment = 'highly-engaged'
else if (score >= 40) segment = 'moderately-engaged'
else if (score >= 10) segment = 'low-engagement'
else segment = 'disengaged'
```

**Weights:**
- Open: +5 points
- Click: +15 points
- Recency: Decays linearly over 180 days

**Segments:**
- **Highly Engaged:** 80-100 (target for promotional emails)
- **Moderately Engaged:** 40-79 (normal send frequency)
- **Low Engagement:** 10-39 (reduce frequency, re-engagement campaigns)
- **Disengaged:** 0-9 (exclude from promotional emails, win-back campaign)

### Unique Open Tracking

- First open for a given `messageId` is marked as `uniqueOpen: true`
- Subsequent opens for the same `messageId` are marked as `uniqueOpen: false`
- Used to calculate accurate open rates

### Event Processing Order

1. **Webhook Receipt** → Signature verification → Store event → Enqueue for background processing
2. **Background Processing** → Type-specific handler → Update metrics → Generate alerts if needed
3. **Alert Creation** → Store in Redis → Send admin notifications → Apply suppression

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | When to Show |
|------|---------|--------------|
| `200` | Success | Operation completed successfully |
| `400` | Bad Request | Invalid query parameters or request body |
| `401` | Unauthorized | Missing or invalid authentication token |
| `403` | Forbidden | User lacks required permissions (admin access) |
| `404` | Not Found | Resource (alert, suppression entry) not found |
| `422` | Unprocessable Entity | Validation failed (use Zod error details) |
| `500` | Internal Server Error | Server-side error (log for debugging) |
| `503` | Service Unavailable | Database or Redis unavailable |

### Error Response Format

```typescript
{
  error: string,        // Machine-readable error code
  message: string,      // Human-readable error message
  details?: string,     // Additional context (optional)
  code?: string         // Application-specific error code (optional)
}
```

### Error Scenarios

#### 1. Invalid Authentication Token
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing authentication token",
  "code": "AUTH_TOKEN_INVALID"
}
```
**Action:** Redirect user to login page

#### 2. Insufficient Permissions
```json
{
  "error": "Forbidden",
  "message": "Admin access required to view deliverability metrics",
  "code": "INSUFFICIENT_PERMISSIONS"
}
```
**Action:** Show "Access Denied" message

#### 3. Validation Error
```json
{
  "error": "Bad Request",
  "message": "Invalid query parameters",
  "details": "period must be one of: hour, day, week",
  "code": "VALIDATION_ERROR"
}
```
**Action:** Highlight invalid form fields

#### 4. Resource Not Found
```json
{
  "error": "Not Found",
  "message": "Alert with ID 'bounce-rate-xyz' not found",
  "code": "ALERT_NOT_FOUND"
}
```
**Action:** Show "Resource not found" message

#### 5. Database Error
```json
{
  "error": "Internal Server Error",
  "message": "Failed to fetch deliverability metrics",
  "details": "Database connection timeout",
  "code": "DATABASE_ERROR"
}
```
**Action:** Show generic error message, retry after delay

### Client-Side Error Handling

```typescript
import { toast } from '@/components/ui/use-toast';

async function fetchDeliverabilityMetrics(period: MetricsPeriod) {
  try {
    const response = await fetch(
      `/api/admin/email/deliverability/metrics?period=${period}`,
      {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      
      switch (response.status) {
        case 401:
          // Redirect to login
          window.location.href = '/login';
          break;
        case 403:
          toast({
            title: 'Access Denied',
            description: error.message,
            variant: 'destructive',
          });
          break;
        case 404:
          toast({
            title: 'Not Found',
            description: error.message,
            variant: 'destructive',
          });
          break;
        case 500:
        case 503:
          toast({
            title: 'Server Error',
            description: 'Please try again later',
            variant: 'destructive',
          });
          break;
        default:
          toast({
            title: 'Error',
            description: error.message || 'An unexpected error occurred',
            variant: 'destructive',
          });
      }
      
      throw new Error(error.message);
    }

    const data: DeliverabilityMetricsResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch deliverability metrics:', error);
    throw error;
  }
}
```

---

## Authorization & Permissions

### Role Requirements

| Endpoint | Required Role | Notes |
|----------|--------------|-------|
| `POST /api/webhooks/resend` | None (webhook signature) | External Resend service |
| `GET /api/admin/email/deliverability/metrics` | **ADMIN** | View-only access |
| `GET /api/admin/email/deliverability/alerts` | **ADMIN** | View-only access |
| `POST /api/admin/email/deliverability/alerts/:id/acknowledge` | **ADMIN** | Modify access |
| `GET /api/admin/email/engagement/scores` | **ADMIN** | View-only access |
| `GET /api/admin/email/suppression` | **ADMIN** | View-only access |
| `DELETE /api/admin/email/suppression/:email` | **ADMIN** | Modify access |
| `GET /api/admin/email/deliverability/trend` | **ADMIN** | View-only access |

### User Roles (from Database Schema)

```typescript
enum UserRole {
  ADMIN = 'ADMIN',         // Full system access
  STAFF = 'STAFF',         // Limited admin access
  CREATOR = 'CREATOR',     // Content creator access
  BRAND = 'BRAND',         // Brand portal access
  VIEWER = 'VIEWER'        // Read-only access
}
```

**Email Events Processing Access:** ADMIN only

### Authorization Check (Middleware)

```typescript
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function requireAdmin(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Admin access required' },
      { status: 403 }
    );
  }

  return null; // Authorized
}
```

### Frontend Auth Guard

```typescript
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function useRequireAdmin() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/login');
      return;
    }

    if (session.user.role !== 'ADMIN') {
      router.push('/dashboard');
      return;
    }
  }, [session, status, router]);

  return { isAdmin: session?.user.role === 'ADMIN', session, status };
}
```

---

## Webhooks & Real-time Updates

### Webhook Event Flow

```
┌─────────┐        ┌──────────┐       ┌──────────┐       ┌─────────────┐
│ Resend  │───────>│ Webhook  │──────>│ Database │──────>│ Background  │
│ Service │ HTTPS  │ Endpoint │ Store │          │ Queue │   Worker    │
└─────────┘        └──────────┘       └──────────┘       └─────────────┘
                         │                                       │
                         │ Signature Verification                │
                         │ (HMAC-SHA256)                         │
                         │                                       v
                         │                              ┌────────────────┐
                         │                              │ Process Event  │
                         │                              │ - Bounces      │
                         │                              │ - Complaints   │
                         │                              │ - Engagement   │
                         │                              │ - Metrics      │
                         │                              │ - Alerts       │
                         │                              └────────────────┘
                         │                                       │
                         v                                       v
                  ┌─────────────┐                       ┌──────────────┐
                  │ Return 200  │                       │ Redis Cache  │
                  │ (Fast ACK)  │                       │ & Admin      │
                  └─────────────┘                       │ Notifications│
                                                        └──────────────┘
```

### Webhook Signature Verification

Resend uses **HMAC-SHA256** for webhook signature verification:

```typescript
import crypto from 'crypto';

export function verifyResendWebhook(
  signature: string,
  payload: any
): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;

  const payloadString = JSON.stringify(payload);
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### Supported Webhook Events

| Resend Event | Internal Event Type | Description |
|--------------|---------------------|-------------|
| `email.sent` | `SENT` | Email accepted by Resend for sending |
| `email.delivered` | `DELIVERED` | Email successfully delivered to inbox |
| `email.opened` | `OPENED` | Recipient opened the email |
| `email.clicked` | `CLICKED` | Recipient clicked a link in email |
| `email.bounced` | `BOUNCED` | Email bounced (hard or soft) |
| `email.complained` | `COMPLAINED` | Recipient marked email as spam |
| `email.delivery_delayed` | `SENT` | Delivery delayed, tracked as sent |

### Real-time UI Updates (Polling Recommendation)

Since this is an admin-only backend system without WebSocket infrastructure, use **polling** for real-time updates:

```typescript
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export function useDeliverabilityMetrics(period: MetricsPeriod = 'hour') {
  return useQuery({
    queryKey: ['deliverability-metrics', period],
    queryFn: () => fetchDeliverabilityMetrics(period),
    refetchInterval: 60000, // Poll every 60 seconds
    refetchOnWindowFocus: true,
  });
}

export function useActiveAlerts() {
  return useQuery({
    queryKey: ['deliverability-alerts', 'active'],
    queryFn: () => fetchAlerts({ acknowledged: false }),
    refetchInterval: 30000, // Poll every 30 seconds for alerts
    refetchOnWindowFocus: true,
  });
}
```

**Polling Intervals:**
- **Metrics:** 60 seconds (low-priority, historical data)
- **Active Alerts:** 30 seconds (higher-priority, requires attention)
- **Engagement Scores:** 5 minutes (computed data, low update frequency)

---

## Frontend Implementation Checklist

### 1. Setup & Authentication

- [ ] Install required dependencies (`@tanstack/react-query`, `zod`, `date-fns`)
- [ ] Create API client module (`/lib/api/email-events.ts`)
- [ ] Implement authentication middleware
- [ ] Create `useRequireAdmin()` hook for route protection
- [ ] Add TypeScript types from this guide to `/types/email-events.ts`

### 2. API Integration Layer

- [ ] Create React Query hooks for all endpoints:
  - [ ] `useDeliverabilityMetrics(period)`
  - [ ] `useDeliverabilityAlerts(filters)`
  - [ ] `useAcknowledgeAlert()`
  - [ ] `useEngagementScores(filters)`
  - [ ] `useSuppressionList(filters)`
  - [ ] `useRemoveFromSuppression()`
  - [ ] `useDeliverabilityTrend(days)`
- [ ] Implement error handling for each hook
- [ ] Add request/response caching with React Query
- [ ] Implement optimistic updates for mutations

### 3. UI Components

#### Deliverability Dashboard
- [ ] Create `/app/admin/email/deliverability/page.tsx`
- [ ] Display current metrics (delivery rate, bounce rate, complaint rate)
- [ ] Show color-coded status indicators (green/yellow/red)
- [ ] Add period selector (hour/day/week)
- [ ] Display bounce breakdown (hard/soft/unknown)
- [ ] Show trend chart (line graph)

#### Alerts Management
- [ ] Create alerts list component
- [ ] Group alerts by severity (urgent/critical/warning/info)
- [ ] Display alert details (message, recommendation, affected emails)
- [ ] Add "Acknowledge" button with notes input
- [ ] Filter alerts by severity and acknowledgment status
- [ ] Sort alerts by triggered date (newest first)

#### Engagement Scores View
- [ ] Create engagement scores table
- [ ] Display score, segment, and engagement metrics
- [ ] Add segment filter dropdown
- [ ] Show last engaged date
- [ ] Add search by email
- [ ] Export to CSV functionality

#### Suppression List Management
- [ ] Create suppression list table
- [ ] Filter by reason (BOUNCE/COMPLAINT/UNSUBSCRIBE/MANUAL)
- [ ] Filter by bounce type (hard/soft)
- [ ] Search by email address
- [ ] Add "Remove from Suppression" action (with confirmation)
- [ ] Display suppression date and reason

### 4. Data Visualization

- [ ] Install chart library (`recharts` or `chart.js`)
- [ ] Create deliverability trend line chart (7-30 days)
- [ ] Create bounce rate bar chart (by type)
- [ ] Create engagement distribution donut chart (by segment)
- [ ] Add interactive tooltips to charts
- [ ] Make charts responsive

### 5. Forms & Validation

- [ ] Create alert acknowledgment form with Zod validation
- [ ] Add form error display
- [ ] Implement client-side validation before submission
- [ ] Add loading states for form submissions

### 6. Error Handling & UX

- [ ] Create error boundary for email events section
- [ ] Add toast notifications for actions (acknowledge, remove suppression)
- [ ] Display loading skeletons while fetching data
- [ ] Show empty states (no alerts, no data)
- [ ] Add retry buttons for failed requests
- [ ] Implement error recovery flows

### 7. Real-time Updates

- [ ] Configure React Query polling intervals:
  - [ ] Metrics: 60 seconds
  - [ ] Alerts: 30 seconds
  - [ ] Engagement scores: 5 minutes
- [ ] Add manual refresh button
- [ ] Display "Last updated" timestamp
- [ ] Show loading indicator during background refetch

### 8. Performance Optimization

- [ ] Implement pagination for large lists (alerts, scores, suppressions)
- [ ] Use `useInfiniteQuery` for infinite scroll
- [ ] Debounce search inputs (300ms)
- [ ] Lazy load chart components
- [ ] Memoize expensive calculations

### 9. Testing

- [ ] Write unit tests for API client functions
- [ ] Test React Query hooks with mock data
- [ ] Test error handling scenarios
- [ ] Test authentication guards
- [ ] Write integration tests for key workflows

### 10. Documentation & Deployment

- [ ] Document component props and usage
- [ ] Add JSDoc comments to API functions
- [ ] Create admin user guide for email deliverability
- [ ] Set up monitoring for frontend errors
- [ ] Deploy to staging for testing
- [ ] Perform UAT with admin users

---

## Edge Cases to Handle

### 1. No Data Available
- **Scenario:** New system with no email events yet
- **Handling:** Show empty state with explanatory text

### 2. Extreme Alert Volume
- **Scenario:** System generates many alerts in short time
- **Handling:** Alert suppression (4 hours), pagination, severity filtering

### 3. Timezone Handling
- **Scenario:** Dates/times in different timezones
- **Handling:** Convert all timestamps to user's local timezone, display UTC in tooltips

### 4. Stale Authentication Token
- **Scenario:** JWT expires during session
- **Handling:** Implement token refresh, redirect to login on 401

### 5. Partial Data Load Failure
- **Scenario:** One API call succeeds, another fails
- **Handling:** Show partial data with error notice, retry failed request

### 6. Long-Running Queries
- **Scenario:** Large date range queries take time
- **Handling:** Show loading skeleton, implement query timeout, suggest narrower range

### 7. Concurrent Modifications
- **Scenario:** Multiple admins acknowledge same alert
- **Handling:** Optimistic updates, handle 404 gracefully

### 8. Mobile Responsiveness
- **Scenario:** Admin views dashboard on mobile
- **Handling:** Stack metrics vertically, simplify charts, collapsible tables

---

## UX Considerations

### Visual Design

#### Alert Severity Colors
- **Urgent:** Red (`bg-red-50 border-red-500 text-red-900`)
- **Critical:** Orange (`bg-orange-50 border-orange-500 text-orange-900`)
- **Warning:** Yellow (`bg-yellow-50 border-yellow-500 text-yellow-900`)
- **Info:** Blue (`bg-blue-50 border-blue-500 text-blue-900`)

#### Metric Status Colors
- **Good:** Green (delivery rate > 95%, bounce rate < 2%, complaint rate < 0.1%)
- **Warning:** Yellow (delivery rate 90-95%, bounce rate 2-5%, complaint rate 0.1-0.3%)
- **Critical:** Red (delivery rate < 90%, bounce rate > 5%, complaint rate > 0.3%)

#### Engagement Segment Colors
- **Highly Engaged:** Green
- **Moderately Engaged:** Blue
- **Low Engagement:** Yellow
- **Disengaged:** Red

### Micro-interactions

- [ ] Smooth transitions when switching between periods
- [ ] Hover effects on table rows
- [ ] Animated counters for metrics
- [ ] Expand/collapse for alert details
- [ ] Confirmation modals for destructive actions
- [ ] Success animations after acknowledgment

### Accessibility

- [ ] ARIA labels for charts and graphs
- [ ] Keyboard navigation for tables
- [ ] Focus indicators on interactive elements
- [ ] Screen reader-friendly alert messages
- [ ] High contrast mode support
- [ ] Proper heading hierarchy (h1 → h2 → h3)

---

## Example React Query Implementation

```typescript
// /lib/api/email-events.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  DeliverabilityMetrics,
  DeliverabilityAlert,
  EngagementScore,
  EmailSuppression,
  DeliverabilityTrendPoint,
  MetricsPeriod,
  AlertSeverity,
  SuppressionReason,
} from '@/types/email-events';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Fetch deliverability metrics
 */
export function useDeliverabilityMetrics(period: MetricsPeriod = 'hour') {
  return useQuery({
    queryKey: ['deliverability-metrics', period],
    queryFn: async (): Promise<DeliverabilityMetrics> => {
      const response = await fetch(
        `${API_BASE}/api/admin/email/deliverability/metrics?period=${period}`,
        {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch deliverability metrics');
      }

      return response.json();
    },
    refetchInterval: 60000, // Poll every 60 seconds
    staleTime: 30000,       // Consider data stale after 30 seconds
  });
}

/**
 * Fetch active alerts
 */
export function useActiveAlerts() {
  return useQuery({
    queryKey: ['deliverability-alerts', 'active'],
    queryFn: async (): Promise<DeliverabilityAlert[]> => {
      const response = await fetch(
        `${API_BASE}/api/admin/email/deliverability/alerts?acknowledged=false&limit=100`,
        {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch alerts');
      }

      const data = await response.json();
      return data.alerts;
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });
}

/**
 * Acknowledge an alert
 */
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ alertId, notes }: { alertId: string; notes?: string }) => {
      const response = await fetch(
        `${API_BASE}/api/admin/email/deliverability/alerts/${alertId}/acknowledge`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ notes }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to acknowledge alert');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate alerts query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['deliverability-alerts'] });
    },
  });
}

/**
 * Fetch deliverability trend
 */
export function useDeliverabilityTrend(days: number = 7) {
  return useQuery({
    queryKey: ['deliverability-trend', days],
    queryFn: async (): Promise<DeliverabilityTrendPoint[]> => {
      const response = await fetch(
        `${API_BASE}/api/admin/email/deliverability/trend?days=${days}`,
        {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch deliverability trend');
      }

      const data = await response.json();
      return data.trend;
    },
    staleTime: 300000, // 5 minutes
  });
}

// Helper function to get auth token
function getAuthToken(): string {
  // Implement your auth token retrieval logic
  // Example: return localStorage.getItem('authToken') || '';
  return '';
}
```

---

## Summary

This guide provides everything needed to integrate the Email Events Processing system into the frontend:

✅ **API Endpoints** - Complete endpoint specifications with query params, request/response formats  
✅ **TypeScript Types** - Full type definitions and Zod schemas for validation  
✅ **Business Logic** - Alert thresholds, bounce handling rules, engagement scoring algorithm  
✅ **Error Handling** - HTTP status codes, error response format, client-side error handling  
✅ **Authorization** - Role requirements, middleware examples, frontend auth guards  
✅ **Webhooks** - Event flow, signature verification, supported events  
✅ **Implementation Checklist** - Step-by-step tasks for building the UI  
✅ **Code Examples** - React Query hooks, error handling, API client implementation  
✅ **UX Guidelines** - Color schemes, micro-interactions, accessibility requirements  

### Next Steps for Frontend Team

1. Review this guide and ask clarification questions
2. Set up API client layer with React Query
3. Create admin dashboard pages for deliverability monitoring
4. Build alerts management interface
5. Implement suppression list management
6. Add data visualization components
7. Test with staging data
8. Deploy to production

### Backend API Endpoints to Implement

The following endpoints are **not yet implemented** and need to be created:

- `GET /api/admin/email/deliverability/metrics`
- `GET /api/admin/email/deliverability/alerts`
- `POST /api/admin/email/deliverability/alerts/:alertId/acknowledge`
- `GET /api/admin/email/engagement/scores`
- `GET /api/admin/email/suppression`
- `DELETE /api/admin/email/suppression/:email`
- `GET /api/admin/email/deliverability/trend`

**Backend tasks tracked in:** `YesGoddess Ops - Backend & Admin Development Roadmap.md`

---

**Questions?** Contact the backend team or refer to:
- `docs/modules/email-campaigns/EMAIL_EVENTS_PROCESSING.md` - Full backend implementation details
- `docs/infrastructure/email/EMAIL_EVENTS_IMPLEMENTATION.md` - System architecture
- `src/jobs/email-events-processor.job.ts` - Background job implementation
- `src/lib/services/email/deliverability.service.ts` - Deliverability monitoring service
