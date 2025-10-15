# 🌐 Notification System - Complete API Reference

**Classification:** 🌐 SHARED  
**Module:** Notifications  
**Last Updated:** October 14, 2025  
**Document:** Part 1 of 3 - API Endpoints & Type Definitions

> **Context:** The notification system provides in-app notifications with real-time updates for all platform events. Both creators/brands (via yesgoddess-web) and admin staff (via ops.yesgoddess.agency) use these endpoints.

---

## Table of Contents

1. [Base URL & Authentication](#base-url--authentication)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Request/Response Examples](#requestresponse-examples)
5. [cURL Examples](#curl-examples)

---

## Base URL & Authentication

### Backend URLs

**Production:**  
```
https://ops.yesgoddess.agency/api
```

**tRPC Base:**  
```
https://ops.yesgoddess.agency/api/trpc
```

### Authentication

All notification endpoints require authentication via JWT token.

**Using fetch/axios:**
```typescript
const response = await fetch('https://ops.yesgoddess.agency/api/notifications', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

**Using tRPC client:**
```typescript
import { trpc } from '@/lib/trpc';

// Authentication is handled automatically via Next-Auth session
const notifications = await trpc.system.notifications.list.query({
  read: false,
  page: 1,
  pageSize: 20
});
```

---

## API Endpoints

The notification system provides both **REST API** and **tRPC** endpoints. Choose based on your preference:

- **REST API:** Traditional HTTP endpoints (`/api/notifications/*`)
- **tRPC:** Type-safe RPC calls (`trpc.system.notifications.*`)

### Endpoint Summary

| Endpoint | REST | tRPC | Purpose |
|----------|------|------|---------|
| List Notifications | `GET /api/notifications` | `system.notifications.list` | Get paginated list |
| Get Unread Count | `GET /api/notifications/unread` | `system.notifications.getUnreadCount` | Get unread badge count |
| Mark as Read | `PATCH /api/notifications/:id/read` | `system.notifications.markAsRead` | Mark single as read |
| Mark All as Read | `PATCH /api/notifications/read-all` | `system.notifications.markAllAsRead` | Mark all as read |
| Delete Notification | `DELETE /api/notifications/:id` | `system.notifications.delete` | Dismiss notification |
| Get Preferences | `GET /api/notifications/preferences` | `system.notifications.getPreferences` | Get user preferences |
| Update Preferences | `PATCH /api/notifications/preferences` | `system.notifications.updatePreferences` | Update preferences |
| Poll for Updates | `GET /api/notifications/poll` | `system.notifications.poll` | Real-time polling |
| Create (Admin) | N/A | `system.notifications.create` | Admin create notification |

---

## 1. List Notifications

Get a paginated list of notifications for the authenticated user.

### REST API

**Endpoint:** `GET /api/notifications`

**Query Parameters:**
```typescript
interface QueryParams {
  page?: number;             // Page number (default: 1)
  pageSize?: number;         // Items per page (default: 20, max: 100)
  read?: 'true' | 'false';   // Filter by read status
  type?: NotificationType;   // Filter by type
  priority?: NotificationPriority; // Filter by priority
}
```

**Response:**
```typescript
{
  success: true,
  data: NotificationItem[],
  pagination: {
    page: number,
    pageSize: number,
    total: number,
    totalPages: number
  }
}
```

### tRPC

**Endpoint:** `system.notifications.list`  
**Method:** `query`

**Input Schema:**
```typescript
interface ListNotificationsInput {
  read?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
  page?: number;             // default: 1
  pageSize?: number;         // default: 20, max: 100
}
```

**Output Schema:**
```typescript
interface ListNotificationsOutput {
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
```

---

## 2. Get Unread Count

Get the total count of unread notifications. This endpoint is heavily cached for performance.

### REST API

**Endpoint:** `GET /api/notifications/unread`

**Response:**
```typescript
{
  success: true,
  data: {
    count: number
  }
}
```

### tRPC

**Endpoint:** `system.notifications.getUnreadCount`  
**Method:** `query`

**Input:** None

**Output:**
```typescript
{
  data: {
    count: number
  }
}
```

---

## 3. Mark Notification as Read

Mark a specific notification as read.

### REST API

**Endpoint:** `PATCH /api/notifications/:id/read`

**Path Parameters:**
- `id` (string, required): Notification ID (CUID)

**Response:**
```typescript
{
  success: true,
  data: {
    id: string,
    read: boolean,      // Will be true
    readAt: string      // ISO 8601 timestamp
  }
}
```

**Error Responses:**
- `401 Unauthorized`: User not authenticated
- `404 Not Found`: Notification doesn't exist or doesn't belong to user

### tRPC

**Endpoint:** `system.notifications.markAsRead`  
**Method:** `mutation`

**Input:**
```typescript
{
  notificationId: string  // CUID
}
```

**Output:**
```typescript
{
  data: {
    id: string,
    read: boolean,
    readAt: string
  }
}
```

---

## 4. Mark All as Read

Mark all notifications as read for the authenticated user.

### REST API

**Endpoint:** `PATCH /api/notifications/read-all`

**Response:**
```typescript
{
  success: true,
  data: {
    count: number  // Number of notifications marked as read
  }
}
```

### tRPC

**Endpoint:** `system.notifications.markAllAsRead`  
**Method:** `mutation`

**Input:** None

**Output:**
```typescript
{
  data: {
    count: number
  }
}
```

---

## 5. Delete Notification

Permanently delete (dismiss) a notification.

### REST API

**Endpoint:** `DELETE /api/notifications/:id`

**Path Parameters:**
- `id` (string, required): Notification ID (CUID)

**Response:**
```typescript
{
  success: true,
  data: {
    deleted: true
  }
}
```

**Error Responses:**
- `401 Unauthorized`: User not authenticated
- `404 Not Found`: Notification doesn't exist or doesn't belong to user

### tRPC

**Endpoint:** `system.notifications.delete`  
**Method:** `mutation`

**Input:**
```typescript
{
  notificationId: string  // CUID
}
```

**Output:**
```typescript
{
  data: {
    success: boolean
  }
}
```

---

## 6. Get Notification Preferences

Retrieve the authenticated user's notification preferences.

### REST API

**Endpoint:** `GET /api/notifications/preferences`

**Response:**
```typescript
{
  success: true,
  data: {
    userId: string,
    enabledTypes: NotificationType[],
    digestFrequency: DigestFrequency,
    emailEnabled: boolean,
    inAppEnabled: boolean,
    lastDigestSentAt?: string  // ISO 8601
  }
}
```

### tRPC

**Endpoint:** `system.notifications.getPreferences`  
**Method:** `query`

**Input:** None

**Output:**
```typescript
{
  data: {
    userId: string,
    enabledTypes: NotificationType[],
    digestFrequency: DigestFrequency,
    emailEnabled: boolean,
    inAppEnabled: boolean,
    lastDigestSentAt?: string
  }
}
```

---

## 7. Update Notification Preferences

Update the authenticated user's notification preferences.

### REST API

**Endpoint:** `PATCH /api/notifications/preferences`

**Request Body:**
```typescript
{
  enabledTypes?: NotificationType[],
  digestFrequency?: DigestFrequency,
  emailEnabled?: boolean,
  inAppEnabled?: boolean
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    userId: string,
    enabledTypes: NotificationType[],
    digestFrequency: DigestFrequency,
    emailEnabled: boolean,
    inAppEnabled: boolean
  }
}
```

### tRPC

**Endpoint:** `system.notifications.updatePreferences`  
**Method:** `mutation`

**Input:**
```typescript
{
  enabledTypes?: NotificationType[],
  digestFrequency?: DigestFrequency,
  emailEnabled?: boolean,
  inAppEnabled?: boolean
}
```

**Output:**
```typescript
{
  data: {
    userId: string,
    enabledTypes: NotificationType[],
    digestFrequency: DigestFrequency,
    emailEnabled: boolean,
    inAppEnabled: boolean
  }
}
```

---

## 8. Poll for New Notifications

Efficient polling endpoint for real-time updates. Includes rate limiting and caching.

### REST API

**Endpoint:** `GET /api/notifications/poll`

**Query Parameters:**
```typescript
{
  lastSeen?: string  // ISO 8601 timestamp (optional)
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    notifications: NotificationItem[],  // Max 50 per poll
    newCount: number,
    unreadCount: number,
    lastSeen: string,              // ISO 8601 timestamp
    suggestedPollInterval: number  // Seconds (default: 10)
  }
}
```

**Rate Limiting:**
- **Limit:** 1 request per 10 seconds per user
- **Response on limit:** HTTP 429 with `Retry-After` header

**Error Responses:**
- `401 Unauthorized`: User not authenticated
- `429 Too Many Requests`: Rate limit exceeded (includes `Retry-After` header)

### tRPC

**Endpoint:** `system.notifications.poll`  
**Method:** `query`

**Input:**
```typescript
{
  lastSeen?: string  // ISO 8601 timestamp
}
```

**Output:**
```typescript
{
  data: {
    notifications: NotificationItem[],
    newCount: number,
    unreadCount: number,
    lastSeen: string,
    suggestedPollInterval: number
  }
}
```

---

## 9. Create Notification (Admin Only)

Create notifications for specific users, user groups, or all users with a role. **Admin access required.**

### tRPC Only

**Endpoint:** `system.notifications.create`  
**Method:** `mutation`  
**Role Required:** `ADMIN`

**Input:**
```typescript
{
  // Target (provide ONE of these)
  userId?: string,              // Single user
  userIds?: string[],           // Multiple specific users
  userRole?: UserRole,          // All users with role
  
  // Content
  type: NotificationType,
  title: string,                // Max 255 chars
  message: string,              // Max 1000 chars
  priority?: NotificationPriority,  // default: MEDIUM
  actionUrl?: string,           // URL or path
  metadata?: Record<string, any>
}
```

**Output:**
```typescript
{
  data: {
    created: number,             // Number of notifications created
    notificationIds: string[]    // Array of notification IDs
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not an admin
- `400 Bad Request`: Missing target or validation failed

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * Notification types categorize the event that triggered the notification
 */
enum NotificationType {
  LICENSE = 'LICENSE',      // License-related events (approval, expiry, etc.)
  PAYOUT = 'PAYOUT',        // Payment and payout notifications
  ROYALTY = 'ROYALTY',      // Royalty statement notifications
  PROJECT = 'PROJECT',      // Project invitations and updates
  SYSTEM = 'SYSTEM',        // System announcements and maintenance
  MESSAGE = 'MESSAGE'       // Direct messages from other users
}

/**
 * Priority levels affect notification display and sorting
 */
enum NotificationPriority {
  LOW = 'LOW',          // Informational, no action needed
  MEDIUM = 'MEDIUM',    // Standard priority (default)
  HIGH = 'HIGH',        // Important, user should review
  URGENT = 'URGENT'     // Critical, requires immediate attention
}

/**
 * Digest frequency for email notifications
 */
enum DigestFrequency {
  IMMEDIATE = 'IMMEDIATE',  // Send emails immediately
  DAILY = 'DAILY',          // Daily digest at 9 AM user timezone
  WEEKLY = 'WEEKLY',        // Weekly digest on Mondays
  NEVER = 'NEVER'           // No email notifications
}

/**
 * User roles for targeting notifications
 */
enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER'
}
```

### Interface Definitions

```typescript
/**
 * Individual notification item
 */
interface NotificationItem {
  id: string;                           // CUID identifier
  type: NotificationType;               // Notification category
  title: string;                        // Short title (max 255 chars)
  message: string;                      // Full message content
  actionUrl: string | null;             // Click destination (URL or path)
  priority: NotificationPriority;       // Display priority
  read: boolean;                        // Read status
  readAt: string | null;                // ISO 8601 timestamp when read
  metadata: Record<string, any> | null; // Additional context data
  createdAt: string;                    // ISO 8601 timestamp when created
}

/**
 * User notification preferences
 */
interface NotificationPreferences {
  userId: string;
  enabledTypes: NotificationType[];      // Which types to receive
  digestFrequency: DigestFrequency;      // Email frequency
  emailEnabled: boolean;                 // Master email toggle
  inAppEnabled: boolean;                 // In-app notifications (always true)
  lastDigestSentAt?: string;            // ISO 8601 timestamp
}

/**
 * Pagination metadata
 */
interface PaginationMeta {
  page: number;          // Current page (1-indexed)
  pageSize: number;      // Items per page
  total: number;         // Total items across all pages
  totalPages: number;    // Total number of pages
}
```

### Metadata Examples by Type

Different notification types include different metadata structures:

```typescript
// LICENSE type
interface LicenseNotificationMetadata {
  licenseId: string;
  assetId?: string;
  expiryDate?: string;      // ISO 8601
  licenseName?: string;
}

// PAYOUT type
interface PayoutNotificationMetadata {
  payoutId: string;
  amountCents: number;
  currency: string;
  paymentMethod?: string;
}

// ROYALTY type
interface RoyaltyNotificationMetadata {
  statementId: string;
  periodStart: string;      // ISO 8601
  periodEnd: string;        // ISO 8601
  totalEarningsCents: number;
}

// PROJECT type
interface ProjectNotificationMetadata {
  projectId: string;
  projectName: string;
  invitedBy?: string;
  role?: string;
}

// MESSAGE type
interface MessageNotificationMetadata {
  threadId: string;
  senderId: string;
  senderName: string;
  messagePreview?: string;
}

// SYSTEM type
interface SystemNotificationMetadata {
  announcementId?: string;
  maintenanceWindow?: {
    start: string;          // ISO 8601
    end: string;            // ISO 8601
  };
  featureId?: string;
}
```

---

## Request/Response Examples

### Example 1: List Unread Notifications

**REST API:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/notifications?read=false&page=1&pageSize=20' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

**tRPC:**
```typescript
const { data, meta } = await trpc.system.notifications.list.query({
  read: false,
  page: 1,
  pageSize: 20
});
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
        "senderName": "Sarah Chen"
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
        "expiryDate": "2025-10-20T00:00:00.000Z",
        "licenseName": "Summer Collection 2025"
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

### Example 2: Get Unread Count

**REST API:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/notifications/unread' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

**tRPC:**
```typescript
const { data } = await trpc.system.notifications.getUnreadCount.query();
console.log(`You have ${data.count} unread notifications`);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "count": 5
  }
}
```

---

### Example 3: Mark as Read

**REST API:**
```bash
curl -X PATCH 'https://ops.yesgoddess.agency/api/notifications/clx123abc456/read' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

**tRPC:**
```typescript
await trpc.system.notifications.markAsRead.mutate({
  notificationId: 'clx123abc456'
});
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clx123abc456",
    "read": true,
    "readAt": "2025-10-14T10:15:00.000Z"
  }
}
```

---

### Example 4: Update Preferences (Disable Email for Payouts)

**REST API:**
```bash
curl -X PATCH 'https://ops.yesgoddess.agency/api/notifications/preferences' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "enabledTypes": ["LICENSE", "ROYALTY", "PROJECT", "SYSTEM", "MESSAGE"],
    "digestFrequency": "DAILY"
  }'
```

**tRPC:**
```typescript
await trpc.system.notifications.updatePreferences.mutate({
  enabledTypes: ['LICENSE', 'ROYALTY', 'PROJECT', 'SYSTEM', 'MESSAGE'],
  digestFrequency: 'DAILY'
});
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user-123",
    "enabledTypes": ["LICENSE", "ROYALTY", "PROJECT", "SYSTEM", "MESSAGE"],
    "digestFrequency": "DAILY",
    "emailEnabled": true,
    "inAppEnabled": true
  }
}
```

---

### Example 5: Poll for New Notifications

**REST API:**
```bash
# First poll
curl -X GET 'https://ops.yesgoddess.agency/api/notifications/poll' \
  -H 'Authorization: Bearer YOUR_TOKEN'

# Subsequent poll with lastSeen
curl -X GET 'https://ops.yesgoddess.agency/api/notifications/poll?lastSeen=2025-10-14T10:00:00.000Z' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

**tRPC:**
```typescript
// First poll
const { data } = await trpc.system.notifications.poll.query();

// Store lastSeen and poll again after suggestedPollInterval
setTimeout(async () => {
  const newData = await trpc.system.notifications.poll.query({
    lastSeen: data.lastSeen
  });
}, data.suggestedPollInterval * 1000);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "clx123abc458",
        "type": "PAYOUT",
        "title": "Payment Processed",
        "message": "Your payout of $250.00 has been processed",
        "actionUrl": "/dashboard/payouts/payout-789",
        "priority": "MEDIUM",
        "read": false,
        "readAt": null,
        "metadata": {
          "payoutId": "payout-789",
          "amountCents": 25000,
          "currency": "USD"
        },
        "createdAt": "2025-10-14T10:05:00.000Z"
      }
    ],
    "newCount": 1,
    "unreadCount": 6,
    "lastSeen": "2025-10-14T10:10:00.000Z",
    "suggestedPollInterval": 10
  }
}
```

---

### Example 6: Admin Creates Announcement

**tRPC Only:**
```typescript
// Send announcement to all creators
await trpc.system.notifications.create.mutate({
  userRole: 'CREATOR',
  type: 'SYSTEM',
  title: 'New Feature: Advanced Analytics',
  message: 'Check out the new analytics dashboard to track your IP performance across all licenses',
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

### List Notifications with Filtering

```bash
# Get unread LICENSE notifications
curl -X GET 'https://ops.yesgoddess.agency/api/notifications?read=false&type=LICENSE&page=1&pageSize=10' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json'

# Get HIGH priority notifications
curl -X GET 'https://ops.yesgoddess.agency/api/notifications?priority=HIGH&page=1&pageSize=20' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

### Mark All as Read

```bash
curl -X PATCH 'https://ops.yesgoddess.agency/api/notifications/read-all' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json'
```

### Delete Notification

```bash
curl -X DELETE 'https://ops.yesgoddess.agency/api/notifications/clx123abc456' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

### Get Preferences

```bash
curl -X GET 'https://ops.yesgoddess.agency/api/notifications/preferences' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

### Update Preferences (Disable All Email Notifications)

```bash
curl -X PATCH 'https://ops.yesgoddess.agency/api/notifications/preferences' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "emailEnabled": false,
    "inAppEnabled": true
  }'
```

---

## Next Steps

- **Part 2:** [Business Logic & Validation Rules](./NOTIFICATION_SYSTEM_COMPLETE_BUSINESS_LOGIC.md)
- **Part 3:** [Frontend Implementation Guide](./NOTIFICATION_SYSTEM_COMPLETE_IMPLEMENTATION.md)

---

**Questions or Issues?** Contact the backend team or file an issue in the repository.
