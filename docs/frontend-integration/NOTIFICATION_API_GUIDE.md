# Notification API Endpoints

## Overview

The Notification API provides both REST and tRPC endpoints for managing user notifications in the YesGoddess backend system. All endpoints require authentication.

## REST API Endpoints

### Base URL
```
/api/notifications
```

### Authentication
All endpoints require a valid session. Include authentication headers or cookies in your requests.

---

## Core Endpoints

### 1. List Notifications
**GET** `/api/notifications`

Retrieve a paginated list of notifications for the authenticated user.

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `pageSize` (number, optional): Items per page (default: 20, max: 100)
- `read` (string, optional): Filter by read status ('true' or 'false')
- `type` (string, optional): Filter by notification type
  - `LICENSE`, `PAYOUT`, `ROYALTY`, `PROJECT`, `SYSTEM`, `MESSAGE`
- `priority` (string, optional): Filter by priority
  - `LOW`, `MEDIUM`, `HIGH`, `URGENT`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clxxx...",
      "type": "LICENSE",
      "title": "License Approved",
      "message": "Your license for 'Summer Campaign' has been approved",
      "actionUrl": "/licenses/clxxx",
      "priority": "HIGH",
      "read": false,
      "readAt": null,
      "metadata": {},
      "createdAt": "2025-10-12T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

### 2. Get Unread Count
**GET** `/api/notifications/unread`

Get the count of unread notifications for the authenticated user. This endpoint is optimized with caching for frequent polling.

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

### 3. Mark Notification as Read
**PATCH** `/api/notifications/:id/read`

Mark a specific notification as read.

**Parameters:**
- `id` (string): Notification ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clxxx...",
    "read": true,
    "readAt": "2025-10-12T11:00:00.000Z"
  }
}
```

**Error Responses:**
- `404`: Notification not found or doesn't belong to user
- `401`: Unauthorized

---

### 4. Mark All as Read
**PATCH** `/api/notifications/read-all`

Mark all notifications as read for the authenticated user.

**Response:**
```json
{
  "success": true,
  "data": {
    "count": 12
  }
}
```

---

### 5. Delete Notification
**DELETE** `/api/notifications/:id`

Delete/dismiss a specific notification.

**Parameters:**
- `id` (string): Notification ID

**Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

**Error Responses:**
- `404`: Notification not found or doesn't belong to user
- `401`: Unauthorized

---

### 6. Get Notification Preferences
**GET** `/api/notifications/preferences`

Retrieve the authenticated user's notification preferences.

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "clxxx...",
    "enabledTypes": ["LICENSE", "PAYOUT", "ROYALTY", "PROJECT", "SYSTEM", "MESSAGE"],
    "digestFrequency": "DAILY",
    "emailEnabled": true,
    "inAppEnabled": true,
    "lastDigestSentAt": "2025-10-11T09:00:00.000Z"
  }
}
```

---

### 7. Update Notification Preferences
**PATCH** `/api/notifications/preferences`

Update the authenticated user's notification preferences.

**Request Body:**
```json
{
  "enabledTypes": ["LICENSE", "PAYOUT", "SYSTEM"],
  "digestFrequency": "WEEKLY",
  "emailEnabled": true,
  "inAppEnabled": true
}
```

**Fields:**
- `enabledTypes` (array, optional): Array of notification types to receive
- `digestFrequency` (string, optional): `IMMEDIATE`, `DAILY`, `WEEKLY`, `NEVER`
- `emailEnabled` (boolean, optional): Enable email notifications (requires verified email)
- `inAppEnabled` (boolean, optional): Enable in-app notifications

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "clxxx...",
    "enabledTypes": ["LICENSE", "PAYOUT", "SYSTEM"],
    "digestFrequency": "WEEKLY",
    "emailEnabled": true,
    "inAppEnabled": true
  }
}
```

**Error Responses:**
- `400`: Cannot enable email notifications without verified email
- `400`: Invalid request body
- `401`: Unauthorized

---

## Real-time Updates

### 8. Poll for New Notifications
**GET** `/api/notifications/poll`

Efficient polling endpoint for checking for new notifications. Includes rate limiting and caching.

**Query Parameters:**
- `lastSeen` (string, optional): ISO 8601 timestamp of last poll. If not provided, returns recent notifications from the last hour.

**Rate Limiting:**
- 1 request per 10 seconds per user
- Returns `429 Too Many Requests` with `Retry-After` header if exceeded

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "clxxx...",
        "type": "MESSAGE",
        "title": "New Message",
        "message": "You have a new message from Brand X",
        "actionUrl": "/messages/clxxx",
        "priority": "MEDIUM",
        "read": false,
        "readAt": null,
        "metadata": {},
        "createdAt": "2025-10-12T11:05:00.000Z"
      }
    ],
    "newCount": 1,
    "unreadCount": 6,
    "lastSeen": "2025-10-12T11:05:30.000Z",
    "suggestedPollInterval": 10
  }
}
```

**Response Fields:**
- `notifications`: Array of new notifications since `lastSeen`
- `newCount`: Number of new notifications in this response
- `unreadCount`: Total unread notification count
- `lastSeen`: Timestamp to use for next poll request
- `suggestedPollInterval`: Recommended seconds to wait before next poll

**Behavior:**
- Returns max 50 notifications per poll
- Queries up to 24 hours in the past
- Caches "no new notifications" result for 5 seconds
- Handles clock skew gracefully

**Usage Example:**
```typescript
// Initial poll
const response = await fetch('/api/notifications/poll');
const { data } = await response.json();

// Subsequent polls
setTimeout(async () => {
  const nextResponse = await fetch(
    `/api/notifications/poll?lastSeen=${data.lastSeen}`
  );
  // Process new notifications...
}, data.suggestedPollInterval * 1000);
```

---

## tRPC Endpoints

All REST endpoints also have tRPC equivalents available through the `system.notifications` router:

- `system.notifications.list` - List notifications
- `system.notifications.getUnreadCount` - Get unread count
- `system.notifications.markAsRead` - Mark single notification as read
- `system.notifications.markAllAsRead` - Mark all as read
- `system.notifications.delete` - Delete notification
- `system.notifications.getPreferences` - Get preferences
- `system.notifications.updatePreferences` - Update preferences
- `system.notifications.poll` - Poll for new notifications
- `system.notifications.create` - Create notification (admin only)

---

## Notification Types

### Available Types
- **LICENSE**: License-related notifications (approvals, expirations, amendments)
- **PAYOUT**: Financial payout notifications
- **ROYALTY**: Royalty statement notifications
- **PROJECT**: Project invitations and updates
- **SYSTEM**: System announcements and maintenance
- **MESSAGE**: Direct messages between users

### Priority Levels
- **URGENT**: Critical notifications requiring immediate attention (sent immediately via email)
- **HIGH**: Important notifications (sent immediately via email)
- **MEDIUM**: Standard notifications (included in digest emails)
- **LOW**: Informational notifications (included in digest emails)

---

## Best Practices

### Polling Strategy

1. **Initial Connection**
   - Fetch recent notifications without `lastSeen` parameter
   - Display unread count in UI

2. **Regular Polling**
   - Use `lastSeen` timestamp from previous poll
   - Respect `suggestedPollInterval` (10 seconds)
   - Handle rate limit responses gracefully with exponential backoff

3. **Background Tab Optimization**
   - Reduce polling frequency when tab is not active
   - Resume normal polling when tab becomes active

4. **Mobile Considerations**
   - Implement longer poll intervals to save battery
   - Use push notifications for high-priority items when possible

### Error Handling

```typescript
async function pollNotifications(lastSeen?: string) {
  try {
    const url = lastSeen 
      ? `/api/notifications/poll?lastSeen=${lastSeen}`
      : '/api/notifications/poll';
      
    const response = await fetch(url);
    
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '10');
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return pollNotifications(lastSeen);
    }
    
    if (!response.ok) {
      throw new Error('Failed to poll notifications');
    }
    
    const { data } = await response.json();
    return data;
  } catch (error) {
    console.error('Polling error:', error);
    // Implement exponential backoff
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s
    return pollNotifications(lastSeen);
  }
}
```

### Performance Tips

1. **Caching**: Unread count and poll results are cached server-side
2. **Pagination**: Use appropriate `pageSize` for list endpoint
3. **Filtering**: Use `type` and `priority` filters to reduce payload
4. **Bundling**: Similar notifications are automatically bundled to reduce noise

---

## Notification Metadata

Notifications can include custom metadata in the `metadata` field. Common metadata patterns:

```typescript
// License notification
{
  "licenseId": "clxxx...",
  "assetName": "Summer Campaign",
  "brandName": "Brand X"
}

// Payout notification
{
  "payoutId": "clxxx...",
  "amount": "$1,234.56",
  "period": "2025-09"
}

// Bundled notification
{
  "bundleKey": "new-messages",
  "bundleCount": 5,
  "lastBundledAt": "2025-10-12T11:00:00.000Z"
}
```

---

## Cache Invalidation

The following actions automatically invalidate relevant caches:

- Creating a notification → clears poll cache and unread count cache
- Marking as read → clears unread count cache
- Marking all as read → clears unread count cache
- Deleting a notification → clears unread count cache
- Updating preferences → clears preferences cache

---

## Security

- All endpoints require authentication
- Users can only access their own notifications
- Admin users can create notifications for any user
- Rate limiting prevents abuse of polling endpoint
- SQL injection protection via Prisma ORM
- Input validation via Zod schemas

---

## Migration from WebSockets

If migrating from a WebSocket-based notification system:

1. Replace WebSocket connection with polling endpoint
2. Use `lastSeen` timestamp to track state
3. Update UI when new notifications are received
4. Consider hybrid approach: polling for reliable updates, WebSockets for instant delivery
