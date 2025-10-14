# Messaging System - Frontend Integration Guide
## Part 3: Frontend Implementation & UX Guidelines

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
**Module:** Messaging System  
**Last Updated:** October 13, 2025

---

## Table of Contents

1. [Frontend Implementation Checklist](#frontend-implementation-checklist)
2. [React Query Integration](#react-query-integration)
3. [Component Architecture](#component-architecture)
4. [State Management](#state-management)
5. [UX Considerations](#ux-considerations)
6. [Responsive Design Guidelines](#responsive-design-guidelines)
7. [Accessibility](#accessibility)
8. [Performance Optimization](#performance-optimization)
9. [Testing Strategy](#testing-strategy)

---

## Frontend Implementation Checklist

### Phase 1: Core Messaging (Week 1-2)
- [ ] Set up tRPC client with authentication
- [ ] Create messaging API client wrapper
- [ ] Implement thread list page
- [ ] Implement thread detail/chat view
- [ ] Build message composer component
- [ ] Add message send functionality
- [ ] Display sent/received messages
- [ ] Add timestamp formatting
- [ ] Implement thread creation flow
- [ ] Add loading states for all operations

### Phase 2: Advanced Features (Week 3)
- [ ] Implement unread count badge
- [ ] Add mark as read functionality
- [ ] Build search interface
- [ ] Add message search with filters
- [ ] Implement infinite scroll for threads
- [ ] Add infinite scroll for messages
- [ ] Display thread participants
- [ ] Add thread archiving
- [ ] Show archived threads view

### Phase 3: Attachments (Week 4)
- [ ] Build file upload component
- [ ] Add drag-and-drop file upload
- [ ] Show upload progress indicator
- [ ] Display attachment previews
- [ ] Implement attachment download
- [ ] Add file type validation
- [ ] Add file size validation
- [ ] Handle upload errors
- [ ] Show attachment thumbnails for images

### Phase 4: Polish & Optimization (Week 5)
- [ ] Implement optimistic updates
- [ ] Add polling for real-time updates
- [ ] Build notification preferences UI
- [ ] Add rate limit warnings
- [ ] Implement error boundaries
- [ ] Add retry logic for failed operations
- [ ] Optimize bundle size
- [ ] Add loading skeletons
- [ ] Implement empty states
- [ ] Add confirmation modals for destructive actions

### Phase 5: Testing & Refinement (Week 6)
- [ ] Write unit tests for components
- [ ] Write integration tests for flows
- [ ] Test accessibility with screen reader
- [ ] Test responsive layouts
- [ ] Performance testing
- [ ] Cross-browser testing
- [ ] User acceptance testing
- [ ] Fix bugs and polish UX

---

## React Query Integration

### tRPC + React Query Setup

```typescript
// lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();

// pages/_app.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/lib/trpc';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000, // 30 seconds
    },
  },
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: process.env.NEXT_PUBLIC_API_URL + '/api/trpc',
      async headers() {
        const session = await getSession();
        return {
          authorization: session?.user ? `Bearer ${session.user.accessToken}` : '',
        };
      },
    }),
  ],
});

function App({ Component, pageProps }: AppProps) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Component {...pageProps} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

---

### Custom Hooks for Messaging

```typescript
// hooks/useMessaging.ts
import { trpc } from '@/lib/trpc';

/**
 * Hook to manage thread list
 */
export function useThreads(options?: { includeArchived?: boolean }) {
  const { data, isLoading, error, refetch } = trpc.messages.listThreads.useQuery({
    limit: 20,
    offset: 0,
    includeArchived: options?.includeArchived ?? false,
  });

  return {
    threads: data?.threads ?? [],
    total: data?.total ?? 0,
    hasMore: data?.hasMore ?? false,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get thread details with messages
 */
export function useThread(threadId: string | undefined) {
  return trpc.messages.getThread.useQuery(
    { threadId: threadId! },
    { 
      enabled: !!threadId,
      refetchInterval: 10000, // Poll every 10 seconds when viewing thread
    }
  );
}

/**
 * Hook to send message
 */
export function useSendMessage(threadId: string) {
  const utils = trpc.useContext();
  
  return trpc.messages.sendMessage.useMutation({
    onSuccess: () => {
      // Invalidate thread to show new message
      utils.messages.getThread.invalidate({ threadId });
      utils.messages.listThreads.invalidate();
    },
  });
}

/**
 * Hook to get unread count with polling
 */
export function useUnreadCount() {
  return trpc.messages.getUnreadCount.useQuery(undefined, {
    refetchInterval: 30000, // Poll every 30 seconds
  });
}

/**
 * Hook to search messages
 */
export function useSearchMessages(query: string, filters?: {
  threadId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return trpc.messages.searchMessages.useQuery(
    {
      query,
      ...filters,
      limit: 20,
      offset: 0,
    },
    {
      enabled: query.length >= 3, // Only search if query is 3+ chars
    }
  );
}
```

---

## Component Architecture

### Recommended Component Structure

```
components/
├── messaging/
│   ├── ThreadList/
│   │   ├── ThreadList.tsx
│   │   ├── ThreadListItem.tsx
│   │   ├── ThreadListSkeleton.tsx
│   │   └── EmptyThreadList.tsx
│   ├── ThreadView/
│   │   ├── ThreadView.tsx
│   │   ├── ThreadHeader.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageItem.tsx
│   │   └── MessageComposer.tsx
│   ├── MessageSearch/
│   │   ├── SearchBar.tsx
│   │   ├── SearchFilters.tsx
│   │   └── SearchResults.tsx
│   ├── Attachments/
│   │   ├── FileUploader.tsx
│   │   ├── AttachmentPreview.tsx
│   │   └── AttachmentList.tsx
│   ├── UnreadBadge/
│   │   └── UnreadBadge.tsx
│   └── shared/
│       ├── UserAvatar.tsx
│       ├── Timestamp.tsx
│       └── LoadingSpinner.tsx
```

---

### Thread List Component

```tsx
// components/messaging/ThreadList/ThreadList.tsx
import React from 'react';
import { useThreads } from '@/hooks/useMessaging';
import ThreadListItem from './ThreadListItem';
import ThreadListSkeleton from './ThreadListSkeleton';
import EmptyThreadList from './EmptyThreadList';

interface ThreadListProps {
  onThreadSelect: (threadId: string) => void;
  selectedThreadId?: string;
}

export const ThreadList: React.FC<ThreadListProps> = ({
  onThreadSelect,
  selectedThreadId,
}) => {
  const { threads, isLoading, error } = useThreads();

  if (isLoading) {
    return <ThreadListSkeleton />;
  }

  if (error) {
    return (
      <div className="error-state">
        <p>Failed to load conversations</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (threads.length === 0) {
    return <EmptyThreadList />;
  }

  return (
    <div className="thread-list">
      {threads.map((thread) => (
        <ThreadListItem
          key={thread.id}
          thread={thread}
          isSelected={thread.id === selectedThreadId}
          onClick={() => onThreadSelect(thread.id)}
        />
      ))}
    </div>
  );
};
```

---

### Thread List Item Component

```tsx
// components/messaging/ThreadList/ThreadListItem.tsx
import React from 'react';
import { ThreadListItem as Thread } from '@/types/messaging';
import { UserAvatar } from '../shared/UserAvatar';
import { Timestamp } from '../shared/Timestamp';
import { UnreadBadge } from '../UnreadBadge/UnreadBadge';

interface ThreadListItemProps {
  thread: Thread;
  isSelected: boolean;
  onClick: () => void;
}

export const ThreadListItem: React.FC<ThreadListItemProps> = ({
  thread,
  isSelected,
  onClick,
}) => {
  // Get other participants (not current user)
  const otherParticipants = thread.participants.filter(
    (p) => p.userId !== currentUserId
  );

  return (
    <div
      className={`thread-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="thread-avatar">
        {otherParticipants.length === 1 ? (
          <UserAvatar user={otherParticipants[0]} size="md" />
        ) : (
          <div className="group-avatar">
            {otherParticipants.slice(0, 2).map((p) => (
              <UserAvatar key={p.userId} user={p} size="sm" />
            ))}
          </div>
        )}
      </div>

      <div className="thread-content">
        <div className="thread-header">
          <h3 className="thread-subject">
            {thread.subject || otherParticipants.map((p) => p.name).join(', ')}
          </h3>
          <Timestamp date={thread.lastMessageAt} format="relative" />
        </div>

        {thread.lastMessage && (
          <p className="thread-preview">
            <span className="sender-name">
              {thread.lastMessage.senderName}:
            </span>{' '}
            {thread.lastMessage.body}
          </p>
        )}
      </div>

      {thread.unreadCount > 0 && (
        <UnreadBadge count={thread.unreadCount} />
      )}
    </div>
  );
};
```

---

### Thread View Component

```tsx
// components/messaging/ThreadView/ThreadView.tsx
import React, { useEffect } from 'react';
import { useThread, useSendMessage } from '@/hooks/useMessaging';
import ThreadHeader from './ThreadHeader';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';

interface ThreadViewProps {
  threadId: string;
}

export const ThreadView: React.FC<ThreadViewProps> = ({ threadId }) => {
  const { data: thread, isLoading } = useThread(threadId);
  const sendMessage = useSendMessage(threadId);

  // Mark thread as read when viewing
  const markThreadRead = trpc.messages.markThreadRead.useMutation();
  
  useEffect(() => {
    if (thread && thread.unreadCount > 0) {
      markThreadRead.mutate({ threadId });
    }
  }, [threadId, thread?.unreadCount]);

  if (isLoading) {
    return <div>Loading conversation...</div>;
  }

  if (!thread) {
    return <div>Conversation not found</div>;
  }

  const otherParticipant = thread.participants.find(
    (p) => p.userId !== currentUserId
  );

  const handleSendMessage = async (body: string, attachmentIds: string[]) => {
    await sendMessage.mutateAsync({
      threadId,
      recipientId: otherParticipant!.userId,
      body,
      attachmentIds,
    });
  };

  return (
    <div className="thread-view">
      <ThreadHeader thread={thread} />
      
      <MessageList messages={thread.messages} />
      
      <MessageComposer
        onSend={handleSendMessage}
        isLoading={sendMessage.isLoading}
        error={sendMessage.error}
      />
    </div>
  );
};
```

---

### Message List Component

```tsx
// components/messaging/ThreadView/MessageList.tsx
import React, { useEffect, useRef } from 'react';
import { MessageListItem as Message } from '@/types/messaging';
import MessageItem from './MessageItem';

interface MessageListProps {
  messages: Message[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="message-list">
      {messages.map((message, index) => {
        const showAvatar = 
          index === 0 || 
          messages[index - 1].senderId !== message.senderId;
        
        const showTimestamp =
          index === 0 ||
          isNewTimeBlock(messages[index - 1].createdAt, message.createdAt);

        return (
          <React.Fragment key={message.id}>
            {showTimestamp && (
              <div className="timestamp-divider">
                <Timestamp date={message.createdAt} format="full" />
              </div>
            )}
            
            <MessageItem
              message={message}
              showAvatar={showAvatar}
            />
          </React.Fragment>
        );
      })}
      
      <div ref={bottomRef} />
    </div>
  );
};

function isNewTimeBlock(prevDate: Date, currentDate: Date): boolean {
  const diff = new Date(currentDate).getTime() - new Date(prevDate).getTime();
  return diff > 60 * 60 * 1000; // 1 hour
}
```

---

### Message Item Component

```tsx
// components/messaging/ThreadView/MessageItem.tsx
import React from 'react';
import { MessageListItem as Message } from '@/types/messaging';
import { UserAvatar } from '../shared/UserAvatar';
import { Timestamp } from '../shared/Timestamp';
import { AttachmentList } from '../Attachments/AttachmentList';

interface MessageItemProps {
  message: Message;
  showAvatar: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  showAvatar,
}) => {
  return (
    <div
      className={`message-item ${message.isOwnMessage ? 'own-message' : 'received-message'}`}
    >
      {showAvatar && !message.isOwnMessage && (
        <UserAvatar
          user={{
            userId: message.senderId,
            name: message.senderName,
            avatar: message.senderAvatar,
          }}
          size="sm"
        />
      )}

      <div className="message-bubble">
        {!message.isOwnMessage && showAvatar && (
          <div className="message-sender">{message.senderName}</div>
        )}

        <div className="message-body">{message.body}</div>

        {message.attachments.length > 0 && (
          <AttachmentList attachments={message.attachments} />
        )}

        <div className="message-footer">
          <Timestamp date={message.createdAt} format="time" />
          {message.isOwnMessage && (
            <span className="read-status">
              {message.readAt ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
```

---

### Message Composer Component

```tsx
// components/messaging/ThreadView/MessageComposer.tsx
import React, { useState } from 'react';
import { FileUploader } from '../Attachments/FileUploader';
import { AttachmentPreview } from '../Attachments/AttachmentPreview';

interface MessageComposerProps {
  onSend: (body: string, attachmentIds: string[]) => Promise<void>;
  isLoading: boolean;
  error?: any;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSend,
  isLoading,
  error,
}) => {
  const [body, setBody] = useState('');
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [showUploader, setShowUploader] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (body.trim().length === 0) return;
    if (body.length > 10000) {
      toast.error('Message too long (max 10,000 characters)');
      return;
    }

    try {
      await onSend(body.trim(), attachmentIds);
      setBody('');
      setAttachmentIds([]);
    } catch (err) {
      // Error handled by parent
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleAttachmentComplete = (attachmentId: string) => {
    setAttachmentIds((prev) => [...prev, attachmentId]);
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachmentIds((prev) => prev.filter((id) => id !== attachmentId));
  };

  const canSend = body.trim().length > 0 && !isLoading;
  const remainingChars = 10000 - body.length;
  const showCharCount = remainingChars < 500;

  return (
    <form className="message-composer" onSubmit={handleSubmit}>
      {error && (
        <div className="composer-error">
          {handleMessagingError(error)}
        </div>
      )}

      {attachmentIds.length > 0 && (
        <div className="attachment-previews">
          {attachmentIds.map((id) => (
            <AttachmentPreview
              key={id}
              attachmentId={id}
              onRemove={() => handleRemoveAttachment(id)}
            />
          ))}
        </div>
      )}

      <div className="composer-input">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          disabled={isLoading}
          rows={3}
          maxLength={10000}
        />

        {showCharCount && (
          <div className="char-counter">
            {remainingChars.toLocaleString()} characters remaining
          </div>
        )}
      </div>

      <div className="composer-actions">
        <button
          type="button"
          onClick={() => setShowUploader(!showUploader)}
          disabled={attachmentIds.length >= 5}
          title="Attach file"
        >
          📎 Attach
        </button>

        <button
          type="submit"
          disabled={!canSend}
          className="send-button"
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>

      {showUploader && (
        <FileUploader
          onComplete={handleAttachmentComplete}
          maxFiles={5 - attachmentIds.length}
        />
      )}
    </form>
  );
};
```

---

### File Uploader Component

```tsx
// components/messaging/Attachments/FileUploader.tsx
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { trpc } from '@/lib/trpc';

interface FileUploaderProps {
  onComplete: (attachmentId: string) => void;
  maxFiles?: number;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onComplete,
  maxFiles = 5,
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const generateUploadUrl = trpc.messages.generateUploadUrl.useMutation();
  const createAttachment = trpc.messages.createAttachment.useMutation();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];

    // Validate file size
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // Generate upload URL
      const uploadDetails = await generateUploadUrl.mutateAsync({
        messageId: currentMessageId, // Get from context
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      });

      // Upload file
      setProgress(50);
      const response = await fetch(uploadDetails.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      // Create attachment record
      setProgress(75);
      const attachment = await createAttachment.mutateAsync({
        messageId: currentMessageId,
        storageKey: uploadDetails.storageKey,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      setProgress(100);
      toast.success('File uploaded');
      onComplete(attachment.id);
    } catch (error) {
      toast.error('Upload failed');
      console.error(error);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`file-uploader ${isDragActive ? 'drag-active' : ''}`}
    >
      <input {...getInputProps()} />
      
      {uploading ? (
        <div className="upload-progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      ) : isDragActive ? (
        <p>Drop file here...</p>
      ) : (
        <p>Drag & drop or click to select file (max 10MB)</p>
      )}
    </div>
  );
};
```

---

### Unread Badge Component

```tsx
// components/messaging/UnreadBadge/UnreadBadge.tsx
import React from 'react';
import { useUnreadCount } from '@/hooks/useMessaging';

export const UnreadBadge: React.FC<{ count?: number }> = ({ count: propCount }) => {
  const { data } = useUnreadCount();
  
  const count = propCount ?? data?.total ?? 0;

  if (count === 0) return null;

  return (
    <span className="unread-badge" aria-label={`${count} unread messages`}>
      {count > 99 ? '99+' : count}
    </span>
  );
};

// Usage in navigation
export const MessagesNavLink: React.FC = () => {
  return (
    <Link href="/messages">
      <span>Messages</span>
      <UnreadBadge />
    </Link>
  );
};
```

---

## State Management

### Local State vs Server State

**Use React Query (server state) for:**
- Thread list
- Thread details
- Messages
- Unread counts
- Search results

**Use React State (local state) for:**
- Message composer input
- UI toggles (show/hide)
- Form validation errors
- Loading indicators for optimistic updates

### Global State (Context/Zustand)

```typescript
// stores/messagingStore.ts
import create from 'zustand';

interface MessagingStore {
  selectedThreadId: string | null;
  setSelectedThreadId: (id: string | null) => void;
  showSearch: boolean;
  toggleSearch: () => void;
  showArchived: boolean;
  toggleArchived: () => void;
}

export const useMessagingStore = create<MessagingStore>((set) => ({
  selectedThreadId: null,
  setSelectedThreadId: (id) => set({ selectedThreadId: id }),
  showSearch: false,
  toggleSearch: () => set((state) => ({ showSearch: !state.showSearch })),
  showArchived: false,
  toggleArchived: () => set((state) => ({ showArchived: !state.showArchived })),
}));
```

---

## UX Considerations

### Loading States

Always show appropriate loading indicators:

```tsx
// Skeleton for thread list
export const ThreadListSkeleton: React.FC = () => (
  <div className="thread-list-skeleton">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="thread-skeleton">
        <div className="skeleton-avatar" />
        <div className="skeleton-content">
          <div className="skeleton-title" />
          <div className="skeleton-preview" />
        </div>
      </div>
    ))}
  </div>
);

// Inline loading for sending message
{isLoading && <LoadingSpinner size="sm" />}
```

---

### Empty States

Provide clear empty states with actions:

```tsx
export const EmptyThreadList: React.FC = () => (
  <div className="empty-state">
    <img src="/illustrations/empty-inbox.svg" alt="" />
    <h3>No conversations yet</h3>
    <p>Start a conversation with a creator or brand</p>
    <Button onClick={openNewThreadModal}>
      Start Conversation
    </Button>
  </div>
);
```

---

### Error States

Show actionable error messages:

```tsx
export const ErrorState: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="error-state">
    <img src="/illustrations/error.svg" alt="" />
    <h3>Something went wrong</h3>
    <p>We couldn't load your messages</p>
    <Button onClick={onRetry}>Try Again</Button>
    <Button variant="link" onClick={() => window.location.reload()}>
      Reload Page
    </Button>
  </div>
);
```

---

### Confirmation Modals

Confirm destructive actions:

```tsx
const handleArchive = async (threadId: string) => {
  const confirmed = await confirm({
    title: 'Archive Conversation?',
    message: 'You can view archived conversations in the Archived folder.',
    confirmText: 'Archive',
    cancelText: 'Cancel',
  });

  if (confirmed) {
    await archiveThread.mutateAsync({ threadId });
    toast.success('Conversation archived');
  }
};
```

---

### Typing Indicators (Future Enhancement)

```tsx
// Placeholder for future WebSocket implementation
export const TypingIndicator: React.FC<{ threadId: string }> = ({ threadId }) => {
  // const { isTyping, userName } = useTypingStatus(threadId);

  // if (!isTyping) return null;

  return (
    <div className="typing-indicator">
      <span>{userName} is typing</span>
      <span className="typing-dots">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </div>
  );
};
```

---

## Responsive Design Guidelines

### Mobile Layout (< 768px)

```tsx
// Single-column layout
// Show either thread list OR thread view

const MessagingPage: React.FC = () => {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const isMobile = useMediaQuery('(max-width: 767px)');

  return (
    <div className="messaging-page">
      {isMobile ? (
        selectedThreadId ? (
          <ThreadView
            threadId={selectedThreadId}
            onBack={() => setSelectedThreadId(null)}
          />
        ) : (
          <ThreadList onThreadSelect={setSelectedThreadId} />
        )
      ) : (
        <>
          <ThreadList
            onThreadSelect={setSelectedThreadId}
            selectedThreadId={selectedThreadId}
          />
          {selectedThreadId && (
            <ThreadView threadId={selectedThreadId} />
          )}
        </>
      )}
    </div>
  );
};
```

### Tablet Layout (768px - 1024px)

- Two-column layout (threads + messages)
- Narrower sidebar (250px)
- Slightly smaller avatars

### Desktop Layout (> 1024px)

- Three-column layout (threads + messages + info panel)
- Wider sidebar (300px)
- Full-size avatars
- Additional context panel

---

## Accessibility

### Keyboard Navigation

```tsx
// Support keyboard shortcuts
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    // Escape to close thread
    if (e.key === 'Escape') {
      setSelectedThreadId(null);
    }
    
    // Cmd/Ctrl + K for search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggleSearch();
    }
  };

  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, []);
```

---

### ARIA Labels

```tsx
<button
  aria-label={`Message from ${message.senderName}, ${formatTimestamp(message.createdAt)}`}
  aria-pressed={isSelected}
>
  {/* Content */}
</button>

<div role="region" aria-label="Conversation with John Doe">
  {/* Messages */}
</div>

<span className="unread-badge" aria-label={`${count} unread messages`}>
  {count}
</span>
```

---

### Focus Management

```tsx
// Auto-focus message input when opening thread
const inputRef = useRef<HTMLTextAreaElement>(null);

useEffect(() => {
  if (threadId) {
    inputRef.current?.focus();
  }
}, [threadId]);

// Trap focus in modal
import { FocusTrap } from '@headlessui/react';

<FocusTrap>
  <Dialog>{/* Modal content */}</Dialog>
</FocusTrap>
```

---

## Performance Optimization

### Code Splitting

```tsx
// Lazy load messaging components
const MessagingPage = lazy(() => import('@/pages/messaging'));
const ThreadView = lazy(() => import('@/components/messaging/ThreadView'));

// Usage with Suspense
<Suspense fallback={<LoadingSpinner />}>
  <MessagingPage />
</Suspense>
```

---

### Virtual Scrolling

For large message lists:

```tsx
import { VirtualList } from '@tanstack/react-virtual';

export const VirtualizedMessageList: React.FC<{ messages: Message[] }> = ({ messages }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated message height
  });

  return (
    <div ref={parentRef} className="message-list">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index];
          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <MessageItem message={message} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

---

### Image Optimization

```tsx
// Lazy load images
<img
  src={attachment.downloadUrl}
  alt={attachment.fileName}
  loading="lazy"
  decoding="async"
/>

// Use Next.js Image component
import Image from 'next/image';

<Image
  src={user.avatar || '/default-avatar.png'}
  alt={user.name}
  width={40}
  height={40}
  className="avatar"
/>
```

---

### Debouncing Search

```tsx
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const SearchBar: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 500);

  const { data } = useSearchMessages(debouncedSearch);

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

## Testing Strategy

### Unit Tests

```typescript
// MessageComposer.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageComposer } from './MessageComposer';

describe('MessageComposer', () => {
  it('should send message on submit', async () => {
    const onSend = jest.fn();
    
    render(<MessageComposer onSend={onSend} isLoading={false} />);
    
    const input = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(input, { target: { value: 'Hello world' } });
    
    const sendButton = screen.getByText('Send');
    fireEvent.click(sendButton);
    
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('Hello world', []);
    });
  });

  it('should not send empty message', () => {
    const onSend = jest.fn();
    
    render(<MessageComposer onSend={onSend} isLoading={false} />);
    
    const sendButton = screen.getByText('Send');
    fireEvent.click(sendButton);
    
    expect(onSend).not.toHaveBeenCalled();
  });
});
```

---

### Integration Tests

```typescript
// messaging-flow.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessagingPage } from '@/pages/messaging';

describe('Messaging Flow', () => {
  it('should complete full messaging flow', async () => {
    render(<MessagingPage />);
    
    // Wait for threads to load
    await screen.findByText('John Doe');
    
    // Select thread
    fireEvent.click(screen.getByText('John Doe'));
    
    // Wait for messages to load
    await screen.findByText('Previous message');
    
    // Type and send message
    const input = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(input, { target: { value: 'New message' } });
    fireEvent.click(screen.getByText('Send'));
    
    // Verify message appears
    await screen.findByText('New message');
  });
});
```

---

### E2E Tests (Playwright)

```typescript
// e2e/messaging.spec.ts
import { test, expect } from '@playwright/test';

test('user can send message', async ({ page }) => {
  await page.goto('/messages');
  
  // Login
  await page.fill('input[name="email"]', 'user@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  // Navigate to thread
  await page.click('text=John Doe');
  
  // Send message
  await page.fill('textarea[placeholder="Type a message..."]', 'Hello!');
  await page.click('button:has-text("Send")');
  
  // Verify message sent
  await expect(page.locator('text=Hello!')).toBeVisible();
});
```

---

## Edge Cases to Handle

### 1. No Internet Connection
```tsx
// Detect offline status
const isOnline = useOnlineStatus();

{!isOnline && (
  <Alert variant="warning">
    You're offline. Messages will be sent when connection is restored.
  </Alert>
)}
```

### 2. Deleted Participant
```tsx
// Handle when participant is deleted
const participant = thread.participants.find(p => p.userId === recipientId);

if (!participant) {
  return <Alert>This user is no longer available</Alert>;
}
```

### 3. Very Long Messages
```tsx
// Truncate preview in list
const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

<p className="thread-preview">
  {truncateText(thread.lastMessage.body, 100)}
</p>
```

### 4. Large File Uploads
```tsx
// Show clear error for large files
if (file.size > MAX_FILE_SIZE) {
  toast.error(`File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}`);
  return;
}
```

### 5. Rate Limit Reached
```tsx
// Show countdown timer
const [secondsRemaining, setSecondsRemaining] = useState(0);

useEffect(() => {
  if (secondsRemaining > 0) {
    const timer = setTimeout(() => setSecondsRemaining(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }
}, [secondsRemaining]);

{secondsRemaining > 0 && (
  <Alert>
    Rate limit reached. Try again in {secondsRemaining} seconds.
  </Alert>
)}
```

---

## Conclusion

This guide provides comprehensive documentation for integrating the YesGoddess messaging system into your frontend application. Follow the implementation checklist, use the provided components as templates, and adapt them to your design system.

### Quick Reference Links

- **[Part 1: API Reference](./MESSAGING_INTEGRATION_GUIDE_PART_1_API_REFERENCE.md)** - Complete endpoint documentation
- **[Part 2: Business Logic](./MESSAGING_INTEGRATION_GUIDE_PART_2_IMPLEMENTATION.md)** - Validation, errors, permissions

### Support

For questions or issues:
1. Check existing documentation in `/docs` folder
2. Review backend implementation in `/src/modules/messages`
3. Contact backend team for clarifications

---

**Happy Coding! 🚀**
