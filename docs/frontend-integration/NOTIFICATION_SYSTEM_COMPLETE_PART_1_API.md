# 🌐 Notification System - Frontend Integration Guide (Part 1: API Endpoints & Types)

**Classification:** 🌐 SHARED  
**Module:** Notifications System  
**Version:** 1.0  
**Last Updated:** October 14, 2025

> **Context:** This is Part 1 of 3 in the Notification System integration documentation. This document covers API endpoints, request/response schemas, and TypeScript type definitions. Used by both the public-facing website (yesgoddess-web) and admin backend (ops.yesgoddess.agency).

---

## Table of Contents

1. [Overview](#overview)
2. [Base URL & Authentication](#base-url--authentication)
3. [API Endpoints](#api-endpoints)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Request/Response Examples](#requestresponse-examples)
6. [Error Responses](#error-responses)

---

## Overview

The Notification System provides both **REST API** and **tRPC** endpoints for:
- In-app notification management
- Email notification preferences
- Real-time polling for updates
- Notification categorization and filtering

### Architecture

- **Backend:** ops.yesgoddess.agency
- **Frontend:** yesgoddess-web (Next.js 15 + App Router)
- **Communication:** REST API + tRPC
- **Authentication:** JWT tokens via NextAuth.js
- **Real-time:** Polling-based (10-second intervals)

---

## Base URL & Authentication

### Base URLs

**REST API:**
```
https://ops.yesgoddess.agency/api/notifications
```

**tRPC API:**
```
https://ops.yesgoddess.agency/api/trpc/system.notifications
```

### Authentication

All endpoints require authentication via NextAuth.js session or JWT token.

**Using fetch (REST):**
```typescript
const response = await fetch('/api/notifications', {
  headers: {
    'Content-Type': 'application/json',
    // Cookie-based auth (handled automatically by Next.js)
  }
});
```

**Using tRPC:**
```typescript
import { trpc } from '@/lib/trpc';

const notifications = await trpc.system.notifications.list.query({
  read: false,
  page: 1,
  pageSize: 20
});
```

---

## API Endpoints

### 1. List Notifications

Retrieve a paginated list of notifications for the authenticated user.

**REST API:**
- **Method:** `GET`
- **Endpoint:** `/api/notifications`

**tRPC API:**
- **Procedure:** `system.notifications.list`
- **Type:** `query`

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number (min: 1) |
| `pageSize` | number | No | 20 | Items per page (min: 1, max: 100) |
| `read` | boolean | No | - | Filter by read status |
| `type` | string | No | - | Filter by notification type |
| `priority` | string | No | - | Filter by priority level |

**Valid `type` values:**
- `LICENSE` - License-related events
- `PAYOUT` - Payment and payout events
- `ROYALTY` - Royalty statements
- `PROJECT` - Project invitations
- `SYSTEM` - Platform announcements
- `MESSAGE` - Direct messages

**Valid `priority` values:**
- `LOW` - Low priority
- `MEDIUM` - Medium priority
- `HIGH` - High priority
- `URGENT` - Urgent priority

#### Response Schema

```typescript
interface ListNotificationsResponse {
  success: boolean;
  data: Notification[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface Notification {
  id: string;                    // CUID
  type: NotificationType;
  title: string;                 // Max 255 characters
  message: string;
  actionUrl: string | null;      // URL or path (e.g., /licenses/123)
  priority: NotificationPriority;
  read: boolean;
  readAt: string | null;         // ISO 8601 timestamp
  metadata: Record<string, any> | null;
  createdAt: string;             // ISO 8601 timestamp
}
```

---

### 2. Get Unread Count

Get the total count of unread notifications (cached for performance).

**REST API:**
- **Method:** `GET`
- **Endpoint:** `/api/notifications/unread`

**tRPC API:**
- **Procedure:** `system.notifications.getUnreadCount`
- **Type:** `query`

#### Response Schema

```typescript
interface UnreadCountResponse {
  success: boolean;
  data: {
    count: number;
  };
}
```

**Caching:**
- Cached in Redis for 5 minutes
- Automatically invalidated when:
  - New notification is created
  - Notification is marked as read
  - Notification is deleted

---

### 3. Mark Notification as Read

Mark a specific notification as read for the current user.

**REST API:**
- **Method:** `PATCH`
- **Endpoint:** `/api/notifications/:id/read`

**tRPC API:**
- **Procedure:** `system.notifications.markAsRead`
- **Type:** `mutation`

#### Request Schema

```typescript
interface MarkAsReadRequest {
  notificationId: string; // CUID
}
```

#### Response Schema

```typescript
interface MarkAsReadResponse {
  success: boolean;
  data: {
    id: string;
    read: boolean;     // Will be true
    readAt: string;    // ISO 8601 timestamp
  };
}
```

---

### 4. Mark All as Read

Mark all unread notifications as read for the current user.

**REST API:**
- **Method:** `PATCH`
- **Endpoint:** `/api/notifications/read-all`

**tRPC API:**
- **Procedure:** `system.notifications.markAllAsRead`
- **Type:** `mutation`

#### Response Schema

```typescript
interface MarkAllAsReadResponse {
  success: boolean;
  data: {
    count: number; // Number of notifications marked as read
  };
}
```

---

### 5. Delete Notification

Permanently delete a notification (soft delete).

**REST API:**
- **Method:** `DELETE`
- **Endpoint:** `/api/notifications/:id`

**tRPC API:**
- **Procedure:** `system.notifications.delete`
- **Type:** `mutation`

#### Request Schema

```typescript
interface DeleteNotificationRequest {
  notificationId: string; // CUID
}
```

#### Response Schema

```typescript
interface DeleteNotificationResponse {
  success: boolean;
  data: {
    deleted: boolean;
  };
}
```

---

### 6. Get Notification Preferences

Retrieve the authenticated user's notification preferences.

**REST API:**
- **Method:** `GET`
- **Endpoint:** `/api/notifications/preferences`

**tRPC API:**
- **Procedure:** `system.notifications.getPreferences`
- **Type:** `query`

#### Response Schema

```typescript
interface NotificationPreferencesResponse {
  success: boolean;
  data: NotificationPreferences;
}

interface NotificationPreferences {
  userId: string;
  enabledTypes: NotificationType[];      // Enabled notification types
  digestFrequency: DigestFrequency;
  emailEnabled: boolean;                 // Master email toggle
  inAppEnabled: boolean;                 // Always true
  lastDigestSentAt?: string;            // ISO 8601 timestamp
}

enum DigestFrequency {
  IMMEDIATE = 'IMMEDIATE', // Send emails immediately
  DAILY = 'DAILY',         // Daily digest at 9 AM
  WEEKLY = 'WEEKLY',       // Weekly digest on Monday at 9 AM
  NEVER = 'NEVER'          // No email notifications
}
```

---

### 7. Update Notification Preferences

Update the authenticated user's notification preferences.

**REST API:**
- **Method:** `PATCH`
- **Endpoint:** `/api/notifications/preferences`

**tRPC API:**
- **Procedure:** `system.notifications.updatePreferences`
- **Type:** `mutation`

#### Request Schema

```typescript
interface UpdatePreferencesRequest {
  enabledTypes?: NotificationType[];  // Array of types to receive
  digestFrequency?: DigestFrequency;
  emailEnabled?: boolean;
  inAppEnabled?: boolean;             // Always true (cannot disable in-app)
}
```

**Important:** Setting `emailEnabled: true` requires the user's email to be verified.

#### Response Schema

```typescript
interface UpdatePreferencesResponse {
  success: boolean;
  data: NotificationPreferences;
}
```

---

### 8. Poll for New Notifications

Efficiently poll for new notifications since the last check.

**REST API:**
- **Method:** `GET`
- **Endpoint:** `/api/notifications/poll`

**tRPC API:**
- **Procedure:** `system.notifications.poll`
- **Type:** `query`

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lastSeen` | string | No | ISO 8601 timestamp of last poll |

**Behavior:**
- If `lastSeen` is not provided, returns notifications from the last hour
- Returns max 50 notifications per poll
- Queries up to 24 hours in the past only
- Handles clock skew gracefully

#### Rate Limiting

- **Limit:** 1 request per 10 seconds per user
- **Response:** `429 Too Many Requests` with `Retry-After` header
- **Recommendation:** Use the `suggestedPollInterval` from the response

#### Response Schema

```typescript
interface PollNotificationsResponse {
  success: boolean;
  data: {
    notifications: Notification[];  // New notifications since lastSeen
    newCount: number;               // Count of new notifications
    unreadCount: number;            // Total unread count
    lastSeen: string;               // ISO 8601 timestamp for next poll
    suggestedPollInterval: number;  // Seconds to wait (typically 10)
  };
}
```

**Caching:**
- "No new notifications" result cached for 5 seconds
- Automatically cleared when new notifications are created

---

### 9. Create Notification (Admin Only)

Create notifications for one or more users. **Admin role required.**

**REST API:**
- Not available via REST (use tRPC)

**tRPC API:**
- **Procedure:** `system.notifications.create`
- **Type:** `mutation`
- **Permission:** ADMIN only

#### Request Schema

```typescript
interface CreateNotificationRequest {
  // Target users (provide ONE of these)
  userId?: string;                        // Single user ID
  userIds?: string[];                     // Multiple user IDs
  userRole?: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER'; // All users with role
  
  // Notification content
  type: NotificationType;
  title: string;                          // Max 255 characters
  message: string;                        // Max 1000 characters
  priority?: NotificationPriority;        // Default: MEDIUM
  actionUrl?: string;                     // URL or path
  metadata?: Record<string, any>;         // Additional context data
}
```

**Validation:**
- Must provide either `userId`, `userIds`, or `userRole`
- `actionUrl` can be a full URL or relative path starting with `/`
- Title max 255 characters
- Message max 1000 characters

#### Response Schema

```typescript
interface CreateNotificationResponse {
  success: boolean;
  data: {
    created: number;           // Number of notifications created
    notificationIds: string[]; // Array of created notification IDs
  };
}
```

---

## TypeScript Type Definitions

Copy these types to your frontend codebase (`src/types/notifications.ts`):

```typescript
// ========================================
// Enums
// ========================================

export enum NotificationType {
  LICENSE = 'LICENSE',
  PAYOUT = 'PAYOUT',
  ROYALTY = 'ROYALTY',
  PROJECT = 'PROJECT',
  SYSTEM = 'SYSTEM',
  MESSAGE = 'MESSAGE'
}

export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export enum DigestFrequency {
  IMMEDIATE = 'IMMEDIATE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  NEVER = 'NEVER'
}

// ========================================
// Core Types
// ========================================

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl: string | null;
  priority: NotificationPriority;
  read: boolean;
  readAt: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  enabledTypes: NotificationType[];
  digestFrequency: DigestFrequency;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  lastDigestSentAt?: string;
}

// ========================================
// Request Types
// ========================================

export interface ListNotificationsParams {
  read?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
  page?: number;
  pageSize?: number;
}

export interface UpdatePreferencesParams {
  enabledTypes?: NotificationType[];
  digestFrequency?: DigestFrequency;
  emailEnabled?: boolean;
  inAppEnabled?: boolean;
}

export interface PollNotificationsParams {
  lastSeen?: string; // ISO 8601 timestamp
}

export interface CreateNotificationParams {
  userId?: string;
  userIds?: string[];
  userRole?: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

// ========================================
// Response Types
// ========================================

export interface ListNotificationsResponse {
  data: Notification[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface UnreadCountResponse {
  data: {
    count: number;
  };
}

export interface PollNotificationsResponse {
  data: {
    notifications: Notification[];
    newCount: number;
    unreadCount: number;
    lastSeen: string;
    suggestedPollInterval: number;
  };
}

export interface MarkAsReadResponse {
  data: {
    id: string;
    read: boolean;
    readAt: string;
  };
}

export interface MarkAllAsReadResponse {
  data: {
    count: number;
  };
}

export interface NotificationPreferencesResponse {
  data: NotificationPreferences;
}

export interface CreateNotificationResponse {
  data: {
    created: number;
    notificationIds: string[];
  };
}

// ========================================
// Metadata Types (type-specific)
// ========================================

export interface LicenseNotificationMetadata {
  licenseId: string;
  licenseName?: string;
  expiryDate?: string;
  creatorId?: string;
  creatorName?: string;
  brandId?: string;
  brandName?: string;
  action?: 'expiring' | 'renewed' | 'cancelled' | 'approved' | 'rejected';
}

export interface PayoutNotificationMetadata {
  payoutId: string;
  amount: number;
  currency: string;
  status: 'processed' | 'failed' | 'pending';
  failureReason?: string;
  expectedDate?: string;
}

export interface RoyaltyNotificationMetadata {
  statementId: string;
  period: string;
  amount: number;
  currency: string;
}

export interface ProjectNotificationMetadata {
  projectId: string;
  projectName: string;
  inviterId?: string;
  inviterName?: string;
  action?: 'invited' | 'status_changed' | 'deadline_approaching';
}

export interface MessageNotificationMetadata {
  threadId: string;
  threadSubject?: string;
  senderId: string;
  senderName: string;
  messagePreview: string;
  messageId: string;
}

export interface SystemNotificationMetadata {
  featureId?: string;
  maintenanceWindow?: {
    start: string;
    end: string;
  };
  version?: string;
}
```

---

## Request/Response Examples

### Example 1: List Unread Notifications

**tRPC Request:**
```typescript
const response = await trpc.system.notifications.list.query({
  read: false,
  page: 1,
  pageSize: 20
});
```

**REST Request:**
```typescript
const response = await fetch('/api/notifications?read=false&page=1&pageSize=20');
const data = await response.json();
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx123abc456",
      "type": "MESSAGE",
      "title": "New message from Sarah Chen",
      "message": "Sarah Chen sent you a message in thread: Brand Partnership Discussion",
      "actionUrl": "/messages/thread-789",
      "priority": "MEDIUM",
      "read": false,
      "readAt": null,
      "metadata": {
        "threadId": "thread-789",
        "senderId": "user-456",
        "senderName": "Sarah Chen",
        "messagePreview": "Hey! I'd love to discuss..."
      },
      "createdAt": "2025-10-13T14:30:00.000Z"
    },
    {
      "id": "clx123abc457",
      "type": "LICENSE",
      "title": "License Expiring Soon",
      "message": "Your license for 'Summer Campaign 2025' expires in 7 days",
      "actionUrl": "/licenses/clx789def",
      "priority": "HIGH",
      "read": false,
      "readAt": null,
      "metadata": {
        "licenseId": "clx789def",
        "licenseName": "Summer Campaign 2025",
        "expiryDate": "2025-10-20",
        "action": "expiring"
      },
      "createdAt": "2025-10-13T09:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 2,
    "totalPages": 1
  }
}
```

---

### Example 2: Mark Notification as Read

**tRPC Request:**
```typescript
await trpc.system.notifications.markAsRead.mutate({
  notificationId: 'clx123abc456'
});
```

**REST Request:**
```typescript
await fetch('/api/notifications/clx123abc456/read', {
  method: 'PATCH'
});
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clx123abc456",
    "read": true,
    "readAt": "2025-10-13T15:30:00.000Z"
  }
}
```

---

### Example 3: Poll for New Notifications

**Initial Poll (no lastSeen):**
```typescript
const initial = await trpc.system.notifications.poll.query({});
```

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "clx123abc458",
        "type": "SYSTEM",
        "title": "Platform Maintenance",
        "message": "Scheduled maintenance tonight at 11 PM EST",
        "actionUrl": null,
        "priority": "LOW",
        "read": false,
        "readAt": null,
        "metadata": {
          "maintenanceWindow": {
            "start": "2025-10-13T23:00:00.000Z",
            "end": "2025-10-14T01:00:00.000Z"
          }
        },
        "createdAt": "2025-10-13T15:00:00.000Z"
      }
    ],
    "newCount": 1,
    "unreadCount": 3,
    "lastSeen": "2025-10-13T15:05:00.000Z",
    "suggestedPollInterval": 10
  }
}
```

**Subsequent Poll (with lastSeen):**
```typescript
const update = await trpc.system.notifications.poll.query({
  lastSeen: '2025-10-13T15:05:00.000Z'
});
```

**Response (no new notifications):**
```json
{
  "success": true,
  "data": {
    "notifications": [],
    "newCount": 0,
    "unreadCount": 3,
    "lastSeen": "2025-10-13T15:05:10.000Z",
    "suggestedPollInterval": 10
  }
}
```

---

### Example 4: Update Preferences

**Request:**
```typescript
await trpc.system.notifications.updatePreferences.mutate({
  enabledTypes: ['LICENSE', 'PAYOUT', 'SYSTEM'],
  digestFrequency: 'DAILY',
  emailEnabled: true
});
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "clx123user",
    "enabledTypes": ["LICENSE", "PAYOUT", "SYSTEM"],
    "digestFrequency": "DAILY",
    "emailEnabled": true,
    "inAppEnabled": true,
    "lastDigestSentAt": "2025-10-13T09:00:00.000Z"
  }
}
```

---

## Error Responses

All endpoints return consistent error responses:

### Standard Error Format

```typescript
interface ErrorResponse {
  success: false;
  error: string;
  details?: any; // Validation errors or additional context
}
```

### HTTP Status Codes

| Code | Meaning | When It Occurs |
|------|---------|----------------|
| `400` | Bad Request | Invalid input, validation failure |
| `401` | Unauthorized | Not authenticated |
| `403` | Forbidden | Authenticated but lacks permission |
| `404` | Not Found | Notification doesn't exist or doesn't belong to user |
| `429` | Too Many Requests | Rate limit exceeded (polling endpoint only) |
| `500` | Internal Server Error | Server-side error |

### Common Error Examples

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Notification not found"
}
```

**429 Rate Limit Exceeded:**
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "retryAfter": 8
}
```

Response headers will include:
```
Retry-After: 8
```

**400 Validation Error:**
```json
{
  "success": false,
  "error": "Invalid request body",
  "details": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "number",
      "path": ["title"],
      "message": "Expected string, received number"
    }
  ]
}
```

**400 Email Not Verified:**
```json
{
  "success": false,
  "error": "Cannot enable email notifications without verified email"
}
```

---

## cURL Examples

### List Notifications
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/notifications?read=false&page=1&pageSize=20' \
  -H 'Cookie: next-auth.session-token=YOUR_SESSION_TOKEN'
```

### Mark as Read
```bash
curl -X PATCH 'https://ops.yesgoddess.agency/api/notifications/clx123abc456/read' \
  -H 'Cookie: next-auth.session-token=YOUR_SESSION_TOKEN'
```

### Poll for Updates
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/notifications/poll?lastSeen=2025-10-13T15:00:00.000Z' \
  -H 'Cookie: next-auth.session-token=YOUR_SESSION_TOKEN'
```

### Update Preferences
```bash
curl -X PATCH 'https://ops.yesgoddess.agency/api/notifications/preferences' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: next-auth.session-token=YOUR_SESSION_TOKEN' \
  -d '{
    "enabledTypes": ["LICENSE", "PAYOUT"],
    "digestFrequency": "DAILY",
    "emailEnabled": true
  }'
```

---

## Next Steps

- **Part 2:** [Business Logic & Implementation Guide](./NOTIFICATION_SYSTEM_COMPLETE_PART_2_IMPLEMENTATION.md)
- **Part 3:** [Advanced Features & Examples](./NOTIFICATION_SYSTEM_COMPLETE_PART_3_ADVANCED.md)

---

**Need Help?**
- Review existing notification docs in `/docs/frontend-integration/`
- Check backend implementation in `/src/modules/system/`
- Reach out to backend team with questions
