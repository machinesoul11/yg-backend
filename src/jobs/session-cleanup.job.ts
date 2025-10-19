/**
 * Session Cleanup Job
 * Removes expired sessions and enforces inactivity timeouts
 * Runs every 6 hours
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { SessionManagementService } from '@/lib/services/session-management.service';

export async function processSessionCleanup(job: Job) {
  const now = new Date();

  job.log('Starting session cleanup process');

  try {
    const sessionService = new SessionManagementService(prisma);

    // 1. Delete truly expired sessions (past expires date)
    const expiredResult = await prisma.session.deleteMany({
      where: { expires: { lt: now } },
    });
    job.log(`Deleted ${expiredResult.count} expired sessions`);

    // 2. Revoke inactive sessions based on user timeout settings
    const inactiveCount = await sessionService.cleanupAllInactiveSessions();
    job.log(`Revoked ${inactiveCount} inactive sessions`);

    // 3. Delete already revoked sessions older than 30 days (for audit purposes)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const revokedResult = await prisma.session.deleteMany({
      where: {
        revokedAt: {
          not: null,
          lt: thirtyDaysAgo,
        },
      },
    });
    job.log(`Deleted ${revokedResult.count} old revoked sessions`);

    const totalCleaned = expiredResult.count + inactiveCount + revokedResult.count;
    job.log(`Session cleanup complete: ${totalCleaned} total sessions processed`);

    return {
      success: true,
      expired: expiredResult.count,
      inactive: inactiveCount,
      oldRevoked: revokedResult.count,
      total: totalCleaned,
    };
  } catch (error) {
    job.log(`Session cleanup failed: ${error}`);
    throw error;
  }
}
