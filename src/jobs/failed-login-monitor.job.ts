/**
 * Failed Login Monitoring Job
 * Detects and alerts on suspicious login patterns
 * Runs every 15 minutes
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';

export async function processFailedLoginMonitoring(job: Job) {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  job.log('Starting failed login monitoring');

  try {
    // Find emails with excessive failed attempts
    const failedAttempts = await prisma.auditEvent.groupBy({
      by: ['email'],
      where: {
        action: 'LOGIN_FAILED',
        timestamp: { gte: fifteenMinutesAgo },
        email: { not: null },
      },
      having: {
        email: {
          _count: {
            gt: 10,
          },
        },
      },
      _count: {
        email: true,
      },
    });

    let alertsGenerated = 0;

    for (const attempt of failedAttempts) {
      if (!attempt.email) continue;

      // In production, this would:
      // 1. Send alert to security team
      // 2. Potentially lock the account
      // 3. Log to security monitoring system
      
      job.log(
        `⚠️  SECURITY ALERT: ${attempt._count.email} failed login attempts for ${attempt.email} in last 15 minutes`
      );

      // Lock account if too many attempts
      if (attempt._count.email >= 15) {
        await prisma.user.updateMany({
          where: { email: attempt.email },
          data: { isActive: false },
        });

        job.log(`🔒 Account locked for ${attempt.email}`);
      }

      alertsGenerated++;
    }

    job.log(
      `Failed login monitoring complete: ${alertsGenerated} alerts generated`
    );

    return {
      success: true,
      alerts: alertsGenerated,
      suspiciousEmails: failedAttempts.map((a) => a.email).filter(Boolean),
    };
  } catch (error) {
    job.log(`Failed login monitoring failed: ${error}`);
    throw error;
  }
}
