# 🌐 Notification Triggers - Part 1: Overview & API Reference

**Classification:** 🌐 SHARED - All users receive notifications (website and email)

**Last Updated:** October 14, 2025

---

## Table of Contents
- [Overview](#overview)
- [Notification Trigger Types](#notification-trigger-types)
- [API Endpoints](#api-endpoints)
- [TypeScript Type Definitions](#typescript-type-definitions)
- [Request/Response Examples](#requestresponse-examples)

---

## Overview

The YesGoddess notification system automatically triggers notifications based on key platform events. This document covers **backend-triggered notifications** that are automatically created by the system, not manually created by users.

### What This Document Covers

✅ **Automated Notification Triggers** - System-generated notifications  
✅ **Trigger Conditions** - When each notification is created  
✅ **Metadata Schemas** - Type-safe notification data  
✅ **Integration Points** - How to handle each notification type in the UI

### Related Documentation

This is **Part 1** of the Notification Triggers guide. See also:

- **NOTIFICATION_TRIGGERS_PART_2_BUSINESS_LOGIC.md** - Business rules, validation, and workflows
- **NOTIFICATION_DELIVERY_PART_1_API_REFERENCE.md** - Notification listing, polling, and management APIs
- **NOTIFICATION_DELIVERY_PART_2_BUSINESS_LOGIC.md** - Email delivery and digest logic
- **NOTIFICATION_DELIVERY_PART_3_IMPLEMENTATION.md** - Frontend implementation patterns

---

## Notification Trigger Types

The platform automatically creates notifications for the following events:

| Trigger | Type | Priority | Description | Frequency |
|---------|------|----------|-------------|-----------|
| **License Expiry Warnings** | `LICENSE` | MEDIUM → HIGH | Multi-stage warnings at 90/60/30 days before expiry | Multiple per license |
| **New Message Received** | `MESSAGE` | MEDIUM | Notification when user receives a direct message | Per message (with bundling) |
| **Royalty Statement Available** | `ROYALTY` | MEDIUM | Creator notified when royalty statement is ready | Per statement |
| **Payout Completed** | `PAYOUT` | HIGH | Notification when payout is successfully processed | Per payout |
| **Payout Failed** | `PAYOUT` | URGENT | Alert when payout processing fails | Per failed payout |
| **Project Invitation** | `PROJECT` | HIGH | Brand invites creator to collaborate on project | Per invitation |
| **Asset Approval/Rejection** | `LICENSE` | HIGH | IP asset ownership decision notifications | Per approval action |

### Trigger Lifecycle

```
┌─────────────────┐
│  Platform Event │ (e.g., license expires in 30 days)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Trigger Check  │ (Background job or service method)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Create In-App   │ (Notification record in DB)
│  Notification   │
└────────┬────────┘
         │
         ├─────────────────┐
         ▼                 ▼
┌─────────────────┐  ┌──────────────┐
│ Email Delivery  │  │  Cache Clear │
│  (if enabled)   │  │ (unread count)│
└─────────────────┘  └──────────────┘
```

---

## API Endpoints

> **Note:** Notification triggers are **backend-automated**. The frontend does NOT call these triggers directly. Instead, the frontend uses the **Notification Delivery APIs** to retrieve and display triggered notifications.

### Core Notification APIs

All notification retrieval APIs are documented in **NOTIFICATION_DELIVERY_PART_1_API_REFERENCE.md**. Key endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/notifications` | GET | List user's notifications (paginated) |
| `/api/notifications/unread` | GET | Get unread count |
| `/api/notifications/poll` | GET | Long-polling for new notifications |
| `/api/notifications/:id` | GET | Get single notification details |
| `/api/notifications/:id/read` | POST | Mark notification as read |

### Trigger-Specific Metadata Access

Each notification type includes metadata specific to the trigger. Access via the `metadata` field:

```typescript
GET /api/notifications/:id

Response:
{
  "success": true,
  "data": {
    "id": "clxxx...",
    "type": "LICENSE",
    "title": "License Expiring in 30 Days",
    "message": "Your license for \"Goddess Logo\" expires on Dec 31, 2025.",
    "priority": "HIGH",
    "actionUrl": "/licenses/clxxx123",
    "metadata": {
      "licenseId": "clxxx123",
      "licenseName": "Goddess Logo",
      "expiryDate": "2025-12-31T00:00:00Z",
      "daysUntilExpiry": 30,
      "notificationType": "expiry"
    },
    "read": false,
    "createdAt": "2025-12-01T09:00:00Z"
  }
}
```

---

## TypeScript Type Definitions

### Base Notification Schema

```typescript
/**
 * Notification entity from database
 */
interface Notification {
  id: string;                        // CUID
  userId: string;                    // Recipient user ID
  type: NotificationType;
  priority: NotificationPriority;
  title: string;                     // Display title (max 200 chars)
  message: string;                   // Body text (max 1000 chars)
  actionUrl: string | null;          // Deep link URL (e.g., /licenses/123)
  metadata: Record<string, any>;     // Type-specific data (see below)
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
}

enum NotificationType {
  LICENSE = 'LICENSE',
  PAYOUT = 'PAYOUT',
  ROYALTY = 'ROYALTY',
  PROJECT = 'PROJECT',
  SYSTEM = 'SYSTEM',
  MESSAGE = 'MESSAGE',
}

enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}
```

### Trigger-Specific Metadata Schemas

#### 1. License Expiry Notifications

```typescript
interface LicenseExpiryMetadata {
  licenseId: string;                 // CUID of license
  licenseName: string;               // Display name of licensed IP
  expiryDate: string;                // ISO 8601 date (license end date)
  daysUntilExpiry: number;           // Days remaining (90, 60, 30, or 0)
  notificationType: 'expiry';
  brandId?: string;                  // Brand CUID (for creator view)
  creatorId?: string;                // Creator CUID (for brand view)
  autoRenewEnabled?: boolean;        // Whether auto-renewal is on
}

// Example Notification
{
  "type": "LICENSE",
  "priority": "HIGH",
  "title": "License Expiring in 30 Days",
  "message": "Your license for \"Goddess Logo\" with ABC Corp expires on December 31, 2025. Review renewal options.",
  "actionUrl": "/licenses/clxxx123",
  "metadata": {
    "licenseId": "clxxx123",
    "licenseName": "Goddess Logo",
    "expiryDate": "2025-12-31T00:00:00Z",
    "daysUntilExpiry": 30,
    "notificationType": "expiry",
    "autoRenewEnabled": false
  }
}
```

#### 2. Message Notifications

```typescript
interface MessageNotificationMetadata {
  threadId: string;                  // Message thread CUID
  messageId?: string;                // Specific message CUID (if single)
  senderId: string;                  // User who sent the message
  senderName: string;                // Display name of sender
  threadSubject?: string | null;     // Subject line (if exists)
  messagePreview: string;            // First 100 chars of message
  messageCount?: number;             // If bundled, total message count
}

// Example Notification
{
  "type": "MESSAGE",
  "priority": "MEDIUM",
  "title": "New message from Sarah Chen",
  "message": "Hey! I wanted to discuss the licensing terms for...",
  "actionUrl": "/messages/clyyy456",
  "metadata": {
    "threadId": "clyyy456",
    "messageId": "clzzz789",
    "senderId": "claaa111",
    "senderName": "Sarah Chen",
    "threadSubject": "License Terms Discussion",
    "messagePreview": "Hey! I wanted to discuss the licensing terms for..."
  }
}
```

#### 3. Royalty Statement Notifications

```typescript
interface RoyaltyStatementMetadata {
  statementId: string;               // Royalty statement CUID
  periodStart: string;               // ISO 8601 date
  periodEnd: string;                 // ISO 8601 date
  totalEarnings: number;             // Amount in cents (USD)
  currency: string;                  // ISO currency code (e.g., 'USD')
  status: RoyaltyStatementStatus;
}

enum RoyaltyStatementStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
}

// Example Notification
{
  "type": "ROYALTY",
  "priority": "MEDIUM",
  "title": "Royalty Statement Available",
  "message": "Your royalty statement for Q4 2025 is now available for review.",
  "actionUrl": "/royalties/statements/clbbb222",
  "metadata": {
    "statementId": "clbbb222",
    "periodStart": "2025-10-01T00:00:00Z",
    "periodEnd": "2025-12-31T23:59:59Z",
    "totalEarnings": 125000,
    "currency": "USD",
    "status": "APPROVED"
  }
}
```

#### 4. Payout Notifications

```typescript
interface PayoutNotificationMetadata {
  payoutId: string;                  // Payout record CUID
  amount: number;                    // Amount in cents
  currency: string;                  // ISO currency code
  status: 'completed' | 'failed';
  paymentMethod?: string;            // e.g., 'bank_transfer', 'paypal'
  failureReason?: string;            // If status = 'failed'
  referenceNumber?: string;          // External transaction ID
}

// Example Notification (Completed)
{
  "type": "PAYOUT",
  "priority": "HIGH",
  "title": "Payout Completed",
  "message": "Your payout of $1,250.00 has been successfully processed.",
  "actionUrl": "/payouts/clccc333",
  "metadata": {
    "payoutId": "clccc333",
    "amount": 125000,
    "currency": "USD",
    "status": "completed",
    "paymentMethod": "bank_transfer",
    "referenceNumber": "TXN-2025-12345"
  }
}

// Example Notification (Failed)
{
  "type": "PAYOUT",
  "priority": "URGENT",
  "title": "Payout Failed",
  "message": "Your payout of $1,250.00 could not be processed. Please update your payment information.",
  "actionUrl": "/settings/payment-methods",
  "metadata": {
    "payoutId": "clccc333",
    "amount": 125000,
    "currency": "USD",
    "status": "failed",
    "failureReason": "Invalid bank account number"
  }
}
```

#### 5. Project Invitation Notifications

```typescript
interface ProjectInvitationMetadata {
  projectId: string;                 // Project CUID
  projectName: string;               // Display name
  invitedBy: string;                 // User ID of inviter
  inviterName: string;               // Display name of inviter
  inviterRole: 'BRAND' | 'CREATOR';  // Role of person who invited
  role: string;                      // Role user is invited as
  message?: string | null;           // Optional invitation message
}

// Example Notification
{
  "type": "PROJECT",
  "priority": "HIGH",
  "title": "Project Invitation",
  "message": "ABC Corp invited you to join \"Summer Campaign 2026\".",
  "actionUrl": "/projects/clddd444/invitation",
  "metadata": {
    "projectId": "clddd444",
    "projectName": "Summer Campaign 2026",
    "invitedBy": "cleee555",
    "inviterName": "ABC Corp",
    "inviterRole": "BRAND",
    "role": "CREATOR",
    "message": "We'd love to feature your work in our upcoming campaign!"
  }
}
```

#### 6. Asset Approval/Rejection Notifications

```typescript
interface AssetApprovalMetadata {
  assetId: string;                   // IP Asset CUID
  assetTitle: string;                // Asset display name
  action: 'approved' | 'rejected' | 'pending_review';
  reviewedBy?: string;               // User ID of reviewer
  reviewerName?: string;             // Display name of reviewer
  reason?: string | null;            // Rejection reason (if applicable)
  ownershipPercentage?: number;      // Ownership stake (0-100)
  disputeId?: string;                // If rejection due to dispute
}

// Example Notification (Approved)
{
  "type": "LICENSE",
  "priority": "HIGH",
  "title": "Asset Ownership Approved",
  "message": "Your ownership claim for \"Goddess Logo\" has been approved.",
  "actionUrl": "/assets/clfff666",
  "metadata": {
    "assetId": "clfff666",
    "assetTitle": "Goddess Logo",
    "action": "approved",
    "reviewedBy": "clggg777",
    "reviewerName": "Platform Admin",
    "ownershipPercentage": 50
  }
}

// Example Notification (Rejected)
{
  "type": "LICENSE",
  "priority": "HIGH",
  "title": "Asset Ownership Rejected",
  "message": "Your ownership claim for \"Goddess Logo\" has been rejected. Reason: Insufficient proof of ownership.",
  "actionUrl": "/assets/clfff666/dispute",
  "metadata": {
    "assetId": "clfff666",
    "assetTitle": "Goddess Logo",
    "action": "rejected",
    "reviewedBy": "clggg777",
    "reviewerName": "Platform Admin",
    "reason": "Insufficient proof of ownership"
  }
}
```

---

## Request/Response Examples

### Example 1: List License Expiry Notifications

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/notifications?type=LICENSE&priority=HIGH' \
  -H 'Authorization: Bearer {jwt_token}'
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clxxx123",
      "type": "LICENSE",
      "title": "License Expiring in 30 Days",
      "message": "Your license for \"Goddess Logo\" expires on December 31, 2025. Review renewal options.",
      "actionUrl": "/licenses/clxxx123",
      "priority": "HIGH",
      "read": false,
      "readAt": null,
      "metadata": {
        "licenseId": "clxxx123",
        "licenseName": "Goddess Logo",
        "expiryDate": "2025-12-31T00:00:00Z",
        "daysUntilExpiry": 30,
        "notificationType": "expiry"
      },
      "createdAt": "2025-12-01T09:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### Example 2: Poll for New Notifications

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/notifications/poll?lastSeen=2025-12-01T09:00:00Z' \
  -H 'Authorization: Bearer {jwt_token}'
```

**Response (New notification available):**
```json
{
  "success": true,
  "hasNew": true,
  "data": [
    {
      "id": "clyyy999",
      "type": "MESSAGE",
      "title": "New message from Sarah Chen",
      "message": "Hey! I wanted to discuss the licensing terms for...",
      "actionUrl": "/messages/clyyy456",
      "priority": "MEDIUM",
      "read": false,
      "readAt": null,
      "metadata": {
        "threadId": "clyyy456",
        "senderId": "claaa111",
        "senderName": "Sarah Chen",
        "messagePreview": "Hey! I wanted to discuss the licensing terms for..."
      },
      "createdAt": "2025-12-01T10:15:00Z"
    }
  ],
  "unreadCount": 5
}
```

### Example 3: Get Unread Count by Type

**Request:**
```bash
curl -X GET 'https://ops.yesgoddess.agency/api/notifications/unread' \
  -H 'Authorization: Bearer {jwt_token}'
```

**Response:**
```json
{
  "success": true,
  "unreadCount": 12,
  "byType": {
    "LICENSE": 3,
    "MESSAGE": 5,
    "ROYALTY": 1,
    "PAYOUT": 2,
    "PROJECT": 1,
    "SYSTEM": 0
  },
  "byPriority": {
    "LOW": 0,
    "MEDIUM": 6,
    "HIGH": 5,
    "URGENT": 1
  }
}
```

---

## Next Steps

Continue to **NOTIFICATION_TRIGGERS_PART_2_BUSINESS_LOGIC.md** for:
- Trigger conditions and timing
- Business rules for each notification type
- Email delivery logic
- Notification preferences and filtering
- Edge cases and error handling

---

## Quick Reference

### Notification Type → Metadata Schema

| Type | Metadata Interface |
|------|-------------------|
| LICENSE (Expiry) | `LicenseExpiryMetadata` |
| MESSAGE | `MessageNotificationMetadata` |
| ROYALTY | `RoyaltyStatementMetadata` |
| PAYOUT | `PayoutNotificationMetadata` |
| PROJECT | `ProjectInvitationMetadata` |
| LICENSE (Approval) | `AssetApprovalMetadata` |

### Priority Levels by Trigger

| Trigger | Default Priority | Escalation |
|---------|-----------------|------------|
| License Expiry (90d) | MEDIUM | - |
| License Expiry (60d) | MEDIUM | - |
| License Expiry (30d) | HIGH | - |
| Message Received | MEDIUM | - |
| Royalty Statement | MEDIUM | - |
| Payout Completed | HIGH | - |
| Payout Failed | URGENT | - |
| Project Invitation | HIGH | - |
| Asset Approved | HIGH | - |
| Asset Rejected | HIGH | - |

---

**Document Version:** 1.0.0  
**API Version:** v1  
**Backend Compatibility:** yg-backend main branch
