/**
 * Update Creator Performance Metrics Job
 * Aggregates earnings, licenses, and ratings for all creators
 * Runs daily at 3 AM
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { CreatorService } from '@/modules/creators/services/creator.service';
import { AuditService } from '@/lib/services/audit.service';

export async function processUpdatePerformanceMetrics(job: Job) {
  const auditService = new AuditService(prisma);
  const creatorService = new CreatorService(prisma, auditService);

  job.log('Starting performance metrics update');

  try {
    // Get all active creators
    const creators = await prisma.creator.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    job.log(`Found ${creators.length} creators to update`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const creator of creators) {
      try {
        await creatorService.updatePerformanceMetrics(creator.id);
        updatedCount++;
      } catch (error) {
        errorCount++;
        job.log(`Failed to update metrics for creator ${creator.id}: ${error}`);
      }
    }

    job.log(`Performance metrics update complete: ${updatedCount} updated, ${errorCount} errors`);

    return {
      success: true,
      updated: updatedCount,
      errors: errorCount,
    };
  } catch (error) {
    job.log(`Performance metrics job failed: ${error}`);
    throw error;
  }
}
