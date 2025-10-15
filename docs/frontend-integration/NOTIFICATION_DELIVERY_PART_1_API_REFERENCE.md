# 🌐 Notification Delivery System - Part 1: API Reference

**Classification:** 🌐 SHARED  
**Module:** Notification Delivery  
**Last Updated:** October 14, 2025

> **Context:** Complete API reference for the notification delivery system covering in-app notifications, email notifications, digest emails, preferences, and scheduling. Used by both yesgoddess-web (public) and ops.yesgoddess.agency (admin).

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core Notification Endpoints](#core-notification-endpoints)
4. [Preference Management Endpoints](#preference-management-endpoints)
5. [Real-time Polling Endpoints](#real-time-polling-endpoints)
6. [Admin-Only Endpoints](#admin-only-endpoints)
7. [Request/Response Examples](#requestresponse-examples)

---

## Overview

The notification delivery system provides:
- **In-app notifications** - Created instantly in the database
- **Email notifications** - Delivered immediately or batched in digests
- **Digest emails** - Daily (9 AM) or Weekly (Monday 9 AM)
- **User preferences** - Granular control over notification types and delivery
- **Priority handling** - URGENT/HIGH always send immediate emails
- **Notification scheduling** - Background jobs handle delivery
- **Retry logic** - Automatic retry on email delivery failures

**Base URL:** `https://ops.yesgoddess.agency/api/trpc`

---

## Authentication

All endpoints require JWT authentication via:
- `Authorization: Bearer <token>` header, OR
- HTTP-only session cookie

```typescript
// Example with tRPC client
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

const trpc = createTRPCProxyClient({
  links: [
    httpBatchLink({
      url: 'https://ops.yesgoddess.agency/api/trpc',
      headers: async () => ({
        authorization: `Bearer ${getAuthToken()}`,
      }),
    }),
  ],
});
```

---

## Core Notification Endpoints

### 1. List Notifications

**Endpoint:** `system.notifications.list`  
**Method:** `query`  
**Auth:** Required  
**Purpose:** Get paginated list of notifications for authenticated user

#### Request Schema

```typescript
interface ListNotificationsRequest {
  read?: boolean;                    // Filter by read status
  type?: NotificationType;           // Filter by notification type
  priority?: NotificationPriority;   // Filter by priority level
  page?: number;                     // Page number (default: 1)
  pageSize?: number;                 // Items per page (default: 20, max: 100)
}

enum NotificationType {
  LICENSE = 'LICENSE',     // License expiration, activation
  PAYOUT = 'PAYOUT',       // Payment processing
  ROYALTY = 'ROYALTY',     // Royalty statements
  PROJECT = 'PROJECT',     // Project invitations, updates
  SYSTEM = 'SYSTEM',       // Platform announcements
  MESSAGE = 'MESSAGE'      // Direct messages
}

enum NotificationPriority {
  LOW = 'LOW',           // Info, tips - digest only
  MEDIUM = 'MEDIUM',     // Regular updates - digest or immediate
  HIGH = 'HIGH',         // Important - always immediate email
  URGENT = 'URGENT'      // Critical - always immediate email
}
```

#### Response Schema

```typescript
interface ListNotificationsResponse {
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

interface Notification {
  id: string;                          // CUID identifier
  type: NotificationType;
  title: string;                       // Max 255 chars
  message: string;                     // Full message content
  actionUrl: string | null;            // Deep link or null
  priority: NotificationPriority;
  read: boolean;
  readAt: string | null;               // ISO 8601 timestamp
  metadata: Record<string, any> | null; // Type-specific data
  createdAt: string;                   // ISO 8601 timestamp
}
```

#### Example Request

```typescript
// Get unread notifications
const result = await trpc.system.notifications.list.query({
  read: false,
  page: 1,
  pageSize: 20,
});

// Get high priority notifications
const urgent = await trpc.system.notifications.list.query({
  priority: 'HIGH',
  read: false,
});

// Get license notifications
const licenses = await trpc.system.notifications.list.query({
  type: 'LICENSE',
  page: 1,
  pageSize: 10,
});
```

#### Example Response

```json
{
  "data": [
    {
      "id": "clx123abc",
      "type": "LICENSE",
      "title": "License Expiring Soon",
      "message": "Your license for 'Brand Logo' expires in 30 days",
      "actionUrl": "/licenses/clx456def",
      "priority": "HIGH",
      "read": false,
      "readAt": null,
      "metadata": {
        "licenseId": "clx456def",
        "expiryDate": "2025-11-14T00:00:00Z",
        "daysRemaining": 30
      },
      "createdAt": "2025-10-14T12:00:00Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

### 2. Get Unread Count

**Endpoint:** `system.notifications.getUnreadCount`  
**Method:** `query`  
**Auth:** Required  
**Purpose:** Get count of unread notifications (cached for 60 seconds)

#### Request Schema

No parameters required.

#### Response Schema

```typescript
interface UnreadCountResponse {
  data: {
    count: number;
  };
}
```

#### Example Request

```typescript
const result = await trpc.system.notifications.getUnreadCount.query();
console.log(`You have ${result.data.count} unread notifications`);
```

#### Example Response

```json
{
  "data": {
    "count": 5
  }
}
```

---

### 3. Mark Notification as Read

**Endpoint:** `system.notifications.markAsRead`  
**Method:** `mutation`  
**Auth:** Required  
**Purpose:** Mark a single notification as read

#### Request Schema

```typescript
interface MarkAsReadRequest {
  notificationId: string;  // CUID of notification
}
```

#### Response Schema

```typescript
interface MarkAsReadResponse {
  data: {
    id: string;
    read: boolean;
    readAt: string | null;
  };
}
```

#### Example Request

```typescript
const result = await trpc.system.notifications.markAsRead.mutate({
  notificationId: 'clx123abc',
});
```

#### Example Response

```json
{
  "data": {
    "id": "clx123abc",
    "read": true,
    "readAt": "2025-10-14T14:30:00Z"
  }
}
```

#### Error Responses

```typescript
// Notification not found or doesn't belong to user
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Notification not found"
  }
}
```

---

### 4. Mark All Notifications as Read

**Endpoint:** `system.notifications.markAllAsRead`  
**Method:** `mutation`  
**Auth:** Required  
**Purpose:** Mark all unread notifications as read for authenticated user

#### Request Schema

No parameters required.

#### Response Schema

```typescript
interface MarkAllAsReadResponse {
  data: {
    count: number;  // Number of notifications marked as read
  };
}
```

#### Example Request

```typescript
const result = await trpc.system.notifications.markAllAsRead.mutate();
console.log(`Marked ${result.data.count} notifications as read`);
```

#### Example Response

```json
{
  "data": {
    "count": 12
  }
}
```

---

### 5. Delete Notification

**Endpoint:** `system.notifications.delete`  
**Method:** `mutation`  
**Auth:** Required  
**Purpose:** Delete (dismiss) a notification

#### Request Schema

```typescript
interface DeleteNotificationRequest {
  notificationId: string;  // CUID of notification
}
```

#### Response Schema

```typescript
interface DeleteNotificationResponse {
  data: {
    success: boolean;
  };
}
```

#### Example Request

```typescript
const result = await trpc.system.notifications.delete.mutate({
  notificationId: 'clx123abc',
});
```

#### Example Response

```json
{
  "data": {
    "success": true
  }
}
```

---

## Preference Management Endpoints

### 6. Get Notification Preferences

**Endpoint:** `system.notifications.getPreferences`  
**Method:** `query`  
**Auth:** Required  
**Purpose:** Retrieve user's notification preferences

#### Request Schema

No parameters required.

#### Response Schema

```typescript
interface NotificationPreferencesResponse {
  data: NotificationPreferences;
}

interface NotificationPreferences {
  userId: string;
  enabledTypes: NotificationType[];    // Types user wants to receive
  digestFrequency: DigestFrequency;    // Email delivery frequency
  emailEnabled: boolean;               // Master email toggle
  inAppEnabled: boolean;               // Master in-app toggle (always true)
  lastDigestSentAt?: string;          // ISO 8601 timestamp (optional)
}

enum DigestFrequency {
  IMMEDIATE = 'IMMEDIATE',  // Send emails immediately
  DAILY = 'DAILY',          // Daily digest at 9 AM
  WEEKLY = 'WEEKLY',        // Weekly digest on Monday at 9 AM
  NEVER = 'NEVER'           // No email notifications
}
```

#### Example Request

```typescript
const prefs = await trpc.system.notifications.getPreferences.query();
```

#### Example Response

```json
{
  "data": {
    "userId": "clx_user123",
    "enabledTypes": ["LICENSE", "PAYOUT", "ROYALTY", "PROJECT", "SYSTEM", "MESSAGE"],
    "digestFrequency": "DAILY",
    "emailEnabled": true,
    "inAppEnabled": true,
    "lastDigestSentAt": "2025-10-14T09:00:00Z"
  }
}
```

---

### 7. Update Notification Preferences

**Endpoint:** `system.notifications.updatePreferences`  
**Method:** `mutation`  
**Auth:** Required  
**Purpose:** Update notification delivery preferences

#### Request Schema

```typescript
interface UpdatePreferencesRequest {
  enabledTypes?: NotificationType[];     // Types to receive
  digestFrequency?: DigestFrequency;     // Email delivery frequency
  emailEnabled?: boolean;                // Enable/disable email
  inAppEnabled?: boolean;                // Enable/disable in-app
}
```

> **Important:** Setting `emailEnabled: true` requires the user to have a verified email address. The API will return `BAD_REQUEST` if email is not verified.

#### Response Schema

```typescript
interface UpdatePreferencesResponse {
  data: NotificationPreferences;  // Updated preferences
}
```

#### Example Requests

```typescript
// Enable email notifications with daily digest
await trpc.system.notifications.updatePreferences.mutate({
  emailEnabled: true,
  digestFrequency: 'DAILY',
});

// Disable specific notification types
await trpc.system.notifications.updatePreferences.mutate({
  enabledTypes: ['LICENSE', 'PAYOUT', 'SYSTEM'],  // Only these 3 types
});

// Switch to immediate emails
await trpc.system.notifications.updatePreferences.mutate({
  digestFrequency: 'IMMEDIATE',
});

// Disable all email notifications
await trpc.system.notifications.updatePreferences.mutate({
  emailEnabled: false,
});
```

#### Example Response

```json
{
  "data": {
    "userId": "clx_user123",
    "enabledTypes": ["LICENSE", "PAYOUT", "SYSTEM"],
    "digestFrequency": "DAILY",
    "emailEnabled": true,
    "inAppEnabled": true
  }
}
```

#### Error Responses

```typescript
// Email not verified
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Cannot enable email notifications without verified email address"
  }
}
```

---

## Real-time Polling Endpoints

### 8. Poll for New Notifications

**Endpoint:** `system.notifications.poll`  
**Method:** `query`  
**Auth:** Required  
**Purpose:** Efficiently check for new notifications since last poll  
**Rate Limit:** 1 request per 10 seconds recommended  
**Caching:** 5-second cache for "no new notifications" responses

#### Request Schema

```typescript
interface PollNotificationsRequest {
  lastSeen?: string;  // ISO 8601 timestamp of last poll (optional)
}
```

**Behavior:**
- If `lastSeen` is provided, returns notifications created after that timestamp
- If `lastSeen` is omitted, returns notifications from the last hour
- Timestamps in the future are normalized to current time
- Timestamps older than 24 hours are limited to 24 hours ago
- Returns empty array if no new notifications (cached for 5 seconds)

#### Response Schema

```typescript
interface PollNotificationsResponse {
  data: {
    notifications: Notification[];  // New notifications since lastSeen
    newCount: number;               // Count of new notifications
    unreadCount: number;            // Total unread count
    lastSeen: string;               // Current timestamp (ISO 8601)
    suggestedPollInterval: number;  // Seconds (always 10)
  };
}
```

#### Example Request

```typescript
// Initial poll (no lastSeen)
const initial = await trpc.system.notifications.poll.query({});

// Store lastSeen timestamp
localStorage.setItem('lastSeen', initial.data.lastSeen);

// Subsequent poll
const update = await trpc.system.notifications.poll.query({
  lastSeen: localStorage.getItem('lastSeen'),
});

// Update lastSeen
localStorage.setItem('lastSeen', update.data.lastSeen);
```

#### Example Response

```json
{
  "data": {
    "notifications": [
      {
        "id": "clx789xyz",
        "type": "MESSAGE",
        "title": "New Message",
        "message": "You have a new message from Brand Partner",
        "actionUrl": "/messages/thread-123",
        "priority": "MEDIUM",
        "read": false,
        "readAt": null,
        "metadata": {
          "threadId": "thread-123",
          "senderId": "clx_sender"
        },
        "createdAt": "2025-10-14T14:35:00Z"
      }
    ],
    "newCount": 1,
    "unreadCount": 6,
    "lastSeen": "2025-10-14T14:36:00Z",
    "suggestedPollInterval": 10
  }
}
```

#### Empty Response (No New Notifications)

```json
{
  "data": {
    "notifications": [],
    "newCount": 0,
    "unreadCount": 5,
    "lastSeen": "2025-10-14T14:36:00Z",
    "suggestedPollInterval": 10
  }
}
```

---

## Admin-Only Endpoints

### 9. Create Notification (Admin)

**Endpoint:** `system.notifications.create`  
**Method:** `mutation`  
**Auth:** Required (Admin role only)  
**Purpose:** Manually create notifications for users

#### Request Schema

```typescript
interface CreateNotificationRequest {
  // Target (must provide ONE of these)
  userId?: string;                     // Single user CUID
  userIds?: string[];                  // Multiple user CUIDs
  userRole?: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';  // All users with role

  // Notification content
  type: NotificationType;
  title: string;                       // Max 255 characters
  message: string;                     // Max 1000 characters
  priority?: NotificationPriority;     // Default: MEDIUM
  actionUrl?: string;                  // Optional deep link (URL or /path)
  metadata?: Record<string, any>;      // Optional type-specific data
}
```

**Validation Rules:**
- Must provide exactly ONE of: `userId`, `userIds`, or `userRole`
- `title` required, max 255 characters
- `message` required, max 1000 characters
- `actionUrl` must be valid URL or start with `/`
- `priority` defaults to `MEDIUM` if not provided

#### Response Schema

```typescript
interface CreateNotificationResponse {
  data: {
    created: number;           // Number of notifications created
    notificationIds: string[]; // Array of created notification CUIDs
  };
}
```

#### Example Requests

```typescript
// Send to single user
const result = await trpc.system.notifications.create.mutate({
  userId: 'clx_user123',
  type: 'SYSTEM',
  title: 'Scheduled Maintenance',
  message: 'The platform will undergo maintenance tonight at 11 PM PST.',
  priority: 'HIGH',
  actionUrl: '/system-status',
});

// Send to all creators
const broadcast = await trpc.system.notifications.create.mutate({
  userRole: 'CREATOR',
  type: 'SYSTEM',
  title: 'New Feature: AI Asset Tagging',
  message: 'Try our new AI-powered asset tagging feature!',
  priority: 'LOW',
  actionUrl: '/features/ai-tagging',
  metadata: {
    featureId: 'ai-tagging',
    category: 'product-launch',
  },
});

// Send to specific users
const targeted = await trpc.system.notifications.create.mutate({
  userIds: ['clx_user1', 'clx_user2', 'clx_user3'],
  type: 'PROJECT',
  title: 'Project Invitation',
  message: 'You have been invited to collaborate on "Fashion Week 2025"',
  priority: 'MEDIUM',
  actionUrl: '/projects/clx_project123',
  metadata: {
    projectId: 'clx_project123',
    invitedBy: 'clx_admin',
  },
});
```

#### Example Response

```json
{
  "data": {
    "created": 3,
    "notificationIds": [
      "clx_notif1",
      "clx_notif2",
      "clx_notif3"
    ]
  }
}
```

#### Error Responses

```typescript
// No target users found
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "No target users found"
  }
}

// Missing required target
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Must provide userId, userIds, or userRole"
  }
}

// Unauthorized (not admin)
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions"
  }
}
```

---

## Request/Response Examples

### Complete cURL Examples

#### List Notifications

```bash
# Get unread notifications
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/system.notifications.list?input=%7B%22read%22%3Afalse%2C%22page%22%3A1%7D' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'

# Get high-priority notifications
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/system.notifications.list?input=%7B%22priority%22%3A%22HIGH%22%7D' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

#### Mark as Read

```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/system.notifications.markAsRead' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"notificationId":"clx123abc"}'
```

#### Update Preferences

```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/system.notifications.updatePreferences' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "digestFrequency": "DAILY",
    "emailEnabled": true,
    "enabledTypes": ["LICENSE", "PAYOUT", "SYSTEM"]
  }'
```

#### Poll for Updates

```bash
curl -X GET 'https://ops.yesgoddess.agency/api/trpc/system.notifications.poll?input=%7B%22lastSeen%22%3A%222025-10-14T14%3A00%3A00Z%22%7D' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

---

## Next Steps

- **Part 2:** [Business Logic & Validation Rules](./NOTIFICATION_DELIVERY_PART_2_BUSINESS_LOGIC.md)
- **Part 3:** [Frontend Implementation Guide](./NOTIFICATION_DELIVERY_PART_3_IMPLEMENTATION.md)

---

**Questions or Issues?** Contact the backend team or refer to the implementation code in `src/modules/system/`.
