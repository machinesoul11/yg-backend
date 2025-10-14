# Message Service - Business Logic & Integration Guide

**Classification:** 🌐 SHARED  
**Module:** Messages  
**Last Updated:** October 13, 2025

> **Purpose:** Implementation guidance, business rules, validation logic, and best practices for integrating the messaging system into the frontend.

---

## Table of Contents
1. [Business Rules & Validation](#business-rules--validation)
2. [Authorization & Permissions](#authorization--permissions)
3. [State Management Patterns](#state-management-patterns)
4. [UI Implementation Guidelines](#ui-implementation-guidelines)
5. [Real-time Updates](#real-time-updates)
6. [Pagination Strategies](#pagination-strategies)
7. [Optimistic Updates](#optimistic-updates)
8. [Testing Considerations](#testing-considerations)

---

## Business Rules & Validation

### Who Can Message Whom?

Users can only send messages to other users if they have a **business relationship**:

#### Relationship Rules
1. **Shared Projects** - Users working on the same project
2. **Active Licenses** - Brand and creator with active license agreement
3. **Admin Users** - Admins can message anyone
4. **Cannot Message:**
   - Yourself
   - Deleted/inactive users
   - Users without established relationship

#### Frontend Implementation
```typescript
// Check if user can message before showing "Message" button
function useCanMessageUser(recipientId: string) {
  const { data: canMessage, isLoading } = trpc.messages.canMessageUser.useQuery(
    { recipientId },
    {
      // Cache for 5 minutes
      staleTime: 5 * 60 * 1000,
    }
  );

  return { canMessage: canMessage?.allowed, reason: canMessage?.reason, isLoading };
}

// Usage in UI
function UserProfile({ user }: { user: User }) {
  const { canMessage, reason } = useCanMessageUser(user.id);

  return (
    <div>
      <h1>{user.name}</h1>
      {canMessage ? (
        <button onClick={handleStartConversation}>
          Send Message
        </button>
      ) : (
        <Tooltip content={reason}>
          <button disabled>Cannot Message</button>
        </Tooltip>
      )}
    </div>
  );
}
```

---

### Thread Creation Rules

#### Validation
- **Minimum 2 participants** (including current user)
- **Maximum 10 participants** (group messaging limit)
- **Subject is optional** (max 255 characters)
- **Current user must be in participant list**
- **All participants must exist and be active**

#### Deduplication
The backend automatically detects existing threads with the same participants:
- Participants are compared by sorted IDs
- If match found, returns existing thread with `existingThread: true`
- Frontend should handle both new and existing threads gracefully

```typescript
function StartConversation({ recipientId }: { recipientId: string }) {
  const router = useRouter();
  const createThread = trpc.messages.createThread.useMutation({
    onSuccess: (data) => {
      if (data.existingThread) {
        // Navigate to existing conversation
        router.push(`/messages/${data.thread.id}`);
      } else {
        // Show "New conversation started" message
        toast.success('New conversation started');
        router.push(`/messages/${data.thread.id}`);
      }
    }
  });

  const handleStart = () => {
    createThread.mutate({
      participantIds: [currentUserId, recipientId],
      // subject optional for 1-on-1 conversations
    });
  };

  return <button onClick={handleStart}>Start Conversation</button>;
}
```

---

### Message Validation Rules

#### Body Content
- **Minimum:** 1 character (after trimming)
- **Maximum:** 10,000 characters
- **Allowed:** All Unicode characters
- **Content Moderation:** Automatically checked for spam/abuse

#### Client-Side Validation
```typescript
function MessageInput({ onSubmit }: Props) {
  const [body, setBody] = useState('');
  
  const isValid = useMemo(() => {
    const trimmed = body.trim();
    return trimmed.length >= 1 && trimmed.length <= 10000;
  }, [body]);

  const charactersRemaining = 10000 - body.length;
  const isNearLimit = charactersRemaining < 500;

  return (
    <div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={10000}
        placeholder="Type your message..."
      />
      
      {isNearLimit && (
        <div className="text-warning">
          {charactersRemaining} characters remaining
        </div>
      )}
      
      <button 
        onClick={() => onSubmit(body.trim())} 
        disabled={!isValid}
      >
        Send
      </button>
    </div>
  );
}
```

---

### Attachment Validation

#### File Restrictions
- **Maximum Size:** 10MB per file
- **Maximum Attachments:** 5 per message
- **Allowed Types:**
  - Images: JPEG, PNG, GIF, WebP
  - Documents: PDF, DOC, DOCX, XLS, XLSX, TXT, CSV

#### Frontend Validation
```typescript
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File must be under 10MB' };
  }
  
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'File type not allowed' };
  }
  
  return { valid: true };
}

function FileUploadInput({ onUpload }: { onUpload: (file: File) => void }) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    onUpload(file);
  };

  return (
    <input
      type="file"
      onChange={handleChange}
      accept={ALLOWED_TYPES.join(',')}
    />
  );
}
```

---

## Authorization & Permissions

### Role-Based Access

| Action | Creator | Brand | Admin |
|--------|---------|-------|-------|
| Create thread with relationship | ✅ | ✅ | ✅ |
| Create thread without relationship | ❌ | ❌ | ✅ |
| View own threads | ✅ | ✅ | ✅ |
| View all threads | ❌ | ❌ | ❌* |
| Send messages in thread | ✅ (participant) | ✅ (participant) | ✅ (participant) |
| Delete own attachments | ✅ | ✅ | ✅ |
| Delete others' attachments | ❌ | ❌ | ❌ |
| Archive thread | ✅ (participant) | ✅ (participant) | ✅ (participant) |

*Admins have no special thread access for privacy reasons. They can only view threads they participate in.

### Field-Level Permissions

#### Thread Participants
- All participants can view all messages
- All participants can send messages
- All participants can archive thread

#### Message Read Status
- Only message recipient can mark as read
- Read status visible to both sender and recipient

#### Attachments
- Sender and recipient can download
- Only sender can delete

---

## State Management Patterns

### Recommended Structure

```typescript
// stores/messages.ts
import { create } from 'zustand';

interface MessagesStore {
  activeThreadId: string | null;
  setActiveThread: (threadId: string) => void;
  
  // Draft messages (persist across navigation)
  draftMessages: Record<string, string>;
  setDraft: (threadId: string, content: string) => void;
  clearDraft: (threadId: string) => void;
  
  // UI state
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useMessagesStore = create<MessagesStore>((set) => ({
  activeThreadId: null,
  setActiveThread: (threadId) => set({ activeThreadId: threadId }),
  
  draftMessages: {},
  setDraft: (threadId, content) => 
    set((state) => ({
      draftMessages: { ...state.draftMessages, [threadId]: content }
    })),
  clearDraft: (threadId) =>
    set((state) => {
      const { [threadId]: _, ...rest } = state.draftMessages;
      return { draftMessages: rest };
    }),
    
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));

// Persist draft messages to localStorage
persist(
  (set, get) => ({
    // ... store implementation
  }),
  {
    name: 'messages-storage',
    partialize: (state) => ({ draftMessages: state.draftMessages }),
  }
);
```

### Usage in Components

```typescript
function MessageComposer({ threadId }: { threadId: string }) {
  const { draftMessages, setDraft, clearDraft } = useMessagesStore();
  const draft = draftMessages[threadId] || '';

  const sendMessage = trpc.messages.sendMessage.useMutation({
    onSuccess: () => {
      clearDraft(threadId);
    }
  });

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(threadId, e.target.value)}
      placeholder="Type your message..."
    />
  );
}
```

---

## UI Implementation Guidelines

### Thread List Design

#### Recommended Features
1. **Unread indicators** - Badge with count
2. **Last message preview** - Truncate at ~50 chars
3. **Timestamp** - Relative time ("2 hours ago")
4. **Participant avatars** - Stack or grid layout
5. **Active thread highlight** - Visual indicator
6. **Archive action** - Swipe or menu option

```typescript
function ThreadListItem({ thread, isActive }: Props) {
  const utils = trpc.useContext();
  
  const archiveThread = trpc.messages.archiveThread.useMutation({
    onSuccess: () => {
      utils.messages.listThreads.invalidate();
    }
  });

  return (
    <div className={cn('thread-item', isActive && 'active')}>
      {/* Participant Avatars */}
      <AvatarStack participants={thread.participants} max={3} />
      
      {/* Thread Info */}
      <div className="thread-info">
        <div className="thread-header">
          <span className="thread-subject">
            {thread.subject || getParticipantNames(thread.participants)}
          </span>
          {thread.unreadCount > 0 && (
            <span className="badge">{thread.unreadCount}</span>
          )}
        </div>
        
        {thread.lastMessage && (
          <div className="last-message">
            <span className="sender">{thread.lastMessage.senderName}:</span>
            <span className="preview">
              {truncate(thread.lastMessage.body, 50)}
            </span>
          </div>
        )}
        
        <div className="thread-footer">
          <time>{formatRelativeTime(thread.lastMessageAt)}</time>
        </div>
      </div>
      
      {/* Actions */}
      <DropdownMenu>
        <DropdownItem onClick={() => archiveThread.mutate({ threadId: thread.id })}>
          Archive
        </DropdownItem>
      </DropdownMenu>
    </div>
  );
}

// Helper functions
function getParticipantNames(participants: Participant[]): string {
  return participants.map(p => p.name).join(', ');
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength 
    ? text.substring(0, maxLength) + '...' 
    : text;
}

function formatRelativeTime(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return rtf.format(-days, 'day');
  if (hours > 0) return rtf.format(-hours, 'hour');
  if (minutes > 0) return rtf.format(-minutes, 'minute');
  return 'Just now';
}
```

---

### Message Bubble Design

#### Layout Patterns
- **Own messages:** Right-aligned, primary color
- **Received messages:** Left-aligned, neutral color
- **Read receipts:** Show checkmark or "Read" label
- **Timestamps:** Show on hover or below message

```typescript
function MessageBubble({ message }: { message: MessageListItem }) {
  const isOwn = message.isOwnMessage;

  return (
    <div className={cn('message', isOwn ? 'own' : 'received')}>
      {!isOwn && (
        <Avatar src={message.senderAvatar} name={message.senderName} />
      )}
      
      <div className="message-content">
        {!isOwn && (
          <div className="sender-name">{message.senderName}</div>
        )}
        
        <div className="message-body">
          {message.body}
        </div>
        
        {message.attachments.length > 0 && (
          <AttachmentList attachments={message.attachments} />
        )}
        
        <div className="message-meta">
          <time>{formatTime(message.createdAt)}</time>
          {isOwn && message.readAt && (
            <span className="read-indicator">
              <CheckCheckIcon /> Read
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

### Attachment Preview Component

```typescript
function AttachmentPreview({ attachment }: { attachment: MessageAttachmentInfo }) {
  const { data } = trpc.messages.getAttachment.useQuery({
    attachmentId: attachment.id
  });

  const isImage = attachment.mimeType.startsWith('image/');

  const handleDownload = () => {
    if (data?.downloadUrl) {
      window.open(data.downloadUrl, '_blank');
    }
  };

  if (isImage) {
    return (
      <div className="image-attachment" onClick={handleDownload}>
        <img 
          src={data?.downloadUrl} 
          alt={attachment.fileName}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="file-attachment" onClick={handleDownload}>
      <FileIcon type={attachment.mimeType} />
      <div className="file-info">
        <span className="file-name">{attachment.fileName}</span>
        <span className="file-size">{formatFileSize(attachment.fileSize)}</span>
      </div>
      <DownloadIcon />
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
```

---

## Real-time Updates

### Notification Integration

When user receives a message notification, update the UI:

```typescript
function useMessageNotifications() {
  const utils = trpc.useContext();
  const { activeThreadId } = useMessagesStore();

  useEffect(() => {
    // Subscribe to notification events
    const channel = new BroadcastChannel('notifications');
    
    channel.onmessage = (event) => {
      if (event.data.type === 'MESSAGE') {
        const { threadId, messageId } = event.data;
        
        // Invalidate unread count
        utils.messages.getUnreadCount.invalidate();
        
        // If viewing the thread, refresh messages
        if (threadId === activeThreadId) {
          utils.messages.getThread.invalidate({ threadId });
        } else {
          // Show toast notification
          toast.info('New message received');
        }
        
        // Update thread list
        utils.messages.listThreads.invalidate();
      }
    };

    return () => channel.close();
  }, [activeThreadId]);
}

// Use in main Messages layout
function MessagesLayout() {
  useMessageNotifications();
  
  return (
    <div className="messages-layout">
      <ThreadSidebar />
      <ThreadView />
    </div>
  );
}
```

---

### Polling Strategy

For applications without WebSocket support:

```typescript
function useMessagePolling(threadId: string | null) {
  const { data: thread } = trpc.messages.getThread.useQuery(
    { threadId: threadId! },
    {
      enabled: !!threadId,
      refetchInterval: 10000, // Poll every 10 seconds when thread is active
      refetchIntervalInBackground: false, // Stop polling when tab is inactive
    }
  );

  // Poll unread count less frequently
  const { data: unreadCount } = trpc.messages.getUnreadCount.useQuery(
    undefined,
    {
      refetchInterval: 30000, // Poll every 30 seconds
    }
  );

  return { thread, unreadCount };
}
```

---

## Pagination Strategies

### Thread List (Offset-based)

```typescript
function ThreadList() {
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = 
    trpc.messages.listThreads.useInfiniteQuery(
      { limit },
      {
        getNextPageParam: (lastPage, allPages) => 
          lastPage.hasMore ? allPages.length * limit : undefined,
      }
    );

  return (
    <InfiniteScroll
      loadMore={fetchNextPage}
      hasMore={hasNextPage}
      isLoading={isFetchingNextPage}
    >
      {data?.pages.flatMap(page => page.threads).map(thread => (
        <ThreadListItem key={thread.id} thread={thread} />
      ))}
    </InfiniteScroll>
  );
}
```

---

### Message History (Reverse Chronological)

Load older messages when user scrolls to top:

```typescript
function MessageHistory({ threadId }: { threadId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.messages.listMessages.useInfiniteQuery(
    { threadId, limit: 50 },
    {
      getNextPageParam: (lastPage, allPages) =>
        lastPage.hasMore ? allPages.length * 50 : undefined,
      // Keep previous data while loading more
      keepPreviousData: true,
    }
  );

  const messages = data?.pages.flatMap(page => page.messages) ?? [];

  // Scroll to bottom on mount and new messages
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, autoScroll]);

  // Load more when scrolling to top
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    
    // User scrolled to top
    if (scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      const oldHeight = scrollHeight;
      fetchNextPage().then(() => {
        // Maintain scroll position after loading
        const newHeight = scrollRef.current!.scrollHeight;
        scrollRef.current!.scrollTop = scrollTop + (newHeight - oldHeight);
      });
    }
    
    // Detect if user is near bottom
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isNearBottom);
  };

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="message-list">
      {isFetchingNextPage && <LoadingSpinner />}
      
      {messages.map(message => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}
```

---

## Optimistic Updates

### Sending Messages

Add message to UI immediately, then update on success:

```typescript
function useSendMessage(threadId: string) {
  const utils = trpc.useContext();

  return trpc.messages.sendMessage.useMutation({
    onMutate: async (newMessage) => {
      // Cancel outgoing queries
      await utils.messages.getThread.cancel({ threadId });

      // Snapshot current state
      const previousThread = utils.messages.getThread.getData({ threadId });

      // Optimistically update
      utils.messages.getThread.setData({ threadId }, (old) => {
        if (!old) return old;
        
        const optimisticMessage: MessageListItem = {
          id: `temp-${Date.now()}`,
          ...newMessage,
          senderId: currentUserId,
          senderName: currentUserName,
          senderAvatar: currentUserAvatar,
          readAt: null,
          attachments: [],
          createdAt: new Date(),
          isOwnMessage: true,
        };

        return {
          ...old,
          messages: [...old.messages, optimisticMessage],
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
    
    onSuccess: () => {
      // Refetch to get actual data
      utils.messages.getThread.invalidate({ threadId });
      utils.messages.listThreads.invalidate();
    },
  });
}
```

---

## Testing Considerations

### Unit Tests

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';

describe('useMessagePolling', () => {
  it('should poll for new messages every 10 seconds', async () => {
    const { result } = renderHook(
      () => useMessagePolling('thread_123'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.thread).toBeDefined();
    });

    // Advance timer and check refetch
    jest.advanceTimersByTime(10000);

    await waitFor(() => {
      expect(mockApiCall).toHaveBeenCalledTimes(2);
    });
  });
});
```

### Integration Tests

```typescript
describe('Message Flow', () => {
  it('should create thread and send message', async () => {
    const { user } = render(<MessagesPage />);

    // Click "New Message" button
    await user.click(screen.getByText('New Message'));

    // Select recipient
    await user.selectOptions(screen.getByLabelText('To:'), 'recipient_id');

    // Type message
    await user.type(screen.getByPlaceholderText('Type message'), 'Hello!');

    // Send
    await user.click(screen.getByText('Send'));

    // Verify message appears
    await waitFor(() => {
      expect(screen.getByText('Hello!')).toBeInTheDocument();
    });
  });
});
```

---

## Frontend Implementation Checklist

Use this checklist when building the messaging UI:

### Thread Management
- [ ] Display thread list with participants
- [ ] Show unread count badge per thread
- [ ] Implement thread creation flow
- [ ] Handle existing thread detection
- [ ] Add thread archive functionality
- [ ] Display last message preview
- [ ] Sort threads by last message time

### Message Display
- [ ] Render message bubbles (own vs received)
- [ ] Show sender name/avatar
- [ ] Display timestamp
- [ ] Show read receipts
- [ ] Handle long messages (expand/collapse)
- [ ] Auto-scroll to bottom on new messages
- [ ] Load older messages on scroll

### Message Composition
- [ ] Text input with character counter
- [ ] Disable send button when empty/invalid
- [ ] Save draft messages to localStorage
- [ ] Show typing indicator (if implementing)
- [ ] Handle Enter key (send on Enter)
- [ ] Support Shift+Enter for new line

### Attachments
- [ ] File upload with drag & drop
- [ ] Validate file type and size
- [ ] Show upload progress
- [ ] Preview images inline
- [ ] Download button for files
- [ ] Delete attachment (sender only)

### Notifications
- [ ] Display unread count in navbar
- [ ] Show toast on new message
- [ ] Play sound notification (optional)
- [ ] Update UI when notification received
- [ ] Mute/unmute thread toggle
- [ ] Notification preference settings

### Real-time Features
- [ ] Poll for new messages (or WebSocket)
- [ ] Invalidate queries on notification
- [ ] Auto-mark messages as read when viewed
- [ ] Update thread list on new message

### Error Handling
- [ ] Display error messages
- [ ] Retry failed requests
- [ ] Handle rate limit errors
- [ ] Show offline indicator
- [ ] Rollback optimistic updates on error

### Accessibility
- [ ] Keyboard navigation support
- [ ] Screen reader announcements
- [ ] Focus management
- [ ] ARIA labels
- [ ] Color contrast compliance

---

## Next Steps

Continue to:
- **[Part 3: Error Handling & Advanced Features](./MESSAGE_SERVICE_ADVANCED.md)** - Complete error codes, rate limiting, and advanced patterns

---

**Questions?** Contact the backend team or refer to the [API Reference](./MESSAGE_SERVICE_API_REFERENCE.md).
