# Email Service Integration Guide

## Overview

This guide shows how to integrate the email service layer with various parts of the YES GODDESS application. All integrations are for backend/admin use only.

## Table of Contents
1. [Authentication Flow Integration](#authentication-flow-integration)
2. [Notification System Integration](#notification-system-integration)
3. [Royalty System Integration](#royalty-system-integration)
4. [Payout System Integration](#payout-system-integration)
5. [Project System Integration](#project-system-integration)
6. [Brand Verification Integration](#brand-verification-integration)
7. [Worker Initialization](#worker-initialization)

---

## Authentication Flow Integration

### Email Verification

**File:** `src/lib/auth/email-verification.ts` or Auth.js configuration

```typescript
import { emailService } from '@/lib/services/email';
import { nanoid } from 'nanoid';
import { prisma } from '@/lib/db';

export async function sendEmailVerification(user: { id: string; email: string; name: string }) {
  // Generate verification token
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Store token in database
  await prisma.verificationToken.create({
    data: {
      identifier: user.email,
      token,
      expires: expiresAt,
    },
  });

  // Build verification URL
  const verificationUrl = `${process.env.NEXTAUTH_URL}/verify-email?token=${token}`;

  // Send email
  await emailService.sendTransactional({
    userId: user.id,
    email: user.email,
    subject: 'Verify your YES GODDESS account',
    template: 'email-verification',
    variables: {
      userName: user.name,
      verificationUrl,
      expiresInHours: 24,
    },
    tags: {
      type: 'verification',
      category: 'system',
    },
  });
}
```

### Password Reset

```typescript
import { emailService } from '@/lib/services/email';

export async function sendPasswordResetEmail(user: { id: string; email: string; name: string }) {
  const resetToken = await generatePasswordResetToken(user.id);
  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${resetToken}`;

  await emailService.sendTransactional({
    userId: user.id,
    email: user.email,
    subject: 'Reset your YES GODDESS password',
    template: 'password-reset',
    variables: {
      userName: user.name,
      resetUrl,
      expiresInHours: 1,
    },
    tags: {
      type: 'password-reset',
      category: 'system',
    },
  });
}
```

### Password Changed Notification

```typescript
export async function sendPasswordChangedNotification(
  user: { id: string; email: string; name: string },
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  await emailService.sendTransactional({
    userId: user.id,
    email: user.email,
    subject: 'Your YES GODDESS password was changed',
    template: 'password-changed',
    variables: {
      userName: user.name,
      changeTime: new Date(),
      ipAddress: metadata?.ipAddress,
      deviceInfo: metadata?.userAgent,
    },
    tags: {
      type: 'security',
      category: 'system',
    },
  });
}
```

### Welcome Email After Verification

```typescript
export async function sendWelcomeEmail(user: { id: string; email: string; name: string; role: string }) {
  const template = user.role === 'CREATOR' ? 'creator-welcome' : 'welcome';
  
  await emailService.sendTransactional({
    userId: user.id,
    email: user.email,
    subject: 'Welcome to YES GODDESS',
    template,
    variables: {
      userName: user.name,
      creatorName: user.name,
      dashboardUrl: `${process.env.NEXTAUTH_URL}/dashboard`,
      loginUrl: `${process.env.NEXTAUTH_URL}/login`,
    },
    tags: {
      type: 'welcome',
      category: 'system',
    },
  });
}
```

---

## Notification System Integration

### Notification to Email Conversion

**File:** `src/services/notification/notification.service.ts`

```typescript
import { emailService } from '@/lib/services/email';
import { emailSchedulingService } from '@/lib/services/email';

export async function sendNotificationEmail(notification: {
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
}) {
  // Get user and check email preferences
  const user = await prisma.user.findUnique({
    where: { id: notification.userId },
    include: { emailPreferences: true },
  });

  if (!user) return;

  // Check if user wants immediate emails or digest
  const digestFrequency = user.emailPreferences?.digestFrequency || 'IMMEDIATE';

  if (digestFrequency === 'IMMEDIATE') {
    // Send immediately
    await sendImmediateNotificationEmail(user, notification);
  } else {
    // Add to digest queue
    await queueForDigest(user, notification, digestFrequency);
  }
}

async function sendImmediateNotificationEmail(
  user: any,
  notification: any
) {
  // Map notification type to email template
  const templateMapping: Record<string, string> = {
    'license_expiry': 'license-expiry',
    'project_invitation': 'project-invitation',
    'royalty_statement': 'royalty-statement',
    'payout_complete': 'payout-confirmation',
    // ... more mappings
  };

  const template = templateMapping[notification.type];
  
  if (!template) {
    console.warn(`No email template for notification type: ${notification.type}`);
    return;
  }

  await emailService.sendTransactional({
    userId: user.id,
    email: user.email,
    subject: notification.title,
    template: template as any,
    variables: notification.metadata || {},
    tags: {
      notificationType: notification.type,
      category: 'notification',
    },
  });
}
```

---

## Royalty System Integration

### Royalty Statement Email

**File:** `src/services/royalty/royalty-statement.service.ts`

```typescript
import { emailService } from '@/lib/services/email';

export async function sendRoyaltyStatement(statement: {
  id: string;
  creatorId: string;
  periodStart: Date;
  periodEnd: Date;
  totalAmount: number;
  lineItems: Array<{
    assetName: string;
    amount: number;
    units: number;
  }>;
}) {
  const creator = await prisma.user.findUnique({
    where: { id: statement.creatorId },
  });

  if (!creator) return;

  // Generate statement URL
  const statementUrl = `${process.env.NEXTAUTH_URL}/dashboard/royalties/${statement.id}`;

  await emailService.sendTransactional({
    userId: creator.id,
    email: creator.email,
    subject: 'Your Royalty Statement is Ready',
    template: 'royalty-statement',
    variables: {
      creatorName: creator.name,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      totalRoyalties: statement.totalAmount,
      currency: 'USD',
      statementUrl,
      lineItems: statement.lineItems,
    },
    tags: {
      type: 'royalty_statement',
      statementId: statement.id,
    },
  });
}
```

---

## Payout System Integration

### Payout Confirmation Email

**File:** `src/services/payout/payout.service.ts`

```typescript
import { emailService } from '@/lib/services/email';

export async function sendPayoutConfirmation(payout: {
  id: string;
  creatorId: string;
  amount: number;
  currency: string;
  method: string;
  estimatedArrival: Date;
}) {
  const creator = await prisma.user.findUnique({
    where: { id: payout.creatorId },
  });

  if (!creator) return;

  await emailService.sendTransactional({
    userId: creator.id,
    email: creator.email,
    subject: 'Your Payout is on the Way',
    template: 'payout-confirmation',
    variables: {
      creatorName: creator.name,
      amount: payout.amount,
      currency: payout.currency,
      payoutMethod: payout.method,
      estimatedArrival: payout.estimatedArrival,
      transactionId: payout.id,
    },
    tags: {
      type: 'payout',
      payoutId: payout.id,
    },
  });
}
```

### Payout Failed Email

```typescript
export async function sendPayoutFailedEmail(payout: {
  id: string;
  creatorId: string;
  amount: number;
  failureReason: string;
}) {
  const creator = await prisma.user.findUnique({
    where: { id: payout.creatorId },
  });

  if (!creator) return;

  // You would create a payout-failed template for this
  // For now, we can send a generic notification
  await emailService.sendTransactional({
    userId: creator.id,
    email: creator.email,
    subject: 'Issue with Your Payout',
    template: 'transaction-receipt', // Use appropriate template
    variables: {
      recipientName: creator.name,
      transactionId: payout.id,
      transactionDate: new Date(),
      amount: payout.amount,
      currency: 'USD',
      description: `Payout failed: ${payout.failureReason}`,
    },
  });
}
```

---

## Project System Integration

### Project Invitation Email

**File:** `src/services/project/project-invitation.service.ts`

```typescript
import { emailService } from '@/lib/services/email';

export async function sendProjectInvitation(invitation: {
  projectId: string;
  inviterId: string;
  inviteeEmail: string;
  role: string;
  token: string;
}) {
  const [project, inviter] = await Promise.all([
    prisma.project.findUnique({ where: { id: invitation.projectId } }),
    prisma.user.findUnique({ where: { id: invitation.inviterId } }),
  ]);

  if (!project || !inviter) return;

  const acceptUrl = `${process.env.NEXTAUTH_URL}/projects/accept-invitation?token=${invitation.token}`;
  const declineUrl = `${process.env.NEXTAUTH_URL}/projects/decline-invitation?token=${invitation.token}`;

  await emailService.sendTransactional({
    email: invitation.inviteeEmail,
    subject: `${inviter.name} invited you to collaborate on ${project.name}`,
    template: 'project-invitation',
    variables: {
      inviterName: inviter.name,
      projectName: project.name,
      projectDescription: project.description,
      role: invitation.role,
      acceptUrl,
      declineUrl,
    },
    tags: {
      type: 'project_invitation',
      projectId: project.id,
    },
  });
}
```

---

## Brand Verification Integration

### Brand Verification Request Email

**File:** `src/services/brand/brand-verification.service.ts`

```typescript
import { emailService } from '@/lib/services/email';

export async function notifyAdminsOfBrandVerification(brand: {
  id: string;
  name: string;
  submittedBy: string;
  submittedAt: Date;
}) {
  // Get all admin users
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
  });

  const reviewUrl = `${process.env.NEXTAUTH_URL}/admin/brands/${brand.id}/verify`;

  // Send to all admins
  for (const admin of admins) {
    await emailService.sendTransactional({
      userId: admin.id,
      email: admin.email,
      subject: 'New Brand Verification Request',
      template: 'brand-verification-request',
      variables: {
        brandName: brand.name,
        submittedBy: brand.submittedBy,
        submittedAt: brand.submittedAt,
        reviewUrl,
      },
      tags: {
        type: 'admin_notification',
        brandId: brand.id,
      },
    });
  }
}
```

### Brand Approved Email

```typescript
export async function sendBrandApprovedEmail(brand: {
  id: string;
  name: string;
  primaryContactId: string;
}) {
  const contact = await prisma.user.findUnique({
    where: { id: brand.primaryContactId },
  });

  if (!contact) return;

  await emailService.sendTransactional({
    userId: contact.id,
    email: contact.email,
    subject: `${brand.name} has been verified!`,
    template: 'brand-verification-complete',
    variables: {
      brandName: brand.name,
      verifiedAt: new Date(),
      dashboardUrl: `${process.env.NEXTAUTH_URL}/dashboard`,
    },
    tags: {
      type: 'brand_verification',
      brandId: brand.id,
    },
  });
}
```

### Brand Rejected Email

```typescript
export async function sendBrandRejectedEmail(brand: {
  id: string;
  name: string;
  primaryContactId: string;
  rejectionReason: string;
}) {
  const contact = await prisma.user.findUnique({
    where: { id: brand.primaryContactId },
  });

  if (!contact) return;

  await emailService.sendTransactional({
    userId: contact.id,
    email: contact.email,
    subject: `Update on ${brand.name} verification`,
    template: 'brand-verification-rejected',
    variables: {
      brandName: brand.name,
      rejectionReason: brand.rejectionReason,
      resubmitUrl: `${process.env.NEXTAUTH_URL}/brands/${brand.id}/resubmit`,
    },
    tags: {
      type: 'brand_verification',
      brandId: brand.id,
    },
  });
}
```

---

## License Expiry Notifications

### Schedule License Expiry Reminders

**File:** `src/jobs/license-expiry-monitor.job.ts`

```typescript
import { emailSchedulingService } from '@/lib/services/email';

export async function scheduleLicenseExpiryReminders() {
  // Find licenses expiring in 30, 7, and 1 day
  const thresholds = [30, 7, 1];

  for (const days of thresholds) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    const expiringLicenses = await prisma.license.findMany({
      where: {
        expiresAt: {
          gte: new Date(expiryDate.setHours(0, 0, 0, 0)),
          lt: new Date(expiryDate.setHours(23, 59, 59, 999)),
        },
        status: 'ACTIVE',
      },
      include: {
        asset: true,
        brand: {
          include: {
            primaryContact: true,
          },
        },
      },
    });

    for (const license of expiringLicenses) {
      // Schedule reminder email
      const reminderDate = new Date(license.expiresAt);
      reminderDate.setDate(reminderDate.getDate() - days);

      await emailSchedulingService.scheduleEmail({
        emailType: 'license_expiry_reminder',
        recipientEmail: license.brand.primaryContact.email,
        recipientUserId: license.brand.primaryContactId,
        templateId: 'license-expiry',
        subject: `Your license for ${license.asset.name} expires in ${days} day${days > 1 ? 's' : ''}`,
        personalizationData: {
          licenseName: license.name || 'License',
          assetName: license.asset.name,
          expiryDate: license.expiresAt,
          daysUntilExpiry: days,
          renewalUrl: `${process.env.NEXTAUTH_URL}/licenses/${license.id}/renew`,
        },
        scheduledSendTime: reminderDate,
        optimizeSendTime: true,
      });
    }
  }
}
```

---

## Worker Initialization

### Application Startup

**File:** `src/app/layout.tsx` or `src/index.ts` (Next.js server)

```typescript
import { initializeEmailWorkers } from '@/jobs/email-workers';

// Initialize email workers when app starts
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_WORKERS === 'true') {
  initializeEmailWorkers();
  console.log('[App] Email workers initialized');
}
```

### Separate Worker Process (Recommended for Production)

**File:** `src/workers.ts`

```typescript
import { initializeEmailWorkers } from '@/jobs/email-workers';

// This file runs as a separate process
initializeEmailWorkers();

console.log('[Workers] Email worker process started');

// Keep process alive
process.on('SIGTERM', async () => {
  console.log('[Workers] Shutting down...');
  process.exit(0);
});
```

**Package.json:**
```json
{
  "scripts": {
    "workers": "tsx src/workers.ts",
    "dev": "concurrently \"next dev\" \"npm run workers\"",
  }
}
```

---

## Environment Configuration

### Required Environment Variables

```bash
# Email Service
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_SENDER_EMAIL=noreply@yesgoddess.com
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
EMAIL_FROM_NAME="YES GODDESS"

# Application URLs
NEXTAUTH_URL=https://yesgoddess.com

# Redis (for queues)
REDIS_URL=redis://localhost:6379

# Worker Configuration
ENABLE_WORKERS=true
```

---

## Testing Integration

### Test Email Sending in Development

```typescript
import { emailService } from '@/lib/services/email';

// Use test mode
if (process.env.NODE_ENV === 'development') {
  // Override to test email for all sends
  const originalSend = emailService.sendTransactional;
  emailService.sendTransactional = async (params) => {
    return originalSend({
      ...params,
      email: 'test@example.com', // All emails go here
    });
  };
}
```

### Mock Email Service in Tests

```typescript
// src/__tests__/setup.ts
jest.mock('@/lib/services/email', () => ({
  emailService: {
    sendTransactional: jest.fn().mockResolvedValue({ success: true }),
  },
}));
```

---

## Monitoring & Alerts

### Admin Dashboard Integration

```typescript
// src/app/admin/email/page.tsx
import { getEmailWorkersHealth } from '@/jobs/email-workers';
import { emailDeliverabilityService } from '@/lib/services/email';

export default async function EmailDashboard() {
  const health = await getEmailWorkersHealth();
  const metrics = await emailDeliverabilityService.calculateMetrics('day');

  return (
    <div>
      <h1>Email System Status</h1>
      
      <section>
        <h2>Worker Health</h2>
        <pre>{JSON.stringify(health, null, 2)}</pre>
      </section>

      <section>
        <h2>Deliverability Metrics (24h)</h2>
        <p>Delivery Rate: {(metrics.deliveryRate * 100).toFixed(2)}%</p>
        <p>Bounce Rate: {(metrics.bounceRate * 100).toFixed(2)}%</p>
        <p>Complaint Rate: {(metrics.complaintRate * 100).toFixed(2)}%</p>
      </section>
    </div>
  );
}
```

---

## Best Practices

1. **Always use type-safe templates** - Import from `template-registry.ts`
2. **Check user preferences before sending** - Done automatically by `emailService`
3. **Use scheduling for non-urgent emails** - Batch processing is more efficient
4. **Handle failures gracefully** - Retries are automatic
5. **Monitor deliverability** - Set up alerts for high bounce rates
6. **Test thoroughly** - Use Resend test mode in development
7. **Follow brand guidelines** - Use provided templates
8. **Log important events** - Help with debugging
9. **Respect rate limits** - Use queues for bulk sends
10. **Keep templates updated** - Reflect current brand guidelines

---

**Integration Guide Version**: 1.0  
**Last Updated**: October 11, 2025
