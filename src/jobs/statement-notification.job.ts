/**
 * Statement Notification Job
 * Sends emails to creators when royalty statements are ready
 */

import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';;
import { EmailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { RoyaltyStatementService } from '@/modules/royalties/services/royalty-statement.service';
import type { StatementNotificationJobData } from '@/modules/royalties/types';

const emailService = new EmailService();
const auditService = new AuditService(prisma);

export const statementNotificationQueue = new Queue<StatementNotificationJobData>(
  'statement-notification',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
);

export const statementNotificationWorker = new Worker<StatementNotificationJobData>(
  'statement-notification',
  async (job: Job<StatementNotificationJobData>) => {
    const { runId } = job.data;

    console.log(`[Job] Starting statement notifications for run ${runId}`);

    // Fetch all statements for this run
    const statements = await prisma.royaltyStatement.findMany({
      where: { royaltyRunId: runId },
      include: {
        creator: {
          include: { user: true },
        },
      },
    });

    console.log(`[Job] Found ${statements.length} statements to notify`);

    const statementService = new RoyaltyStatementService(
      prisma,
      redis,
      emailService,
      auditService
    );

    let successCount = 0;
    let failureCount = 0;

    // Send emails in batches of 10
    for (let i = 0; i < statements.length; i += 10) {
      const batch = statements.slice(i, i + 10);

      await Promise.allSettled(
        batch.map(async (statement) => {
          try {
            await statementService.notifyStatementReady(statement.id);
            successCount++;
          } catch (error) {
            console.error(
              `[Job] Failed to notify statement ${statement.id}:`,
              error
            );
            failureCount++;
          }
        })
      );

      // Update progress
      await job.updateProgress((i / statements.length) * 100);

      // Rate limit: wait 1 second between batches
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(
      `[Job] Statement notifications completed: ${successCount} success, ${failureCount} failed`
    );

    return { success: true, notified: successCount, failed: failureCount };
  },
  {
    connection: redisConnection,
    concurrency: 1, // Sequential processing
  }
);

// Event listeners
statementNotificationWorker.on('completed', (job) => {
  console.log(
    `[Job] Statement notification job ${job.id} completed successfully`
  );
});

statementNotificationWorker.on('failed', (job, err) => {
  console.error(`[Job] Statement notification job ${job?.id} failed:`, err);
});

statementNotificationWorker.on('error', (err) => {
  console.error('[Job] Statement notification worker error:', err);
});
