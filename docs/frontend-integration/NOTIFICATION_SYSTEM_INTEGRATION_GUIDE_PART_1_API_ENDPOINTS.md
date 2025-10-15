# 🌐 Notification System - Frontend Integration Guide
## Part 1: API Endpoints & Request/Response Schemas

**Classification:** 🌐 SHARED  
**Module:** Notification Service  
**Last Updated:** October 14, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Request/Response Schemas](#requestresponse-schemas)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Request/Response Examples](#requestresponse-examples)

---

## Overview

The Notification System provides comprehensive in-app notification management with support for:

- **Bulk notification creation** for efficient multi-user messaging
- **Priority handling** (URGENT, HIGH, MEDIUM, LOW)
- **Notification categorization** by type (LICENSE, PAYOUT, ROYALTY, PROJECT, SYSTEM, MESSAGE)
- **Intelligent bundling/grouping** to prevent notification spam
- **Real-time polling** with efficient caching
- **User preferences** for email delivery and digest frequency
- **Automatic expiry and cleanup** based on configurable rules

### Architecture

- **Base URL:** `https://ops.yesgoddess.agency/api`
- **Authentication:** JWT-based session authentication (cookies)
- **Response Format:** JSON with standardized structure

---

## API Endpoints

### Core Notification Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/notifications` | GET | Required | List user's notifications (paginated) |
| `/api/notifications/:id` | DELETE | Required | Delete/dismiss a notification |
| `/api/notifications/:id/read` | PATCH | Required | Mark single notification as read |
| `/api/notifications/read-all` | PATCH | Required | Mark all user's notifications as read |
| `/api/notifications/unread` | GET | Required | Get unread notification count |
| `/api/notifications/poll` | GET | Required | Poll for new notifications (efficient) |

### Preference Management Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/notifications/preferences` | GET | Required | Get user's notification preferences |
| `/api/notifications/preferences` | PATCH | Required | Update notification preferences |

### Admin-Only Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/notifications` | POST | Admin | Create notification(s) for user(s) |

---

## Request/Response Schemas

### 1. List Notifications

**Endpoint:** `GET /api/notifications`

#### Query Parameters

```typescript
interface ListNotificationsQuery {
  page?: number;           // Page number (default: 1)
  pageSize?: number;       // Items per page (default: 20, max: 100)
  read?: 'true' | 'false'; // Filter by read status
  type?: NotificationType; // Filter by type
  priority?: NotificationPriority; // Filter by priority
}
```

#### Response Schema

```typescript
interface ListNotificationsResponse {
  success: true;
  data: Notification[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

---

### 2. Get Unread Count

**Endpoint:** `GET /api/notifications/unread`

#### Response Schema

```typescript
interface UnreadCountResponse {
  success: true;
  data: {
    count: number;
  };
}
```

---

### 3. Poll for New Notifications

**Endpoint:** `GET /api/notifications/poll`

#### Query Parameters

```typescript
interface PollNotificationsQuery {
  lastSeen?: string; // ISO 8601 datetime (optional)
}
```

#### Response Schema

```typescript
interface PollNotificationsResponse {
  success: true;
  data: {
    hasNew: boolean;
    notifications: Notification[]; // Only new notifications
    unreadCount: number;
    lastPolled: string; // ISO 8601 datetime
  };
}
```

**Rate Limiting:**
- Max 1 request per 10 seconds per user
- Returns `429 Too Many Requests` if exceeded with `Retry-After` header

---

### 4. Mark as Read

**Endpoint:** `PATCH /api/notifications/:id/read`

#### Response Schema

```typescript
interface MarkAsReadResponse {
  success: true;
  data: {
    id: string;
    read: true;
    readAt: string; // ISO 8601 datetime
  };
}
```

---

### 5. Mark All as Read

**Endpoint:** `PATCH /api/notifications/read-all`

#### Response Schema

```typescript
interface MarkAllAsReadResponse {
  success: true;
  data: {
    count: number; // Number of notifications marked as read
  };
}
```

---

### 6. Delete Notification

**Endpoint:** `DELETE /api/notifications/:id`

#### Response Schema

```typescript
interface DeleteNotificationResponse {
  success: true;
  data: {
    deleted: true;
  };
}
```

---

### 7. Get Preferences

**Endpoint:** `GET /api/notifications/preferences`

#### Response Schema

```typescript
interface GetPreferencesResponse {
  success: true;
  data: NotificationPreferences;
}
```

---

### 8. Update Preferences

**Endpoint:** `PATCH /api/notifications/preferences`

#### Request Body Schema

```typescript
interface UpdatePreferencesRequest {
  enabledTypes?: NotificationType[];
  digestFrequency?: 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'NEVER';
  emailEnabled?: boolean;
  inAppEnabled?: boolean;
}
```

#### Response Schema

```typescript
interface UpdatePreferencesResponse {
  success: true;
  data: NotificationPreferences;
}
```

---

### 9. Create Notification (Admin Only)

**Endpoint:** `POST /api/notifications`

#### Request Body Schema

```typescript
interface CreateNotificationRequest {
  // Target users (provide ONE of these)
  userId?: string;          // Single user ID
  userIds?: string[];       // Multiple user IDs
  userRole?: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER'; // All users with role
  
  // Notification content
  type: NotificationType;
  title: string;            // Max 255 characters
  message: string;          // Max 1000 characters
  priority?: NotificationPriority; // Default: MEDIUM
  actionUrl?: string;       // URL or path (e.g., /dashboard/licenses/123)
  metadata?: Record<string, any>; // Additional context data
}
```

#### Response Schema

```typescript
interface CreateNotificationResponse {
  success: true;
  data: {
    created: number;
    notificationIds: string[];
  };
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
// Copy these into your frontend codebase

export type NotificationType = 
  | 'LICENSE'
  | 'PAYOUT'
  | 'ROYALTY'
  | 'PROJECT'
  | 'SYSTEM'
  | 'MESSAGE';

export type NotificationPriority = 
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'URGENT';

export type DigestFrequency = 
  | 'IMMEDIATE'
  | 'DAILY'
  | 'WEEKLY'
  | 'NEVER';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl: string | null;
  priority: NotificationPriority;
  read: boolean;
  readAt: string | null; // ISO 8601 datetime
  metadata: Record<string, any> | null;
  createdAt: string; // ISO 8601 datetime
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  enabledTypes: NotificationType[];
  digestFrequency: DigestFrequency;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### API Response Wrapper Types

```typescript
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: any;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Pagination metadata
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
```

### Type Guards

```typescript
export function isNotificationType(value: string): value is NotificationType {
  return ['LICENSE', 'PAYOUT', 'ROYALTY', 'PROJECT', 'SYSTEM', 'MESSAGE'].includes(value);
}

export function isNotificationPriority(value: string): value is NotificationPriority {
  return ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(value);
}

export function isApiError(response: ApiResponse<any>): response is ApiErrorResponse {
  return response.success === false;
}
```

---

## Request/Response Examples

### Example 1: List Unread Notifications

**Request:**
```bash
curl -X GET "https://ops.yesgoddess.agency/api/notifications?read=false&page=1&pageSize=20" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx789abc123",
      "type": "LICENSE",
      "title": "License Approved",
      "message": "Your license for 'Goddess Collection Vol. 1' has been approved.",
      "actionUrl": "/licenses/clx123license",
      "priority": "HIGH",
      "read": false,
      "readAt": null,
      "metadata": {
        "licenseId": "clx123license",
        "assetName": "Goddess Collection Vol. 1"
      },
      "createdAt": "2025-10-14T10:30:00.000Z"
    },
    {
      "id": "clx789abc124",
      "type": "MESSAGE",
      "title": "New Message",
      "message": "Sarah Johnson sent you a message: Hey! Let's discuss the licensing terms...",
      "actionUrl": "/messages/thread123",
      "priority": "MEDIUM",
      "read": false,
      "readAt": null,
      "metadata": {
        "threadId": "thread123",
        "senderId": "user456"
      },
      "createdAt": "2025-10-14T09:15:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 8,
    "totalPages": 1
  }
}
```

---

### Example 2: Poll for New Notifications

**Request:**
```bash
curl -X GET "https://ops.yesgoddess.agency/api/notifications/poll?lastSeen=2025-10-14T10:00:00.000Z" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

**Response (200 OK) - Has New:**
```json
{
  "success": true,
  "data": {
    "hasNew": true,
    "notifications": [
      {
        "id": "clx789abc125",
        "type": "PAYOUT",
        "title": "Payout Completed",
        "message": "Your payout of $1,250.00 has been processed successfully.",
        "actionUrl": "/payouts/clx789payout",
        "priority": "HIGH",
        "read": false,
        "readAt": null,
        "metadata": {
          "payoutId": "clx789payout",
          "amount": 1250.00,
          "currency": "USD"
        },
        "createdAt": "2025-10-14T10:25:00.000Z"
      }
    ],
    "unreadCount": 9,
    "lastPolled": "2025-10-14T10:30:15.234Z"
  }
}
```

**Response (200 OK) - No New:**
```json
{
  "success": true,
  "data": {
    "hasNew": false,
    "notifications": [],
    "unreadCount": 8,
    "lastPolled": "2025-10-14T10:30:15.234Z"
  }
}
```

**Response (429 Too Many Requests) - Rate Limited:**
```json
{
  "success": false,
  "error": "Rate limit exceeded. Please wait before polling again."
}
```

**Headers:**
```
Retry-After: 7
```

---

### Example 3: Mark Notification as Read

**Request:**
```bash
curl -X PATCH "https://ops.yesgoddess.agency/api/notifications/clx789abc123/read" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "clx789abc123",
    "read": true,
    "readAt": "2025-10-14T10:35:22.156Z"
  }
}
```

---

### Example 4: Get Unread Count

**Request:**
```bash
curl -X GET "https://ops.yesgoddess.agency/api/notifications/unread" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "count": 7
  }
}
```

---

### Example 5: Update Notification Preferences

**Request:**
```bash
curl -X PATCH "https://ops.yesgoddess.agency/api/notifications/preferences" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "digestFrequency": "DAILY",
    "emailEnabled": true,
    "enabledTypes": ["LICENSE", "PAYOUT", "ROYALTY", "PROJECT", "SYSTEM"]
  }'
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "clx123prefs",
    "userId": "user123",
    "enabledTypes": ["LICENSE", "PAYOUT", "ROYALTY", "PROJECT", "SYSTEM"],
    "digestFrequency": "DAILY",
    "emailEnabled": true,
    "inAppEnabled": true,
    "createdAt": "2025-09-01T00:00:00.000Z",
    "updatedAt": "2025-10-14T10:40:00.000Z"
  }
}
```

---

### Example 6: Create Notification (Admin)

**Request:**
```bash
curl -X POST "https://ops.yesgoddess.agency/api/notifications" \
  -H "Cookie: next-auth.session-token=ADMIN_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userRole": "CREATOR",
    "type": "SYSTEM",
    "title": "New Feature: Advanced Analytics",
    "message": "Check out the new analytics dashboard to track your IP performance",
    "priority": "MEDIUM",
    "actionUrl": "/dashboard/analytics",
    "metadata": {
      "featureId": "analytics-v2",
      "launchDate": "2025-10-13"
    }
  }'
```

**Response (200 OK):**
```json
{
  "success": true,
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

### Example 7: Delete Notification

**Request:**
```bash
curl -X DELETE "https://ops.yesgoddess.agency/api/notifications/clx789abc123" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

---

### Example 8: Error Responses

#### Unauthorized (401)
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

#### Not Found (404)
```json
{
  "success": false,
  "error": "Notification not found"
}
```

#### Validation Error (400)
```json
{
  "success": false,
  "error": "Invalid query parameters",
  "details": [
    {
      "code": "invalid_type",
      "expected": "number",
      "received": "string",
      "path": ["page"],
      "message": "Expected number, received string"
    }
  ]
}
```

#### Rate Limit Error (429)
```json
{
  "success": false,
  "error": "Rate limit exceeded. Please wait before polling again."
}
```

#### Server Error (500)
```json
{
  "success": false,
  "error": "Internal server error"
}
```

---

## Next Steps

Continue to:
- **[Part 2: Business Logic & Implementation](./NOTIFICATION_SYSTEM_INTEGRATION_GUIDE_PART_2_BUSINESS_LOGIC.md)**
- **[Part 3: Frontend Implementation Checklist](./NOTIFICATION_SYSTEM_INTEGRATION_GUIDE_PART_3_IMPLEMENTATION.md)**
