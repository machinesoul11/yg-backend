# 🔒 Messaging Data Privacy & GDPR - Frontend Integration Guide

**Classification:** 🌐 SHARED  
**Module:** Messaging - Data Privacy & GDPR Compliance  
**Last Updated:** October 13, 2025  
**Status:** ✅ Complete

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Request/Response Examples](#requestresponse-examples)
5. [Business Logic & Data Retention](#business-logic--data-retention)
6. [Error Handling](#error-handling)
7. [GDPR Compliance Features](#gdpr-compliance-features)
8. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

### Module Purpose

The Data Privacy module provides GDPR-compliant features:
- **Soft Delete:** Messages retained for audit (2-year retention)
- **Data Export:** Users can download all their message data
- **Data Deletion:** Users can request complete data removal on account closure
- **Message Retention:** Automatic cleanup of messages older than 2 years

### Key Features

✅ **Soft Delete Implementation**
- Messages marked as `deletedAt` instead of hard deleted
- Hidden from UI but retained for audit/legal purposes
- Permanent deletion after 2-year retention period

✅ **GDPR Data Export**
- Complete message history in machine-readable JSON
- Includes threads, messages, participants, attachments
- Secure download URL (48-hour expiration)
- Automatic cleanup after 7 days

✅ **User Data Deletion**
- Removes user from thread participants
- Soft deletes all user's messages
- Deletes message attachments from storage
- Triggered on account closure

✅ **Automatic Retention Policy**
- Background job runs daily
- Permanently deletes messages older than 2 years
- Cleans up attachment files from storage
- Maintains compliance with data retention laws

### Architecture

```
Frontend → tRPC → DataPrivacyService → [Export/Delete] → Prisma/Storage
                                              ↓
                                      Background Jobs
                                       (Retention)
```

---

## API Endpoints

### 1. Export User Message Data

**Endpoint:** `messages.exportMyMessageData`  
**Type:** Mutation  
**Auth:** Protected (requires login)

Export all message data for the current user.

#### Input Schema
```typescript
// No input required - uses session user ID
```

#### Response Schema
```typescript
{
  exportId: string;      // Storage key for export file
  downloadUrl: string;   // Signed URL (48-hour expiration)
  expiresAt: Date;       // Download link expiration time
}
```

#### What's Included in Export

```typescript
interface UserMessageExport {
  metadata: {
    userId: string;
    exportedAt: string;      // ISO 8601
    totalThreads: number;
    totalMessages: number;
  };
  threads: Array<{
    threadId: string;
    subject: string | null;
    participants: Array<{
      userId: string;
      name: string;
    }>;
    createdAt: string;
    messages: Array<{
      messageId: string;
      senderId: string;
      senderName: string;
      recipientId: string;
      body: string;
      sentAt: string;
      readAt: string | null;
      attachments: Array<{
        fileName: string;
        fileSize: number;
        mimeType: string;
        storageKey: string;
      }>;
    }>;
  }>;
}
```

---

### 2. Delete User Message Data

**Endpoint:** `messages.deleteMyMessageData`  
**Type:** Mutation  
**Auth:** Protected (requires login)

Delete all message data for the current user (triggered on account closure).

#### Input Schema
```typescript
// No input required - uses session user ID
```

#### Response Schema
```typescript
{
  threadsRemoved: number;        // Threads where user was only participant
  messagesSoftDeleted: number;   // Messages marked as deleted
  attachmentsDeleted: number;    // Attachment files removed from storage
}
```

#### What Gets Deleted

1. **User removed from thread participants**
2. **All user's messages soft deleted** (marked with `deletedAt`)
3. **Attachment files deleted** from storage
4. **Threads deleted** if user was sole participant

---

### 3. Admin: Cleanup Old Messages

**Endpoint:** `messages.cleanupOldMessages`  
**Type:** Mutation  
**Auth:** Admin only

Manually trigger cleanup of messages deleted more than 2 years ago.

#### Input Schema
```typescript
// No input required
```

#### Response Schema
```typescript
{
  messagesDeleted: number;
  attachmentsDeleted: number;
}
```

> **Note:** This is also run automatically via a daily background job.

---

## TypeScript Type Definitions

### Export Types

```typescript
/**
 * Message Data Export Result
 */
export interface MessageExportResult {
  exportId: string;
  downloadUrl: string;
  expiresAt: Date;
}

/**
 * Complete Export Data Structure
 */
export interface UserMessageExport {
  metadata: {
    userId: string;
    exportedAt: string;
    totalThreads: number;
    totalMessages: number;
  };
  threads: Array<ThreadExport>;
}

export interface ThreadExport {
  threadId: string;
  subject: string | null;
  participants: Array<{
    userId: string;
    name: string;
  }>;
  createdAt: string;
  messages: Array<MessageExport>;
}

export interface MessageExport {
  messageId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  body: string;
  sentAt: string;
  readAt: string | null;
  attachments: Array<AttachmentExport>;
}

export interface AttachmentExport {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
}

/**
 * Deletion Result
 */
export interface MessageDeletionResult {
  threadsRemoved: number;
  messagesSoftDeleted: number;
  attachmentsDeleted: number;
}

/**
 * Retention Cleanup Result
 */
export interface RetentionCleanupResult {
  messagesDeleted: number;
  attachmentsDeleted: number;
}
```

---

## Request/Response Examples

### Example 1: Export Message Data

#### Request
```typescript
import { trpc } from '@/lib/trpc';

const exportResult = await trpc.messages.exportMyMessageData.mutate();

console.log('Export ready:', exportResult.downloadUrl);
console.log('Expires at:', exportResult.expiresAt);
```

#### Success Response
```json
{
  "exportId": "exports/messages/message-data-export-clxuser123-1697184000000.json",
  "downloadUrl": "https://storage.yesgoddess.agency/exports/messages/message-data-export-clxuser123-1697184000000.json?signature=...",
  "expiresAt": "2025-10-15T10:30:00.000Z"
}
```

#### Export File Contents (JSON)
```json
{
  "metadata": {
    "userId": "clxuser123",
    "exportedAt": "2025-10-13T10:30:00.000Z",
    "totalThreads": 15,
    "totalMessages": 143
  },
  "threads": [
    {
      "threadId": "clxthread456",
      "subject": "Project Discussion",
      "participants": [
        {
          "userId": "clxuser123",
          "name": "Jane Smith"
        },
        {
          "userId": "clxuser789",
          "name": "John Doe"
        }
      ],
      "createdAt": "2025-09-01T08:00:00.000Z",
      "messages": [
        {
          "messageId": "clxmsg001",
          "senderId": "clxuser123",
          "senderName": "Jane Smith",
          "recipientId": "clxuser789",
          "body": "Hi John, can we discuss the project timeline?",
          "sentAt": "2025-09-01T08:15:00.000Z",
          "readAt": "2025-09-01T08:20:00.000Z",
          "attachments": []
        },
        {
          "messageId": "clxmsg002",
          "senderId": "clxuser789",
          "senderName": "John Doe",
          "recipientId": "clxuser123",
          "body": "Sure! I have some availability this week.",
          "sentAt": "2025-09-01T08:25:00.000Z",
          "readAt": "2025-09-01T08:30:00.000Z",
          "attachments": [
            {
              "fileName": "project-timeline.pdf",
              "fileSize": 245678,
              "mimeType": "application/pdf",
              "storageKey": "attachments/2025/09/clxattach123.pdf"
            }
          ]
        }
      ]
    }
  ]
}
```

---

### Example 2: Delete Message Data

#### Request
```typescript
const deleteResult = await trpc.messages.deleteMyMessageData.mutate();

console.log(`Deleted ${deleteResult.messagesSoftDeleted} messages`);
console.log(`Removed ${deleteResult.attachmentsDeleted} attachments`);
```

#### Success Response
```json
{
  "threadsRemoved": 3,
  "messagesSoftDeleted": 143,
  "attachmentsDeleted": 12
}
```

---

### Example 3: Admin Cleanup (Manual Trigger)

#### Request
```typescript
// Admin only
const cleanupResult = await trpc.messages.cleanupOldMessages.mutate();

console.log(`Cleaned up ${cleanupResult.messagesDeleted} old messages`);
```

#### Success Response
```json
{
  "messagesDeleted": 847,
  "attachmentsDeleted": 62
}
```

---

### Example 4: cURL Commands

#### Export Data
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/messages.exportMyMessageData \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

#### Delete Data
```bash
curl -X POST https://ops.yesgoddess.agency/api/trpc/messages.deleteMyMessageData \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

---

## Business Logic & Data Retention

### Soft Delete Strategy

#### Why Soft Delete?

1. **Audit Trail:** Compliance and legal requirements
2. **Dispute Resolution:** Reference for ownership disputes
3. **Recovery:** Accidental deletion protection (within window)
4. **Analytics:** Aggregate data for platform insights

#### How It Works

```typescript
// Instead of DELETE
await prisma.message.delete({ where: { id: messageId }});

// We UPDATE with deletedAt
await prisma.message.update({
  where: { id: messageId },
  data: { deletedAt: new Date() }
});

// Queries exclude soft-deleted by default
const messages = await prisma.message.findMany({
  where: {
    threadId,
    deletedAt: null  // ✅ Only active messages
  }
});
```

#### Frontend Behavior

```typescript
// Don't show deleted messages in UI
const activeMessages = thread.messages.filter(msg => !msg.deletedAt);

// But allow export to include them (for user data export)
const allMessages = thread.messages; // Includes deleted
```

---

### Message Retention Policy

**Retention Period:** 2 years from deletion date  
**Cleanup Frequency:** Daily (via background job)  
**Cleanup Process:**

1. Find messages with `deletedAt < (now - 2 years)`
2. Delete attachment files from storage
3. Permanently delete message records from database
4. Log cleanup statistics

#### Background Job

```typescript
// Runs daily at 2 AM
// Schedule: 0 2 * * *

export const messageRetentionCleanupWorker = new Worker(
  'message-retention-cleanup',
  async (job) => {
    const result = await dataPrivacyService.cleanupOldDeletedMessages();
    
    console.log(`[Cleanup] Deleted ${result.messagesDeleted} messages`);
    console.log(`[Cleanup] Deleted ${result.attachmentsDeleted} attachments`);
    
    return result;
  }
);
```

#### Manual Trigger (Admin)

Admins can manually trigger cleanup via the API endpoint or admin dashboard.

---

### Data Export Process

#### Flow

1. **User requests export** → `exportMyMessageData()`
2. **Compile all data** → Fetch threads, messages, participants
3. **Generate JSON file** → Structured export format
4. **Upload to storage** → Private bucket
5. **Generate signed URL** → 48-hour expiration
6. **Return download link** → User downloads file
7. **Schedule cleanup** → File deleted after 7 days

#### Security

- ✅ **Private storage bucket** (not public)
- ✅ **Signed URLs** with short expiration
- ✅ **User authentication** required
- ✅ **Automatic cleanup** after 7 days
- ✅ **Audit logging** of export requests

#### Email Notification (Future)

```typescript
// TODO: Implement when template is ready
await emailService.sendTransactional({
  to: user.email,
  subject: 'Your Message Data Export is Ready',
  template: 'data-export-ready',
  variables: {
    userName: user.name,
    downloadUrl: downloadUrlResult.url,
    expiresAt: expiresAt.toISOString(),
    exportType: 'Messages',
  },
});
```

---

### Data Deletion on Account Closure

**Trigger:** User deletes their account  
**Process:**

1. **Soft delete all messages** sent or received by user
2. **Remove user from thread participants**
3. **Delete threads** if user was sole participant
4. **Delete attachment files** from storage
5. **Return deletion statistics**

#### Thread Handling

```typescript
for (const thread of userThreads) {
  const participants = thread.participantsJson as string[];
  const updatedParticipants = participants.filter(id => id !== userId);
  
  if (updatedParticipants.length === 0) {
    // No participants left → delete thread
    await prisma.messageThread.update({
      where: { id: thread.id },
      data: { deletedAt: new Date() }
    });
  } else {
    // Update participants list
    await prisma.messageThread.update({
      where: { id: thread.id },
      data: { participantsJson: updatedParticipants }
    });
  }
}
```

---

## Error Handling

### Error Codes

| Error Code | HTTP Status | When It Occurs | User-Friendly Message |
|------------|-------------|----------------|----------------------|
| `USER_NOT_FOUND` | 404 | User doesn't exist | "User not found" |
| `EXPORT_FAILED` | 500 | Storage/compilation error | "Failed to generate export. Please try again." |
| `DELETION_FAILED` | 500 | Database error | "Failed to delete data. Please contact support." |
| `UNAUTHORIZED` | 401 | Not logged in | "Please log in to access this feature" |

### Error Response Format

```typescript
interface TRPCError {
  code: 'NOT_FOUND' | 'INTERNAL_SERVER_ERROR' | 'UNAUTHORIZED';
  message: string;
}
```

### Error Handling Examples

```typescript
function DataExportButton() {
  const exportData = trpc.messages.exportMyMessageData.useMutation({
    onError: (error) => {
      if (error.data?.code === 'INTERNAL_SERVER_ERROR') {
        toast.error('Failed to generate export. Please try again or contact support.');
      } else {
        toast.error('An unexpected error occurred');
      }
    },
    onSuccess: (result) => {
      // Automatically download
      window.open(result.downloadUrl, '_blank');
      
      toast.success('Export ready! Download started automatically.');
    },
  });
  
  return (
    <button 
      onClick={() => exportData.mutate()}
      disabled={exportData.isLoading}
    >
      {exportData.isLoading ? 'Generating export...' : 'Export My Data'}
    </button>
  );
}
```

---

## GDPR Compliance Features

### Right to Access (Data Portability)

**GDPR Article 15 & 20**

Users can request a copy of all their personal data in a structured, machine-readable format.

#### Implementation

```typescript
// User clicks "Export My Data"
const exportResult = await trpc.messages.exportMyMessageData.mutate();

// Download JSON file
window.open(exportResult.downloadUrl, '_blank');
```

#### What's Included

- ✅ All threads user participated in
- ✅ All messages sent/received (including deleted)
- ✅ All participants' names and IDs
- ✅ All attachment metadata
- ✅ Timestamps (created, read)

#### Frontend UI

```typescript
function GDPRDataExport() {
  const [isExporting, setIsExporting] = useState(false);
  const exportMutation = trpc.messages.exportMyMessageData.useMutation();
  
  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const result = await exportMutation.mutateAsync();
      
      // Open download in new tab
      window.open(result.downloadUrl, '_blank');
      
      toast.success(
        `Export ready! Download link expires ${formatDate(result.expiresAt)}.`
      );
    } catch (error) {
      toast.error('Failed to generate export. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };
  
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h3 className="font-semibold text-blue-900">Export Your Data</h3>
      <p className="text-sm text-blue-800 mt-1">
        Download all your message data in JSON format.
      </p>
      
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        {isExporting ? (
          <>
            <Spinner className="inline mr-2" />
            Generating export...
          </>
        ) : (
          'Export My Message Data'
        )}
      </button>
      
      <p className="text-xs text-blue-700 mt-2">
        Export link expires in 48 hours. File will be deleted after 7 days.
      </p>
    </div>
  );
}
```

---

### Right to Erasure (Right to be Forgotten)

**GDPR Article 17**

Users can request deletion of their personal data.

#### Implementation

```typescript
// User closes account
const deletionResult = await trpc.messages.deleteMyMessageData.mutate();

console.log(`Deleted ${deletionResult.messagesSoftDeleted} messages`);
console.log(`Removed ${deletionResult.attachmentsDeleted} attachment files`);
```

#### What Gets Deleted

- ✅ User removed from thread participants
- ✅ Messages soft deleted (marked with `deletedAt`)
- ✅ Attachment files deleted from storage
- ✅ Threads deleted if user was sole participant

#### What's Retained

- ✅ **Aggregate statistics** (anonymized, non-identifiable)
- ✅ **Compliance records** (required by law)

#### Frontend UI

```typescript
function AccountDeletionConfirmation() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const deleteMutation = trpc.messages.deleteMyMessageData.useMutation();
  
  const handleDelete = async () => {
    if (!confirmed) {
      toast.error('Please confirm you understand this action is permanent');
      return;
    }
    
    setIsDeleting(true);
    
    try {
      const result = await deleteMutation.mutateAsync();
      
      toast.success(
        `Deleted ${result.messagesSoftDeleted} messages and ` +
        `${result.attachmentsDeleted} attachments.`
      );
      
      // Redirect to confirmation page
      router.push('/account-deleted');
    } catch (error) {
      toast.error('Failed to delete data. Please contact support.');
    } finally {
      setIsDeleting(false);
    }
  };
  
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <h3 className="font-semibold text-red-900">Delete Account Data</h3>
      <p className="text-sm text-red-800 mt-1">
        This will permanently delete all your message data, including:
      </p>
      
      <ul className="list-disc list-inside text-sm text-red-800 mt-2">
        <li>All messages you've sent or received</li>
        <li>All attachment files</li>
        <li>Your participation in message threads</li>
      </ul>
      
      <div className="mt-3 flex items-center">
        <input
          type="checkbox"
          id="confirm-delete"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor="confirm-delete" className="text-sm text-red-800">
          I understand this action is <strong>permanent and cannot be undone</strong>
        </label>
      </div>
      
      <button
        onClick={handleDelete}
        disabled={!confirmed || isDeleting}
        className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
      >
        {isDeleting ? (
          <>
            <Spinner className="inline mr-2" />
            Deleting...
          </>
        ) : (
          'Delete My Message Data'
        )}
      </button>
      
      <p className="text-xs text-red-700 mt-2">
        ⚠️ This action cannot be undone. Please export your data first if you need a copy.
      </p>
    </div>
  );
}
```

---

### Data Retention Transparency

Users should be informed about:
- ✅ How long data is stored
- ✅ Why soft delete is used
- ✅ When permanent deletion occurs

#### Frontend Display

```typescript
function DataRetentionInfo() {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <h3 className="font-semibold text-gray-900">Data Retention Policy</h3>
      
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="font-medium text-gray-700">Active Messages</dt>
          <dd className="text-gray-600">
            Stored indefinitely until you delete them
          </dd>
        </div>
        
        <div>
          <dt className="font-medium text-gray-700">Deleted Messages</dt>
          <dd className="text-gray-600">
            Retained for 2 years for audit/legal purposes, then permanently deleted
          </dd>
        </div>
        
        <div>
          <dt className="font-medium text-gray-700">Attachment Files</dt>
          <dd className="text-gray-600">
            Deleted immediately when message is deleted
          </dd>
        </div>
        
        <div>
          <dt className="font-medium text-gray-700">Account Closure</dt>
          <dd className="text-gray-600">
            All messages soft deleted immediately, then permanently deleted after 2 years
          </dd>
        </div>
      </dl>
      
      <p className="text-xs text-gray-500 mt-3">
        Learn more in our <a href="/privacy-policy" className="underline">Privacy Policy</a>
      </p>
    </div>
  );
}
```

---

## Frontend Implementation Checklist

### Phase 1: Data Export

- [ ] **Export Button**
  - [ ] Add "Export My Data" button in user settings
  - [ ] Show loading state during export generation
  - [ ] Handle download URL automatically
  - [ ] Display expiration time to user

- [ ] **Error Handling**
  - [ ] Show user-friendly error if export fails
  - [ ] Provide support contact if repeated failures
  - [ ] Log errors for debugging

- [ ] **Download Experience**
  - [ ] Auto-open download URL in new tab
  - [ ] Show success toast with expiration info
  - [ ] Provide "Copy Link" option as backup

### Phase 2: Data Deletion

- [ ] **Deletion Confirmation**
  - [ ] Add warning modal with consequences
  - [ ] Require explicit confirmation checkbox
  - [ ] Show what will be deleted
  - [ ] Prevent accidental deletion

- [ ] **Account Closure Flow**
  - [ ] Trigger data deletion on account deletion
  - [ ] Show deletion progress/result
  - [ ] Redirect to confirmation page after
  - [ ] Send confirmation email (when template ready)

### Phase 3: Transparency

- [ ] **Retention Policy Display**
  - [ ] Show data retention periods in settings
  - [ ] Explain soft delete vs permanent delete
  - [ ] Link to privacy policy

- [ ] **GDPR Rights Explanation**
  - [ ] Explain right to access (export)
  - [ ] Explain right to erasure (delete)
  - [ ] Provide easy access to both features

### Phase 4: Admin Tools

- [ ] **Manual Cleanup Trigger** (Admin Dashboard)
  - [ ] Button to trigger retention cleanup
  - [ ] Show cleanup statistics
  - [ ] Display last cleanup date
  - [ ] Schedule indicator

### Phase 5: Testing

- [ ] Test export with 0 messages
- [ ] Test export with 1000+ messages
- [ ] Test export download link expiration
- [ ] Test deletion when user has no messages
- [ ] Test deletion when user is sole thread participant
- [ ] Verify attachments are actually deleted from storage

---

## Summary

This guide covers the **Data Privacy & GDPR Compliance** aspects of the messaging module:

✅ **Soft Delete:** Messages retained for audit (2 years)  
✅ **Data Export:** GDPR-compliant data portability  
✅ **Data Deletion:** Right to erasure on account closure  
✅ **Retention Policy:** Automatic cleanup of old data  

**Key Points:**
- Export links expire in 48 hours
- Export files deleted after 7 days
- Messages permanently deleted after 2 years
- Attachments deleted immediately on message deletion

**Next Steps:**
1. Review [MESSAGING_SECURITY_VALIDATION_INTEGRATION_GUIDE.md](./MESSAGING_SECURITY_VALIDATION_INTEGRATION_GUIDE.md) for access control
2. Review [MESSAGING_CORE_API_INTEGRATION_GUIDE.md](./MESSAGING_CORE_API_INTEGRATION_GUIDE.md) for thread/message APIs

---

**Questions or Issues?**  
Contact backend team or open an issue in the repository.
