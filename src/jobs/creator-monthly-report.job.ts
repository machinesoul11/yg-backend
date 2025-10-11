/**
 * Send Monthly Performance Report Job
 * Sends monthly performance reports to all active creators
 * Runs on the 1st of every month at 9 AM
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { CreatorNotificationsService } from '@/modules/creators/services/creator-notifications.service';

export async function processSendMonthlyReports(job: Job) {
  const notificationsService = new CreatorNotificationsService(prisma);

  job.log('Starting monthly performance report process');

  try {
    // Get all approved creators
    const creators = await prisma.creator.findMany({
      where: {
        verificationStatus: 'approved',
        deletedAt: null,
      },
    });

    job.log(`Found ${creators.length} creators for monthly reports`);

    // Get previous month details
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthName = lastMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

    let sentCount = 0;
    let errorCount = 0;

    for (const creator of creators) {
      try {
        // TODO: Implement actual metrics calculation when royalties module is ready
        const metrics = {
          monthName,
          earningsCents: 0,
          newLicenses: 0,
          profileViews: 0,
          totalActiveLicenses: 0,
        };

        await notificationsService.sendMonthlyPerformanceReport(creator.id, metrics);
        sentCount++;
      } catch (error) {
        errorCount++;
        job.log(`Failed to send report to creator ${creator.id}: ${error}`);
      }
    }

    job.log(`Monthly reports complete: ${sentCount} sent, ${errorCount} errors`);

    return {
      success: true,
      sent: sentCount,
      errors: errorCount,
    };
  } catch (error) {
    job.log(`Monthly report job failed: ${error}`);
    throw error;
  }
}
