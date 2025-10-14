# Message Service - Error Handling & Advanced Features

**Classification:** 🌐 SHARED  
**Module:** Messages  
**Last Updated:** October 13, 2025

> **Purpose:** Comprehensive error handling, rate limiting, file uploads, notification system, and advanced integration patterns.

---

## Table of Contents
1. [Error Handling](#error-handling)
2. [Rate Limiting & Quotas](#rate-limiting--quotas)
3. [File Upload Flow](#file-upload-flow)
4. [Notification System](#notification-system)
5. [Content Moderation](#content-moderation)
6. [Search Implementation](#search-implementation)
7. [Performance Optimization](#performance-optimization)
8. [Security Considerations](#security-considerations)

---

## Error Handling

### Error Code Reference

All errors follow the tRPC error format:

```typescript
interface TRPCError {
  code: string;        // HTTP-like error code
  message: string;     // Human-readable message
  data?: {
    code: string;      // Internal error code
    statusCode: number;
  };
}
```

### Complete Error Codes

| Error Code | HTTP Status | When It Occurs | User-Friendly Message |
|------------|-------------|----------------|----------------------|
| `THREAD_NOT_FOUND` | 404 | Thread doesn't exist | "This conversation was not found" |
| `THREAD_ACCESS_DENIED` | 403 | User not a participant | "You don't have access to this conversation" |
| `INVALID_PARTICIPANTS` | 400 | Invalid participant list | "One or more participants are invalid" |
| `MESSAGE_NOT_FOUND` | 404 | Message doesn't exist | "This message was not found" |
| `MESSAGE_ACCESS_DENIED` | 403 | User can't access message | "You don't have access to this message" |
| `CANNOT_MESSAGE_USER` | 403 | No business relationship | "You cannot message this user" |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many messages sent | "You're sending messages too quickly. Please wait." |
| `ATTACHMENT_NOT_FOUND` | 404 | Attachment doesn't exist | "This file was not found" |
| `ATTACHMENT_TOO_LARGE` | 400 | File exceeds 10MB | "File is too large. Maximum size is 10MB" |
| `INVALID_ATTACHMENT_TYPE` | 400 | File type not allowed | "This file type is not allowed" |
| `UNAUTHORIZED` | 401 | No valid session | "Please sign in to continue" |
| `FORBIDDEN` | 403 | Generic access denied | "You don't have permission to do this" |
| `BAD_REQUEST` | 400 | Validation failed | "Invalid request. Please check your input" |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected error | "Something went wrong. Please try again" |

---

### Error Handling Pattern

```typescript
// lib/utils/errors.ts
export function getErrorMessage(error: unknown): string {
  if (error instanceof TRPCError) {
    // Extract custom message from data
    const code = error.data?.code;
    
    switch (code) {
      case 'THREAD_NOT_FOUND':
        return 'This conversation was not found';
      case 'THREAD_ACCESS_DENIED':
        return "You don't have access to this conversation";
      case 'CANNOT_MESSAGE_USER':
        return error.message; // Backend provides specific reason
      case 'RATE_LIMIT_EXCEEDED':
        return "You're sending messages too quickly. Please wait a moment.";
      case 'ATTACHMENT_TOO_LARGE':
        return 'File is too large. Maximum size is 10MB';
      case 'INVALID_ATTACHMENT_TYPE':
        return 'This file type is not allowed';
      default:
        return error.message;
    }
  }
  
  return 'An unexpected error occurred';
}

export function shouldRetry(error: unknown): boolean {
  if (error instanceof TRPCError) {
    const code = error.data?.code;
    // Don't retry client errors
    if (code?.startsWith('4')) return false;
    // Retry server errors
    if (code?.startsWith('5')) return true;
  }
  return false;
}
```

---

### React Query Error Handling

```typescript
import { toast } from 'sonner';
import { getErrorMessage, shouldRetry } from '@/lib/utils/errors';

function MessageForm({ threadId, recipientId }: Props) {
  const sendMessage = trpc.messages.sendMessage.useMutation({
    retry: (failureCount, error) => {
      // Retry server errors up to 3 times
      return shouldRetry(error) && failureCount < 3;
    },
    
    onError: (error) => {
      const message = getErrorMessage(error);
      toast.error(message);
      
      // Special handling for rate limits
      if (error.data?.code === 'RATE_LIMIT_EXCEEDED') {
        // Extract reset time from error message
        const resetMatch = error.message.match(/Resets at (.+)/);
        if (resetMatch) {
          const resetAt = new Date(resetMatch[1]);
          showRateLimitDialog(resetAt);
        }
      }
    },
    
    onSuccess: () => {
      toast.success('Message sent');
    }
  });

  // ... rest of component
}
```

---

### Global Error Boundary

```typescript
// components/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to error tracking service
    Sentry.captureException(error, { extra: errorInfo });
    console.error('Messages Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-container">
          <h2>Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false })}>
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Usage
<ErrorBoundary>
  <MessagesLayout />
</ErrorBoundary>
```

---

## Rate Limiting & Quotas

### Message Rate Limits

**Limit:** 50 messages per hour per user  
**Window:** Rolling 1-hour window  
**Storage:** Redis

#### How It Works
1. Each message sent increments counter
2. Counter expires after 1 hour
3. When limit reached, returns `RATE_LIMIT_EXCEEDED`
4. Error message includes reset time

#### Frontend Handling

```typescript
function useRateLimitTracking() {
  const [messageCount, setMessageCount] = useState(0);
  const [resetTime, setResetTime] = useState<Date | null>(null);

  const checkRateLimit = trpc.messages.checkRateLimit.useQuery(
    undefined,
    {
      refetchInterval: 60000, // Check every minute
      onSuccess: (data) => {
        setMessageCount(data.sentMessages);
        setResetTime(data.resetAt);
      }
    }
  );

  const messagesRemaining = 50 - messageCount;
  const isNearLimit = messagesRemaining <= 5;

  return { messageCount, messagesRemaining, isNearLimit, resetTime };
}

function MessageInput() {
  const { messagesRemaining, isNearLimit, resetTime } = useRateLimitTracking();

  return (
    <div>
      {isNearLimit && (
        <Alert variant="warning">
          You have {messagesRemaining} messages remaining this hour.
          Resets at {formatTime(resetTime)}.
        </Alert>
      )}
      
      <textarea />
      <button>Send</button>
    </div>
  );
}
```

---

### Rate Limit Error Dialog

```typescript
function RateLimitDialog({ resetAt }: { resetAt: Date }) {
  const [timeRemaining, setTimeRemaining] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const reset = resetAt.getTime();
      const diff = reset - now;

      if (diff <= 0) {
        setTimeRemaining('Rate limit has reset');
        clearInterval(interval);
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeRemaining(`${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [resetAt]);

  return (
    <Dialog>
      <DialogTitle>Slow down!</DialogTitle>
      <DialogContent>
        <p>You've reached the message limit of 50 messages per hour.</p>
        <p>Your limit will reset in: <strong>{timeRemaining}</strong></p>
      </DialogContent>
    </Dialog>
  );
}
```

---

## File Upload Flow

### Complete Upload Process

The file upload is a **3-step process**:

1. **Generate Upload URL** - Get presigned URL from backend
2. **Direct Upload** - Upload file directly to storage (R2/S3)
3. **Create Attachment Record** - Confirm upload and create DB record

### Implementation

```typescript
// hooks/useFileUpload.ts
import { useState } from 'react';
import { trpc } from '@/lib/api/client';

interface UseFileUploadOptions {
  messageId: string;
  onSuccess?: (attachment: Attachment) => void;
  onError?: (error: Error) => void;
}

export function useFileUpload({ messageId, onSuccess, onError }: UseFileUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const generateUrl = trpc.messages.generateUploadUrl.useMutation();
  const createAttachment = trpc.messages.createAttachment.useMutation();

  const uploadFile = async (file: File) => {
    try {
      setIsUploading(true);
      setProgress(0);

      // Step 1: Get presigned URL
      const { uploadUrl, storageKey } = await generateUrl.mutateAsync({
        messageId,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      });

      // Step 2: Upload to storage with progress tracking
      const xhr = new XMLHttpRequest();

      await new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            setProgress(percentComplete);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve(xhr.response);
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // Step 3: Create attachment record
      const attachment = await createAttachment.mutateAsync({
        messageId,
        storageKey,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      setProgress(100);
      onSuccess?.(attachment);
      
      return attachment;
    } catch (error) {
      onError?.(error as Error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadFile, isUploading, progress };
}
```

---

### File Upload Component

```typescript
function FileUploadButton({ messageId }: { messageId: string }) {
  const { uploadFile, isUploading, progress } = useFileUpload({
    messageId,
    onSuccess: (attachment) => {
      toast.success(`${attachment.fileName} uploaded`);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    }
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate before upload
    const validation = validateFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    await uploadFile(file);
  };

  return (
    <div>
      <input
        type="file"
        onChange={handleFileSelect}
        disabled={isUploading}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
        style={{ display: 'none' }}
        id="file-upload"
      />
      
      <label htmlFor="file-upload" className="btn">
        {isUploading ? (
          <>
            <Spinner />
            Uploading {progress.toFixed(0)}%
          </>
        ) : (
          <>
            <PaperclipIcon />
            Attach File
          </>
        )}
      </label>
    </div>
  );
}
```

---

### Drag & Drop Upload

```typescript
function MessageComposer({ threadId, recipientId }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const { uploadFile } = useFileUpload({ messageId: 'temp' });

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    
    for (const file of files) {
      const validation = validateFile(file);
      if (validation.valid) {
        await uploadFile(file);
      } else {
        toast.error(`${file.name}: ${validation.error}`);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn('composer', isDragging && 'dragging')}
    >
      {isDragging && (
        <div className="drop-overlay">
          Drop files here to upload
        </div>
      )}
      
      <textarea placeholder="Type a message..." />
      <FileUploadButton />
      <button>Send</button>
    </div>
  );
}
```

---

## Notification System

### How Notifications Work

1. **Message Sent** → Backend triggers notification
2. **In-App Notification** → Created immediately in database
3. **Email Notification** → Queued to background job
4. **Frontend Updates** → Via polling or WebSocket

### Notification Types

#### Immediate Emails
- Sent within seconds of message
- 5-minute cooldown per thread (prevents spam)
- User can opt out via preferences

#### Digest Emails
- Daily: 9 AM every day
- Weekly: 9 AM every Monday
- Groups messages by thread
- Only sent if unread messages exist

### Preference Settings UI

```typescript
function NotificationPreferences() {
  const [preferences, setPreferences] = useState({
    emailNotifications: 'immediate' as EmailNotificationMode,
    inAppNotifications: true,
    digestFrequency: 'daily' as DigestFrequency,
  });

  const updatePrefs = trpc.messages.updateNotificationPreferences.useMutation({
    onSuccess: () => {
      toast.success('Preferences saved');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updatePrefs.mutate(preferences);
  };

  return (
    <form onSubmit={handleSubmit}>
      <fieldset>
        <legend>Email Notifications</legend>
        
        <label>
          <input
            type="radio"
            value="immediate"
            checked={preferences.emailNotifications === 'immediate'}
            onChange={(e) => setPreferences({
              ...preferences,
              emailNotifications: e.target.value as EmailNotificationMode
            })}
          />
          Send email immediately when I receive a message
        </label>

        <label>
          <input
            type="radio"
            value="digest"
            checked={preferences.emailNotifications === 'digest'}
            onChange={(e) => setPreferences({
              ...preferences,
              emailNotifications: e.target.value as EmailNotificationMode
            })}
          />
          Send digest email
        </label>

        {preferences.emailNotifications === 'digest' && (
          <select
            value={preferences.digestFrequency}
            onChange={(e) => setPreferences({
              ...preferences,
              digestFrequency: e.target.value as DigestFrequency
            })}
          >
            <option value="daily">Daily (9 AM)</option>
            <option value="weekly">Weekly (Mondays at 9 AM)</option>
          </select>
        )}

        <label>
          <input
            type="radio"
            value="off"
            checked={preferences.emailNotifications === 'off'}
            onChange={(e) => setPreferences({
              ...preferences,
              emailNotifications: e.target.value as EmailNotificationMode
            })}
          />
          Don't send me email notifications
        </label>
      </fieldset>

      <fieldset>
        <legend>In-App Notifications</legend>
        
        <label>
          <input
            type="checkbox"
            checked={preferences.inAppNotifications}
            onChange={(e) => setPreferences({
              ...preferences,
              inAppNotifications: e.target.checked
            })}
          />
          Show notifications in the app
        </label>
      </fieldset>

      <button type="submit" disabled={updatePrefs.isLoading}>
        Save Preferences
      </button>
    </form>
  );
}
```

---

### Thread Muting

Allow users to mute individual threads:

```typescript
function ThreadMuteButton({ threadId }: { threadId: string }) {
  const [isMuted, setIsMuted] = useState(false);

  const muteThread = trpc.messages.muteThread.useMutation({
    onSuccess: () => {
      setIsMuted(true);
      toast.success('Thread muted');
    }
  });

  const unmuteThread = trpc.messages.unmuteThread.useMutation({
    onSuccess: () => {
      setIsMuted(false);
      toast.success('Thread unmuted');
    }
  });

  const handleToggle = () => {
    if (isMuted) {
      unmuteThread.mutate({ threadId });
    } else {
      muteThread.mutate({ threadId });
    }
  };

  return (
    <button onClick={handleToggle} className="icon-button">
      {isMuted ? (
        <>
          <BellSlashIcon />
          Unmute
        </>
      ) : (
        <>
          <BellIcon />
          Mute
        </>
      )}
    </button>
  );
}
```

---

## Content Moderation

### Automatic Moderation

All messages are automatically checked for:
- **Spam patterns**
- **Abusive language**
- **Suspicious links**
- **Excessive capitalization**

### Moderation Results

Messages are still sent, but flagged messages:
- Logged for admin review
- May trigger warnings
- Repeat offenders may be restricted

### Frontend Handling

The frontend doesn't need to handle moderation directly, but should:

1. **Show character counter** to prevent excessive length
2. **Warn about link sharing** (optional UX enhancement)
3. **Provide reporting mechanism** for users

```typescript
function MessageReportButton({ messageId }: { messageId: string }) {
  const [isOpen, setIsOpen] = useState(false);

  const reportMessage = trpc.messages.reportMessage.useMutation({
    onSuccess: () => {
      toast.success('Message reported. We will review it.');
      setIsOpen(false);
    }
  });

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        <FlagIcon /> Report
      </button>

      <Dialog open={isOpen} onClose={() => setIsOpen(false)}>
        <DialogTitle>Report Message</DialogTitle>
        <DialogContent>
          <p>Why are you reporting this message?</p>
          <select onChange={(e) => reportMessage.mutate({
            messageId,
            reason: e.target.value
          })}>
            <option value="">Select reason...</option>
            <option value="spam">Spam</option>
            <option value="harassment">Harassment</option>
            <option value="inappropriate">Inappropriate content</option>
            <option value="other">Other</option>
          </select>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

---

## Search Implementation

### Full-Text Search

The backend provides full-text search across message body:

```typescript
function MessageSearch() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    threadId: undefined as string | undefined,
    dateFrom: undefined as string | undefined,
    dateTo: undefined as string | undefined,
  });

  const [debouncedQuery] = useDebounce(query, 500);

  const { data, isLoading, fetchNextPage, hasNextPage } = 
    trpc.messages.searchMessages.useInfiniteQuery(
      {
        query: debouncedQuery,
        ...filters,
        limit: 20,
      },
      {
        enabled: debouncedQuery.length >= 3,
        getNextPageParam: (lastPage, allPages) =>
          lastPage.hasMore ? allPages.length * 20 : undefined,
      }
    );

  return (
    <div className="search-container">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search messages..."
      />

      <SearchFilters filters={filters} onChange={setFilters} />

      {isLoading && <LoadingSpinner />}

      {data?.pages.flatMap(page => page.messages).map(message => (
        <SearchResultItem
          key={message.id}
          message={message}
          query={debouncedQuery}
        />
      ))}

      {hasNextPage && (
        <button onClick={() => fetchNextPage()}>
          Load More Results
        </button>
      )}
    </div>
  );
}
```

---

### Search Result Highlighting

```typescript
function SearchResultItem({ message, query }: Props) {
  const highlightedBody = useMemo(() => {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return message.body.replace(regex, '<mark>$1</mark>');
  }, [message.body, query]);

  return (
    <div className="search-result">
      <div className="result-meta">
        <Avatar src={message.senderAvatar} />
        <span className="sender">{message.senderName}</span>
        <time>{formatDate(message.createdAt)}</time>
      </div>

      <div
        className="result-body"
        dangerouslySetInnerHTML={{ __html: highlightedBody }}
      />

      <Link href={`/messages/${message.threadId}#${message.id}`}>
        View in conversation →
      </Link>
    </div>
  );
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

---

## Performance Optimization

### Virtualization for Long Lists

Use virtual scrolling for message lists with 100+ messages:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedMessageList({ messages }: { messages: Message[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Estimated message height
    overscan: 5, // Render 5 extra items
  });

  return (
    <div ref={parentRef} className="message-list" style={{ height: '600px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index];
          
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <MessageBubble message={message} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

### Image Lazy Loading

```typescript
function MessageImage({ src, alt }: { src: string; alt: string }) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="message-image">
      {!isLoaded && <Skeleton />}
      
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        style={{ display: isLoaded ? 'block' : 'none' }}
      />
    </div>
  );
}
```

---

### Debounced Search

```typescript
import { useDeferredValue, useEffect, useState } from 'react';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Or use React 18's useDeferredValue
function MessageSearch() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  // Only trigger search when deferred value updates
  const { data } = trpc.messages.searchMessages.useQuery({
    query: deferredQuery
  }, {
    enabled: deferredQuery.length >= 3
  });
}
```

---

## Security Considerations

### Input Sanitization

Always sanitize user input before rendering:

```typescript
import DOMPurify from 'isomorphic-dompurify';

function SafeMessageBody({ body }: { body: string }) {
  // Strip all HTML tags except allowed ones
  const sanitized = DOMPurify.sanitize(body, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
    ALLOWED_ATTR: ['href', 'target'],
  });

  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

---

### XSS Prevention

```typescript
// Bad: Direct rendering of user input
<div>{message.body}</div> // Safe for plain text

// Bad: Using dangerouslySetInnerHTML without sanitization
<div dangerouslySetInnerHTML={{ __html: message.body }} /> // UNSAFE!

// Good: Sanitize before rendering
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.body) }} />

// Best: Use plain text rendering
<div>{message.body}</div>
```

---

### CSRF Protection

tRPC handles CSRF protection automatically via:
- HTTP-only cookies
- SameSite cookie attribute
- Origin checking

No additional frontend work needed.

---

### Link Safety

Warn users before opening external links:

```typescript
function SafeLink({ href, children }: { href: string; children: ReactNode }) {
  const [showWarning, setShowWarning] = useState(false);

  const isExternal = !href.startsWith('/') && !href.startsWith(window.location.origin);

  const handleClick = (e: React.MouseEvent) => {
    if (isExternal && !showWarning) {
      e.preventDefault();
      setShowWarning(true);
    }
  };

  return (
    <>
      <a href={href} onClick={handleClick} target={isExternal ? '_blank' : undefined}>
        {children}
      </a>

      {showWarning && (
        <Dialog onClose={() => setShowWarning(false)}>
          <DialogTitle>Leaving YesGoddess</DialogTitle>
          <DialogContent>
            <p>This link will take you to an external website:</p>
            <code>{href}</code>
            <p>Are you sure you want to continue?</p>
          </DialogContent>
          <DialogActions>
            <button onClick={() => setShowWarning(false)}>Cancel</button>
            <a href={href} target="_blank" rel="noopener noreferrer">
              Continue
            </a>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
```

---

## Summary

You now have complete documentation for:

✅ **19 API endpoints** with full request/response schemas  
✅ **All error codes** and user-friendly messages  
✅ **Rate limiting** handling and UI patterns  
✅ **File upload** flow with progress tracking  
✅ **Notification system** integration  
✅ **Search functionality** with highlighting  
✅ **Performance optimizations** for scale  
✅ **Security best practices**

---

## Complete Example: Full Message Thread Component

```typescript
// pages/messages/[threadId].tsx
import { useRouter } from 'next/router';
import { trpc } from '@/lib/api/client';
import { useMessagesStore } from '@/stores/messages';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function ThreadPage() {
  const router = useRouter();
  const { threadId } = router.query as { threadId: string };
  const { setActiveThread } = useMessagesStore();

  // Fetch thread data
  const { data: thread, isLoading, error } = trpc.messages.getThread.useQuery(
    { threadId },
    { enabled: !!threadId }
  );

  // Set active thread
  useEffect(() => {
    if (threadId) {
      setActiveThread(threadId);
    }
    return () => setActiveThread(null);
  }, [threadId]);

  // Mark messages as read when visible
  const markAsRead = trpc.messages.markThreadRead.useMutation();
  useEffect(() => {
    if (thread && thread.unreadCount > 0) {
      const timer = setTimeout(() => {
        markAsRead.mutate({ threadId });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [thread?.unreadCount, threadId]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!thread) return <NotFound />;

  return (
    <ErrorBoundary>
      <div className="thread-page">
        <ThreadHeader participants={thread.participants} />
        
        <MessageHistory messages={thread.messages} />
        
        <MessageComposer
          threadId={threadId}
          recipientId={getOtherParticipantId(thread.participants)}
        />
      </div>
    </ErrorBoundary>
  );
}
```

---

## Additional Resources

- **[API Reference](./MESSAGE_SERVICE_API_REFERENCE.md)** - Complete API documentation
- **[Integration Guide](./MESSAGE_SERVICE_INTEGRATION_GUIDE.md)** - Business logic and patterns
- **[Implementation Summary](../modules/messages/IMPLEMENTATION_COMPLETE.md)** - Backend implementation details
- **[Notification System](../modules/messages/NOTIFICATIONS.md)** - Notification architecture

---

**Questions?** Contact the backend team for clarification or additional examples.
