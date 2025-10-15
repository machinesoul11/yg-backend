# 🌐 Notification System - Frontend Integration Guide
## Part 2: Business Logic & Validation Rules

**Classification:** 🌐 SHARED  
**Module:** Notification Service  
**Last Updated:** October 14, 2025

---

## Table of Contents

1. [Business Logic Overview](#business-logic-overview)
2. [Notification Types & Priority Rules](#notification-types--priority-rules)
3. [Bundling & Grouping Logic](#bundling--grouping-logic)
4. [Email Delivery Rules](#email-delivery-rules)
5. [Preference Management](#preference-management)
6. [Validation Rules](#validation-rules)
7. [Error Handling](#error-handling)
8. [Authorization & Permissions](#authorization--permissions)
9. [Rate Limiting](#rate-limiting)
10. [Caching Strategy](#caching-strategy)

---

## Business Logic Overview

The notification system implements several layers of intelligent behavior:

1. **Priority-based delivery** - URGENT/HIGH notifications trigger immediate emails
2. **Type-based categorization** - Notifications grouped by business domain
3. **Bundling prevention** - Similar notifications grouped to prevent spam
4. **User preferences** - Respect user's delivery and digest preferences
5. **Automatic cleanup** - Old notifications expire based on rules

---

## Notification Types & Priority Rules

### Notification Types

| Type | Description | Default Priority | Can Bundle | Email Behavior |
|------|-------------|------------------|------------|----------------|
| **LICENSE** | License-related events | MEDIUM | Yes (15 min window) | Digest |
| **PAYOUT** | Payment & payout events | HIGH | No | Immediate |
| **ROYALTY** | Royalty statements | MEDIUM | Yes (60 min window) | Digest |
| **PROJECT** | Project activities | MEDIUM | Yes (30 min window) | Digest |
| **SYSTEM** | System-wide announcements | HIGH | No | Immediate |
| **MESSAGE** | Direct messages | MEDIUM | Yes (5 min window) | Configurable |

### Priority Levels

| Priority | Badge Color | Email Behavior | Use Cases | UI Treatment |
|----------|-------------|----------------|-----------|--------------|
| **URGENT** | Red | Immediate email | Critical failures, security issues, urgent actions | Red badge, toast notification |
| **HIGH** | Orange | Immediate email | Approvals, important updates, completed payouts | Orange badge, prominent display |
| **MEDIUM** | Blue | Digest email | General notifications, new messages | Blue badge, standard display |
| **LOW** | Gray | Digest email | Info, tips, minor updates | Gray badge, subtle display |

### Type-Specific Business Rules

#### LICENSE Notifications
- **Approved:** HIGH priority, immediate email
- **Rejected:** HIGH priority, immediate email with reason
- **Expiring Soon:** MEDIUM priority, digest email
  - 90 days before: Initial offer
  - 60 days before: First reminder
  - 30 days before: Second reminder (HIGH priority)
  - 7 days before: Final notice (URGENT priority)
- **Expired:** URGENT priority, immediate email

#### PAYOUT Notifications
- **Completed:** HIGH priority, immediate email
- **Failed:** URGENT priority, immediate email with action required
- **Pending:** MEDIUM priority, digest email

#### MESSAGE Notifications
- **Single message:** MEDIUM priority
- **Bundled messages:** Title updates to show count
- **Muted threads:** No notification created
- **Cooldown:** 5 minutes between email notifications per thread

---

## Bundling & Grouping Logic

### How Bundling Works

Bundling prevents notification spam by updating existing notifications instead of creating duplicates.

**Rules:**
1. Only applies to notification types where `canBundle: true`
2. Only bundles within the defined time window (see table above)
3. URGENT and HIGH priority notifications never bundle
4. Requires a `bundleKey` to identify related notifications

### Bundle Key Format

```typescript
// Examples of bundle keys
const bundleKeys = {
  // Message notifications in same thread
  messageThread: `thread_${threadId}`,
  
  // License updates for same asset
  licenseAsset: `license_${licenseId}`,
  
  // Project updates for same project
  projectUpdate: `project_${projectId}`,
  
  // Royalty statements for same period
  royaltyPeriod: `royalty_${userId}_${period}`,
};
```

### Bundle Behavior

When a notification is bundled:
1. **Title & Message** - Updated to reflect the count
2. **Timestamp** - Updated to latest occurrence
3. **Metadata** - Includes `bundleCount` and `lastBundledAt`
4. **Read Status** - Resets to unread

**Example:**

```typescript
// First notification
{
  title: "New Message",
  message: "John sent you a message",
  metadata: { bundleCount: 1, bundleKey: "thread_123" }
}

// After bundling (2 more messages)
{
  title: "New Messages",
  message: "You have 3 new messages in 'Project Discussion'",
  metadata: { 
    bundleCount: 3, 
    bundleKey: "thread_123",
    lastBundledAt: "2025-10-14T10:35:00.000Z"
  }
}
```

### Display Recommendations

```typescript
// Frontend should check for bundled notifications
function formatNotificationTitle(notification: Notification): string {
  const bundleCount = notification.metadata?.bundleCount;
  
  if (bundleCount && bundleCount > 1) {
    // Show bundled count in UI
    return `${notification.title} (${bundleCount})`;
  }
  
  return notification.title;
}
```

---

## Email Delivery Rules

### Priority-Based Email Delivery

| Priority | Immediate Email | Digest Email | Rule |
|----------|----------------|--------------|------|
| URGENT | ✅ Yes | ❌ No | Always send immediately |
| HIGH | ✅ Yes | ❌ No | Always send immediately |
| MEDIUM | ❌ No | ✅ Yes | Include in daily/weekly digest |
| LOW | ❌ No | ✅ Yes | Include in daily/weekly digest |

### Digest Frequency Options

Users can configure their digest preference:

| Setting | Behavior |
|---------|----------|
| **IMMEDIATE** | All notifications trigger email (overrides priority rules for MEDIUM/LOW) |
| **DAILY** | MEDIUM/LOW notifications sent once per day at 9 AM |
| **WEEKLY** | MEDIUM/LOW notifications sent once per week on Monday at 9 AM |
| **NEVER** | Only URGENT/HIGH notifications sent (no digest) |

### Email Preference Rules

1. **Email Verification Required**
   - Users must have verified email to enable email notifications
   - Frontend should check `user.email_verified` before allowing toggle

2. **Type-Specific Preferences**
   - Users can disable specific notification types
   - If type disabled, no email sent regardless of priority

3. **Muted Threads (Messages)**
   - Users can mute specific message threads
   - No notifications created for muted threads

4. **Email Cooldown (Messages)**
   - Prevents email spam for rapid message exchanges
   - 5-minute cooldown between email notifications per thread
   - In-app notifications still created immediately

---

## Preference Management

### Default Preferences

When a user account is created, default preferences are:

```typescript
const defaultPreferences = {
  enabledTypes: ['LICENSE', 'PAYOUT', 'ROYALTY', 'PROJECT', 'SYSTEM', 'MESSAGE'],
  digestFrequency: 'DAILY',
  emailEnabled: false, // Must verify email first
  inAppEnabled: true,
};
```

### Preference Validation

#### Email Enabled

```typescript
// Only allow if email verified
if (emailEnabled && !user.email_verified) {
  throw new Error('Cannot enable email notifications without verified email address');
}
```

#### Enabled Types

```typescript
// Must be subset of valid types
const validTypes = ['LICENSE', 'PAYOUT', 'ROYALTY', 'PROJECT', 'SYSTEM', 'MESSAGE'];

function validateEnabledTypes(types: string[]): boolean {
  return types.every(type => validTypes.includes(type));
}
```

#### Digest Frequency

```typescript
// Must be one of the valid frequencies
const validFrequencies = ['IMMEDIATE', 'DAILY', 'WEEKLY', 'NEVER'];

function validateDigestFrequency(freq: string): boolean {
  return validFrequencies.includes(freq);
}
```

---

## Validation Rules

### Field Validation

#### Create Notification Request

| Field | Required | Type | Validation |
|-------|----------|------|------------|
| `userId` | One of 3* | string | Valid CUID |
| `userIds` | One of 3* | string[] | Array of valid CUIDs |
| `userRole` | One of 3* | enum | 'ADMIN', 'CREATOR', 'BRAND', 'VIEWER' |
| `type` | Yes | enum | Valid NotificationType |
| `title` | Yes | string | 1-255 characters |
| `message` | Yes | string | 1-1000 characters |
| `priority` | No | enum | Valid NotificationPriority (default: MEDIUM) |
| `actionUrl` | No | string | Valid URL or path starting with / |
| `metadata` | No | object | Valid JSON object |

**\*Must provide exactly ONE of: userId, userIds, or userRole**

#### List Notifications Query

| Parameter | Required | Type | Validation |
|-----------|----------|------|------------|
| `page` | No | number | Integer >= 1 (default: 1) |
| `pageSize` | No | number | Integer 1-100 (default: 20) |
| `read` | No | boolean | 'true' or 'false' |
| `type` | No | enum | Valid NotificationType |
| `priority` | No | enum | Valid NotificationPriority |

#### Update Preferences Request

| Field | Required | Type | Validation |
|-------|----------|------|------------|
| `enabledTypes` | No | array | Subset of valid NotificationTypes |
| `digestFrequency` | No | enum | 'IMMEDIATE', 'DAILY', 'WEEKLY', 'NEVER' |
| `emailEnabled` | No | boolean | true/false (requires verified email) |
| `inAppEnabled` | No | boolean | true/false |

### actionUrl Validation

The `actionUrl` field accepts two formats:

1. **Relative path:** Must start with `/`
   - Examples: `/licenses/clx123`, `/dashboard`, `/messages/thread_abc`

2. **Full URL:** Must be valid HTTP(S) URL
   - Examples: `https://yesgoddess.agency/explore`

```typescript
// Regex validation
const actionUrlRegex = /^(https?:\/\/.+|\/[a-z0-9\/-]*)$/i;

function isValidActionUrl(url: string): boolean {
  return actionUrlRegex.test(url);
}
```

---

## Error Handling

### HTTP Status Codes

| Status | Meaning | When Used |
|--------|---------|-----------|
| **200** | Success | Request completed successfully |
| **400** | Bad Request | Invalid request parameters or body |
| **401** | Unauthorized | No valid session or authentication failed |
| **403** | Forbidden | Authenticated but lacks permission (e.g., non-admin creating notification) |
| **404** | Not Found | Notification doesn't exist or user doesn't own it |
| **429** | Too Many Requests | Rate limit exceeded (polling endpoint) |
| **500** | Internal Server Error | Unexpected server error |

### Error Response Format

All errors follow this structure:

```typescript
interface ErrorResponse {
  success: false;
  error: string;        // User-friendly error message
  details?: any;        // Optional validation details (Zod errors)
}
```

### Common Error Scenarios

#### 1. Validation Errors (400)

**Scenario:** Invalid query parameters

```json
{
  "success": false,
  "error": "Invalid query parameters",
  "details": [
    {
      "code": "invalid_type",
      "expected": "number",
      "received": "string",
      "path": ["pageSize"],
      "message": "Expected number, received string"
    }
  ]
}
```

**Frontend Handling:**
- Display field-specific errors in forms
- Highlight invalid fields
- Show user-friendly messages

#### 2. Authentication Errors (401)

**Scenario:** No valid session

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**Frontend Handling:**
- Redirect to login page
- Clear local auth state
- Show "Session expired" message

#### 3. Not Found Errors (404)

**Scenario:** Notification doesn't exist or user doesn't own it

```json
{
  "success": false,
  "error": "Notification not found"
}
```

**Frontend Handling:**
- Remove notification from UI
- Show "Notification no longer available" message
- Refresh notification list

#### 4. Rate Limit Errors (429)

**Scenario:** Polling too frequently

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

**Frontend Handling:**
- Pause polling for `Retry-After` seconds
- Show "Checking too frequently" message
- Implement exponential backoff

#### 5. Permission Errors (403)

**Scenario:** Non-admin trying to create notification

```json
{
  "success": false,
  "error": "Forbidden: Admin access required"
}
```

**Frontend Handling:**
- Hide admin-only features
- Show "Insufficient permissions" message

---

## Authorization & Permissions

### User Permissions

| Endpoint | Required Auth | Required Role | Permission Check |
|----------|---------------|---------------|------------------|
| `GET /api/notifications` | Session | Any | User can only see their own notifications |
| `PATCH /api/notifications/:id/read` | Session | Any | User must own the notification |
| `DELETE /api/notifications/:id` | Session | Any | User must own the notification |
| `PATCH /api/notifications/read-all` | Session | Any | Marks only user's own notifications |
| `GET /api/notifications/unread` | Session | Any | User's own count |
| `GET /api/notifications/poll` | Session | Any | User's own notifications |
| `GET /api/notifications/preferences` | Session | Any | User's own preferences |
| `PATCH /api/notifications/preferences` | Session | Any | User's own preferences |
| `POST /api/notifications` | Session | **ADMIN only** | Must have ADMIN role |

### Resource Ownership Rules

Users can only:
- **View** their own notifications
- **Mark as read** their own notifications
- **Delete** their own notifications
- **Update** their own preferences

Admins can:
- **Create** notifications for any user(s)
- All user permissions for their own notifications

### Permission Checks

```typescript
// Backend performs these checks automatically
async function checkNotificationOwnership(
  notificationId: string, 
  userId: string
): Promise<boolean> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userId: true }
  });
  
  return notification?.userId === userId;
}
```

**Frontend should:**
- Never display admin-only UI for non-admins
- Handle 403 errors gracefully
- Assume all API calls are permission-checked on backend

---

## Rate Limiting

### Polling Endpoint Rate Limit

**Configuration:**
- **Window:** 10 seconds
- **Max Requests:** 1 per window
- **Per:** Individual user

**Response:**
- Status: `429 Too Many Requests`
- Header: `Retry-After: <seconds>`
- Body: Error message

### Recommended Polling Strategy

```typescript
// Recommended: 15-30 second intervals
const POLL_INTERVAL = 20000; // 20 seconds

// With exponential backoff on errors
let currentInterval = POLL_INTERVAL;

async function pollNotifications() {
  try {
    const response = await fetch('/api/notifications/poll?lastSeen=' + lastSeen);
    
    if (response.status === 429) {
      // Rate limited - wait longer
      const retryAfter = parseInt(response.headers.get('Retry-After') || '10');
      currentInterval = retryAfter * 1000 + 5000; // Add 5s buffer
    } else if (response.ok) {
      // Success - reset to normal interval
      currentInterval = POLL_INTERVAL;
    }
  } catch (error) {
    // Network error - exponential backoff
    currentInterval = Math.min(currentInterval * 2, 60000); // Max 60s
  }
  
  setTimeout(pollNotifications, currentInterval);
}
```

---

## Caching Strategy

### Backend Caching

The backend uses Redis caching for:

1. **Unread Count Cache**
   - Key: `notifications:unread:{userId}`
   - TTL: 60 seconds
   - Invalidated: When notifications created/read/deleted

2. **Poll Empty Cache**
   - Key: `notifications:poll:empty:{userId}`
   - TTL: 5 seconds
   - Purpose: Avoid DB queries when no new notifications
   - Invalidated: When new notifications created

3. **Rate Limit Cache**
   - Key: `notifications:poll:ratelimit:{userId}`
   - TTL: 10 seconds (+ 5s buffer)
   - Purpose: Enforce polling rate limit

### Frontend Caching Recommendations

```typescript
// Use React Query or SWR for client-side caching

// List notifications - cache for 30 seconds
const { data: notifications } = useQuery({
  queryKey: ['notifications', { page, read, type }],
  queryFn: () => fetchNotifications({ page, read, type }),
  staleTime: 30000,  // 30 seconds
  refetchOnWindowFocus: true,
});

// Unread count - cache for 15 seconds, refetch frequently
const { data: unreadCount } = useQuery({
  queryKey: ['notifications', 'unread'],
  queryFn: fetchUnreadCount,
  staleTime: 15000,  // 15 seconds
  refetchInterval: 20000, // Refetch every 20s
});

// Preferences - cache for 5 minutes, rarely changes
const { data: preferences } = useQuery({
  queryKey: ['notifications', 'preferences'],
  queryFn: fetchPreferences,
  staleTime: 300000, // 5 minutes
});
```

### Cache Invalidation

**When to invalidate:**

```typescript
// After marking as read
queryClient.invalidateQueries(['notifications']);
queryClient.invalidateQueries(['notifications', 'unread']);

// After deleting
queryClient.invalidateQueries(['notifications']);
queryClient.invalidateQueries(['notifications', 'unread']);

// After updating preferences
queryClient.invalidateQueries(['notifications', 'preferences']);

// After polling returns new notifications
if (pollData.hasNew) {
  queryClient.invalidateQueries(['notifications']);
  queryClient.invalidateQueries(['notifications', 'unread']);
}
```

---

## Next Steps

Continue to:
- **[Part 1: API Endpoints & Schemas](./NOTIFICATION_SYSTEM_INTEGRATION_GUIDE_PART_1_API_ENDPOINTS.md)**
- **[Part 3: Frontend Implementation Checklist](./NOTIFICATION_SYSTEM_INTEGRATION_GUIDE_PART_3_IMPLEMENTATION.md)**
