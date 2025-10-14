# Message Service - API Reference & Type Definitions

**Classification:** 🌐 SHARED  
**Module:** Messages  
**Last Updated:** October 13, 2025

> **Purpose:** Complete API reference for the YesGoddess messaging system. Creators and brands message each other via the website. Admins can view/moderate if needed.

---

## Table of Contents
1. [API Base Configuration](#api-base-configuration)
2. [Thread Management Endpoints](#thread-management-endpoints)
3. [Message Operations Endpoints](#message-operations-endpoints)
4. [Attachment Endpoints](#attachment-endpoints)
5. [Notification Preference Endpoints](#notification-preference-endpoints)
6. [TypeScript Type Definitions](#typescript-type-definitions)
7. [Zod Validation Schemas](#zod-validation-schemas)

---

## API Base Configuration

### tRPC Client Setup

```typescript
// lib/api/client.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/api/root';

export const trpc = createTRPCReact<AppRouter>();

// All endpoints are prefixed with `messages.*`
// Example: trpc.messages.createThread.useMutation()
```

### Authentication
- **All endpoints require authentication**
- JWT token passed via HTTP-only cookie
- User ID automatically extracted from session
- No manual token management needed

### Base URL
- **Production:** `https://ops.yesgoddess.agency/api/trpc`
- **Local Dev:** `http://localhost:3000/api/trpc`

---

## Thread Management Endpoints

### 1. Create Thread
**Endpoint:** `messages.createThread`  
**Type:** Mutation  
**Purpose:** Create new message thread or return existing thread with same participants

#### Input Schema
```typescript
{
  participantIds: string[];  // 2-10 CUIDs, must include current user
  subject?: string;          // Optional, max 255 chars
}
```

#### Response Schema
```typescript
{
  thread: {
    id: string;              // CUID
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
  existingThread: boolean;   // true if thread already existed
}
```

#### React Query Example
```typescript
import { trpc } from '@/lib/api/client';

function CreateThreadButton() {
  const createThread = trpc.messages.createThread.useMutation({
    onSuccess: (data) => {
      if (data.existingThread) {
        console.log('Navigating to existing thread:', data.thread.id);
      } else {
        console.log('New thread created:', data.thread.id);
      }
      router.push(`/messages/${data.thread.id}`);
    }
  });

  const handleCreateThread = (recipientId: string) => {
    createThread.mutate({
      participantIds: [currentUserId, recipientId],
      subject: 'Project Discussion'
    });
  };

  return (
    <button 
      onClick={() => handleCreateThread('recipient_id')}
      disabled={createThread.isLoading}
    >
      {createThread.isLoading ? 'Creating...' : 'Start Conversation'}
    </button>
  );
}
```

#### cURL Example
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/messages.createThread \
  -H "Content-Type: application/json" \
  -H "Cookie: auth-token=YOUR_JWT_TOKEN" \
  -d '{
    "participantIds": ["clq1234abcd", "clq5678efgh"],
    "subject": "License Discussion"
  }'
```

---

### 2. List Threads
**Endpoint:** `messages.listThreads`  
**Type:** Query  
**Purpose:** List authenticated user's threads with pagination

#### Input Schema
```typescript
{
  limit?: number;           // 1-100, default 20
  offset?: number;          // default 0
  includeArchived?: boolean; // default false
}
```

#### Response Schema
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
    unreadCount: number;    // Unread messages for current user
    lastMessage?: {
      body: string;
      senderId: string;
      senderName: string;
      createdAt: Date;
    } | null;
    createdAt: Date;
  }>;
  total: number;            // Total thread count
  hasMore: boolean;         // More pages available
}
```

#### React Query Example
```typescript
function ThreadList() {
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading, error } = trpc.messages.listThreads.useQuery({
    limit,
    offset: page * limit,
    includeArchived: false
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      {data.threads.map(thread => (
        <ThreadCard key={thread.id} thread={thread} />
      ))}
      
      {data.hasMore && (
        <button onClick={() => setPage(page + 1)}>
          Load More
        </button>
      )}
    </div>
  );
}
```

---

### 3. Get Thread Details
**Endpoint:** `messages.getThread`  
**Type:** Query  
**Purpose:** Get single thread with messages

#### Input Schema
```typescript
{
  threadId: string;  // CUID
}
```

#### Response Schema
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
      fileName: string;
      fileSize: number;
      mimeType: string;
    }>;
    createdAt: Date;
    isOwnMessage: boolean;  // true if current user sent it
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

#### React Query Example
```typescript
function ThreadView({ threadId }: { threadId: string }) {
  const { data: thread, isLoading } = trpc.messages.getThread.useQuery({
    threadId
  });

  const utils = trpc.useContext();

  // Auto-refresh when new message notification arrives
  useEffect(() => {
    const channel = new BroadcastChannel('notifications');
    channel.onmessage = (event) => {
      if (event.data.type === 'MESSAGE' && event.data.threadId === threadId) {
        utils.messages.getThread.invalidate({ threadId });
      }
    };
    return () => channel.close();
  }, [threadId]);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <ThreadHeader participants={thread.participants} />
      <MessageList messages={thread.messages} />
      <MessageInput threadId={threadId} />
    </div>
  );
}
```

---

### 4. Archive Thread
**Endpoint:** `messages.archiveThread`  
**Type:** Mutation  
**Purpose:** Archive (soft delete) thread

#### Input Schema
```typescript
{
  threadId: string;  // CUID
}
```

#### Response Schema
```typescript
{
  success: boolean;
}
```

#### React Query Example
```typescript
function ArchiveThreadButton({ threadId }: { threadId: string }) {
  const utils = trpc.useContext();
  
  const archiveThread = trpc.messages.archiveThread.useMutation({
    onSuccess: () => {
      // Invalidate thread list to remove archived thread
      utils.messages.listThreads.invalidate();
      toast.success('Thread archived');
    }
  });

  return (
    <button onClick={() => archiveThread.mutate({ threadId })}>
      Archive
    </button>
  );
}
```

---

### 5. Get Unread Count
**Endpoint:** `messages.getUnreadCount`  
**Type:** Query  
**Purpose:** Get unread message count for user

#### Input Schema
None (uses authenticated user from session)

#### Response Schema
```typescript
{
  total: number;                    // Total unread across all threads
  byThread: Record<string, number>; // threadId -> unread count
}
```

#### React Query Example
```typescript
function UnreadBadge() {
  const { data: unreadCount } = trpc.messages.getUnreadCount.useQuery(
    undefined,
    {
      refetchInterval: 30000, // Poll every 30 seconds
    }
  );

  if (!unreadCount?.total) return null;

  return (
    <span className="badge badge-primary">
      {unreadCount.total}
    </span>
  );
}
```

---

## Message Operations Endpoints

### 6. Send Message
**Endpoint:** `messages.sendMessage`  
**Type:** Mutation  
**Purpose:** Send new message in thread

#### Input Schema
```typescript
{
  threadId: string;        // CUID
  recipientId: string;     // CUID, must be thread participant
  body: string;            // 1-10,000 characters
  attachmentIds?: string[]; // Max 5 attachments
}
```

#### Response Schema
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
    readAt: null;          // Always null for new message
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
    isOwnMessage: true;    // Always true for sender
  };
  threadUpdated: boolean;  // Always true
}
```

#### React Query Example
```typescript
function MessageInput({ threadId, recipientId }: Props) {
  const [body, setBody] = useState('');
  const utils = trpc.useContext();

  const sendMessage = trpc.messages.sendMessage.useMutation({
    onSuccess: (data) => {
      setBody('');
      // Optimistically update thread
      utils.messages.getThread.invalidate({ threadId });
      utils.messages.listThreads.invalidate();
    },
    onError: (error) => {
      if (error.data?.code === 'TOO_MANY_REQUESTS') {
        toast.error('You are sending messages too quickly. Please wait a moment.');
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim()) {
      sendMessage.mutate({ threadId, recipientId, body: body.trim() });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={10000}
        placeholder="Type your message..."
        disabled={sendMessage.isLoading}
      />
      <button type="submit" disabled={sendMessage.isLoading || !body.trim()}>
        {sendMessage.isLoading ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}
```

---

### 7. List Messages
**Endpoint:** `messages.listMessages`  
**Type:** Query  
**Purpose:** List messages in thread with pagination

#### Input Schema
```typescript
{
  threadId: string;  // CUID
  limit?: number;    // 1-100, default 50
  offset?: number;   // default 0
}
```

#### Response Schema
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
    attachments: Array<AttachmentInfo>;
    createdAt: Date;
    isOwnMessage: boolean;
  }>;
  total: number;
  hasMore: boolean;
}
```

#### React Query Example
```typescript
function MessageHistory({ threadId }: { threadId: string }) {
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data } = trpc.messages.listMessages.useQuery({
    threadId,
    limit,
    offset: page * limit
  });

  return (
    <div>
      {data?.messages.map(msg => (
        <MessageBubble 
          key={msg.id} 
          message={msg}
          isOwn={msg.isOwnMessage}
        />
      ))}
      
      {data?.hasMore && (
        <button onClick={() => setPage(p => p + 1)}>
          Load Older Messages
        </button>
      )}
    </div>
  );
}
```

---

### 8. Mark Messages as Read
**Endpoint:** `messages.markMessagesRead`  
**Type:** Mutation  
**Purpose:** Mark multiple messages as read

#### Input Schema
```typescript
{
  messageIds: string[];  // 1-100 CUIDs
}
```

#### Response Schema
```typescript
{
  count: number;  // Number of messages marked as read
}
```

#### React Query Example
```typescript
function useMarkMessagesAsRead(threadId: string) {
  const utils = trpc.useContext();

  return trpc.messages.markMessagesRead.useMutation({
    onSuccess: (data) => {
      // Update unread count
      utils.messages.getUnreadCount.invalidate();
      // Update thread details
      utils.messages.getThread.invalidate({ threadId });
      console.log(`Marked ${data.count} messages as read`);
    }
  });
}

// Usage: Mark visible messages as read when user views them
function MessageList({ messages, threadId }: Props) {
  const markAsRead = useMarkMessagesAsRead(threadId);
  const observerRef = useRef<IntersectionObserver>();

  useEffect(() => {
    const unreadIds = messages
      .filter(m => !m.readAt && !m.isOwnMessage)
      .map(m => m.id);

    if (unreadIds.length > 0) {
      // Mark as read after 2 seconds of being visible
      const timer = setTimeout(() => {
        markAsRead.mutate({ messageIds: unreadIds });
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [messages]);

  // ... render messages
}
```

---

### 9. Mark Single Message as Read
**Endpoint:** `messages.markMessageRead`  
**Type:** Mutation  
**Purpose:** Mark single message as read (convenience method)

#### Input Schema
```typescript
{
  messageId: string;  // CUID
}
```

#### Response Schema
```typescript
{
  success: boolean;
}
```

---

### 10. Mark Thread as Read
**Endpoint:** `messages.markThreadRead`  
**Type:** Mutation  
**Purpose:** Mark all messages in thread as read

#### Input Schema
```typescript
{
  threadId: string;  // CUID
}
```

#### Response Schema
```typescript
{
  count: number;  // Number of messages marked as read
}
```

#### React Query Example
```typescript
function MarkThreadReadButton({ threadId }: { threadId: string }) {
  const utils = trpc.useContext();
  
  const markThreadRead = trpc.messages.markThreadRead.useMutation({
    onSuccess: (data) => {
      utils.messages.getUnreadCount.invalidate();
      toast.success(`Marked ${data.count} messages as read`);
    }
  });

  return (
    <button onClick={() => markThreadRead.mutate({ threadId })}>
      Mark All as Read
    </button>
  );
}
```

---

### 11. Search Messages
**Endpoint:** `messages.searchMessages`  
**Type:** Query  
**Purpose:** Full-text search across user's messages

#### Input Schema
```typescript
{
  query: string;       // 1-500 chars
  threadId?: string;   // Optional: filter by thread
  dateFrom?: string;   // ISO datetime
  dateTo?: string;     // ISO datetime
  limit?: number;      // 1-100, default 20
  offset?: number;     // default 0
}
```

#### Response Schema
```typescript
{
  messages: Array<MessageListItem>;
  total: number;
  hasMore: boolean;
}
```

#### React Query Example
```typescript
function MessageSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 500);

  const { data, isLoading } = trpc.messages.searchMessages.useQuery(
    {
      query: debouncedQuery,
      limit: 20,
      offset: 0
    },
    {
      enabled: debouncedQuery.length >= 3,
      keepPreviousData: true
    }
  );

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search messages..."
      />
      
      {isLoading && <span>Searching...</span>}
      
      {data?.messages.map(msg => (
        <SearchResult key={msg.id} message={msg} query={query} />
      ))}
    </div>
  );
}
```

---

## Attachment Endpoints

### 12. Generate Upload URL
**Endpoint:** `messages.generateUploadUrl`  
**Type:** Mutation  
**Purpose:** Get presigned URL for direct file upload to storage

#### Input Schema
```typescript
{
  messageId: string;   // CUID
  fileName: string;    // 1-255 chars
  contentType: string; // MIME type
  fileSize: number;    // Bytes, max 10MB
}
```

#### Response Schema
```typescript
{
  uploadUrl: string;   // Presigned URL for PUT request
  storageKey: string;  // Key to use when creating attachment record
  expiresIn: number;   // Seconds until URL expires (900 = 15 min)
}
```

#### React Example (Complete Upload Flow)
```typescript
function FileUploader({ messageId }: { messageId: string }) {
  const generateUrl = trpc.messages.generateUploadUrl.useMutation();
  const createAttachment = trpc.messages.createAttachment.useMutation();

  const handleFileUpload = async (file: File) => {
    try {
      // Step 1: Get presigned URL
      const { uploadUrl, storageKey } = await generateUrl.mutateAsync({
        messageId,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size
      });

      // Step 2: Upload directly to storage
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      // Step 3: Create attachment record
      await createAttachment.mutateAsync({
        messageId,
        storageKey,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type
      });

      toast.success('File uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload file');
    }
  };

  return (
    <input
      type="file"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleFileUpload(file);
      }}
      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
    />
  );
}
```

---

### 13. Create Attachment Record
**Endpoint:** `messages.createAttachment`  
**Type:** Mutation  
**Purpose:** Create attachment record after successful upload

#### Input Schema
```typescript
{
  messageId: string;  // CUID
  storageKey: string; // From generateUploadUrl
  fileName: string;   // 1-255 chars
  fileSize: number;   // Bytes
  mimeType: string;   // MIME type
}
```

#### Response Schema
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

### 14. Get Attachment
**Endpoint:** `messages.getAttachment`  
**Type:** Query  
**Purpose:** Get attachment with presigned download URL

#### Input Schema
```typescript
{
  attachmentId: string;  // CUID
}
```

#### Response Schema
```typescript
{
  id: string;
  messageId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;  // Presigned URL, valid 15 minutes
  createdAt: Date;
}
```

#### React Query Example
```typescript
function AttachmentDownload({ attachmentId, fileName }: Props) {
  const { data: attachment } = trpc.messages.getAttachment.useQuery({
    attachmentId
  });

  const handleDownload = () => {
    if (attachment?.downloadUrl) {
      // Browser will handle the download
      window.open(attachment.downloadUrl, '_blank');
    }
  };

  return (
    <button onClick={handleDownload} disabled={!attachment}>
      <DownloadIcon />
      {fileName}
    </button>
  );
}
```

---

### 15. Get Message Attachments
**Endpoint:** `messages.getMessageAttachments`  
**Type:** Query  
**Purpose:** Get all attachments for a message

#### Input Schema
```typescript
{
  messageId: string;  // CUID
}
```

#### Response Schema
```typescript
Array<{
  id: string;
  messageId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;  // Presigned URL
  createdAt: Date;
}>
```

---

### 16. Delete Attachment
**Endpoint:** `messages.deleteAttachment`  
**Type:** Mutation  
**Purpose:** Delete attachment (sender only)

#### Input Schema
```typescript
{
  attachmentId: string;  // CUID
}
```

#### Response Schema
```typescript
{
  success: boolean;
}
```

---

## Notification Preference Endpoints

### 17. Mute Thread
**Endpoint:** `messages.muteThread`  
**Type:** Mutation  
**Purpose:** Disable notifications for specific thread

#### Input Schema
```typescript
{
  threadId: string;  // CUID
}
```

#### Response Schema
```typescript
{
  success: boolean;
}
```

#### React Query Example
```typescript
function ThreadNotificationToggle({ threadId }: { threadId: string }) {
  const muteThread = trpc.messages.muteThread.useMutation();
  const unmuteThread = trpc.messages.unmuteThread.useMutation();

  const [isMuted, setIsMuted] = useState(false);

  const handleToggle = () => {
    if (isMuted) {
      unmuteThread.mutate({ threadId });
      setIsMuted(false);
    } else {
      muteThread.mutate({ threadId });
      setIsMuted(true);
    }
  };

  return (
    <button onClick={handleToggle}>
      {isMuted ? <BellSlashIcon /> : <BellIcon />}
      {isMuted ? 'Unmute' : 'Mute'}
    </button>
  );
}
```

---

### 18. Unmute Thread
**Endpoint:** `messages.unmuteThread`  
**Type:** Mutation  
**Purpose:** Re-enable notifications for thread

#### Input Schema
```typescript
{
  threadId: string;  // CUID
}
```

#### Response Schema
```typescript
{
  success: boolean;
}
```

---

### 19. Update Notification Preferences
**Endpoint:** `messages.updateNotificationPreferences`  
**Type:** Mutation  
**Purpose:** Update global message notification settings

#### Input Schema
```typescript
{
  emailNotifications?: 'immediate' | 'digest' | 'off';
  inAppNotifications?: boolean;
  digestFrequency?: 'daily' | 'weekly';  // Only if emailNotifications = 'digest'
}
```

#### Response Schema
```typescript
{
  success: boolean;
}
```

#### React Query Example
```typescript
function NotificationSettings() {
  const updatePrefs = trpc.messages.updateNotificationPreferences.useMutation({
    onSuccess: () => {
      toast.success('Notification preferences updated');
    }
  });

  const handleSubmit = (values: FormValues) => {
    updatePrefs.mutate({
      emailNotifications: values.emailNotifications,
      inAppNotifications: values.inAppNotifications,
      digestFrequency: values.emailNotifications === 'digest' 
        ? values.digestFrequency 
        : undefined
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <select name="emailNotifications">
        <option value="immediate">Email me immediately</option>
        <option value="digest">Send daily/weekly digest</option>
        <option value="off">No email notifications</option>
      </select>

      {/* Show digest frequency if digest is selected */}
      <select name="digestFrequency">
        <option value="daily">Daily digest</option>
        <option value="weekly">Weekly digest</option>
      </select>

      <label>
        <input type="checkbox" name="inAppNotifications" />
        Show in-app notifications
      </label>

      <button type="submit">Save Preferences</button>
    </form>
  );
}
```

---

## TypeScript Type Definitions

Copy these types to your frontend project:

```typescript
// types/messages.ts

// ===========================
// Thread Types
// ===========================

export interface MessageThreadParticipant {
  userId: string;
  name: string;
  avatar?: string | null;
}

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

export interface ThreadDetails extends ThreadListItem {
  messages: MessageListItem[];
  totalMessages: number;
}

// ===========================
// Message Types
// ===========================

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

export interface MessageAttachmentInfo {
  id: string;
  messageId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl?: string;  // Only present when retrieved via getAttachment
  createdAt: Date;
}

// ===========================
// Request Types
// ===========================

export interface CreateThreadInput {
  participantIds: string[];
  subject?: string;
}

export interface SendMessageInput {
  threadId: string;
  recipientId: string;
  body: string;
  attachmentIds?: string[];
}

export interface SearchMessagesInput {
  query: string;
  threadId?: string;
  dateFrom?: string;  // ISO datetime
  dateTo?: string;    // ISO datetime
  limit?: number;
  offset?: number;
}

// ===========================
// Response Types
// ===========================

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

export interface SendMessageResult {
  message: MessageListItem;
  threadUpdated: boolean;
}

export interface ListThreadsResult {
  threads: ThreadListItem[];
  total: number;
  hasMore: boolean;
}

export interface ListMessagesResult {
  messages: MessageListItem[];
  total: number;
  hasMore: boolean;
}

export interface UnreadCountResult {
  total: number;
  byThread: Record<string, number>;
}

export interface UploadUrlResult {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}

// ===========================
// Notification Types
// ===========================

export type EmailNotificationMode = 'immediate' | 'digest' | 'off';
export type DigestFrequency = 'daily' | 'weekly';

export interface NotificationPreferences {
  emailNotifications?: EmailNotificationMode;
  inAppNotifications?: boolean;
  digestFrequency?: DigestFrequency;
}
```

---

## Zod Validation Schemas

If you want client-side validation using the same schemas:

```typescript
// validation/messages.ts
import { z } from 'zod';

export const CreateThreadSchema = z.object({
  participantIds: z
    .array(z.string().cuid())
    .min(2, 'Thread must have at least 2 participants')
    .max(10, 'Thread cannot have more than 10 participants'),
  subject: z.string().max(255).optional(),
});

export const SendMessageSchema = z.object({
  threadId: z.string().cuid(),
  body: z.string()
    .min(1, 'Message body cannot be empty')
    .max(10000, 'Message too long'),
  recipientId: z.string().cuid(),
  attachmentIds: z
    .array(z.string().cuid())
    .max(5, 'Maximum 5 attachments per message')
    .optional(),
});

export const SearchMessagesSchema = z.object({
  query: z.string().min(1).max(500),
  threadId: z.string().cuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export const UploadAttachmentSchema = z.object({
  messageId: z.string().cuid(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(1).max(10 * 1024 * 1024), // 10MB
  mimeType: z.string().regex(/^[a-z]+\/[a-z0-9\-\+\.]+$/i, 'Invalid MIME type'),
});

// Usage in form validation
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

function MessageForm() {
  const form = useForm({
    resolver: zodResolver(SendMessageSchema),
  });

  // form will validate against schema before submission
}
```

---

## Next Steps

Continue to:
- **[Part 2: Business Logic & Integration Guide](./MESSAGE_SERVICE_INTEGRATION_GUIDE.md)** - Implementation patterns, validation rules, and best practices
- **[Part 3: Error Handling & Advanced Features](./MESSAGE_SERVICE_ADVANCED.md)** - Error codes, rate limiting, real-time updates

---

**Questions?** Contact the backend team or refer to the [Implementation Summary](../modules/messages/IMPLEMENTATION_COMPLETE.md).
