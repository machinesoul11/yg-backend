/**
 * Send Stripe Onboarding Reminder Job
 * Sends reminder emails to creators who haven't completed Stripe onboarding
 * Runs weekly on Mondays at 10 AM
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { CreatorNotificationsService } from '@/modules/creators/services/creator-notifications.service';

export async function processSendOnboardingReminders(job: Job) {
  const notificationsService = new CreatorNotificationsService(prisma);

  job.log('Starting Stripe onboarding reminder process');

  try {
    // Get approved creators with incomplete onboarding (created more than 7 days ago)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const creators = await prisma.creator.findMany({
      where: {
        verificationStatus: 'approved',
        onboardingStatus: { in: ['pending', 'in_progress'] },
        createdAt: { lt: sevenDaysAgo },
        deletedAt: null,
      },
    });

    job.log(`Found ${creators.length} creators to remind`);

    let sentCount = 0;
    let errorCount = 0;

    for (const creator of creators) {
      try {
        await notificationsService.sendStripeOnboardingReminder(creator.id);
        sentCount++;
      } catch (error) {
        errorCount++;
        job.log(`Failed to send reminder to creator ${creator.id}: ${error}`);
      }
    }

    job.log(`Onboarding reminders complete: ${sentCount} sent, ${errorCount} errors`);

    return {
      success: true,
      sent: sentCount,
      errors: errorCount,
    };
  } catch (error) {
    job.log(`Onboarding reminder job failed: ${error}`);
    throw error;
  }
}
