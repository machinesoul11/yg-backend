# 🌐 Notification System - Business Logic & Validation

**Classification:** 🌐 SHARED  
**Module:** Notifications  
**Last Updated:** October 14, 2025  
**Document:** Part 2 of 3 - Business Logic, Validation & Error Handling

> **Context:** This document details validation rules, business logic, error handling, permissions, and rate limiting for the notification system.

---

## Table of Contents

1. [Validation Rules](#validation-rules)
2. [Business Logic](#business-logic)
3. [Error Handling](#error-handling)
4. [Authorization & Permissions](#authorization--permissions)
5. [Rate Limiting & Quotas](#rate-limiting--quotas)
6. [Caching Strategy](#caching-strategy)
7. [Real-time Updates](#real-time-updates)

---

## Validation Rules

### Field Validation

All notification endpoints enforce strict validation using Zod schemas.

#### Title Validation

```typescript
// Rules
- Required: Yes
- Type: string
- Min Length: 1 character
- Max Length: 255 characters
- Trimmed: Yes (whitespace removed from start/end)

// Valid Examples
✓ "New message from Sarah"
✓ "License expires in 7 days"
✓ "Payment processed successfully"

// Invalid Examples
✗ "" (empty string)
✗ "   " (only whitespace)
✗ (more than 255 characters)
```

#### Message Validation

```typescript
// Rules
- Required: Yes
- Type: string
- Min Length: 1 character
- Max Length: 1000 characters
- Trimmed: Yes

// Valid Examples
✓ "Your license for 'Summer Collection' has been approved and is now active."
✓ "Payment of $250.00 has been processed and will arrive in 3-5 business days."

// Invalid Examples
✗ "" (empty string)
✗ (more than 1000 characters)
```

#### Action URL Validation

```typescript
// Rules
- Required: No (optional)
- Type: string
- Format: Valid URL OR relative path starting with /
- Examples:
  ✓ "/dashboard/licenses/clx123"
  ✓ "/messages/thread-789"
  ✓ "https://yesgoddess.agency/marketplace"
  ✗ "dashboard/licenses" (missing leading /)
  ✗ "javascript:alert(1)" (invalid protocol)
```

#### Priority Validation

```typescript
// Rules
- Required: No
- Type: enum NotificationPriority
- Default: MEDIUM
- Allowed Values:
  - LOW: Informational, no action required
  - MEDIUM: Standard priority (default)
  - HIGH: Important, user should review
  - URGENT: Critical, immediate attention needed

// Frontend Mapping Suggestions
LOW → Gray/muted styling
MEDIUM → Default styling
HIGH → Orange/amber accent
URGENT → Red accent with icon
```

#### Type Validation

```typescript
// Rules
- Required: Yes
- Type: enum NotificationType
- Allowed Values:
  - LICENSE: License-related events
  - PAYOUT: Payment notifications
  - ROYALTY: Royalty statements
  - PROJECT: Project invitations
  - SYSTEM: Announcements, maintenance
  - MESSAGE: Direct messages

// Each type should have distinct icon/color in UI
```

#### Metadata Validation

```typescript
// Rules
- Required: No
- Type: Record<string, any> (JSON object)
- Max Size: 10KB (serialized)
- Must be valid JSON

// Best Practices
- Use for type-specific data
- Don't store sensitive information (PII, secrets)
- Keep structure consistent per notification type
- Document expected fields for each type
```

### Pagination Validation

```typescript
// List Notifications Pagination
interface PaginationRules {
  page: {
    type: 'number',
    min: 1,
    default: 1,
    description: 'Page number (1-indexed)'
  },
  pageSize: {
    type: 'number',
    min: 1,
    max: 100,
    default: 20,
    description: 'Items per page'
  }
}

// Recommended Page Sizes
- Mobile: 10-20 items
- Desktop: 20-50 items
- Admin Dashboard: 50-100 items
```

### Preferences Validation

```typescript
// Update Preferences Rules
interface PreferencesValidation {
  enabledTypes: {
    type: 'array',
    items: 'NotificationType',
    optional: true,
    description: 'Must be array of valid notification types'
  },
  digestFrequency: {
    type: 'enum',
    values: ['IMMEDIATE', 'DAILY', 'WEEKLY', 'NEVER'],
    optional: true
  },
  emailEnabled: {
    type: 'boolean',
    optional: true,
    note: 'Requires verified email address'
  },
  inAppEnabled: {
    type: 'boolean',
    optional: true,
    note: 'Currently always true'
  }
}
```

---

## Business Logic

### Notification Creation Logic

#### Target Resolution

When creating notifications (admin only), the system resolves targets in this order:

```typescript
// Priority Order
1. userId (single user)
   → Creates 1 notification

2. userIds (array of users)
   → Creates N notifications (one per user)

3. userRole (role-based broadcast)
   → Queries all users with role (where deleted_at IS NULL)
   → Creates notification for each user

// Validation Rule
- Must provide EXACTLY ONE of: userId, userIds, or userRole
- If multiple provided, validation fails with 400 error
```

#### Automatic Cache Invalidation

When notifications are created, the system automatically invalidates caches:

```typescript
// Caches Cleared
1. Unread count cache
   → Key: `notifications:unread:${userId}`
   
2. Poll empty cache
   → Key: `notifications:poll:empty:${userId}`

// This ensures users see new notifications immediately
```

#### Notification Ordering

```typescript
// Default Sort Order
- Primary: createdAt DESC (newest first)
- Secondary: priority (URGENT > HIGH > MEDIUM > LOW)

// Frontend Display Recommendations
1. Group by read status (unread first)
2. Within groups, sort by priority + createdAt
3. Consider "pinning" URGENT notifications to top
```

### Read Status Management

#### Mark as Read Logic

```typescript
// Single Notification
1. Verify ownership (notification.userId === currentUser.id)
2. Set read = true
3. Set readAt = now()
4. Clear unread count cache
5. Return updated notification

// All Notifications
1. Update all unread notifications for user
2. Set read = true, readAt = now()
3. Clear unread count cache
4. Return count of updated notifications
```

#### Optimistic Read Updates

The frontend should implement optimistic updates:

```typescript
// Recommended Flow
1. User clicks notification
2. Immediately mark as read in UI (optimistic)
3. Call markAsRead mutation in background
4. If mutation fails, revert UI state
5. If mutation succeeds, invalidate queries

// Benefits
- Instant feedback
- Better UX
- Handles network latency
```

### Deletion Logic

```typescript
// Soft Delete vs Hard Delete
Current Implementation: HARD DELETE
- Notification is permanently removed from database
- Cannot be recovered
- Recommended for user privacy

Alternative (Not Implemented): Soft Delete
- Set deleted_at timestamp
- Filter out in queries
- Allows recovery/audit trail
```

### Preference Logic

#### Email vs In-App

```typescript
// Preference Resolution
1. Check if notification type is in enabledTypes
   → If NO: Don't send (either channel)
   → If YES: Continue to step 2

2. For EMAIL channel:
   → Check emailEnabled
   → Check user has verified email
   → Check digestFrequency (IMMEDIATE sends now, DAILY/WEEKLY queues)

3. For IN-APP channel:
   → Check inAppEnabled (currently always true)
   → Always create notification record

// Example Scenarios
Scenario 1: User disables PAYOUT type
  - No email sent
  - No in-app notification created

Scenario 2: User sets digestFrequency = DAILY
  - Email sent once per day at 9 AM user timezone
  - In-app notification created immediately

Scenario 3: User sets emailEnabled = false
  - No emails sent (any type)
  - In-app notifications still created
```

#### Default Preferences

```typescript
// New User Defaults
{
  enabledTypes: ['LICENSE', 'PAYOUT', 'ROYALTY', 'PROJECT', 'SYSTEM', 'MESSAGE'],
  digestFrequency: 'IMMEDIATE',
  emailEnabled: true,
  inAppEnabled: true
}

// Frontend Should Allow
- Toggle individual types on/off
- Change digest frequency
- Master email toggle
- Show email verification status
```

---

## Error Handling

### HTTP Status Codes

```typescript
// Success Responses
200 OK              → Successful GET, PATCH, DELETE
201 Created         → (Not used in notification API)

// Client Errors
400 Bad Request     → Validation failed, invalid input
401 Unauthorized    → Missing or invalid authentication
403 Forbidden       → Authenticated but lacks permission (admin-only endpoints)
404 Not Found       → Notification doesn't exist or doesn't belong to user
429 Too Many Requests → Rate limit exceeded (poll endpoint)

// Server Errors
500 Internal Server Error → Unexpected server error
503 Service Unavailable   → Redis/Database temporarily unavailable
```

### Error Response Format

All error responses follow this structure:

```typescript
// Standard Error Response
{
  success: false,
  error: string,           // Human-readable message
  details?: any            // Optional validation details
}

// Examples
{
  "success": false,
  "error": "Unauthorized"
}

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

### Specific Error Scenarios

#### 1. Notification Not Found

```typescript
// Scenario
- User requests notification that doesn't exist
- User requests notification belonging to another user

// Response
HTTP 404 Not Found
{
  "success": false,
  "error": "Notification not found"
}

// Frontend Handling
- Remove notification from local state
- Show toast: "Notification no longer available"
- Don't retry
```

#### 2. Unauthorized Access

```typescript
// Scenario
- Missing JWT token
- Expired JWT token
- Invalid JWT token

// Response
HTTP 401 Unauthorized
{
  "success": false,
  "error": "Unauthorized"
}

// Frontend Handling
- Redirect to login page
- Clear auth state
- Show message: "Please log in again"
```

#### 3. Admin-Only Endpoint

```typescript
// Scenario
- Non-admin user calls notifications.create

// Response
HTTP 403 Forbidden
{
  "success": false,
  "error": "Admin access required"
}

// Frontend Handling
- Hide admin features from UI
- Show error: "You don't have permission"
- Log potential security issue
```

#### 4. Validation Error

```typescript
// Scenario
- Invalid notification type
- Page size > 100
- Title too long

// Response
HTTP 400 Bad Request
{
  "success": false,
  "error": "Invalid request body",
  "details": [
    {
      "code": "too_big",
      "maximum": 255,
      "type": "string",
      "path": ["title"],
      "message": "String must contain at most 255 character(s)"
    }
  ]
}

// Frontend Handling
- Show field-level validation errors
- Highlight invalid fields
- Prevent form submission until fixed
```

#### 5. Rate Limit Exceeded

```typescript
// Scenario
- Polling more than once per 10 seconds

// Response
HTTP 429 Too Many Requests
Headers: {
  "Retry-After": "8"  // Seconds until retry allowed
}
Body: {
  "success": false,
  "error": "Rate limit exceeded",
  "retryAfter": 8
}

// Frontend Handling
- Disable polling temporarily
- Show retry countdown
- Resume polling after retryAfter seconds
- Don't spam retry
```

---

## Authorization & Permissions

### Endpoint Permissions

| Endpoint | Required Auth | Role Restrictions | Ownership Check |
|----------|---------------|-------------------|-----------------|
| List Notifications | ✅ Yes | None | Returns only user's notifications |
| Get Unread Count | ✅ Yes | None | Returns only user's count |
| Mark as Read | ✅ Yes | None | ✅ Must own notification |
| Mark All as Read | ✅ Yes | None | Updates only user's notifications |
| Delete Notification | ✅ Yes | None | ✅ Must own notification |
| Get Preferences | ✅ Yes | None | Returns only user's preferences |
| Update Preferences | ✅ Yes | None | Updates only user's preferences |
| Poll | ✅ Yes | None | Returns only user's notifications |
| Create Notification | ✅ Yes | ✅ ADMIN only | N/A (creates for others) |

### Ownership Verification

```typescript
// Backend Checks (Automatic)
For endpoints with ownership check:
1. Extract userId from JWT session
2. Query notification with ID
3. Verify notification.userId === session.user.id
4. If mismatch: Return 404 (not 403 to avoid info leak)

// Frontend Should NEVER
- Display notifications from other users
- Allow editing notifications belonging to others
- Assume backend will enforce (but backend does)
```

### Role-Based Access

```typescript
// Admin-Only Features
- Create notifications (notifications.create)
- Send broadcasts to roles
- View notification analytics (not implemented)

// All Authenticated Users Can
- View their own notifications
- Mark as read/unread
- Delete their notifications
- Update their preferences
- Poll for updates

// No Public Access
- All endpoints require authentication
- No anonymous notification viewing
```

---

## Rate Limiting & Quotas

### Poll Endpoint Rate Limiting

```typescript
// Implementation
Algorithm: Fixed Window with Redis
Window: 10 seconds
Limit: 1 request per user per window

// Redis Keys
Key: `notifications:poll:ratelimit:${userId}`
TTL: 10 seconds
Value: timestamp of last poll

// Logic Flow
1. Check Redis for key
2. If key exists:
   → Calculate retryAfter = 10 - (now - lastPoll)
   → Return 429 with Retry-After header
3. If key doesn't exist:
   → Set key with current timestamp
   → Set TTL to 10 seconds
   → Process request

// Headers on 429 Response
Retry-After: 8  // Seconds until next allowed request
```

### Recommended Polling Strategy

```typescript
// Frontend Implementation
class NotificationPoller {
  private pollInterval: number = 10000; // 10 seconds
  private timerId: number | null = null;
  private lastSeen: string | null = null;

  async poll() {
    try {
      const { data } = await trpc.system.notifications.poll.query({
        lastSeen: this.lastSeen
      });

      // Update lastSeen for next poll
      this.lastSeen = data.lastSeen;

      // Update UI with new notifications
      this.handleNewNotifications(data.notifications);

      // Use suggested interval (or fallback to default)
      this.pollInterval = (data.suggestedPollInterval || 10) * 1000;

    } catch (error) {
      if (error.status === 429) {
        // Rate limited - use retryAfter
        const retryAfter = error.data?.retryAfter || 10;
        this.pollInterval = retryAfter * 1000;
      } else {
        // Other error - exponential backoff
        this.pollInterval = Math.min(this.pollInterval * 2, 60000);
      }
    } finally {
      // Schedule next poll
      this.timerId = setTimeout(() => this.poll(), this.pollInterval);
    }
  }

  start() {
    if (!this.timerId) {
      this.poll();
    }
  }

  stop() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}
```

### Other Endpoints

```typescript
// No Rate Limiting (Currently)
- List notifications
- Mark as read
- Delete
- Preferences

// Recommendations
- Implement client-side debouncing for mark-as-read
- Batch delete operations if deleting multiple
- Cache preferences locally (updated infrequently)
```

---

## Caching Strategy

### Unread Count Cache

```typescript
// Purpose
Heavily accessed endpoint (navbar badge, frequent checks)
Must be fast and scalable

// Implementation
Key: `notifications:unread:${userId}`
TTL: 300 seconds (5 minutes)
Storage: Redis

// Invalidation Triggers
1. New notification created for user
2. Notification marked as read
3. All notifications marked as read
4. Notification deleted

// Frontend Recommendations
- Poll unread count every 30-60 seconds
- Update immediately after user actions (optimistic)
- Show loading state on initial fetch
```

### Poll Empty Cache

```typescript
// Purpose
Optimize polling when no new notifications exist
Reduce database queries

// Implementation
Key: `notifications:poll:empty:${userId}`
TTL: 30 seconds
Storage: Redis
Value: "1" (boolean indicator)

// Logic
1. If cache hit → Return empty response immediately
2. If cache miss → Query database
   - If no new notifications → Set cache
   - If new notifications → Don't set cache

// Benefits
- Reduces DB load during quiet periods
- Still delivers notifications within 30 seconds
- Self-healing (cache expires)
```

### Preferences Cache

```typescript
// Purpose
User preferences change infrequently
Safe to cache aggressively

// Implementation
Key: `notification-prefs:${userId}`
TTL: 3600 seconds (1 hour)
Storage: Redis

// Invalidation
- On updatePreferences mutation
- Manual refresh if needed

// Frontend Caching
- Store in React Query cache
- Stale time: 5 minutes
- Cache time: 1 hour
```

---

## Real-time Updates

### Polling Architecture

```typescript
// Why Polling Instead of WebSockets?
1. Simpler implementation
2. Works through all proxies/firewalls
3. No connection management complexity
4. Sufficient for notification use case (10s latency acceptable)

// When to Use WebSockets Instead?
- Real-time chat (sub-second latency needed)
- Live collaboration (Google Docs style)
- Trading/auction platforms (instant updates critical)
```

### Polling Best Practices

```typescript
// DO
✓ Use lastSeen parameter to only fetch new notifications
✓ Respect suggestedPollInterval from response
✓ Handle 429 errors gracefully with Retry-After
✓ Stop polling when tab is hidden (document.hidden)
✓ Resume polling when tab becomes visible
✓ Implement exponential backoff on errors
✓ Clear poll timer on user logout

// DON'T
✗ Poll faster than 10 seconds
✗ Ignore rate limit errors
✗ Keep polling on server errors (exponential backoff instead)
✗ Poll when user is offline
✗ Create multiple concurrent pollers
```

### Tab Visibility Optimization

```typescript
// Example Implementation
let poller: NotificationPoller;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Tab hidden - stop polling to save resources
    poller.stop();
  } else {
    // Tab visible - resume polling
    poller.start();
  }
});

// Benefits
- Saves battery on mobile
- Reduces server load
- Improves performance
- User still sees notifications when they return to tab
```

---

## Next Steps

- **Part 1:** [API Endpoints & Type Definitions](./NOTIFICATION_SYSTEM_COMPLETE_API_REFERENCE.md)
- **Part 3:** [Frontend Implementation Guide](./NOTIFICATION_SYSTEM_COMPLETE_IMPLEMENTATION.md)

---

**Questions or Issues?** Contact the backend team or file an issue in the repository.
