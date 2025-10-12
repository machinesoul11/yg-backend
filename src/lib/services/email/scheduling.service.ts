/**
 * Email Scheduling Service
 * 
 * Handles scheduling emails for future delivery:
 * - One-time scheduled sends
 * - Recurring emails (daily, weekly, monthly)
 * - Send time optimization based on recipient engagement
 * - Timezone-aware scheduling
 * - Frequency capping
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { Queue, Worker, type Job } from 'bullmq';
import { emailService } from './email.service';
import type { ScheduledEmailStatus } from '@prisma/client';

export interface ScheduleEmailParams {
  emailType: string;
  recipientUserId?: string;
  recipientEmail: string;
  templateId: string;
  subject: string;
  personalizationData?: Record<string, any>;
  scheduledSendTime: Date;
  timezone?: string;
  optimizeSendTime?: boolean;
  recurrencePattern?: string; // cron pattern
}

export const scheduledEmailQueue = new Queue('scheduled-emails', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000,
    },
    removeOnComplete: 1000,
    removeOnFail: 2000,
  },
});

export class EmailSchedulingService {
  /**
   * Schedule an email for future delivery
   */
  async scheduleEmail(params: ScheduleEmailParams): Promise<string> {
    // Create scheduled email record
    const scheduledEmail = await prisma.scheduledEmail.create({
      data: {
        emailType: params.emailType,
        recipientUserId: params.recipientUserId,
        recipientEmail: params.recipientEmail,
        templateId: params.templateId,
        subject: params.subject,
        personalizationData: params.personalizationData,
        scheduledSendTime: params.scheduledSendTime,
        timezone: params.timezone,
        optimizeSendTime: params.optimizeSendTime || false,
        recurrencePattern: params.recurrencePattern,
        status: 'PENDING',
      },
    });

    // If send time optimization is enabled, adjust send time
    let actualSendTime = params.scheduledSendTime;
    if (params.optimizeSendTime && params.recipientUserId) {
      actualSendTime = await this.optimizeSendTime(
        params.recipientUserId,
        params.scheduledSendTime
      );
    }

    // Queue the email for processing at scheduled time
    await scheduledEmailQueue.add(
      'send-scheduled-email',
      { scheduledEmailId: scheduledEmail.id },
      {
        delay: actualSendTime.getTime() - Date.now(),
        jobId: `scheduled-email-${scheduledEmail.id}`,
      }
    );

    console.log(`[EmailScheduling] Scheduled email ${scheduledEmail.id} for ${actualSendTime.toISOString()}`);

    return scheduledEmail.id;
  }

  /**
   * Optimize send time based on recipient's engagement history
   */
  private async optimizeSendTime(userId: string, requestedTime: Date): Promise<Date> {
    // Get user's open history to find optimal send time
    const opens = await prisma.emailEvent.findMany({
      where: {
        userId,
        eventType: 'OPENED',
        openedAt: {
          not: null,
        },
      },
      select: {
        openedAt: true,
      },
      take: 50, // Last 50 opens
    });

    if (opens.length < 5) {
      // Not enough data - use requested time
      return requestedTime;
    }

    // Calculate average hour of opens
    const hours = opens
      .map(o => o.openedAt!.getHours())
      .reduce((sum, hour) => sum + hour, 0) / opens.length;

    const optimalHour = Math.round(hours);

    // Adjust requested time to optimal hour
    const optimized = new Date(requestedTime);
    optimized.setHours(optimalHour, 0, 0, 0);

    // If optimized time is in the past, use next day
    if (optimized < new Date()) {
      optimized.setDate(optimized.getDate() + 1);
    }

    console.log(`[EmailScheduling] Optimized send time for user ${userId}: ${optimalHour}:00`);

    return optimized;
  }

  /**
   * Cancel a scheduled email
   */
  async cancelScheduledEmail(scheduledEmailId: string): Promise<void> {
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: 'CANCELLED',
      },
    });

    // Remove from queue
    await scheduledEmailQueue.remove(`scheduled-email-${scheduledEmailId}`);

    console.log(`[EmailScheduling] Cancelled scheduled email ${scheduledEmailId}`);
  }

  /**
   * Process scheduled email from queue
   */
  async processScheduledEmail(scheduledEmailId: string): Promise<void> {
    const scheduledEmail = await prisma.scheduledEmail.findUnique({
      where: { id: scheduledEmailId },
    });

    if (!scheduledEmail || scheduledEmail.status !== 'PENDING') {
      console.log(`[EmailScheduling] Skipping ${scheduledEmailId} - status: ${scheduledEmail?.status}`);
      return;
    }

    // Check frequency capping
    if (scheduledEmail.recipientUserId) {
      const shouldSend = await this.checkFrequencyCap(
        scheduledEmail.recipientUserId,
        scheduledEmail.emailType
      );

      if (!shouldSend) {
        console.log(`[EmailScheduling] Frequency cap reached for user ${scheduledEmail.recipientUserId}`);
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmailId },
          data: {
            status: 'CANCELLED',
            errorMessage: 'Frequency cap reached',
          },
        });
        return;
      }
    }

    // Update status to queued
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: 'QUEUED' },
    });

    try {
      // Send the email
      const result = await emailService.sendTransactional({
        userId: scheduledEmail.recipientUserId,
        email: scheduledEmail.recipientEmail,
        subject: scheduledEmail.subject,
        template: scheduledEmail.templateId as any, // Type assertion needed
        variables: scheduledEmail.personalizationData as any,
      });

      if (result.success) {
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmailId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        console.log(`[EmailScheduling] Sent scheduled email ${scheduledEmailId}`);

        // Handle recurrence
        if (scheduledEmail.recurrencePattern) {
          await this.scheduleNextRecurrence(scheduledEmail);
        }
      } else {
        throw new Error(result.error || 'Failed to send email');
      }
    } catch (error) {
      console.error(`[EmailScheduling] Error sending ${scheduledEmailId}:`, error);

      const retryCount = scheduledEmail.retryCount + 1;
      const status: ScheduledEmailStatus = retryCount >= 3 ? 'FAILED' : 'PENDING';

      await prisma.scheduledEmail.update({
        where: { id: scheduledEmailId },
        data: {
          status,
          failedAt: status === 'FAILED' ? new Date() : undefined,
          retryCount,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      if (status === 'PENDING') {
        // Retry after delay
        await scheduledEmailQueue.add(
          'send-scheduled-email',
          { scheduledEmailId },
          {
            delay: 60000 * retryCount, // Exponential backoff
          }
        );
      }
    }
  }

  /**
   * Schedule next occurrence for recurring email
   */
  private async scheduleNextRecurrence(scheduledEmail: any): Promise<void> {
    if (!scheduledEmail.recurrencePattern) return;

    // Parse cron pattern and calculate next send time
    // For simplicity, supporting basic patterns like "daily", "weekly", "monthly"
    let nextSendTime = new Date(scheduledEmail.scheduledSendTime);

    switch (scheduledEmail.recurrencePattern) {
      case 'daily':
        nextSendTime.setDate(nextSendTime.getDate() + 1);
        break;
      case 'weekly':
        nextSendTime.setDate(nextSendTime.getDate() + 7);
        break;
      case 'monthly':
        nextSendTime.setMonth(nextSendTime.getMonth() + 1);
        break;
      default:
        // For more complex patterns, would use a cron parser
        return;
    }

    // Create next scheduled email
    await this.scheduleEmail({
      emailType: scheduledEmail.emailType,
      recipientUserId: scheduledEmail.recipientUserId,
      recipientEmail: scheduledEmail.recipientEmail,
      templateId: scheduledEmail.templateId,
      subject: scheduledEmail.subject,
      personalizationData: scheduledEmail.personalizationData,
      scheduledSendTime: nextSendTime,
      timezone: scheduledEmail.timezone,
      optimizeSendTime: scheduledEmail.optimizeSendTime,
      recurrencePattern: scheduledEmail.recurrencePattern,
    });
  }

  /**
   * Check if recipient has reached frequency cap
   */
  private async checkFrequencyCap(userId: string, emailType: string): Promise<boolean> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Count emails sent in last 24 hours
    const recentEmails = await prisma.emailEvent.count({
      where: {
        userId,
        eventType: 'SENT',
        sentAt: {
          gte: oneDayAgo,
        },
      },
    });

    // Marketing emails: max 3 per day
    // Transactional emails: no limit
    const isMarketing = ['campaign', 'newsletter', 'announcement'].includes(emailType);
    const dailyLimit = isMarketing ? 3 : 999;

    return recentEmails < dailyLimit;
  }

  /**
   * Get upcoming scheduled emails
   */
  async getUpcomingScheduledEmails(limit: number = 100): Promise<any[]> {
    return prisma.scheduledEmail.findMany({
      where: {
        status: 'PENDING',
        scheduledSendTime: {
          gte: new Date(),
        },
      },
      orderBy: {
        scheduledSendTime: 'asc',
      },
      take: limit,
    });
  }
}

// Worker to process scheduled emails
export const scheduledEmailWorker = new Worker(
  'scheduled-emails',
  async (job: Job) => {
    const { scheduledEmailId } = job.data;
    const service = new EmailSchedulingService();
    await service.processScheduledEmail(scheduledEmailId);
  },
  {
    connection: redis,
    concurrency: 10,
  }
);

// Handle worker events
scheduledEmailWorker.on('completed', (job) => {
  console.log(`[ScheduledEmailWorker] Job ${job.id} completed`);
});

scheduledEmailWorker.on('failed', (job, err) => {
  console.error(`[ScheduledEmailWorker] Job ${job?.id} failed:`, err.message);
});

export const emailSchedulingService = new EmailSchedulingService();
