/**
 * Email Reputation Monitoring Job
 * 
 * Scheduled job that runs daily to:
 * - Calculate sender reputation metrics
 * - Check blacklist status
 * - Validate authentication records (SPF, DKIM, DMARC)
 * - Send alerts if reputation drops below thresholds
 */

import { Queue, Worker, type Job } from 'bullmq';
import { redis } from '@/lib/redis';
import { emailReputationService } from '@/lib/services/email/reputation.service';

const SENDER_DOMAIN = process.env.RESEND_SENDER_DOMAIN || 'yesgoddess.com';

export interface ReputationMonitoringJobData {
  domain: string;
  checks: ('metrics' | 'blacklist' | 'authentication')[];
}

export const reputationMonitoringQueue = new Queue<ReputationMonitoringJobData>(
  'reputation-monitoring',
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1 minute
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
);

export const reputationMonitoringWorker = new Worker<ReputationMonitoringJobData>(
  'reputation-monitoring',
  async (job: Job<ReputationMonitoringJobData>) => {
    const { domain, checks } = job.data;

    console.log(`[ReputationMonitoring] Starting checks for ${domain}`);

    try {
      // Calculate reputation metrics
      if (checks.includes('metrics')) {
        await job.updateProgress(10);
        await emailReputationService.calculateReputationMetrics(domain);
        console.log(`[ReputationMonitoring] Metrics calculated for ${domain}`);
      }

      // Check blacklists
      if (checks.includes('blacklist')) {
        await job.updateProgress(50);
        const blacklistStatus = await emailReputationService.checkBlacklists(domain);
        
        if (blacklistStatus.listed) {
          console.warn(`[ReputationMonitoring] ⚠️ Domain ${domain} is blacklisted on:`, blacklistStatus.blacklists);
        } else {
          console.log(`[ReputationMonitoring] ✓ Domain ${domain} is not blacklisted`);
        }
      }

      // Validate authentication records
      if (checks.includes('authentication')) {
        await job.updateProgress(80);
        const authStatus = await emailReputationService.validateAuthenticationRecords(domain);
        
        const issues: string[] = [];
        if (!authStatus.spf.valid) issues.push('SPF');
        if (!authStatus.dkim.valid) issues.push('DKIM');
        if (!authStatus.dmarc.valid) issues.push('DMARC');
        
        if (issues.length > 0) {
          console.warn(`[ReputationMonitoring] ⚠️ Authentication issues for ${domain}:`, issues);
        } else {
          console.log(`[ReputationMonitoring] ✓ All authentication records valid for ${domain}`);
        }
      }

      await job.updateProgress(100);
      console.log(`[ReputationMonitoring] Completed checks for ${domain}`);

      return {
        success: true,
        domain,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error(`[ReputationMonitoring] Error checking ${domain}:`, error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1, // Run one at a time
  }
);

/**
 * Schedule daily reputation monitoring
 */
export async function scheduleReputationMonitoring(): Promise<void> {
  // Run daily at 2 AM
  await reputationMonitoringQueue.add(
    'daily-reputation-check',
    {
      domain: SENDER_DOMAIN,
      checks: ['metrics', 'blacklist', 'authentication'],
    },
    {
      repeat: {
        pattern: '0 2 * * *', // 2 AM daily
      },
      jobId: 'daily-reputation-monitoring',
    }
  );

  console.log('[ReputationMonitoring] Scheduled daily monitoring at 2 AM');
}

/**
 * Run reputation check on-demand
 */
export async function checkReputationNow(domain?: string): Promise<void> {
  await reputationMonitoringQueue.add(
    'on-demand-reputation-check',
    {
      domain: domain || SENDER_DOMAIN,
      checks: ['metrics', 'blacklist', 'authentication'],
    }
  );

  console.log('[ReputationMonitoring] On-demand check queued');
}

// Handle worker events
reputationMonitoringWorker.on('completed', (job) => {
  console.log(`[ReputationMonitoring] Job ${job.id} completed`);
});

reputationMonitoringWorker.on('failed', (job, err) => {
  console.error(`[ReputationMonitoring] Job ${job?.id} failed:`, err.message);
});
