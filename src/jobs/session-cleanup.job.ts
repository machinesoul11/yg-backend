/**
 * Session Cleanup Job
 * Removes expired sessions from database
 * Runs every 6 hours
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';

export async function processSessionCleanup(job: Job) {
  const now = new Date();

  job.log('Starting session cleanup process');

  try {
    const result = await prisma.session.deleteMany({
      where: { expires: { lt: now } },
    });

    job.log(`Session cleanup complete: ${result.count} sessions deleted`);

    return {
      success: true,
      deleted: result.count,
    };
  } catch (error) {
    job.log(`Session cleanup failed: ${error}`);
    throw error;
  }
}
