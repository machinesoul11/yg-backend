# Messaging System - Frontend Integration Guide
## Part 1: API Reference & Endpoints

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
**Module:** Messaging System  
**Backend Repo:** yg-backend (deployed at ops.yesgoddess.agency)  
**Frontend Repo:** yesgoddess-web (Next.js 15 + App Router + TypeScript)  
**Last Updated:** October 13, 2025  
**Architecture:** tRPC API with JWT authentication, separate deployments

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [TypeScript Type Definitions](#typescript-type-definitions)
5. [Request/Response Examples](#requestresponse-examples)

---

## Overview

The YesGoddess messaging system enables direct communication between creators and brands within the platform. This document provides complete API reference documentation for frontend integration.

### Key Features
- 1-on-1 threaded messaging between creators and brands
- Real-time unread counts
- Message attachments (up to 5 per message, 10MB max each)
- Full-text message search
- Thread archiving
- Rate limiting protection
- Content moderation

### Base URL
```
Production: https://ops.yesgoddess.agency/api/trpc
```

### Technology Stack
- **API Protocol:** tRPC (Type-safe RPC)
- **Authentication:** JWT tokens via NextAuth session
- **Data Format:** JSON
- **Transport:** HTTP/HTTPS

---

## Authentication

All messaging endpoints require authentication via JWT token.

### Authentication Header
```http
Authorization: Bearer <JWT_TOKEN>
```

### Session Management
The backend uses NextAuth sessions. Your frontend should:
1. Obtain session token via NextAuth
2. Include token in tRPC client configuration
3. Handle token refresh automatically
4. Redirect to login on 401 Unauthorized

### tRPC Client Setup Example
```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { getSession } from 'next-auth/react';

export const trpc = createTRPCProxyClient({
  links: [
    httpBatchLink({
      url: 'https://ops.yesgoddess.agency/api/trpc',
      async headers() {
        const session = await getSession();
        return {
          authorization: session?.user ? `Bearer ${session.user.accessToken}` : '',
        };
      },
    }),
  ],
});
```

---

## API Endpoints

### Thread Management

#### 1. Create Thread
**Endpoint:** `messages.createThread`  
**Type:** Mutation  
**Purpose:** Create a new message thread or return existing thread between participants

**Input Schema:**
```typescript
{
  participantIds: string[];  // 2-10 CUIDs, must include current user
  subject?: string;          // Optional, max 255 characters
}
```

**Response Schema:**
```typescript
{
  thread: {
    id: string;
    subject: string | null;
    participantIds: string[];
    participants: Array<{
      userId: string;
      name: string;
      avatar?: string | null;
    }>;
    lastMessageAt: Date;
    createdAt: Date;
  };
  existingThread: boolean;  // true if thread already existed
}
```

**Business Rules:**
- Minimum 2 participants, maximum 10
- Current user must be in participant list
- Returns existing thread if one exists with same participants
- All participant IDs must be valid, active users

---

#### 2. List Threads
**Endpoint:** `messages.listThreads`  
**Type:** Query  
**Purpose:** Retrieve paginated list of user's message threads

**Input Schema:**
```typescript
{
  limit?: number;          // 1-100, default: 20
  offset?: number;         // default: 0
  includeArchived?: boolean;  // default: false
}
```

**Response Schema:**
```typescript
{
  threads: Array<{
    id: string;
    subject: string | null;
    participants: Array<{
      userId: string;
      name: string;
      avatar?: string | null;
    }>;
    lastMessageAt: Date;
    unreadCount: number;
    lastMessage?: {
      body: string;
      senderId: string;
      senderName: string;
      createdAt: Date;
    } | null;
    createdAt: Date;
  }>;
  total: number;
  hasMore: boolean;
}
```

**Sorting:** Threads sorted by `lastMessageAt` descending (newest first)

---

#### 3. Get Thread Details
**Endpoint:** `messages.getThread`  
**Type:** Query  
**Purpose:** Retrieve thread with messages

**Input Schema:**
```typescript
{
  threadId: string;  // CUID
}
```

**Response Schema:**
```typescript
{
  id: string;
  subject: string | null;
  participants: Array<{
    userId: string;
    name: string;
    avatar?: string | null;
  }>;
  lastMessageAt: Date;
  unreadCount: number;
  messages: Array<{
    id: string;
    threadId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string | null;
    recipientId: string;
    body: string;
    readAt: Date | null;
    attachments: Array<{
      id: string;
      messageId: string;
      storageKey: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      createdAt: Date;
    }>;
    createdAt: Date;
    isOwnMessage: boolean;
  }>;
  totalMessages: number;
  createdAt: Date;
  lastMessage: {
    body: string;
    senderId: string;
    senderName: string;
    createdAt: Date;
  } | null;
}
```

**Notes:**
- Messages ordered chronologically (oldest first)
- `isOwnMessage` indicates if current user sent the message
- User must be participant in thread

---

#### 4. Archive Thread
**Endpoint:** `messages.archiveThread`  
**Type:** Mutation  
**Purpose:** Soft delete (archive) a thread

**Input Schema:**
```typescript
{
  threadId: string;  // CUID
}
```

**Response Schema:**
```typescript
{
  success: boolean;
}
```

**Behavior:**
- Sets `deletedAt` timestamp (soft delete)
- Thread excluded from default listings
- Can be retrieved via `listThreads({ includeArchived: true })`
- User must be participant

---

#### 5. Get Unread Count
**Endpoint:** `messages.getUnreadCount`  
**Type:** Query  
**Purpose:** Get unread message counts for current user

**Input:** None (uses authenticated user)

**Response Schema:**
```typescript
{
  total: number;
  byThread: Record<string, number>;  // threadId -> unread count
}
```

**Use Cases:**
- Badge counter in navigation
- Unread indicators per thread
- Real-time updates (poll every 30-60 seconds)

---

### Message Operations

#### 6. Send Message
**Endpoint:** `messages.sendMessage`  
**Type:** Mutation  
**Purpose:** Send a message in a thread

**Input Schema:**
```typescript
{
  threadId: string;         // CUID
  recipientId: string;      // CUID
  body: string;             // 1-10,000 characters
  attachmentIds?: string[]; // Optional, max 5 attachments
}
```

**Response Schema:**
```typescript
{
  message: {
    id: string;
    threadId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string | null;
    recipientId: string;
    body: string;
    readAt: null;
    attachments: Array<{
      id: string;
      messageId: string;
      storageKey: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      createdAt: Date;
    }>;
    createdAt: Date;
    isOwnMessage: true;
  };
  threadUpdated: boolean;
}
```

**Business Rules:**
- Both sender and recipient must be thread participants
- Rate limit: 50 messages per hour per user
- Message body length: 1-10,000 characters
- Automatically updates thread's `lastMessageAt`
- Triggers notification to recipient

---

#### 7. List Messages
**Endpoint:** `messages.listMessages`  
**Type:** Query  
**Purpose:** Retrieve paginated messages from a thread

**Input Schema:**
```typescript
{
  threadId: string;   // CUID
  limit?: number;     // 1-100, default: 50
  offset?: number;    // default: 0
}
```

**Response Schema:**
```typescript
{
  messages: Array<{
    id: string;
    threadId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string | null;
    recipientId: string;
    body: string;
    readAt: Date | null;
    attachments: Array<{
      id: string;
      messageId: string;
      storageKey: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      createdAt: Date;
    }>;
    createdAt: Date;
    isOwnMessage: boolean;
  }>;
  total: number;
  hasMore: boolean;
}
```

**Sorting:** Messages ordered chronologically ascending (oldest first)

---

#### 8. Mark Message as Read
**Endpoint:** `messages.markMessageRead`  
**Type:** Mutation  
**Purpose:** Mark a single message as read

**Input Schema:**
```typescript
{
  messageId: string;  // CUID
}
```

**Response Schema:**
```typescript
{
  success: boolean;
}
```

**Access Control:**
- Only the message recipient can mark as read
- Updates `readAt` timestamp

---

#### 9. Mark Multiple Messages as Read
**Endpoint:** `messages.markMessagesRead`  
**Type:** Mutation  
**Purpose:** Batch mark messages as read

**Input Schema:**
```typescript
{
  messageIds: string[];  // 1-100 CUIDs
}
```

**Response Schema:**
```typescript
{
  count: number;  // Number of messages actually marked as read
}
```

**Usage:** Efficient batch operation for marking multiple messages

---

#### 10. Mark Thread as Read
**Endpoint:** `messages.markThreadRead`  
**Type:** Mutation  
**Purpose:** Mark all messages in a thread as read

**Input Schema:**
```typescript
{
  threadId: string;  // CUID
}
```

**Response Schema:**
```typescript
{
  count: number;  // Number of messages marked as read
}
```

**Behavior:**
- Marks all unread messages where user is recipient
- User must be thread participant
- Returns count of messages updated

---

### Search & Discovery

#### 11. Search Messages
**Endpoint:** `messages.searchMessages`  
**Type:** Query  
**Purpose:** Full-text search across user's messages

**Input Schema:**
```typescript
{
  query: string;        // 1-500 characters, search term
  threadId?: string;    // Optional: filter to specific thread
  dateFrom?: string;    // Optional: ISO datetime string
  dateTo?: string;      // Optional: ISO datetime string
  limit?: number;       // 1-100, default: 20
  offset?: number;      // default: 0
}
```

**Response Schema:**
```typescript
{
  messages: Array<{
    id: string;
    threadId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string | null;
    recipientId: string;
    body: string;
    readAt: Date | null;
    attachments: Array<{
      id: string;
      messageId: string;
      storageKey: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      createdAt: Date;
    }>;
    createdAt: Date;
    isOwnMessage: boolean;
  }>;
  total: number;
  hasMore: boolean;
}
```

**Search Features:**
- Case-insensitive full-text search
- Searches only messages user is participant in
- Optional date range filtering
- Optional thread-specific search
- Ordered by relevance/date

---

### Attachment Operations

#### 12. Generate Upload URL
**Endpoint:** `messages.generateUploadUrl`  
**Type:** Mutation  
**Purpose:** Generate signed URL for direct file upload

**Input Schema:**
```typescript
{
  messageId: string;    // CUID - message being created
  fileName: string;     // 1-255 characters
  contentType: string;  // MIME type
  fileSize: number;     // 1 to 10,485,760 bytes (10MB)
}
```

**Response Schema:**
```typescript
{
  uploadUrl: string;       // Signed URL for direct upload
  storageKey: string;      // Key to reference after upload
  expiresAt: Date;        // URL expiration timestamp
  attachmentId: string;   // ID to reference attachment
}
```

**Upload Flow:**
1. Call `generateUploadUrl` with file details
2. Upload file directly to signed URL (PUT request)
3. Call `createAttachment` to confirm upload
4. Reference `attachmentId` in `sendMessage`

---

#### 13. Create Attachment
**Endpoint:** `messages.createAttachment`  
**Type:** Mutation  
**Purpose:** Confirm attachment upload and create database record

**Input Schema:**
```typescript
{
  messageId: string;    // CUID
  storageKey: string;   // From generateUploadUrl
  fileName: string;     // Original filename
  fileSize: number;     // File size in bytes
  mimeType: string;     // MIME type
}
```

**Response Schema:**
```typescript
{
  id: string;
  messageId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: Date;
}
```

---

#### 14. Get Attachment
**Endpoint:** `messages.getAttachment`  
**Type:** Query  
**Purpose:** Get attachment details with download URL

**Input Schema:**
```typescript
{
  attachmentId: string;  // CUID
}
```

**Response Schema:**
```typescript
{
  id: string;
  messageId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;  // Signed download URL
  createdAt: Date;
}
```

**Access Control:**
- User must be participant in message's thread
- Download URL expires after 1 hour

---

#### 15. Get Message Attachments
**Endpoint:** `messages.getMessageAttachments`  
**Type:** Query  
**Purpose:** List all attachments for a message

**Input Schema:**
```typescript
{
  messageId: string;  // CUID
}
```

**Response Schema:**
```typescript
Array<{
  id: string;
  messageId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: Date;
}>
```

---

#### 16. Delete Attachment
**Endpoint:** `messages.deleteAttachment`  
**Type:** Mutation  
**Purpose:** Delete an attachment

**Input Schema:**
```typescript
{
  attachmentId: string;  // CUID
}
```

**Response Schema:**
```typescript
{
  success: boolean;
}
```

**Access Control:**
- Only message sender can delete attachments
- Must delete before message is sent
- Cannot delete attachments from sent messages

---

### Notification Preferences

#### 17. Mute Thread
**Endpoint:** `messages.muteThread`  
**Type:** Mutation  
**Purpose:** Mute notifications for a specific thread

**Input Schema:**
```typescript
{
  threadId: string;  // CUID
}
```

**Response Schema:**
```typescript
{
  success: boolean;
}
```

---

#### 18. Unmute Thread
**Endpoint:** `messages.unmuteThread`  
**Type:** Mutation  
**Purpose:** Unmute notifications for a thread

**Input Schema:**
```typescript
{
  threadId: string;  // CUID
}
```

**Response Schema:**
```typescript
{
  success: boolean;
}
```

---

#### 19. Update Notification Preferences
**Endpoint:** `messages.updateNotificationPreferences`  
**Type:** Mutation  
**Purpose:** Update global message notification preferences

**Input Schema:**
```typescript
{
  emailNotifications?: 'immediate' | 'digest' | 'off';
  inAppNotifications?: boolean;
  digestFrequency?: 'daily' | 'weekly';
}
```

**Response Schema:**
```typescript
{
  success: boolean;
}
```

**Preference Options:**
- **emailNotifications:**
  - `immediate`: Email for each message
  - `digest`: Batched email summaries
  - `off`: No email notifications
- **inAppNotifications:** Show in-app notifications
- **digestFrequency:** Frequency for digest emails

---

### Data Privacy & GDPR

#### 20. Export Message Data
**Endpoint:** `messages.exportMyMessageData`  
**Type:** Mutation  
**Purpose:** Export all user's message data (GDPR compliance)

**Input:** None (uses authenticated user)

**Response Schema:**
```typescript
{
  exportUrl: string;     // Signed URL to download ZIP
  expiresAt: Date;      // URL expiration
  totalThreads: number;
  totalMessages: number;
}
```

**Export Contents:**
- All threads (JSON)
- All messages (JSON)
- All attachments (original files)
- Metadata and timestamps

---

#### 21. Delete Message Data
**Endpoint:** `messages.deleteMyMessageData`  
**Type:** Mutation  
**Purpose:** Permanently delete all user's messages (GDPR "right to be forgotten")

**Input:** None (uses authenticated user)

**Response Schema:**
```typescript
{
  threadsDeleted: number;
  messagesDeleted: number;
  success: boolean;
}
```

**⚠️ WARNING:** This is permanent and cannot be undone!

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * Message Thread Participant
 */
export interface MessageThreadParticipant {
  userId: string;
  name: string;
  avatar?: string | null;
}

/**
 * Thread List Item
 */
export interface ThreadListItem {
  id: string;
  subject: string | null;
  participants: MessageThreadParticipant[];
  lastMessageAt: Date;
  unreadCount: number;
  lastMessage?: {
    body: string;
    senderId: string;
    senderName: string;
    createdAt: Date;
  } | null;
  createdAt: Date;
}

/**
 * Thread Details (includes messages)
 */
export interface ThreadDetails extends ThreadListItem {
  messages: MessageListItem[];
  totalMessages: number;
}

/**
 * Message List Item
 */
export interface MessageListItem {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  recipientId: string;
  body: string;
  readAt: Date | null;
  attachments: MessageAttachmentInfo[];
  createdAt: Date;
  isOwnMessage: boolean;
}

/**
 * Message Attachment Info
 */
export interface MessageAttachmentInfo {
  id: string;
  messageId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl?: string;
  createdAt: Date;
}

/**
 * Unread Count Result
 */
export interface UnreadCountResult {
  total: number;
  byThread: Record<string, number>;
}
```

### Input Types

```typescript
/**
 * Create Thread Input
 */
export interface CreateThreadInput {
  participantIds: string[];
  subject?: string;
}

/**
 * List Threads Input
 */
export interface ListThreadsInput {
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

/**
 * Send Message Input
 */
export interface SendMessageInput {
  threadId: string;
  recipientId: string;
  body: string;
  attachmentIds?: string[];
}

/**
 * Search Messages Input
 */
export interface SearchMessagesInput {
  query: string;
  threadId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

/**
 * Upload Attachment Input
 */
export interface UploadAttachmentInput {
  messageId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}
```

### Result Types

```typescript
/**
 * List Threads Result
 */
export interface ListThreadsResult {
  threads: ThreadListItem[];
  total: number;
  hasMore: boolean;
}

/**
 * List Messages Result
 */
export interface ListMessagesResult {
  messages: MessageListItem[];
  total: number;
  hasMore: boolean;
}

/**
 * Send Message Result
 */
export interface SendMessageResult {
  message: MessageListItem;
  threadUpdated: boolean;
}

/**
 * Create Thread Result
 */
export interface CreateThreadResult {
  thread: {
    id: string;
    subject: string | null;
    participantIds: string[];
    participants: MessageThreadParticipant[];
    lastMessageAt: Date;
    createdAt: Date;
  };
  existingThread: boolean;
}

/**
 * Attachment Upload Result
 */
export interface AttachmentUploadResult {
  uploadUrl: string;
  storageKey: string;
  expiresAt: Date;
  attachmentId: string;
}
```

---

## Request/Response Examples

### Example 1: Create New Thread

**Request:**
```typescript
const result = await trpc.messages.createThread.mutate({
  participantIds: ['clx123abc', 'clx456def'],
  subject: 'Campaign Collaboration Discussion'
});
```

**Response:**
```json
{
  "thread": {
    "id": "clx789ghi",
    "subject": "Campaign Collaboration Discussion",
    "participantIds": ["clx123abc", "clx456def"],
    "participants": [
      {
        "userId": "clx123abc",
        "name": "Sarah Brand Manager",
        "avatar": "https://storage.yesgoddess.agency/avatars/sarah.jpg"
      },
      {
        "userId": "clx456def",
        "name": "Alex Creator",
        "avatar": "https://storage.yesgoddess.agency/avatars/alex.jpg"
      }
    ],
    "lastMessageAt": "2025-10-13T10:30:00.000Z",
    "createdAt": "2025-10-13T10:30:00.000Z"
  },
  "existingThread": false
}
```

---

### Example 2: List Threads

**Request:**
```typescript
const result = await trpc.messages.listThreads.query({
  limit: 20,
  offset: 0,
  includeArchived: false
});
```

**Response:**
```json
{
  "threads": [
    {
      "id": "clx789ghi",
      "subject": "Campaign Collaboration Discussion",
      "participants": [
        {
          "userId": "clx123abc",
          "name": "Sarah Brand Manager",
          "avatar": "https://storage.yesgoddess.agency/avatars/sarah.jpg"
        }
      ],
      "lastMessageAt": "2025-10-13T14:22:00.000Z",
      "unreadCount": 3,
      "lastMessage": {
        "body": "Sounds great! Let's finalize the details.",
        "senderId": "clx123abc",
        "senderName": "Sarah Brand Manager",
        "createdAt": "2025-10-13T14:22:00.000Z"
      },
      "createdAt": "2025-10-13T10:30:00.000Z"
    }
  ],
  "total": 15,
  "hasMore": false
}
```

---

### Example 3: Send Message

**Request:**
```typescript
const result = await trpc.messages.sendMessage.mutate({
  threadId: 'clx789ghi',
  recipientId: 'clx123abc',
  body: 'Thank you for your interest! I would love to collaborate.',
  attachmentIds: []
});
```

**Response:**
```json
{
  "message": {
    "id": "clxmsg001",
    "threadId": "clx789ghi",
    "senderId": "clx456def",
    "senderName": "Alex Creator",
    "senderAvatar": "https://storage.yesgoddess.agency/avatars/alex.jpg",
    "recipientId": "clx123abc",
    "body": "Thank you for your interest! I would love to collaborate.",
    "readAt": null,
    "attachments": [],
    "createdAt": "2025-10-13T14:25:00.000Z",
    "isOwnMessage": true
  },
  "threadUpdated": true
}
```

---

### Example 4: Search Messages

**Request:**
```typescript
const result = await trpc.messages.searchMessages.query({
  query: 'campaign deliverables',
  dateFrom: '2025-10-01T00:00:00.000Z',
  dateTo: '2025-10-31T23:59:59.999Z',
  limit: 20,
  offset: 0
});
```

**Response:**
```json
{
  "messages": [
    {
      "id": "clxmsg123",
      "threadId": "clx789ghi",
      "senderId": "clx123abc",
      "senderName": "Sarah Brand Manager",
      "senderAvatar": "https://storage.yesgoddess.agency/avatars/sarah.jpg",
      "recipientId": "clx456def",
      "body": "Here are the campaign deliverables we discussed...",
      "readAt": "2025-10-13T11:00:00.000Z",
      "attachments": [
        {
          "id": "clxatt001",
          "messageId": "clxmsg123",
          "storageKey": "attachments/2025/10/brief.pdf",
          "fileName": "Campaign_Brief.pdf",
          "fileSize": 245760,
          "mimeType": "application/pdf",
          "createdAt": "2025-10-13T10:45:00.000Z"
        }
      ],
      "createdAt": "2025-10-13T10:45:00.000Z",
      "isOwnMessage": false
    }
  ],
  "total": 1,
  "hasMore": false
}
```

---

### Example 5: File Upload Flow

**Step 1: Generate Upload URL**
```typescript
const uploadDetails = await trpc.messages.generateUploadUrl.mutate({
  messageId: 'clxmsg456',
  fileName: 'proposal.pdf',
  contentType: 'application/pdf',
  fileSize: 524288
});

// Response:
// {
//   uploadUrl: "https://r2.yesgoddess.agency/upload/signed-url-here",
//   storageKey: "attachments/2025/10/xyz123.pdf",
//   expiresAt: "2025-10-13T15:30:00.000Z",
//   attachmentId: "clxatt789"
// }
```

**Step 2: Upload File**
```typescript
const file = new File([fileData], 'proposal.pdf', { type: 'application/pdf' });

await fetch(uploadDetails.uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': 'application/pdf'
  }
});
```

**Step 3: Create Attachment Record**
```typescript
const attachment = await trpc.messages.createAttachment.mutate({
  messageId: 'clxmsg456',
  storageKey: uploadDetails.storageKey,
  fileName: 'proposal.pdf',
  fileSize: 524288,
  mimeType: 'application/pdf'
});
```

**Step 4: Send Message with Attachment**
```typescript
await trpc.messages.sendMessage.mutate({
  threadId: 'clx789ghi',
  recipientId: 'clx123abc',
  body: 'Please review the attached proposal.',
  attachmentIds: [attachment.id]
});
```

---

### Example 6: Get Unread Count

**Request:**
```typescript
const unreadCount = await trpc.messages.getUnreadCount.query();
```

**Response:**
```json
{
  "total": 5,
  "byThread": {
    "clx789ghi": 3,
    "clx999zzz": 2
  }
}
```

---

### Example 7: Mark Thread as Read

**Request:**
```typescript
const result = await trpc.messages.markThreadRead.mutate({
  threadId: 'clx789ghi'
});
```

**Response:**
```json
{
  "count": 3
}
```

---

## Next Steps

Continue to:
- **[Part 2: Business Logic & Implementation](./MESSAGING_INTEGRATION_GUIDE_PART_2_IMPLEMENTATION.md)** - Validation rules, error handling, permissions, and rate limiting
- **[Part 3: Frontend Implementation Guide](./MESSAGING_INTEGRATION_GUIDE_PART_3_FRONTEND.md)** - React components, state management, and UX best practices
