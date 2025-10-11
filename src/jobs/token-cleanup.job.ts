/**
 * Token Cleanup Job
 * Removes expired verification tokens and password reset tokens
 * Runs every hour
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';

export async function processTokenCleanup(job: Job) {
  const now = new Date();
  
  job.log('Starting token cleanup process');

  try {
    // Delete expired verification tokens
    const verificationResult = await prisma.verificationToken.deleteMany({
      where: { expires: { lt: now } },
    });
    job.log(`Deleted ${verificationResult.count} expired verification tokens`);

    // Delete expired password reset tokens
    const passwordResetResult = await prisma.passwordResetToken.deleteMany({
      where: { expires: { lt: now } },
    });
    job.log(`Deleted ${passwordResetResult.count} expired password reset tokens`);

    // Delete used reset tokens older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const usedTokensResult = await prisma.passwordResetToken.deleteMany({
      where: {
        usedAt: { not: null, lt: sevenDaysAgo },
      },
    });
    job.log(`Deleted ${usedTokensResult.count} old used password reset tokens`);

    const totalDeleted =
      verificationResult.count +
      passwordResetResult.count +
      usedTokensResult.count;

    job.log(`Token cleanup complete: ${totalDeleted} tokens deleted`);

    return {
      success: true,
      deleted: {
        verificationTokens: verificationResult.count,
        expiredResetTokens: passwordResetResult.count,
        usedResetTokens: usedTokensResult.count,
        total: totalDeleted,
      },
    };
  } catch (error) {
    job.log(`Token cleanup failed: ${error}`);
    throw error;
  }
}
