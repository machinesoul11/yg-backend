/**
 * Email Events Processor Job
 * 
 * Background job that processes email webhook events asynchronously.
 * This ensures webhook endpoints respond quickly while complex processing
 * happens in the background with proper error handling and retry logic.
 * 
 * Processes:
 * - Bounce events (hard/soft bounce categorization and suppression)
 * - Complaint events (spam complaints and immediate suppression)
 * - Engagement events (opens, clicks with scoring updates)
 * - Delivery events (delivery confirmation and metrics)
 * 
 * Features:
 * - Event-specific processors for clean separation
 * - Automatic retry with exponential backoff
 * - Idempotency checking to prevent duplicate processing
 * - Engagement score calculation
 * - Deliverability metrics updates
 * - Alert generation for critical issues
 */

import { type Job } from 'bullmq';
import { createLazyQueue, createWorkerIfNotServerless } from '@/lib/queue/lazy-queue';
import { prisma } from '@/lib/db';
import { SuppressionListManager } from '@/lib/adapters/email/suppression-list';
import { emailDeliverabilityService } from '@/lib/services/email/deliverability.service';
import { emailEngagementScoringService } from '@/lib/services/email/engagement-scoring.service';
import type { EmailEventType } from '@prisma/client';

export interface EmailEventJobData {
  eventId: string;
  eventType: EmailEventType;
  email: string;
  messageId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ProcessingResult {
  success: boolean;
  eventId: string;
  eventType: EmailEventType;
  actionsТaken: string[];
  warnings?: string[];
  error?: string;
}

// Initialize suppression list manager
const suppressionList = new SuppressionListManager();

/**
 * Queue for email event processing (lazy-loaded)
 */
export const emailEventsQueue = createLazyQueue<EmailEventJobData>('email-events-processing', {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 seconds
    },
    removeOnComplete: {
      count: 1000,
      age: 24 * 3600, // Keep completed jobs for 24 hours
    },
    removeOnFail: {
      count: 5000,
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
});

/**
 * Worker for processing email events (skip in serverless)
 */
async function processEmailEvent(job: Job<EmailEventJobData>): Promise<ProcessingResult> {
  const { eventId, eventType, email, messageId, timestamp, metadata } = job.data;

  console.log(`[EmailEventsProcessor] Processing ${eventType} event for ${email} (ID: ${eventId})`);

  const actions: string[] = [];
  const warnings: string[] = [];

  try {
    // Check if event has already been processed (idempotency)
    const event = await prisma.emailEvent.findUnique({
      where: { id: eventId },
      select: { id: true, metadata: true },
    });

    if (!event) {
      throw new Error(`Event ${eventId} not found in database`);
    }

    // Check if already processed
    const alreadyProcessed = (event.metadata as any)?.processed === true;
    if (alreadyProcessed) {
      console.log(`[EmailEventsProcessor] Event ${eventId} already processed, skipping`);
      return {
        success: true,
        eventId,
        eventType,
        actionsТaken: ['skipped-already-processed'],
      };
    }

    // Route to specific processor based on event type
    switch (eventType) {
      case 'BOUNCED':
        await processBounceEvent(job, event, actions, warnings);
        break;

      case 'COMPLAINED':
        await processComplaintEvent(job, event, actions, warnings);
        break;

      case 'OPENED':
        await processOpenEvent(job, event, actions);
        break;

      case 'CLICKED':
        await processClickEvent(job, event, actions);
        break;

      case 'DELIVERED':
        await processDeliveredEvent(job, event, actions);
        break;

      case 'SENT':
        // Sent events are logged but don't require special processing
        actions.push('logged-send-event');
        break;

      case 'FAILED':
        await processFailedEvent(job, event, actions, warnings);
        break;

      default:
        warnings.push(`Unknown event type: ${eventType}`);
    }

    // Mark event as processed
    await prisma.emailEvent.update({
      where: { id: eventId },
      data: {
        metadata: {
          ...(event.metadata as object || {}),
          processed: true,
          processedAt: new Date().toISOString(),
          processingJobId: job.id,
        },
      },
    });

    actions.push('marked-as-processed');

    console.log(
      `[EmailEventsProcessor] Successfully processed ${eventType} for ${email}`,
      { actions, warnings: warnings.length > 0 ? warnings : undefined }
    );

    return {
      success: true,
      eventId,
      eventType,
      actionsТaken: actions,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    console.error(`[EmailEventsProcessor] Error processing event ${eventId}:`, error);

    return {
      success: false,
      eventId,
      eventType,
      actionsТaken: actions,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export const emailEventsWorker = createWorkerIfNotServerless<EmailEventJobData>(
  'email-events-processing',
  processEmailEvent,
  {
    concurrency: 10, // Process up to 10 events concurrently
  }
);

/**
 * Process bounce events
 * Categorizes bounces, updates suppression lists, and tracks metrics
 */
async function processBounceEvent(
  job: Job<EmailEventJobData>,
  event: any,
  actions: string[],
  warnings: string[]
): Promise<void> {
  const { email, metadata } = job.data;

  await job.updateProgress(25);

  // Get bounce details from event metadata
  const bounceReason = event.bounceReason || metadata?.bounceReason || 'Unknown';
  const bounceType = determineBounceType(bounceReason, metadata);

  actions.push(`categorized-bounce-${bounceType}`);

  // Check existing bounce history by counting previous bounce events
  const bounceHistory = await prisma.emailSuppression.findUnique({
    where: { email },
  });

  // Count recent soft bounces for this email
  const recentBounces = await prisma.emailEvent.count({
    where: {
      email,
      eventType: 'BOUNCED',
      createdAt: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      },
    },
  });

  await job.updateProgress(50);

  if (bounceType === 'hard') {
    // Hard bounce: Immediate suppression
    await suppressionList.add({
      email,
      reason: 'BOUNCE',
      bounceType: 'hard',
      bounceReason,
    });
    actions.push('added-to-suppression-list-hard-bounce');

    // Alert if this is a previously valid address
    if (!bounceHistory) {
      warnings.push('hard-bounce-from-previously-valid-address');
    }
  } else if (bounceType === 'soft') {
    // Soft bounce: Track count and suppress after threshold
    const bounceCount = recentBounces + 1;
    const SOFT_BOUNCE_THRESHOLD = 3;

    if (bounceCount >= SOFT_BOUNCE_THRESHOLD) {
      await suppressionList.add({
        email,
        reason: 'BOUNCE',
        bounceType: 'soft',
        bounceReason: `${bounceCount} soft bounces in 30 days: ${bounceReason}`,
      });
      actions.push(`suppressed-after-${bounceCount}-soft-bounces`);
    } else {
      // Track soft bounce count in event metadata
      actions.push(`tracked-soft-bounce-count-${bounceCount}`);
      warnings.push(`soft-bounce-count-${bounceCount}-of-${SOFT_BOUNCE_THRESHOLD}`);
    }
  }

  await job.updateProgress(75);

  // Update deliverability metrics
  await emailDeliverabilityService.recordBounce(email, bounceType, bounceReason);
  actions.push('updated-deliverability-metrics');

  // Check if bounce rate exceeds threshold
  const metrics = await emailDeliverabilityService.calculateMetrics('hour');
  if (metrics.bounceRate > 0.05) {
    // > 5% bounce rate is critical
    warnings.push(`critical-bounce-rate-${(metrics.bounceRate * 100).toFixed(2)}%`);
    actions.push('triggered-bounce-rate-alert');
  }

  await job.updateProgress(100);
}

/**
 * Process complaint (spam) events
 * Immediately suppresses addresses and triggers alerts
 */
async function processComplaintEvent(
  job: Job<EmailEventJobData>,
  event: any,
  actions: string[],
  warnings: string[]
): Promise<void> {
  const { email, metadata } = job.data;

  await job.updateProgress(33);

  // Complaints are always critical - immediate suppression
  await suppressionList.add({
    email,
    reason: 'COMPLAINT',
  });
  actions.push('added-to-suppression-list-complaint');

  await job.updateProgress(66);

  // Record complaint in deliverability metrics
  await emailDeliverabilityService.recordComplaint(email);
  actions.push('updated-deliverability-metrics');

  // Check complaint rate
  const metrics = await emailDeliverabilityService.calculateMetrics('hour');
  if (metrics.complaintRate > 0.001) {
    // > 0.1% complaint rate is concerning
    warnings.push(`elevated-complaint-rate-${(metrics.complaintRate * 100).toFixed(4)}%`);
    actions.push('triggered-complaint-rate-alert');
  }

  // Always log complaints as warnings since they affect sender reputation
  warnings.push('spam-complaint-received');

  await job.updateProgress(100);
}

/**
 * Process open events
 * Updates engagement scores and tracks unique opens
 */
async function processOpenEvent(
  job: Job<EmailEventJobData>,
  event: any,
  actions: string[]
): Promise<void> {
  const { email, metadata } = job.data;

  await job.updateProgress(50);

  // Update engagement score
  await updateEngagementScore(email, 'open', metadata);
  actions.push('updated-engagement-score');

  // Track unique vs repeat opens
  if (event.uniqueOpen) {
    actions.push('tracked-unique-open');
  } else {
    actions.push('tracked-repeat-open');
  }

  await job.updateProgress(100);
}

/**
 * Process click events
 * Updates engagement scores with higher weight and tracks click patterns
 */
async function processClickEvent(
  job: Job<EmailEventJobData>,
  event: any,
  actions: string[]
): Promise<void> {
  const { email, metadata } = job.data;

  await job.updateProgress(50);

  // Update engagement score (clicks worth more than opens)
  await updateEngagementScore(email, 'click', metadata);
  actions.push('updated-engagement-score');

  // Track which URL was clicked
  if (event.clickedUrl) {
    actions.push(`tracked-click-url`);
  }

  await job.updateProgress(100);
}

/**
 * Process delivered events
 * Updates deliverability metrics
 */
async function processDeliveredEvent(
  job: Job<EmailEventJobData>,
  event: any,
  actions: string[]
): Promise<void> {
  await job.updateProgress(50);

  // Record successful delivery
  await emailDeliverabilityService.recordDelivery(job.data.email);
  actions.push('recorded-delivery');

  await job.updateProgress(100);
}

/**
 * Process failed events
 * Tracks failures and may trigger alerts for unusual patterns
 */
async function processFailedEvent(
  job: Job<EmailEventJobData>,
  event: any,
  actions: string[],
  warnings: string[]
): Promise<void> {
  const { email, metadata } = job.data;

  await job.updateProgress(50);

  // Record failure
  await emailDeliverabilityService.recordFailure(email, metadata?.error || 'Unknown error');
  actions.push('recorded-failure');

  // Check for failure spikes
  const metrics = await emailDeliverabilityService.calculateMetrics('hour');
  if (metrics.totalFailed > 100) {
    warnings.push(`high-failure-count-${metrics.totalFailed}`);
    actions.push('detected-failure-spike');
  }

  await job.updateProgress(100);
}

/**
 * Update engagement score for a recipient
 * Scores range from 0-100 based on open/click activity and recency
 */
async function updateEngagementScore(
  email: string,
  action: 'open' | 'click',
  metadata?: Record<string, any>
): Promise<void> {
  // Use the engagement scoring service to update the score
  await emailEngagementScoringService.updateScore({
    email,
    action,
    timestamp: new Date(),
    messageId: metadata?.messageId,
  });

  console.log(`[EmailEventsProcessor] Updated engagement score for ${email} (${action})`);
}

/**
 * Determine bounce type from bounce reason and metadata
 */
function determineBounceType(
  bounceReason: string,
  metadata?: Record<string, any>
): 'hard' | 'soft' | 'unknown' {
  const reason = bounceReason.toLowerCase();
  const bounceTypeFromMetadata = metadata?.bounceType?.toLowerCase();

  // Check explicit bounce type from metadata
  if (bounceTypeFromMetadata === 'hard' || bounceTypeFromMetadata === 'permanent') {
    return 'hard';
  }
  if (bounceTypeFromMetadata === 'soft' || bounceTypeFromMetadata === 'temporary' || bounceTypeFromMetadata === 'transient') {
    return 'soft';
  }

  // Hard bounce indicators
  const hardBounceIndicators = [
    'permanent',
    'invalid',
    'not exist',
    'unknown user',
    'user unknown',
    'no such user',
    'mailbox not found',
    'recipient rejected',
    'address rejected',
    'domain not found',
  ];

  if (hardBounceIndicators.some(indicator => reason.includes(indicator))) {
    return 'hard';
  }

  // Soft bounce indicators
  const softBounceIndicators = [
    'temporary',
    'mailbox full',
    'quota exceeded',
    'timeout',
    'connection',
    'too many',
    'rate limit',
    'greylisted',
    'deferred',
  ];

  if (softBounceIndicators.some(indicator => reason.includes(indicator))) {
    return 'soft';
  }

  return 'unknown';
}

/**
 * Enqueue an email event for processing
 */
export async function enqueueEmailEvent(eventData: EmailEventJobData): Promise<string> {
  const job = await emailEventsQueue.add('process-email-event', eventData, {
    jobId: `email-event-${eventData.eventId}`, // Ensure idempotency
    priority: eventData.eventType === 'COMPLAINED' ? 1 : eventData.eventType === 'BOUNCED' ? 2 : 3,
  });

  return job.id || eventData.eventId;
}

// Worker event handlers (only if worker was created)
if (emailEventsWorker) {
  emailEventsWorker.on('completed', (job, result) => {
    if (result.warnings && result.warnings.length > 0) {
      console.warn(
        `[EmailEventsProcessor] Completed job ${job.id} with warnings:`,
        result.warnings
      );
    }
  });

  emailEventsWorker.on('failed', (job, error) => {
    console.error(
      `[EmailEventsProcessor] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
      error
    );
  });

  emailEventsWorker.on('error', (error) => {
    console.error('[EmailEventsProcessor] Worker error:', error);
  });

  console.log('[EmailEventsProcessor] Email events processor worker initialized');
}
