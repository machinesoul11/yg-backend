/**
 * Step-Up Token Cleanup Job
 * Removes expired step-up authentication tokens
 * Runs every hour
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { StepUpAuthService } from '@/lib/services/step-up-auth.service';
import { AuditService } from '@/lib/services/audit.service';

export async function processStepUpTokenCleanup(job: Job) {
  job.log('Starting step-up token cleanup process');

  try {
    const auditService = new AuditService(prisma);
    const stepUpService = new StepUpAuthService(prisma, auditService);

    const deletedCount = await stepUpService.cleanupExpiredTokens();

    job.log(`Step-up token cleanup complete: ${deletedCount} tokens deleted`);

    return {
      success: true,
      deleted: deletedCount,
    };
  } catch (error) {
    job.log(`Step-up token cleanup failed: ${error}`);
    throw error;
  }
}
