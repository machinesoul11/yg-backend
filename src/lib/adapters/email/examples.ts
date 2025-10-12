/**
 * Email Adapter Integration Examples
 * 
 * This file demonstrates how to use the email adapter layer
 * in various scenarios within the YES GODDESS platform.
 */

import {
  emailAdapter,
  bounceHandler,
  complaintHandler,
  suppressionList,
  type SendEmailParams,
  type BounceInfo,
  type ComplaintInfo,
} from '@/lib/services/email';
import React from 'react';

/**
 * Example 1: Send a simple transactional email
 */
export async function sendWelcomeEmail(
  recipientEmail: string,
  userName: string
) {
  try {
    // Check suppression list first
    const isSuppressed = await suppressionList.isSuppressed(recipientEmail);
    if (isSuppressed) {
      console.log(`Email ${recipientEmail} is suppressed, skipping send`);
      return { success: false, reason: 'suppressed' };
    }

    // Send email using HTML content
    const result = await emailAdapter.sendEmail({
      to: recipientEmail,
      subject: 'Welcome to YES GODDESS',
      html: `<h1>Welcome, ${userName}!</h1><p>Thank you for joining YES GODDESS.</p>`,
      tags: {
        category: 'onboarding',
        type: 'welcome',
      },
    });

    console.log(`Welcome email sent with ID: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    throw error;
  }
}

/**
 * Example 2: Send bulk campaign emails
 */
export async function sendMonthlyNewsletter(
  creators: Array<{ id: string; email: string; name: string }>
) {
  try {
    // Filter out suppressed emails
    const suppressionResults = await suppressionList.checkBulk(
      creators.map(c => c.email)
    );

    const validRecipients = creators.filter(
      c => !suppressionResults.get(c.email)
    );

    console.log(
      `Sending to ${validRecipients.length}/${creators.length} recipients (${
        creators.length - validRecipients.length
      } suppressed)`
    );

    // Send bulk emails with progress tracking
    const result = await emailAdapter.sendBulk({
      recipients: validRecipients.map(c => ({
        email: c.email,
        variables: {
          creatorName: c.name,
          month: new Date().toLocaleDateString('en-US', { month: 'long' }),
        },
      })),
      template: 'monthly-newsletter',
      subject: 'Your Monthly YES GODDESS Update',
      batchSize: 100,
      batchDelay: 100, // 100ms delay between batches
      onProgress: (progress) => {
        console.log(
          `Newsletter progress: ${progress.sent}/${progress.total} sent (${progress.percentComplete}%)`
        );
      },
    });

    console.log(
      `Bulk send complete: ${result.queued} queued, ${result.failed} failed`
    );

    if (result.errors && result.errors.length > 0) {
      console.error('Failed sends:', result.errors.slice(0, 10)); // Log first 10 errors
    }

    return result;
  } catch (error) {
    console.error('Failed to send newsletter:', error);
    throw error;
  }
}

/**
 * Example 3: Send templated email with complex data
 */
export async function sendRoyaltyStatement(params: {
  creatorEmail: string;
  creatorName: string;
  period: string;
  totalEarnings: number;
  breakdown: Array<{
    projectName: string;
    earnings: number;
  }>;
}) {
  try {
    const result = await emailAdapter.sendTemplate({
      to: params.creatorEmail,
      template: 'royalty-statement',
      variables: {
        creatorName: params.creatorName,
        period: params.period,
        totalEarnings: params.totalEarnings,
        breakdown: params.breakdown,
      },
      subject: `Your Royalty Statement for ${params.period}`,
      tags: {
        category: 'financial',
        type: 'royalty-statement',
      },
    });

    return result;
  } catch (error) {
    console.error('Failed to send royalty statement:', error);
    throw error;
  }
}

/**
 * Example 4: Handle webhook bounce event
 */
export async function handleBounceWebhook(webhookData: {
  email: string;
  bounceType: 'hard' | 'soft' | 'technical';
  reason: string;
  diagnosticCode?: string;
}) {
  try {
    const bounceInfo: BounceInfo & { email: string } = {
      email: webhookData.email,
      type: webhookData.bounceType,
      reason: webhookData.reason,
      diagnosticCode: webhookData.diagnosticCode,
      timestamp: new Date(),
      suppressionRecommended: webhookData.bounceType === 'hard',
    };

    await bounceHandler.handleBounce(bounceInfo);

    // Get updated bounce statistics
    const stats = await bounceHandler.getBounceStats(webhookData.email);
    console.log('Bounce stats:', stats);

    return { success: true };
  } catch (error) {
    console.error('Failed to handle bounce:', error);
    throw error;
  }
}

/**
 * Example 5: Handle webhook complaint event
 */
export async function handleComplaintWebhook(webhookData: {
  email: string;
  feedbackType?: string;
}) {
  try {
    const complaintInfo: ComplaintInfo & { email: string } = {
      email: webhookData.email,
      type: 'abuse',
      timestamp: new Date(),
      feedbackType: webhookData.feedbackType,
      suppressionRecommended: true,
    };

    await complaintHandler.handleComplaint(complaintInfo);

    // Check if complaint rate is concerning
    const rate = await complaintHandler.getComplaintRate({
      startDate: new Date(Date.now() - 86400000), // Last 24 hours
      endDate: new Date(),
    });

    if (rate > 0.05) {
      console.error(
        `WARNING: Complaint rate is ${rate.toFixed(4)}% (threshold: 0.05%)`
      );
      // TODO: Alert administrators
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to handle complaint:', error);
    throw error;
  }
}

/**
 * Example 6: Process webhook event
 */
export async function processWebhookEvent(rawPayload: any) {
  try {
    // Parse webhook event
    const event = emailAdapter.parseWebhookEvent(rawPayload);

    console.log(`Processing webhook event: ${event.type} for ${event.email}`);

    // Handle based on event type
    switch (event.type) {
      case 'email.bounced':
        await handleBounceWebhook({
          email: event.email,
          bounceType: (event.data as BounceInfo).type as 'hard' | 'soft' | 'technical',
          reason: (event.data as BounceInfo).reason,
          diagnosticCode: (event.data as BounceInfo).diagnosticCode,
        });
        break;

      case 'email.complained':
        await handleComplaintWebhook({
          email: event.email,
          feedbackType: (event.data as ComplaintInfo).feedbackType,
        });
        break;

      case 'email.delivered':
        console.log(`Email delivered to ${event.email}`);
        // Update delivery status in database
        break;

      case 'email.opened':
        console.log(`Email opened by ${event.email}`);
        // Track engagement metrics
        break;

      case 'email.clicked':
        console.log(
          `Link clicked in email to ${event.email}:`,
          event.data.url
        );
        // Track click-through metrics
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to process webhook event:', error);
    throw error;
  }
}

/**
 * Example 7: Check email health metrics
 */
export async function checkEmailHealthMetrics() {
  try {
    const endDate = new Date();
    const startDate = new Date(Date.now() - 86400000 * 7); // Last 7 days

    // Get bounce rate
    const bounceRate = await bounceHandler.getBounceRate({
      startDate,
      endDate,
    });

    // Get complaint rate
    const complaintRate = await complaintHandler.getComplaintRate({
      startDate,
      endDate,
    });

    // Get suppression stats
    const suppressionStats = await suppressionList.getStatistics();

    const metrics = {
      bounceRate,
      complaintRate,
      suppressionStats,
      healthy: bounceRate < 5 && complaintRate < 0.1,
    };

    console.log('Email Health Metrics:', metrics);

    if (!metrics.healthy) {
      console.error('WARNING: Email health metrics are concerning!');
      if (bounceRate >= 5) {
        console.error(`High bounce rate: ${bounceRate.toFixed(2)}%`);
      }
      if (complaintRate >= 0.1) {
        console.error(`High complaint rate: ${complaintRate.toFixed(4)}%`);
      }
    }

    return metrics;
  } catch (error) {
    console.error('Failed to check health metrics:', error);
    throw error;
  }
}

/**
 * Example 8: Manage suppression list
 */
export async function manageSuppressionList() {
  try {
    // Add email to suppression list manually
    await suppressionList.add({
      email: 'block@example.com',
      reason: 'MANUAL',
    });

    // Check if email is suppressed
    const isSuppressed = await suppressionList.isSuppressed('block@example.com');
    console.log('Is suppressed:', isSuppressed);

    // Get suppression info
    const info = await suppressionList.getSuppressionInfo('block@example.com');
    console.log('Suppression info:', info);

    // List all suppressed emails
    const list = await suppressionList.list({
      reason: 'BOUNCE',
      limit: 10,
    });
    console.log('Suppressed emails (bounces):', list);

    // Export suppression list for backup
    const exported = await suppressionList.export();
    console.log(`Exported ${exported.length} suppressed emails`);

    // Remove from suppression list (manual override)
    await suppressionList.remove('block@example.com');
    console.log('Removed from suppression list');

    return { success: true };
  } catch (error) {
    console.error('Failed to manage suppression list:', error);
    throw error;
  }
}

/**
 * Example 9: Schedule email for future delivery
 */
export async function scheduleEmail(params: {
  email: string;
  subject: string;
  content: string;
  scheduledAt: Date;
}) {
  try {
    const result = await emailAdapter.sendEmail({
      to: params.email,
      subject: params.subject,
      html: params.content,
      scheduledAt: params.scheduledAt,
      tags: {
        type: 'scheduled',
      },
    });

    console.log(
      `Email scheduled for ${params.scheduledAt.toISOString()}: ${result.messageId}`
    );
    return result;
  } catch (error) {
    console.error('Failed to schedule email:', error);
    throw error;
  }
}

/**
 * Example 10: Send email with attachments
 */
export async function sendEmailWithAttachment(params: {
  to: string;
  subject: string;
  content: string;
  attachmentData: Buffer;
  attachmentName: string;
}) {
  try {
    const result = await emailAdapter.sendEmail({
      to: params.to,
      subject: params.subject,
      html: params.content,
      attachments: [
        {
          filename: params.attachmentName,
          content: params.attachmentData,
          contentType: 'application/pdf',
        },
      ],
    });

    return result;
  } catch (error) {
    console.error('Failed to send email with attachment:', error);
    throw error;
  }
}
