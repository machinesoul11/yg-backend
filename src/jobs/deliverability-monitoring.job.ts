/**
 * Email Deliverability Monitoring Job
 * 
 * Scheduled job that runs hourly to:
 * - Calculate deliverability metrics (delivery rate, bounce rate, complaint rate)
 * - Check against thresholds
 * - Generate alerts for administrators
 * - Track trends and anomalies
 * 
 * Alert Thresholds:
 * - Delivery Rate: Warning <95%, Critical <90%
 * - Bounce Rate: Warning >2%, Critical >5%
 * - Complaint Rate: Warning >0.1%, Critical >0.3%
 * - Failure Spike: >100 failures in an hour
 */

import { Queue, Worker, type Job } from 'bullmq';
import { redis } from '@/lib/redis';
import { emailDeliverabilityService } from '@/lib/services/email/deliverability.service';

export interface DeliverabilityMonitoringJobData {
  period: 'hour' | 'day';
  includeAlerts: boolean;
}

export const deliverabilityMonitoringQueue = new Queue<DeliverabilityMonitoringJobData>(
  'deliverability-monitoring',
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

export const deliverabilityMonitoringWorker = new Worker<DeliverabilityMonitoringJobData>(
  'deliverability-monitoring',
  async (job: Job<DeliverabilityMonitoringJobData>) => {
    const { period, includeAlerts } = job.data;

    console.log(`[DeliverabilityMonitoring] Starting ${period} monitoring check`);

    try {
      // Calculate current metrics
      await job.updateProgress(20);
      const metrics = await emailDeliverabilityService.calculateMetrics(period);

      console.log(`[DeliverabilityMonitoring] Metrics for ${period}:`, {
        totalSent: metrics.totalSent,
        deliveryRate: (metrics.deliveryRate * 100).toFixed(2) + '%',
        bounceRate: (metrics.bounceRate * 100).toFixed(2) + '%',
        complaintRate: (metrics.complaintRate * 100).toFixed(4) + '%',
      });

      // Monitor and generate alerts if enabled
      if (includeAlerts) {
        await job.updateProgress(60);
        const alerts = await emailDeliverabilityService.monitorAndAlert();

        if (alerts.length > 0) {
          console.warn(
            `[DeliverabilityMonitoring] Generated ${alerts.length} alert(s):`,
            alerts.map(a => `${a.severity}: ${a.message}`)
          );
        } else {
          console.log(`[DeliverabilityMonitoring] No alerts triggered`);
        }
      }

      // Get domain-level metrics
      await job.updateProgress(80);
      const domainMetrics = await emailDeliverabilityService.getMetricsByDomain(period);
      
      const problematicDomains = domainMetrics.filter(d => d.issues.length > 0);
      if (problematicDomains.length > 0) {
        console.warn(
          `[DeliverabilityMonitoring] ${problematicDomains.length} domain(s) with issues:`,
          problematicDomains.map(d => ({ domain: d.domain, issues: d.issues }))
        );
      }

      await job.updateProgress(100);
      console.log(`[DeliverabilityMonitoring] Completed ${period} monitoring check`);

      return {
        success: true,
        period,
        metrics: {
          totalSent: metrics.totalSent,
          deliveryRate: metrics.deliveryRate,
          bounceRate: metrics.bounceRate,
          complaintRate: metrics.complaintRate,
        },
        alertsGenerated: includeAlerts ? true : false,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error(`[DeliverabilityMonitoring] Error during ${period} check:`, error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1, // Run one at a time
  }
);

/**
 * Schedule hourly deliverability monitoring
 */
export async function scheduleDeliverabilityMonitoring(): Promise<void> {
  // Run hourly monitoring every hour at :05 past the hour
  await deliverabilityMonitoringQueue.add(
    'hourly-deliverability-check',
    {
      period: 'hour',
      includeAlerts: true,
    },
    {
      repeat: {
        pattern: '5 * * * *', // Every hour at :05
      },
      jobId: 'hourly-deliverability-monitoring',
    }
  );

  console.log('[DeliverabilityMonitoring] Scheduled hourly monitoring at :05 past every hour');

  // Run daily monitoring every day at 3 AM
  await deliverabilityMonitoringQueue.add(
    'daily-deliverability-check',
    {
      period: 'day',
      includeAlerts: true,
    },
    {
      repeat: {
        pattern: '0 3 * * *', // 3 AM daily
      },
      jobId: 'daily-deliverability-monitoring',
    }
  );

  console.log('[DeliverabilityMonitoring] Scheduled daily monitoring at 3 AM');
}

/**
 * Run deliverability check on-demand
 */
export async function checkDeliverabilityNow(period: 'hour' | 'day' = 'hour'): Promise<void> {
  await deliverabilityMonitoringQueue.add(
    'on-demand-deliverability-check',
    {
      period,
      includeAlerts: false, // Don't send alerts for manual checks
    }
  );

  console.log(`[DeliverabilityMonitoring] On-demand ${period} check queued`);
}

// Handle worker events
deliverabilityMonitoringWorker.on('completed', (job) => {
  console.log(`[DeliverabilityMonitoring] Job ${job.id} completed`);
});

deliverabilityMonitoringWorker.on('failed', (job, err) => {
  console.error(`[DeliverabilityMonitoring] Job ${job?.id} failed:`, err.message);
});

deliverabilityMonitoringWorker.on('error', (err) => {
  console.error('[DeliverabilityMonitoring] Worker error:', err);
});
