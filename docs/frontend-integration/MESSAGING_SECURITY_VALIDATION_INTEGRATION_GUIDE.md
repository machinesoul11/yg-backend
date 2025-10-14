# 🔒 Messaging Security & Validation - Frontend Integration Guide

**Classification:** 🌐 SHARED  
**Module:** Messaging - Security & Validation Features  
**Last Updated:** October 13, 2025  
**Status:** ✅ Complete

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Request/Response Examples](#requestresponse-examples)
5. [Business Logic & Validation Rules](#business-logic--validation-rules)
6. [Error Handling](#error-handling)
7. [Authorization & Permissions](#authorization--permissions)
8. [Rate Limiting & Quotas](#rate-limiting--quotas)
9. [Content Moderation](#content-moderation)
10. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

### Module Purpose

The Messaging Security & Validation module provides:
- **Access Control:** Thread participation verification and relationship-based messaging
- **Rate Limiting:** 50 messages/hour per user to prevent spam
- **Content Moderation:** Automated validation hooks for future spam prevention
- **Business Relationship Validation:** Ensures users can only message connected parties

### Key Features

✅ **Thread Access Control**
- Only participants can view/send messages
- Automatic participant validation on every request

✅ **Rate Limiting**
- 50 messages per hour per user
- Sliding window implemented in Redis
- Clear error messages with reset times

✅ **Relationship Validation**
- Creators ↔ Brands (shared projects or licenses)
- Creators ↔ Creators
- Admins can message anyone
- Blocks self-messaging

✅ **Content Moderation Hooks**
- Character limit: 1-10,000 characters
- Line break limit (max 50)
- Suspicious pattern detection
- Placeholder for profanity filters and link scanning

### Architecture

```
Frontend → tRPC → MessageService → [Rate Limit Check] → [Access Check] → [Content Validation] → Database
                                            ↓                   ↓                    ↓
                                         Redis            Prisma              ModService
```

---

## API Endpoints

### 1. Check if User Can Message

**Endpoint:** `messages.canMessageUser`  
**Type:** Query  
**Auth:** Protected (requires login)

Check if current user can send messages to another user.

#### Input Schema
```typescript
{
  recipientId: string;  // CUID of potential recipient
}
```

#### Response Schema
```typescript
{
  allowed: boolean;       // Can user send messages?
  reason?: string;        // Explanation if not allowed
}
```

#### When To Use
- Before showing "Send Message" button
- Before starting a new conversation
- To provide user feedback on messaging restrictions

---

### 2. Check Rate Limit Status

**Endpoint:** `messages.checkRateLimit` *(Not currently exposed, but handled internally)*  
**Type:** Internal  
**Auth:** Protected

Rate limit checking happens automatically when sending messages. The client receives error details if limit is exceeded.

#### Rate Limit Information (from error)
```typescript
{
  allowed: boolean;
  remainingMessages: number;
  resetAt: Date;
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
/**
 * Can Message User Check
 */
export interface CanMessageUserInput {
  recipientId: string;
}

export interface CanMessageUserResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Rate Limit Status
 */
export interface RateLimitCheckResult {
  allowed: boolean;
  remainingMessages: number;
  resetAt: Date;
}

/**
 * Content Moderation Result
 */
export interface ContentModerationResult {
  approved: boolean;
  errors: string[];      // Blocking errors
  warnings: string[];    // Non-blocking warnings
  flags: string[];       // Classification flags
}

/**
 * Message Sending Validation
 */
export interface SendMessageValidation {
  threadId: string;      // CUID
  senderId: string;      // Auto-filled from session
  recipientId: string;   // CUID
  body: string;          // 1-10,000 chars
  attachmentIds?: string[];  // Optional, max 5
}
```

### Validation Schemas (Zod)

```typescript
import { z } from 'zod';

export const SendMessageSchema = z.object({
  threadId: z.string().cuid(),
  recipientId: z.string().cuid(),
  body: z
    .string()
    .min(1, 'Message body cannot be empty')
    .max(10000, 'Message too long'),
  attachmentIds: z
    .array(z.string().cuid())
    .max(5, 'Maximum 5 attachments per message')
    .optional(),
});

export const CanMessageUserSchema = z.object({
  recipientId: z.string().cuid(),
});
```

---

## Request/Response Examples

### Example 1: Check if User Can Message

#### Request
```typescript
import { trpc } from '@/lib/trpc';

const result = await trpc.messages.canMessageUser.query({
  recipientId: 'clx123abc456',
});
```

#### Success Response
```json
{
  "allowed": true
}
```

#### Blocked Response
```json
{
  "allowed": false,
  "reason": "No active business relationship with this user"
}
```

---

### Example 2: Send Message (Rate Limited)

#### Request
```typescript
const message = await trpc.messages.sendMessage.mutate({
  threadId: 'clx789xyz123',
  recipientId: 'clx123abc456',
  body: 'Hello! I have a question about the project.',
});
```

#### Success Response
```json
{
  "message": {
    "id": "clxmsg123abc",
    "threadId": "clx789xyz123",
    "senderId": "clxuser456",
    "senderName": "Jane Smith",
    "recipientId": "clx123abc456",
    "body": "Hello! I have a question about the project.",
    "readAt": null,
    "attachments": [],
    "createdAt": "2025-10-13T10:30:00.000Z",
    "isOwnMessage": true
  },
  "threadUpdated": true
}
```

#### Rate Limit Exceeded Response
```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Message rate limit exceeded. Resets at 2025-10-13T11:30:00.000Z",
    "data": {
      "resetAt": "2025-10-13T11:30:00.000Z",
      "limit": 50
    }
  }
}
```

---

### Example 3: cURL Commands

#### Check Can Message
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/messages.canMessageUser \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{
    "recipientId": "clx123abc456"
  }'
```

#### Send Message
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/messages.sendMessage \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{
    "threadId": "clx789xyz123",
    "recipientId": "clx123abc456",
    "body": "Hello! I have a question about the project."
  }'
```

---

## Business Logic & Validation Rules

### Access Control Rules

#### 1. Thread Participation Verification

**Rule:** Users can only access threads where they are participants.

**Validation:**
```typescript
// Backend automatically checks:
const participants = thread.participantsJson as string[];
if (!participants.includes(userId)) {
  throw new ThreadAccessDeniedError(threadId);
}
```

**Frontend Should:**
- Only show threads where user is participant
- Hide threads immediately after archiving
- Display clear error if user tries to access unauthorized thread

---

#### 2. Business Relationship Validation

**Rule:** Users can only message others they have a business relationship with.

**Relationships Include:**
- **Shared Projects:** Both users are on the same project
- **Active Licenses:** Brand has licensed creator's IP
- **Admin Override:** Admins can message anyone
- **Self-Messaging:** Blocked (cannot message yourself)

**Implementation:**
```typescript
// Backend checks:
async canMessageUser(senderId, recipientId): Promise<CanMessageUserResult> {
  // 1. Cannot message self
  if (senderId === recipientId) {
    return { allowed: false, reason: 'Cannot message yourself' };
  }
  
  // 2. Check if either is admin
  const [sender, recipient] = await Promise.all([
    prisma.user.findUnique({ where: { id: senderId }}),
    prisma.user.findUnique({ where: { id: recipientId }})
  ]);
  
  if (sender.role === 'ADMIN' || recipient.role === 'ADMIN') {
    return { allowed: true };
  }
  
  // 3. Check business relationship
  const hasRelationship = await checkUserRelationship(senderId, recipientId);
  
  if (!hasRelationship) {
    return { 
      allowed: false, 
      reason: 'No active business relationship with this user' 
    };
  }
  
  return { allowed: true };
}
```

**Frontend Implementation:**
```typescript
function useCanMessageUser(recipientId: string) {
  const { data: canMessage, isLoading } = trpc.messages.canMessageUser.useQuery(
    { recipientId },
    {
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      enabled: !!recipientId,
    }
  );

  return { 
    canMessage: canMessage?.allowed, 
    reason: canMessage?.reason, 
    isLoading 
  };
}

// Usage in UI
function UserProfile({ user }: { user: User }) {
  const { canMessage, reason, isLoading } = useCanMessageUser(user.id);

  if (isLoading) return <Skeleton />;

  return (
    <div>
      <h1>{user.name}</h1>
      {canMessage ? (
        <button onClick={handleStartConversation}>
          <MessageIcon /> Send Message
        </button>
      ) : (
        <Tooltip content={reason || 'Cannot message this user'}>
          <button disabled className="opacity-50 cursor-not-allowed">
            <MessageIcon /> Message Unavailable
          </button>
        </Tooltip>
      )}
    </div>
  );
}
```

---

### Content Validation Rules

#### 1. Message Body Validation

| Field | Min | Max | Type | Required |
|-------|-----|-----|------|----------|
| `body` | 1 char | 10,000 chars | String | Yes |

**Validation Errors:**
- Empty message: `"Message body cannot be empty"`
- Too long: `"Message too long"`

**Frontend Validation:**
```typescript
function MessageInput({ threadId, recipientId }: Props) {
  const [message, setMessage] = useState('');
  const maxLength = 10000;
  const remaining = maxLength - message.length;
  
  const isValid = message.trim().length > 0 && message.length <= maxLength;
  
  return (
    <div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={maxLength}
        placeholder="Type your message..."
        className={`textarea ${!isValid ? 'border-red-500' : ''}`}
      />
      
      <div className="flex justify-between items-center">
        <span className={remaining < 100 ? 'text-orange-500' : 'text-gray-500'}>
          {remaining} characters remaining
        </span>
        
        <button 
          disabled={!isValid}
          onClick={handleSend}
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

---

#### 2. Attachment Validation

| Rule | Limit |
|------|-------|
| Max attachments per message | 5 files |
| Max file size | 10 MB per file |
| Allowed types | Images, PDFs, Office docs, text |

**Frontend Validation:**
```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENTS = 5;
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

function validateAttachment(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `File "${file.name}" exceeds 10 MB limit` 
    };
  }
  
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { 
      valid: false, 
      error: `File type "${file.type}" not allowed` 
    };
  }
  
  return { valid: true };
}

function AttachmentUpload({ attachments, onAdd, onRemove }: Props) {
  const handleFileSelect = (files: FileList) => {
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      toast.error(`Maximum ${MAX_ATTACHMENTS} attachments per message`);
      return;
    }
    
    Array.from(files).forEach((file) => {
      const validation = validateAttachment(file);
      if (!validation.valid) {
        toast.error(validation.error);
      } else {
        onAdd(file);
      }
    });
  };
  
  return (
    <div>
      <input
        type="file"
        multiple
        accept={ALLOWED_TYPES.join(',')}
        onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
        disabled={attachments.length >= MAX_ATTACHMENTS}
      />
      
      {attachments.length >= MAX_ATTACHMENTS && (
        <p className="text-sm text-orange-500">
          Maximum {MAX_ATTACHMENTS} attachments reached
        </p>
      )}
    </div>
  );
}
```

---

#### 3. Content Moderation Checks

**Automated Checks:**
- ✅ Message length (enforced)
- ✅ Line break limit: max 50 (warning only)
- ✅ Suspicious patterns: repeated characters, extremely long URLs
- ⏳ Profanity filter (placeholder for future)
- ⏳ Malicious link scanning (placeholder for future)

**Current Implementation:**
```typescript
// Backend automatically validates
const moderationResult = await contentModerationService.validateMessage({
  content: body,
  senderId,
  recipientId,
  threadId,
});

if (!moderationResult.approved) {
  throw new Error(`Message validation failed: ${moderationResult.errors.join(', ')}`);
}

// Warnings are logged but don't block sending
if (moderationResult.warnings.length > 0) {
  await logModerationEvent({
    messageId: message.id,
    result: moderationResult,
    senderId,
  });
}
```

**Frontend Should:**
- Display generic error if message is blocked
- Don't reveal specific moderation rules (prevents gaming the system)
- Log failed attempts for support debugging

```typescript
const sendMessage = useMutation({
  mutationFn: trpc.messages.sendMessage.mutate,
  onError: (error) => {
    if (error.message.includes('validation failed')) {
      toast.error('Message could not be sent. Please review content and try again.');
    } else {
      toast.error(error.message);
    }
  },
});
```

---

## Error Handling

### Error Codes

| Error Code | HTTP Status | When It Occurs | User-Friendly Message |
|------------|-------------|----------------|----------------------|
| `THREAD_ACCESS_DENIED` | 403 | User not a participant | "You don't have access to this conversation" |
| `CANNOT_MESSAGE_USER` | 403 | No business relationship | "You cannot message this user" |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many messages sent | "You're sending messages too quickly. Please wait." |
| `INVALID_PARTICIPANTS` | 400 | Invalid participant list | "One or more participants are invalid" |
| `MESSAGE_ACCESS_DENIED` | 403 | User can't access message | "You don't have access to this message" |

### Error Response Format

```typescript
interface TRPCError {
  code: 'FORBIDDEN' | 'TOO_MANY_REQUESTS' | 'BAD_REQUEST';
  message: string;
  data?: {
    resetAt?: string;  // ISO 8601 date for rate limits
    limit?: number;
  };
}
```

### Error Handling Best Practices

```typescript
function MessageComposer({ threadId, recipientId }: Props) {
  const sendMessage = trpc.messages.sendMessage.useMutation({
    onError: (error) => {
      switch (error.data?.code) {
        case 'TOO_MANY_REQUESTS':
          const resetAt = new Date(error.data.resetAt);
          const minutes = Math.ceil((resetAt.getTime() - Date.now()) / 60000);
          toast.error(
            `Rate limit reached. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
            { duration: 5000 }
          );
          break;
          
        case 'FORBIDDEN':
          if (error.message.includes('Cannot message')) {
            toast.error('You cannot message this user. Contact support if you believe this is an error.');
          } else {
            toast.error('Access denied');
          }
          break;
          
        default:
          toast.error('Failed to send message. Please try again.');
      }
    },
    onSuccess: () => {
      toast.success('Message sent!');
      resetForm();
    },
  });
  
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      sendMessage.mutate({ threadId, recipientId, body: message });
    }}>
      {/* Form fields */}
    </form>
  );
}
```

---

## Authorization & Permissions

### Role-Based Access

| Action | Creator | Brand | Admin | Notes |
|--------|---------|-------|-------|-------|
| View own threads | ✅ | ✅ | ✅ | Must be participant |
| View all threads | ❌ | ❌ | ❌ | Privacy: even admins can't |
| Send message in thread | ✅ | ✅ | ✅ | Must be participant |
| Create thread with relationship | ✅ | ✅ | ✅ | Needs shared project/license |
| Create thread without relationship | ❌ | ❌ | ✅ | Admin override |
| Archive thread | ✅ | ✅ | ✅ | Must be participant |
| Delete message | ✅ | ✅ | ✅ | Only sender/recipient |

### Permission Checking Pattern

```typescript
// Check permission before rendering UI
function ThreadActions({ thread }: { thread: ThreadListItem }) {
  const { data: session } = useSession();
  const isParticipant = thread.participants.some(
    (p) => p.userId === session?.user.id
  );
  
  if (!isParticipant) {
    return null; // Don't show actions
  }
  
  return (
    <div className="flex gap-2">
      <button onClick={() => archiveThread(thread.id)}>
        Archive
      </button>
    </div>
  );
}
```

---

## Rate Limiting & Quotas

### Message Rate Limits

**Limit:** 50 messages per hour per user  
**Window:** Rolling 1-hour window  
**Storage:** Redis  
**Scope:** Per user ID

#### How It Works

1. Each message sent increments counter in Redis
2. Counter has 1-hour TTL (time-to-live)
3. When limit reached, returns `RATE_LIMIT_EXCEEDED` error
4. Error includes reset time

#### Frontend Rate Limit Tracking

```typescript
function useMessageRateLimit() {
  const [messageCount, setMessageCount] = useState(0);
  const [resetTime, setResetTime] = useState<Date | null>(null);
  const [isNearLimit, setIsNearLimit] = useState(false);
  
  const sendMessage = trpc.messages.sendMessage.useMutation({
    onSuccess: () => {
      setMessageCount((prev) => prev + 1);
      setIsNearLimit(messageCount + 1 >= 45); // Warning at 45
    },
    onError: (error) => {
      if (error.data?.code === 'TOO_MANY_REQUESTS') {
        setResetTime(new Date(error.data.resetAt));
        setMessageCount(50); // At limit
      }
    },
  });
  
  const messagesRemaining = 50 - messageCount;
  
  return {
    messageCount,
    messagesRemaining,
    isNearLimit,
    resetTime,
    sendMessage,
  };
}

// Usage in UI
function MessageInput() {
  const { messagesRemaining, isNearLimit, resetTime } = useMessageRateLimit();
  
  return (
    <div>
      {isNearLimit && (
        <Alert variant="warning">
          ⚠️ You have {messagesRemaining} messages remaining this hour.
          {resetTime && ` Resets at ${formatTime(resetTime)}.`}
        </Alert>
      )}
      
      {resetTime && messagesRemaining === 0 && (
        <Alert variant="error">
          🚫 Rate limit reached. Please wait until {formatTime(resetTime)}.
        </Alert>
      )}
      
      <textarea disabled={messagesRemaining === 0} />
      <button disabled={messagesRemaining === 0}>Send</button>
    </div>
  );
}
```

#### Rate Limit Display Component

```typescript
function RateLimitCountdown({ resetAt }: { resetAt: Date }) {
  const [timeRemaining, setTimeRemaining] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const reset = resetAt.getTime();
      const diff = reset - now;

      if (diff <= 0) {
        setTimeRemaining('Rate limit has reset');
        clearInterval(interval);
        window.location.reload(); // Refresh to allow messaging
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeRemaining(`${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [resetAt]);

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <h3 className="font-semibold text-yellow-900">Slow down!</h3>
      <p className="text-yellow-800">
        You've reached the message limit of 50 messages per hour.
      </p>
      <p className="text-sm text-yellow-700 mt-2">
        Time remaining: <strong>{timeRemaining}</strong>
      </p>
    </div>
  );
}
```

---

## Content Moderation

### Current Moderation Features

#### 1. Character Limit Enforcement
- **Min:** 1 character
- **Max:** 10,000 characters
- **Blocking:** Yes

#### 2. Line Break Limit (Warning)
- **Max:** 50 line breaks
- **Blocking:** No (warning only)
- **Purpose:** Detect potential spam formatting

#### 3. Suspicious Pattern Detection
- **Repeated characters:** `aaaaaaaaaaaaa` (10+ times)
- **Extremely long URLs:** 200+ characters
- **Blocking:** No (flagged for review)

### Future Moderation Hooks

The system has placeholders for:
- ⏳ **Profanity Filter:** Integration point ready
- ⏳ **Malicious Link Scanning:** Integration point ready
- ⏳ **Spam Detection:** Based on user history

### Frontend Considerations

**Do:**
- ✅ Show generic error messages
- ✅ Log moderation failures for support
- ✅ Allow users to edit and retry

**Don't:**
- ❌ Reveal specific moderation rules
- ❌ Show which words/patterns triggered block
- ❌ Allow circumventing moderation checks

```typescript
// Good: Generic error
toast.error('Message could not be sent. Please review content and try again.');

// Bad: Reveals moderation details
toast.error('Message blocked: Contains profanity "****"');
```

---

## Frontend Implementation Checklist

### Phase 1: Access Control

- [ ] **Can Message Check**
  - [ ] Query `canMessageUser` before showing "Message" button
  - [ ] Cache result for 5 minutes
  - [ ] Display reason if not allowed
  - [ ] Disable messaging UI if blocked

- [ ] **Thread Participation**
  - [ ] Only fetch threads where user is participant
  - [ ] Hide threads immediately after archiving
  - [ ] Show 403 error gracefully if unauthorized access

### Phase 2: Rate Limiting

- [ ] **Rate Limit Tracking**
  - [ ] Track message count in component state
  - [ ] Show warning at 45 messages
  - [ ] Disable send button at 50 messages
  - [ ] Display countdown timer when limited

- [ ] **Error Handling**
  - [ ] Parse `RATE_LIMIT_EXCEEDED` errors
  - [ ] Extract `resetAt` from error data
  - [ ] Show user-friendly countdown
  - [ ] Auto-refresh when limit resets

### Phase 3: Content Validation

- [ ] **Message Input**
  - [ ] Character counter (0/10,000)
  - [ ] Warning when approaching limit
  - [ ] Client-side validation before submit
  - [ ] Disable send if invalid

- [ ] **Attachments**
  - [ ] Validate file size (10 MB max)
  - [ ] Validate file type (images, PDFs, docs)
  - [ ] Limit to 5 attachments
  - [ ] Show file preview before upload

### Phase 4: Error Handling

- [ ] **Error Display**
  - [ ] User-friendly error messages
  - [ ] Specific handling for each error code
  - [ ] Toast notifications for errors
  - [ ] Retry mechanism where appropriate

- [ ] **Logging**
  - [ ] Log all failed message attempts
  - [ ] Include error code and message
  - [ ] Send to error tracking (Sentry, etc.)

### Phase 5: Permission Checks

- [ ] **UI Authorization**
  - [ ] Check user role before rendering actions
  - [ ] Hide unauthorized features
  - [ ] Show appropriate messaging for blocked actions

### Phase 6: Testing Edge Cases

- [ ] Test rate limit at exactly 50 messages
- [ ] Test sending to non-relationship user
- [ ] Test accessing thread where not participant
- [ ] Test message with 10,001 characters
- [ ] Test uploading 6 attachments
- [ ] Test self-messaging attempt

---

## Summary

This guide covers the **Security & Validation** aspects of the messaging module:

✅ **Access Control:** Thread participation and relationship validation  
✅ **Rate Limiting:** 50 messages/hour with clear feedback  
✅ **Content Validation:** Message length, attachments, moderation hooks  
✅ **Error Handling:** User-friendly messages for all error scenarios  

**Next Steps:**
1. Review [MESSAGING_DATA_PRIVACY_INTEGRATION_GUIDE.md](./MESSAGING_DATA_PRIVACY_INTEGRATION_GUIDE.md) for GDPR compliance features
2. Review [MESSAGING_CORE_API_INTEGRATION_GUIDE.md](./MESSAGING_CORE_API_INTEGRATION_GUIDE.md) for thread/message APIs

---

**Questions or Issues?**  
Contact backend team or open an issue in the repository.
