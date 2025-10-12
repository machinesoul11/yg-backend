# Message Service - Implementation Checklist

## Overview
This document tracks the implementation of the messaging system as specified in the Backend & Admin Development Roadmap.

---

## ✅ Thread Management

### ✅ Create New Thread Service
**Status:** COMPLETE  
**Location:** `src/modules/messages/services/thread.service.ts`

**Features:**
- Creates new threads or returns existing thread with same participants
- Validates participants exist and are active users
- Prevents duplicate threads between same participant sets
- Stores participants as JSONB array for flexible querying

**Implementation Details:**
- Method: `createThread(userId, input)`
- Deduplication by sorted participant IDs
- Returns thread details with participant information

### ✅ Add Participant Validation (Creator-Brand, Creator-Creator)
**Status:** COMPLETE  
**Location:** `src/modules/messages/services/message.service.ts`

**Features:**
- `canMessageUser()` validates business relationships
- Checks for shared projects, licenses, or admin status
- Prevents messaging without established relationship
- Blocks self-messaging

**Validation Rules:**
- Users with shared projects can message
- Users with active licenses can message
- Admins can message anyone
- Active, non-deleted accounts only

### ✅ Build Thread Listing with Pagination
**Status:** COMPLETE  
**Location:** `src/modules/messages/services/thread.service.ts`

**Features:**
- Paginated thread list (offset-based)
- Sorted by `last_message_at` descending
- Includes last message preview
- Filters by authenticated user participation
- Supports archived thread filtering

**Implementation Details:**
- Method: `listThreads(input)`
- Includes unread count per thread
- Loads participant details
- Optional `includeArchived` parameter

### ✅ Implement Unread Count Calculation
**Status:** COMPLETE  
**Location:** `src/modules/messages/services/thread.service.ts`

**Features:**
- Per-thread unread counts
- Total unread count across all threads
- Efficient single-query calculation
- Based on `readAt` null status

**Implementation Details:**
- Method: `getUnreadCount(userId)`
- Returns `{ total, byThread }`
- Uses indexed query on `recipientId` and `readAt`

### ✅ Add Thread Archiving
**Status:** COMPLETE  
**Location:** `src/modules/messages/services/thread.service.ts`

**Features:**
- Soft delete implementation (`deletedAt` timestamp)
- Only participants can archive threads
- Archived threads excluded from default listings
- Can be included via query parameter

**Implementation Details:**
- Method: `archiveThread(userId, threadId)`
- Sets `deletedAt` to current timestamp
- Validates user is participant before archiving

---

## ✅ Message Operations

### ✅ Create Send Message Service
**Status:** COMPLETE  
**Location:** `src/modules/messages/services/message.service.ts`

**Features:**
- Validates sender is thread participant
- Validates recipient is thread participant
- Checks business relationship via `canMessageUser()`
- Updates thread's `last_message_at`
- Returns created message with sender details

**Implementation Details:**
- Method: `sendMessage(input)`
- Includes rate limit checking
- Validates thread exists and user access
- Creates message with proper associations

### ✅ Implement Message Validation (Length, Content)
**Status:** COMPLETE  
**Location:** `src/modules/messages/validation.ts`

**Features:**
- Body length: 1-10,000 characters
- Required fields validation
- Attachment count limit (max 5)
- CUID validation for IDs

**Validation Schema:**
```typescript
SendMessageSchema {
  threadId: CUID
  recipientId: CUID
  body: 1-10,000 chars
  attachmentIds?: max 5
}
```

### ✅ Build Message Threading Logic
**Status:** COMPLETE  
**Location:** `src/modules/messages/services/message.service.ts`

**Features:**
- Messages ordered chronologically (ascending `createdAt`)
- Paginated message retrieval (50 default)
- Includes sender information
- Marks own vs received messages
- Loads attachments with messages

**Implementation Details:**
- Method: `listMessages(input, currentUserId)`
- Returns messages with `isOwnMessage` flag
- Includes total count and `hasMore` pagination

### ✅ Add Attachment Handling (Link to Storage)
**Status:** COMPLETE  
**Location:** `src/modules/messages/services/attachment.service.ts`

**Features:**
- Presigned upload URL generation (15 min expiry)
- File validation (size, MIME type)
- Attachment metadata storage
- Presigned download URL generation
- Cascade delete with messages

**Supported File Types:**
- Images: JPEG, PNG, GIF, WebP
- Documents: PDF, Word, Excel
- Text: Plain text, CSV

**Size Limit:** 10MB per file

**Implementation Details:**
- `generateUploadUrl()`: Creates presigned upload
- `createAttachment()`: Stores metadata after upload
- `getAttachment()`: Returns download URL
- Integrates with R2/Azure storage provider

### ✅ Create Mark-as-Read Service
**Status:** COMPLETE  
**Location:** `src/modules/messages/services/message.service.ts`

**Features:**
- Mark individual messages as read
- Mark all thread messages as read
- Only recipients can mark messages read
- Updates `readAt` timestamp

**Implementation Details:**
- `markMessagesAsRead(input)`: Marks specific messages
- `markThreadAsRead(userId, threadId)`: Marks entire thread
- Returns count of marked messages
- Validates user is message recipient

### ✅ Implement Message Search (Full-Text)
**Status:** COMPLETE  
**Location:** `src/modules/messages/services/message.service.ts`

**Features:**
- Full-text search across message bodies
- Case-insensitive search
- Filter by thread ID
- Filter by date range
- Paginated results
- Access control (only user's messages)

**Implementation Details:**
- Method: `searchMessages(input, userId)`
- Uses Prisma's `contains` with `insensitive` mode
- Returns messages in descending order (newest first)
- Includes sender and attachment information

**Note:** For production, consider adding PostgreSQL full-text search indexes for better performance.

---

## ✅ Notifications Integration

### ✅ Trigger Email Notification on New Message
**Status:** COMPLETE  
**Location:** 
- `src/modules/messages/services/notification.service.ts`
- `src/jobs/message-notification.job.ts`

**Features:**
- Immediate email notifications (if enabled)
- 5-minute cooldown per thread to prevent spam
- Email template: `NewMessage.tsx`
- Queued via BullMQ for async processing
- Respects user preferences

**Email Contains:**
- Sender name
- Thread subject (if exists)
- Message preview (first 100 chars)
- Link to view message

**Implementation Details:**
- Service method: `notifyNewMessage(payload)`
- Checks email cooldown via Redis
- Queues job to `message-notifications` queue
- Worker: `messageNotificationWorker`

### ✅ Create In-App Notification Entry
**Status:** COMPLETE  
**Location:** `src/modules/messages/services/notification.service.ts`

**Features:**
- Creates notification in `notifications` table
- Type: `MESSAGE` (new enum value)
- Priority: `MEDIUM`
- Includes message preview
- Links to thread (`/messages/{threadId}`)
- Respects thread muting

**Implementation Details:**
- Uses existing `NotificationService`
- Method: `createInAppNotification(params)`
- Stores thread ID and preview in metadata
- Skips if thread is muted

### ✅ Add Digest Email for Multiple Unread Messages
**Status:** COMPLETE  
**Location:**
- `src/jobs/message-digest.job.ts`
- `emails/templates/MessageDigest.tsx`

**Features:**
- Daily digest (9 AM daily)
- Weekly digest (9 AM Mondays)
- Groups messages by thread
- Shows message count per thread
- Lists unique senders
- Previews latest message per thread

**Email Contains:**
- Total unread count
- Thread summaries with:
  - Thread subject
  - Number of new messages
  - Sender names
  - Latest message preview
- Link to inbox

**Implementation Details:**
- Function: `sendMessageDigests(job)`
- Scheduled via cron patterns
- Queries unread messages since last digest
- Groups by thread in application layer

### ✅ Implement Notification Preferences (Immediate/Daily Digest)
**Status:** COMPLETE  
**Location:** 
- `src/modules/messages/services/notification.service.ts`
- `src/modules/messages/router.ts` (API endpoints)

**Preferences Available:**
- `emailNotifications`: 'immediate' | 'digest' | 'off'
- `inAppNotifications`: boolean
- `digestFrequency`: 'daily' | 'weekly'
- Thread-level muting

**Storage:**
Stored in `email_preferences.categoryPreferences` JSON field:
```json
{
  "messages": {
    "emailNotifications": "immediate",
    "inAppNotifications": true,
    "digestFrequency": "daily"
  },
  "mutedThreads": ["thread-id-1"]
}
```

**API Endpoints:**
```typescript
// Update preferences
messages.updateNotificationPreferences(preferences)

// Mute/unmute threads
messages.muteThread({ threadId })
messages.unmuteThread({ threadId })
```

**Default Settings:**
- Email: immediate
- In-app: enabled
- Digest: daily

---

## Database Schema

### Existing Tables (Already Implemented)

#### MessageThread
```prisma
model MessageThread {
  id               String    @id @default(cuid())
  subject          String?   
  participantsJson Json      
  lastMessageAt    DateTime  
  deletedAt        DateTime? 
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  messages         Message[]
}
```

#### Message
```prisma
model Message {
  id          String    @id @default(cuid())
  threadId    String    
  senderId    String    
  recipientId String    
  body        String    @db.Text
  readAt      DateTime? 
  deletedAt   DateTime? 
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  thread      MessageThread       
  sender      User                
  recipient   User                
  attachments MessageAttachment[]
}
```

#### MessageAttachment
```prisma
model MessageAttachment {
  id         String   @id @default(cuid())
  messageId  String   
  storageKey String   
  fileName   String   
  fileSize   Int      
  mimeType   String   
  createdAt  DateTime @default(now())
  
  message Message
}
```

### Database Changes Made

#### NotificationType Enum
**Migration:** `migrations/add_message_notification_type.sql`

Added `MESSAGE` value to existing enum:
```sql
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MESSAGE';
```

**No new tables required** - implementation reuses existing structures.

---

## API Endpoints (tRPC Router)

### Thread Endpoints
```typescript
// Create or get existing thread
threads.createThread({ participantIds, subject? })

// List user's threads
threads.listThreads({ limit?, offset?, includeArchived? })

// Get single thread with messages
threads.getThread({ threadId })

// Archive thread
threads.archiveThread({ threadId })

// Get unread count
threads.getUnreadCount()
```

### Message Endpoints
```typescript
// Send message
messages.sendMessage({ threadId, recipientId, body, attachmentIds? })

// List messages in thread
messages.listMessages({ threadId, limit?, offset? })

// Mark messages as read
messages.markMessagesRead({ messageIds })

// Mark thread as read
messages.markThreadRead({ threadId })

// Search messages
messages.searchMessages({ query, threadId?, dateFrom?, dateTo?, limit?, offset? })
```

### Attachment Endpoints
```typescript
// Generate upload URL
messages.generateUploadUrl({ messageId, fileName, contentType, fileSize })

// Create attachment record
messages.createAttachment({ messageId, storageKey, fileName, fileSize, mimeType })

// Get attachment with download URL
messages.getAttachment({ attachmentId })

// Get all message attachments
messages.getMessageAttachments({ messageId })

// Delete attachment
messages.deleteAttachment({ attachmentId })
```

### Notification Preference Endpoints
```typescript
// Mute/unmute thread
messages.muteThread({ threadId })
messages.unmuteThread({ threadId })

// Update notification preferences
messages.updateNotificationPreferences({
  emailNotifications?: 'immediate' | 'digest' | 'off',
  inAppNotifications?: boolean,
  digestFrequency?: 'daily' | 'weekly'
})
```

---

## Email Templates

### NewMessage.tsx
**Purpose:** Immediate notification for new messages  
**Template Key:** `'new-message'`  
**Category:** `'messages'`

**Variables:**
```typescript
{
  recipientName?: string;
  senderName: string;
  threadSubject?: string;
  messagePreview: string;
  threadUrl: string;
}
```

**Design:**
- YES GODDESS brand colors (VOID, BONE, ALTAR)
- Minimal, clean layout
- Message preview in callout box
- Clear CTA button to view message

### MessageDigest.tsx
**Purpose:** Daily/weekly digest of unread messages  
**Template Key:** `'message-digest'`  
**Category:** `'messages'`

**Variables:**
```typescript
{
  recipientName?: string;
  frequency: 'daily' | 'weekly';
  threads: Array<{
    threadId: string;
    threadSubject: string | null;
    messageCount: number;
    senders: string[];
    latestMessage: {
      senderName: string;
      body: string;
      createdAt: Date;
    };
  }>;
  totalUnreadCount: number;
  inboxUrl: string;
}
```

**Design:**
- Summary header with total count
- Thread cards with sender info
- Latest message preview per thread
- Single CTA to inbox
- Preference management link

---

## Background Jobs

### Message Notification Worker
**File:** `src/jobs/message-notification.job.ts`  
**Queue:** `message-notifications`  
**Purpose:** Send immediate email notifications

**Configuration:**
- Concurrency: 5
- Rate limit: 100 emails/minute
- Retries: 3 (exponential backoff)

**Process:**
1. Receive job from queue
2. Send email via EmailService
3. Track delivery status
4. Retry on failure

### Message Digest Job
**File:** `src/jobs/message-digest.job.ts`  
**Purpose:** Send scheduled digest emails

**Schedules:**
- Daily: `0 9 * * *` (9 AM daily)
- Weekly: `0 9 * * 1` (9 AM Mondays)

**Process:**
1. Query users with matching digest frequency
2. Get unread messages since last digest
3. Group messages by thread
4. Send digest email if unread messages exist
5. Log results

---

## Security & Access Control

### Authorization Rules

**Thread Access:**
- Users can only view threads they participate in
- Admin users have no special thread access (privacy)

**Message Access:**
- Only thread participants can view messages
- Senders and recipients can view attachments

**Messaging Rules:**
- Users can only message those with business relationships:
  - Shared projects
  - Active licenses
  - Admin status (admin can message anyone)
- Cannot message self
- Cannot message deleted/inactive users

**Attachment Rules:**
- Only message sender can delete attachments
- Both sender and recipient can download

### Rate Limiting

**Message Sending:**
- Limit: 50 messages per hour per user
- Window: 1 hour rolling
- Storage: Redis
- Error: `RateLimitExceededError` with reset time

**Email Notifications:**
- Cooldown: 5 minutes per thread per user
- Prevents spam from rapid exchanges
- In-app notifications still created
- Storage: Redis (300s TTL)

### Content Validation

**Message Body:**
- Min length: 1 character
- Max length: 10,000 characters
- No HTML/script injection (handled by React rendering)

**Attachments:**
- Max size: 10MB per file
- Max files per message: 5
- Allowed MIME types: Images, PDFs, Office docs, text

---

## Testing & Validation

### Manual Testing Checklist

**Thread Management:**
- [ ] Create thread between two users
- [ ] Attempt duplicate thread creation (should return existing)
- [ ] List threads (verify pagination)
- [ ] Archive thread (verify excluded from default list)
- [ ] Get unread count (verify accurate)

**Message Operations:**
- [ ] Send message in thread
- [ ] Send message with attachment
- [ ] Mark message as read
- [ ] Mark thread as read
- [ ] Search messages
- [ ] Verify rate limiting (send 51 messages in an hour)

**Notifications:**
- [ ] Send message, verify in-app notification
- [ ] Verify immediate email sent
- [ ] Send rapid messages, verify cooldown
- [ ] Mute thread, verify no notifications
- [ ] Set digest preference, verify no immediate email
- [ ] Trigger digest job, verify email sent

**Attachments:**
- [ ] Upload file (get presigned URL, upload, create record)
- [ ] Download file (verify presigned URL)
- [ ] Delete attachment
- [ ] Verify file size limit enforcement
- [ ] Verify MIME type validation

**Access Control:**
- [ ] Attempt to view thread without participation (should fail)
- [ ] Message user without relationship (should fail)
- [ ] Message deleted user (should fail)

### Integration Testing

**With Email Service:**
- Verify emails appear in Resend dashboard
- Check email deliverability
- Verify unsubscribe links work
- Test suppression list integration

**With Storage Service:**
- Verify file uploads to R2/Azure
- Check presigned URL expiration
- Verify file deletion from storage

**With Notification Service:**
- Verify in-app notifications created
- Check notification count updates
- Verify notification clicking clears count

---

## Performance Optimizations

### Implemented Optimizations

1. **Indexed Queries:**
   - `threadId + createdAt` on messages (chronological fetch)
   - `recipientId + readAt` on messages (unread count)
   - `lastMessageAt` on threads (thread sorting)
   - GIN index on `participantsJson` (participant queries)

2. **Caching:**
   - Rate limit counters in Redis
   - Email cooldowns in Redis
   - Unread counts cacheable (future enhancement)

3. **Async Processing:**
   - Email sending via BullMQ queue
   - Non-blocking notification creation

4. **Efficient Queries:**
   - Single query for unread counts
   - Batch participant lookup
   - Pagination for large result sets

### Potential Future Optimizations

1. **Caching:**
   - Cache unread counts in Redis
   - Cache thread lists for active users
   - Cache participant details

2. **Database:**
   - Add full-text search indexes for messages
   - Materialized view for thread summaries
   - Partitioning for large message tables

3. **Real-time:**
   - WebSocket connections for live updates
   - Pusher/Ably for real-time delivery
   - Optimistic UI updates

---

## Documentation

### Created Documentation Files

1. **NOTIFICATIONS.md** - `docs/modules/messages/NOTIFICATIONS.md`
   - Comprehensive notification system guide
   - Email template details
   - Background job configuration
   - Troubleshooting guide

2. **Implementation Checklist** - This file
   - Complete feature tracking
   - API reference
   - Testing guidelines
   - Security considerations

### Existing Documentation

Referenced existing docs:
- Email template guidelines: `docs/brand/guidelines.md`
- Storage service: `docs/infrastructure/storage/`
- Email service: `src/lib/services/email/README.md`

---

## Deployment Checklist

### Environment Variables
- [ ] `NEXT_PUBLIC_APP_URL` - Base URL for message links
- [ ] `RESEND_API_KEY` - Email service API key  
- [ ] `RESEND_SENDER_EMAIL` - From email address
- [ ] `DATABASE_URL` - PostgreSQL connection
- [ ] Redis connection configured

### Database Migration
- [ ] Run migration: `migrations/add_message_notification_type.sql`
- [ ] Verify `NotificationType` enum updated
- [ ] Confirm existing tables intact

### Background Jobs
- [ ] Deploy message notification worker
- [ ] Configure digest job schedules
- [ ] Verify BullMQ connection
- [ ] Set up job monitoring

### Email Templates
- [ ] Test email templates in Resend
- [ ] Verify brand guidelines compliance
- [ ] Test across email clients
- [ ] Configure SPF/DKIM records

### Monitoring
- [ ] Set up queue depth alerts
- [ ] Monitor email send rates
- [ ] Track failed job counts
- [ ] Monitor rate limit hits

---

## Status: COMPLETE ✅

All features from the roadmap have been implemented:

### Thread Management (100%)
- ✅ Create new thread service
- ✅ Add participant validation
- ✅ Build thread listing with pagination
- ✅ Implement unread count calculation
- ✅ Add thread archiving

### Message Operations (100%)
- ✅ Create send message service
- ✅ Implement message validation
- ✅ Build message threading logic
- ✅ Add attachment handling
- ✅ Create mark-as-read service
- ✅ Implement message search

### Notifications Integration (100%)
- ✅ Trigger email notification on new message
- ✅ Create in-app notification entry
- ✅ Add digest email for multiple unread messages
- ✅ Implement notification preferences

**Total Progress: 14/14 Features (100%)**

---

## Next Steps

### Optional Enhancements (Not in Roadmap)

1. **Real-time Updates:**
   - WebSocket integration for live messages
   - Typing indicators
   - Online status

2. **Advanced Features:**
   - Message reactions/emojis
   - Message editing
   - Message threading (replies)
   - Voice messages
   - Video messages

3. **Analytics:**
   - Message volume tracking
   - Response time metrics
   - User engagement analytics

4. **Moderation:**
   - Content flagging
   - Automated moderation
   - Report abuse functionality

5. **Mobile:**
   - Push notifications (FCM/APNS)
   - Mobile-optimized email templates
   - Native app integration

These are not required for the current roadmap but could be considered for future iterations.
