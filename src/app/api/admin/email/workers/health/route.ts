/**
 * Email Workers Health Check Endpoint
 * 
 * Provides health status for all email background workers.
 * This is an admin-only endpoint for monitoring email infrastructure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEmailWorkersHealth } from '@/jobs/email-workers';
import { scheduledEmailQueue } from '@/lib/services/email/scheduling.service';
import { emailRetryQueue } from '@/lib/services/email/retry.service';

export async function GET(req: NextRequest) {
  try {
    // Get worker health status
    const workersHealth = await getEmailWorkersHealth();

    // Get queue stats
    const [scheduledStats, retryStats] = await Promise.all([
      scheduledEmailQueue.getJobCounts(),
      emailRetryQueue.getJobCounts(),
    ]);

    return NextResponse.json({
      status: workersHealth.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      workers: workersHealth.workers,
      queues: {
        scheduledEmails: {
          waiting: scheduledStats.waiting,
          active: scheduledStats.active,
          completed: scheduledStats.completed,
          failed: scheduledStats.failed,
          delayed: scheduledStats.delayed,
        },
        emailRetry: {
          waiting: retryStats.waiting,
          active: retryStats.active,
          completed: retryStats.completed,
          failed: retryStats.failed,
          delayed: retryStats.delayed,
        },
      },
    });
  } catch (error) {
    console.error('[EmailWorkersHealth] Error checking health:', error);
    
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
