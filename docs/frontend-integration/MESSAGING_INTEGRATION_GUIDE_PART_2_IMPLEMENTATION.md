# Messaging System - Frontend Integration Guide
## Part 2: Business Logic & Implementation Details

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
**Module:** Messaging System  
**Last Updated:** October 13, 2025

---

## Table of Contents

1. [Business Logic & Validation Rules](#business-logic--validation-rules)
2. [Error Handling](#error-handling)
3. [Authorization & Permissions](#authorization--permissions)
4. [Rate Limiting & Quotas](#rate-limiting--quotas)
5. [File Upload Guidelines](#file-upload-guidelines)
6. [Real-time Updates](#real-time-updates)
7. [Pagination & Filtering](#pagination--filtering)
8. [Content Moderation](#content-moderation)

---

## Business Logic & Validation Rules

### Thread Creation Rules

#### Participant Validation
```typescript
// Rule: 2-10 participants required
const participantIds = ['user1', 'user2']; // Min 2
const tooMany = ['user1', 'user2', ...] // Max 10

// Rule: Current user must be in participant list
if (!participantIds.includes(currentUserId)) {
  // Error: User must be participant
}

// Rule: All participants must be active users
// Backend validates all IDs exist and are not deleted
```

#### Duplicate Thread Detection
- Backend checks for existing thread with same participants
- If found, returns existing thread with `existingThread: true`
- Frontend should handle this gracefully (don't show "Thread Created" message)

```typescript
const result = await createThread({ participantIds: ['user1', 'user2'] });

if (result.existingThread) {
  // Navigate to existing thread
  router.push(`/messages/${result.thread.id}`);
} else {
  // Show "New conversation started" message
  toast.success('Conversation started!');
  router.push(`/messages/${result.thread.id}`);
}
```

---

### Message Validation Rules

#### Message Body
```typescript
// Length validation
const MIN_LENGTH = 1;
const MAX_LENGTH = 10000;

// Validation function
function validateMessageBody(body: string): { valid: boolean; error?: string } {
  if (body.trim().length < MIN_LENGTH) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  if (body.length > MAX_LENGTH) {
    return { valid: false, error: 'Message too long (max 10,000 characters)' };
  }
  return { valid: true };
}
```

#### Character Count Display
```tsx
// Show character counter near max
const CharacterCounter: React.FC<{ value: string }> = ({ value }) => {
  const remaining = 10000 - value.length;
  const showWarning = remaining < 500;
  
  return (
    <div className={showWarning ? 'text-warning' : 'text-muted'}>
      {remaining.toLocaleString()} characters remaining
    </div>
  );
};
```

#### Attachment Limits
```typescript
const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Validation
function validateAttachments(files: File[]): { valid: boolean; error?: string } {
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { valid: false, error: `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message` };
  }
  
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return { 
        valid: false, 
        error: `File "${file.name}" exceeds 10MB limit` 
      };
    }
  }
  
  return { valid: true };
}
```

---

### Participant Messaging Rules

#### Can Message User Logic
The backend validates whether two users can message each other based on:

1. **Both users must be active** (not deleted/suspended)
2. **Business relationship must exist**:
   - Shared project/campaign
   - Brand has viewed creator's profile
   - Creator has applied to brand's campaign
   - Admin can message anyone

```typescript
// Backend handles this validation
// Frontend should handle the error gracefully
try {
  await trpc.messages.sendMessage.mutate({ ... });
} catch (error) {
  if (error.code === 'CANNOT_MESSAGE_USER') {
    // Show user-friendly error
    toast.error('You cannot message this user at this time.');
  }
}
```

---

### Subject Line Rules

```typescript
// Optional for threads
const MAX_SUBJECT_LENGTH = 255;

// Auto-generate subject if not provided
function generateSubject(participants: Participant[]): string {
  const names = participants.map(p => p.name).join(', ');
  return names.length > MAX_SUBJECT_LENGTH 
    ? `${names.substring(0, 252)}...`
    : names;
}
```

---

## Error Handling

### Error Codes and HTTP Status Codes

| Error Code | HTTP Status | User-Friendly Message | Frontend Action |
|------------|-------------|----------------------|-----------------|
| `THREAD_NOT_FOUND` | 404 | "Conversation not found" | Redirect to inbox |
| `THREAD_ACCESS_DENIED` | 403 | "You don't have access to this conversation" | Redirect to inbox |
| `INVALID_PARTICIPANTS` | 400 | "Invalid participants selected" | Show validation error |
| `MESSAGE_NOT_FOUND` | 404 | "Message not found" | Refresh thread |
| `MESSAGE_ACCESS_DENIED` | 403 | "Access denied" | Redirect to inbox |
| `CANNOT_MESSAGE_USER` | 403 | "You cannot message this user at this time" | Disable send button |
| `RATE_LIMIT_EXCEEDED` | 429 | "You're sending messages too quickly. Please wait a moment." | Show cooldown timer |
| `ATTACHMENT_NOT_FOUND` | 404 | "Attachment not found" | Remove from UI |
| `ATTACHMENT_TOO_LARGE` | 400 | "File too large (max 10MB)" | Show file size error |
| `INVALID_ATTACHMENT_TYPE` | 400 | "File type not allowed" | Show allowed types |
| `UNAUTHORIZED` | 401 | "Please sign in to continue" | Redirect to login |
| `INTERNAL_SERVER_ERROR` | 500 | "Something went wrong. Please try again." | Show retry button |

---

### Error Response Format

tRPC errors follow this structure:

```typescript
interface TRPCError {
  code: string;
  message: string;
  data?: {
    code: string;
    httpStatus: number;
    path: string;
    stack?: string; // Only in development
  };
}
```

---

### Error Handling Examples

#### Generic Error Handler
```typescript
import { TRPCClientError } from '@trpc/client';

export function handleMessagingError(error: unknown): string {
  if (error instanceof TRPCClientError) {
    const code = error.data?.code || error.message;
    
    switch (code) {
      case 'THREAD_NOT_FOUND':
        return 'Conversation not found';
      case 'THREAD_ACCESS_DENIED':
        return "You don't have access to this conversation";
      case 'RATE_LIMIT_EXCEEDED':
        return "You're sending messages too quickly. Please wait.";
      case 'CANNOT_MESSAGE_USER':
        return 'You cannot message this user at this time';
      case 'ATTACHMENT_TOO_LARGE':
        return 'File too large (max 10MB)';
      case 'UNAUTHORIZED':
        return 'Please sign in to continue';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
  
  return 'An unexpected error occurred';
}
```

#### Component-Level Error Handling
```tsx
const MessageComposer: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const sendMessage = trpc.messages.sendMessage.useMutation();
  
  const handleSend = async (body: string) => {
    setError(null);
    
    try {
      await sendMessage.mutateAsync({
        threadId,
        recipientId,
        body,
      });
      toast.success('Message sent');
    } catch (err) {
      const errorMessage = handleMessagingError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };
  
  return (
    <div>
      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}
      {/* Message form */}
    </div>
  );
};
```

---

### Rate Limit Error Handling

When rate limit is hit, the error includes reset time:

```typescript
// Error response for rate limit
{
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Message rate limit exceeded. Resets at 2025-10-13T15:30:00.000Z'
}

// Extract reset time and show countdown
const handleRateLimitError = (error: TRPCError) => {
  const resetMatch = error.message.match(/Resets at (.+)$/);
  if (resetMatch) {
    const resetAt = new Date(resetMatch[1]);
    const now = new Date();
    const secondsRemaining = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
    
    return `Please wait ${secondsRemaining} seconds before sending another message.`;
  }
  return "You're sending messages too quickly. Please wait.";
};
```

---

### Retry Logic

```typescript
// Retry with exponential backoff for transient errors
const sendMessageWithRetry = async (
  input: SendMessageInput,
  maxRetries = 3
): Promise<SendMessageResult> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await trpc.messages.sendMessage.mutate(input);
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on client errors
      if (error instanceof TRPCClientError) {
        const status = error.data?.httpStatus;
        if (status && status >= 400 && status < 500) {
          throw error;
        }
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }
  
  throw lastError!;
};
```

---

## Authorization & Permissions

### User Roles

The messaging system has these access levels:

| Role | Can Create Thread | Can Send Message | Can View All Messages | Can Moderate |
|------|-------------------|------------------|----------------------|--------------|
| **Creator** | ✅ (with brands they're connected to) | ✅ (in own threads) | ❌ | ❌ |
| **Brand** | ✅ (with creators they're connected to) | ✅ (in own threads) | ❌ | ❌ |
| **Admin** | ✅ (with anyone) | ✅ (in any thread) | ✅ | ✅ |
| **Guest** | ❌ | ❌ | ❌ | ❌ |

---

### Resource Ownership Rules

#### Thread Access
- User must be in thread's `participantIds` array
- All operations require user to be participant
- No exceptions for non-admin users

```typescript
// Check if user has access to thread
function canAccessThread(thread: ThreadDetails, userId: string): boolean {
  return thread.participants.some(p => p.userId === userId);
}
```

#### Message Access
- User must be participant in message's thread
- Only recipient can mark message as read
- Only sender can delete draft messages

```typescript
// Check if user can mark message as read
function canMarkAsRead(message: MessageListItem, userId: string): boolean {
  return message.recipientId === userId && !message.readAt;
}
```

#### Attachment Access
- User must be participant in attachment's message thread
- Download URLs are signed and expire after 1 hour
- Only sender can delete attachments (before message is sent)

---

### Permission-Based UI

Show/hide UI elements based on permissions:

```tsx
const ThreadHeader: React.FC<{ thread: ThreadDetails }> = ({ thread }) => {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  
  const canArchive = thread.participants.some(p => p.userId === userId);
  const canMute = canArchive;
  
  return (
    <div>
      <h2>{thread.subject}</h2>
      {canArchive && (
        <Button onClick={() => archiveThread(thread.id)}>
          Archive
        </Button>
      )}
      {canMute && (
        <Button onClick={() => muteThread(thread.id)}>
          Mute
        </Button>
      )}
    </div>
  );
};
```

---

## Rate Limiting & Quotas

### Message Send Rate Limit

**Limit:** 50 messages per hour per user

```typescript
const RATE_LIMIT = {
  MAX_MESSAGES: 50,
  WINDOW_HOURS: 1,
};
```

#### Rate Limit Headers

When rate limit is approaching, check these response headers (if available):

```typescript
// Response headers (may vary by implementation)
{
  'X-RateLimit-Limit': '50',
  'X-RateLimit-Remaining': '5',
  'X-RateLimit-Reset': '1697209200'
}
```

#### Client-Side Rate Limit Tracking

Track messages sent to provide early warning:

```typescript
const useMessageRateLimit = () => {
  const [messagesSent, setMessagesSent] = useState(0);
  const [resetAt, setResetAt] = useState<Date | null>(null);
  
  useEffect(() => {
    // Reset counter every hour
    const interval = setInterval(() => {
      setMessagesSent(0);
      setResetAt(new Date(Date.now() + 60 * 60 * 1000));
    }, 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  const incrementCounter = () => {
    setMessagesSent(prev => prev + 1);
  };
  
  const warningThreshold = 45; // 90% of limit
  const showWarning = messagesSent >= warningThreshold;
  
  return { messagesSent, showWarning, incrementCounter };
};
```

#### Rate Limit Warning UI

```tsx
const RateLimitWarning: React.FC<{ messagesSent: number }> = ({ messagesSent }) => {
  const remaining = 50 - messagesSent;
  
  if (remaining > 5) return null;
  
  return (
    <Alert variant="warning">
      You have {remaining} messages remaining this hour.
    </Alert>
  );
};
```

---

### Search Rate Limiting

Search queries may have lower rate limits:

```typescript
// Recommended: Debounce search input
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const SearchMessages: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 500); // 500ms delay
  
  const { data } = trpc.messages.searchMessages.useQuery({
    query: debouncedSearch,
  }, {
    enabled: debouncedSearch.length >= 3, // Min 3 chars
  });
  
  return (
    <input
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search messages..."
    />
  );
};
```

---

## File Upload Guidelines

### Allowed File Types

```typescript
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  
  // Archives
  'application/zip',
  'application/x-rar-compressed',
];

const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.zip', '.rar',
];
```

---

### File Size Limits

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ATTACHMENTS_PER_MESSAGE = 5;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

---

### File Upload Flow

#### Step-by-Step Upload Process

```typescript
async function uploadAttachment(
  file: File,
  messageId: string
): Promise<MessageAttachmentInfo> {
  
  // Step 1: Validate file
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File too large (max 10MB)');
  }
  
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('File type not allowed');
  }
  
  // Step 2: Generate upload URL
  const uploadDetails = await trpc.messages.generateUploadUrl.mutate({
    messageId,
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  });
  
  // Step 3: Upload file directly to storage
  const uploadResponse = await fetch(uploadDetails.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  });
  
  if (!uploadResponse.ok) {
    throw new Error('Upload failed');
  }
  
  // Step 4: Create attachment record
  const attachment = await trpc.messages.createAttachment.mutate({
    messageId,
    storageKey: uploadDetails.storageKey,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  });
  
  return attachment;
}
```

---

### Upload Progress Tracking

```tsx
const FileUploader: React.FC<{ onComplete: (attachmentId: string) => void }> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'complete' | 'error'>('idle');
  
  const handleFileSelect = async (file: File) => {
    setStatus('uploading');
    setProgress(0);
    
    try {
      // Simulate progress (actual implementation would use XMLHttpRequest)
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);
      
      const attachment = await uploadAttachment(file, messageId);
      
      clearInterval(progressInterval);
      setProgress(100);
      setStatus('complete');
      onComplete(attachment.id);
    } catch (error) {
      setStatus('error');
      toast.error('Upload failed');
    }
  };
  
  return (
    <div>
      {status === 'uploading' && (
        <div className="progress-bar">
          <div style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      )}
    </div>
  );
};
```

---

### Attachment Display

```tsx
const AttachmentPreview: React.FC<{ attachment: MessageAttachmentInfo }> = ({ attachment }) => {
  const isImage = attachment.mimeType.startsWith('image/');
  
  return (
    <div className="attachment-preview">
      {isImage ? (
        <img src={attachment.downloadUrl} alt={attachment.fileName} />
      ) : (
        <div className="file-icon">
          <FileIcon type={attachment.mimeType} />
          <span>{attachment.fileName}</span>
          <span className="file-size">{formatFileSize(attachment.fileSize)}</span>
        </div>
      )}
      <a href={attachment.downloadUrl} download={attachment.fileName}>
        Download
      </a>
    </div>
  );
};
```

---

## Real-time Updates

### Polling Strategy

Since WebSocket/SSE is not implemented, use polling for updates:

```typescript
// Poll for unread count every 30 seconds
const useUnreadCountPolling = (intervalMs = 30000) => {
  const { data, refetch } = trpc.messages.getUnreadCount.useQuery(undefined, {
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
  });
  
  return data;
};

// Poll for new messages in active thread
const useThreadPolling = (threadId: string, intervalMs = 10000) => {
  const { data, refetch } = trpc.messages.getThread.useQuery(
    { threadId },
    {
      refetchInterval: intervalMs,
      refetchIntervalInBackground: false,
      enabled: !!threadId,
    }
  );
  
  return { thread: data, refetch };
};
```

---

### Optimistic Updates

Update UI immediately, then sync with server:

```typescript
const useSendMessage = (threadId: string) => {
  const utils = trpc.useContext();
  
  const sendMessage = trpc.messages.sendMessage.useMutation({
    onMutate: async (newMessage) => {
      // Cancel outgoing refetches
      await utils.messages.getThread.cancel({ threadId });
      
      // Snapshot previous value
      const previousThread = utils.messages.getThread.getData({ threadId });
      
      // Optimistically update UI
      utils.messages.getThread.setData({ threadId }, (old) => {
        if (!old) return old;
        
        return {
          ...old,
          messages: [
            ...old.messages,
            {
              id: 'temp-' + Date.now(),
              body: newMessage.body,
              senderId: currentUserId,
              senderName: currentUserName,
              createdAt: new Date(),
              readAt: null,
              attachments: [],
              isOwnMessage: true,
              // ...other fields
            } as MessageListItem,
          ],
        };
      });
      
      return { previousThread };
    },
    
    onError: (err, newMessage, context) => {
      // Rollback on error
      if (context?.previousThread) {
        utils.messages.getThread.setData({ threadId }, context.previousThread);
      }
      toast.error('Failed to send message');
    },
    
    onSettled: () => {
      // Refetch to sync
      utils.messages.getThread.invalidate({ threadId });
    },
  });
  
  return sendMessage;
};
```

---

## Pagination & Filtering

### Pagination Format

The API uses **offset-based pagination**:

```typescript
interface PaginationInput {
  limit: number;   // Items per page (1-100)
  offset: number;  // Items to skip
}

interface PaginationResult {
  items: T[];
  total: number;
  hasMore: boolean;
}
```

---

### Infinite Scroll Implementation

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';

const useInfiniteThreads = () => {
  return useInfiniteQuery({
    queryKey: ['threads'],
    queryFn: async ({ pageParam = 0 }) => {
      return await trpc.messages.listThreads.query({
        limit: 20,
        offset: pageParam,
      });
    },
    getNextPageParam: (lastPage, pages) => {
      if (!lastPage.hasMore) return undefined;
      return pages.length * 20; // offset = pageNumber * limit
    },
  });
};

// Component usage
const ThreadList: React.FC = () => {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteThreads();
  
  const threads = data?.pages.flatMap(page => page.threads) ?? [];
  
  return (
    <div>
      {threads.map(thread => (
        <ThreadListItem key={thread.id} thread={thread} />
      ))}
      
      {hasNextPage && (
        <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </Button>
      )}
    </div>
  );
};
```

---

### Filter Options

#### Thread Filters
```typescript
interface ThreadFilters {
  includeArchived?: boolean;  // Show archived threads
}

// Usage
const { data } = trpc.messages.listThreads.useQuery({
  includeArchived: showArchived,
  limit: 20,
  offset: 0,
});
```

#### Message Search Filters
```typescript
interface SearchFilters {
  query: string;
  threadId?: string;       // Filter to specific thread
  dateFrom?: string;       // ISO datetime
  dateTo?: string;         // ISO datetime
}

// Usage
const { data } = trpc.messages.searchMessages.useQuery({
  query: searchTerm,
  threadId: currentThreadId,  // Optional
  dateFrom: new Date('2025-01-01').toISOString(),
  limit: 20,
});
```

---

## Content Moderation

### Automated Moderation

The backend automatically checks messages for:
- Profanity and offensive language
- Spam patterns
- Malicious links
- Personal information (PII)

### Moderation Warnings

If content is flagged but not blocked:

```typescript
// Backend logs moderation event
// Frontend doesn't need to handle this directly
// Message is sent successfully
```

### Moderation Blocking

If content violates policies:

```typescript
try {
  await sendMessage({ body: messageText });
} catch (error) {
  if (error.message.includes('validation failed')) {
    toast.error(
      'Your message could not be sent due to content policy violations. ' +
      'Please revise your message and try again.'
    );
  }
}
```

### Best Practices

1. **Don't show specific violations** - Keep error messages generic for security
2. **Provide clear guidelines** - Link to community guidelines
3. **Allow editing** - Let users revise and resubmit
4. **Report feature** - Allow users to report inappropriate messages

```tsx
const ReportMessage: React.FC<{ messageId: string }> = ({ messageId }) => {
  const reportMessage = trpc.admin.reportMessage.useMutation();
  
  const handleReport = async () => {
    await reportMessage.mutateAsync({
      messageId,
      reason: 'inappropriate',
    });
    toast.success('Message reported to moderators');
  };
  
  return <Button onClick={handleReport}>Report</Button>;
};
```

---

## Next Steps

Continue to:
- **[Part 1: API Reference](./MESSAGING_INTEGRATION_GUIDE_PART_1_API_REFERENCE.md)** - Complete API endpoint documentation
- **[Part 3: Frontend Implementation Guide](./MESSAGING_INTEGRATION_GUIDE_PART_3_FRONTEND.md)** - React components, state management, and UX best practices
