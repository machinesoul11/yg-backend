# 🌐 Notifications System - API Endpoints Reference

**Classification:** 🌐 SHARED  
**Module:** Notifications Integration  
**Last Updated:** October 13, 2025

> **Context:** The notification system provides in-app notifications and email delivery for all platform events. Both creators/brands (via yesgoddess-web) and admin staff (via ops.yesgoddess.agency) use these endpoints.

---

## Table of Contents

1. [Base URL & Authentication](#base-url--authentication)
2. [Core Notification Endpoints](#core-notification-endpoints)
3. [Preference Management Endpoints](#preference-management-endpoints)
4. [Polling & Real-time Updates](#polling--real-time-updates)
5. [Request/Response Examples](#requestresponse-examples)

---

## Base URL & Authentication

**Base URL:**  
```
https://ops.yesgoddess.agency/api/trpc
```

**Authentication:**  
All endpoints require a valid JWT token in the `Authorization` header or as a cookie.

```typescript
// Example with fetch
const response = await fetch('https://ops.yesgoddess.agency/api/trpc/system.notifications.list', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

---

## Core Notification Endpoints

### 1. List Notifications

**Endpoint:** `system.notifications.list`  
**Method:** `query`  
**Authentication:** Required (user must be authenticated)

Retrieve a paginated list of notifications for the authenticated user.

#### Request Schema

```typescript
interface ListNotificationsRequest {
  read?: boolean;            // Filter by read status
  type?: NotificationType;   // Filter by notification type
  priority?: NotificationPriority; // Filter by priority
  page?: number;             // Page number (default: 1)
  pageSize?: number;         // Items per page (default: 20, max: 100)
}
```

#### Response Schema

```typescript
interface ListNotificationsResponse {
  data: NotificationItem[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

interface NotificationItem {
  id: string;                    // CUID
  type: NotificationType;        // LICENSE | PAYOUT | ROYALTY | PROJECT | SYSTEM | MESSAGE
  title: string;                 // Max 255 characters
  message: string;               // Full message content
  actionUrl: string | null;      // URL to navigate when clicked
  priority: NotificationPriority; // LOW | MEDIUM | HIGH | URGENT
  read: boolean;                 // Read status
  readAt: string | null;         // ISO 8601 timestamp
  metadata: Record<string, any> | null; // Type-specific data
  createdAt: string;             // ISO 8601 timestamp
}
```

#### TypeScript Types

```typescript
enum NotificationType {
  LICENSE = 'LICENSE',
  PAYOUT = 'PAYOUT',
  ROYALTY = 'ROYALTY',
  PROJECT = 'PROJECT',
  SYSTEM = 'SYSTEM',
  MESSAGE = 'MESSAGE'
}

enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}
```

---

### 2. Get Unread Count

**Endpoint:** `system.notifications.getUnreadCount`  
**Method:** `query`  
**Authentication:** Required

Get the total count of unread notifications for the current user.

#### Request Schema

No input parameters required.

#### Response Schema

```typescript
interface UnreadCountResponse {
  data: {
    count: number;
  };
}
```

---

### 3. Mark Notification as Read

**Endpoint:** `system.notifications.markAsRead`  
**Method:** `mutation`  
**Authentication:** Required

Mark a specific notification as read.

#### Request Schema

```typescript
interface MarkAsReadRequest {
  notificationId: string; // CUID
}
```

#### Response Schema

```typescript
interface MarkAsReadResponse {
  data: {
    id: string;
    read: boolean;     // Will be true
    readAt: string;    // ISO 8601 timestamp
  };
}
```

---

### 4. Mark All as Read

**Endpoint:** `system.notifications.markAllAsRead`  
**Method:** `mutation`  
**Authentication:** Required

Mark all unread notifications as read for the current user.

#### Request Schema

No input parameters required.

#### Response Schema

```typescript
interface MarkAllAsReadResponse {
  data: {
    count: number; // Number of notifications marked as read
  };
}
```

---

### 5. Delete Notification

**Endpoint:** `system.notifications.delete`  
**Method:** `mutation`  
**Authentication:** Required

Permanently delete a notification.

#### Request Schema

```typescript
interface DeleteNotificationRequest {
  notificationId: string; // CUID
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

---

### 6. Create Notification (Admin Only)

**Endpoint:** `system.notifications.create`  
**Method:** `mutation`  
**Authentication:** Required (ADMIN role only)

Create notifications for one or more users.

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
  actionUrl?: string;                     // URL or path (e.g., /dashboard/licenses/123)
  metadata?: Record<string, any>;         // Additional context data
}
```

#### Response Schema

```typescript
interface CreateNotificationResponse {
  data: {
    created: number;           // Number of notifications created
    notificationIds: string[]; // Array of created notification IDs
  };
}
```

---

## Preference Management Endpoints

### 7. Get Notification Preferences

**Endpoint:** `system.notifications.getPreferences`  
**Method:** `query`  
**Authentication:** Required

Retrieve the authenticated user's notification preferences.

#### Request Schema

No input parameters required.

#### Response Schema

```typescript
interface NotificationPreferencesResponse {
  data: NotificationPreferences;
}

interface NotificationPreferences {
  userId: string;
  enabledTypes: NotificationType[];      // Array of enabled notification types
  digestFrequency: DigestFrequency;      // IMMEDIATE | DAILY | WEEKLY | NEVER
  emailEnabled: boolean;                 // Master email toggle
  inAppEnabled: boolean;                 // Master in-app toggle (always true)
  lastDigestSentAt?: string;            // ISO 8601 timestamp (optional)
}

enum DigestFrequency {
  IMMEDIATE = 'IMMEDIATE', // Send emails immediately
  DAILY = 'DAILY',         // Daily digest at 9 AM
  WEEKLY = 'WEEKLY',       // Weekly digest on Monday at 9 AM
  NEVER = 'NEVER'          // No email notifications
}
```

---

### 8. Update Notification Preferences

**Endpoint:** `system.notifications.updatePreferences`  
**Method:** `mutation`  
**Authentication:** Required

Update the authenticated user's notification preferences.

#### Request Schema

```typescript
interface UpdatePreferencesRequest {
  enabledTypes?: NotificationType[];     // Types to receive
  digestFrequency?: DigestFrequency;     // Email delivery frequency
  emailEnabled?: boolean;                // Enable/disable email (requires verified email)
  inAppEnabled?: boolean;                // Enable/disable in-app
}
```

> **Important:** Setting `emailEnabled: true` requires the user to have a verified email address. The API will return a `BAD_REQUEST` error if the email is not verified.

#### Response Schema

```typescript
interface UpdatePreferencesResponse {
  data: NotificationPreferences; // Updated preferences
}
```

---

## Polling & Real-time Updates

### 9. Poll for New Notifications

**Endpoint:** `system.notifications.poll`  
**Method:** `query`  
**Authentication:** Required

Efficiently poll for new notifications since the last check.

#### Request Schema

```typescript
interface PollNotificationsRequest {
  lastSeen?: string; // ISO 8601 timestamp (optional)
}
```

> **Note:** If `lastSeen` is not provided, returns notifications from the last hour.

#### Response Schema

```typescript
interface PollNotificationsResponse {
  data: {
    notifications: NotificationItem[];  // New notifications
    newCount: number;                   // Count of new notifications
    unreadCount: number;                // Total unread count
    lastSeen: string;                   // ISO 8601 timestamp for next poll
    suggestedPollInterval: number;      // Seconds to wait before next poll (typically 10)
  };
}
```

#### Polling Best Practices

1. **Initial Poll:** Call without `lastSeen` to get recent notifications
2. **Subsequent Polls:** Use the `lastSeen` value from the previous response
3. **Interval:** Use the `suggestedPollInterval` value (typically 10 seconds)
4. **Caching:** Backend caches "no new notifications" for 5 seconds
5. **Limits:** Only queries up to 24 hours back to prevent abuse

---

## Request/Response Examples

### Example 1: List Unread Notifications

**Request:**
```typescript
const response = await trpc.system.notifications.list.query({
  read: false,
  page: 1,
  pageSize: 20
});
```

**Response:**
```json
{
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
        "senderId": "user-456"
      },
      "createdAt": "2025-10-13T14:30:00.000Z"
    },
    {
      "id": "clx123abc457",
      "type": "LICENSE",
      "title": "License Expiring Soon",
      "message": "Your license for 'Summer Collection 2025' expires in 7 days",
      "actionUrl": "/dashboard/licenses/lic-123",
      "priority": "HIGH",
      "read": false,
      "readAt": null,
      "metadata": {
        "licenseId": "lic-123",
        "expiryDate": "2025-10-20T00:00:00.000Z"
      },
      "createdAt": "2025-10-13T09:00:00.000Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 2,
      "totalPages": 1
    }
  }
}
```

---

### Example 2: Mark as Read

**Request:**
```typescript
await trpc.system.notifications.markAsRead.mutate({
  notificationId: 'clx123abc456'
});
```

**Response:**
```json
{
  "data": {
    "id": "clx123abc456",
    "read": true,
    "readAt": "2025-10-13T14:35:00.000Z"
  }
}
```

---

### Example 3: Update Preferences (Daily Digest)

**Request:**
```typescript
await trpc.system.notifications.updatePreferences.mutate({
  enabledTypes: ['MESSAGE', 'LICENSE', 'PAYOUT'],
  digestFrequency: 'DAILY',
  emailEnabled: true,
  inAppEnabled: true
});
```

**Response:**
```json
{
  "data": {
    "userId": "user-123",
    "enabledTypes": ["MESSAGE", "LICENSE", "PAYOUT"],
    "digestFrequency": "DAILY",
    "emailEnabled": true,
    "inAppEnabled": true
  }
}
```

---

### Example 4: Poll for New Notifications

**Initial Request:**
```typescript
const initial = await trpc.system.notifications.poll.query({});
```

**Response:**
```json
{
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
        "metadata": null,
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

**Subsequent Request (10 seconds later):**
```typescript
const update = await trpc.system.notifications.poll.query({
  lastSeen: '2025-10-13T15:05:00.000Z'
});
```

**Response (no new notifications):**
```json
{
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

### Example 5: Create Notification (Admin Only)

**Request:**
```typescript
// Admin sending announcement to all creators
await trpc.system.notifications.create.mutate({
  userRole: 'CREATOR',
  type: 'SYSTEM',
  title: 'New Feature: Advanced Analytics',
  message: 'Check out the new analytics dashboard to track your IP performance',
  priority: 'MEDIUM',
  actionUrl: '/dashboard/analytics',
  metadata: {
    featureId: 'analytics-v2',
    launchDate: '2025-10-13'
  }
});
```

**Response:**
```json
{
  "data": {
    "created": 47,
    "notificationIds": [
      "clx123abc459",
      "clx123abc460",
      "clx123abc461"
      // ... 44 more IDs
    ]
  }
}
```

---

## cURL Examples

### List Notifications
```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/system.notifications.list' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "read": false,
    "page": 1,
    "pageSize": 20
  }'
```

### Mark as Read
```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/system.notifications.markAsRead' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "notificationId": "clx123abc456"
  }'
```

### Update Preferences
```bash
curl -X POST 'https://ops.yesgoddess.agency/api/trpc/system.notifications.updatePreferences' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "digestFrequency": "DAILY",
    "emailEnabled": true
  }'
```

---

## Query Parameters

All tRPC endpoints use POST requests with JSON bodies. There are no URL query parameters.

---

## Next Steps

- **Part 2:** [Business Logic & Validation Rules](./NOTIFICATIONS_BUSINESS_LOGIC.md)
- **Part 3:** [Frontend Implementation Guide](./NOTIFICATIONS_IMPLEMENTATION_GUIDE.md)
