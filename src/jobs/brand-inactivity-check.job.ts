/**
 * Brand Inactivity Check Job
 * Identifies and flags brands with no activity in 90 days
 * Schedule: Weekly on Mondays
 */

import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email/email.service';

const emailService = new EmailService();

export async function brandInactivityCheckJob() {
  try {
    console.log('[Job] Running brand inactivity check job');

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Find verified brands created more than 90 days ago
    const brands = await (prisma.brand as any).findMany({
      where: {
        verificationStatus: 'verified',
        deletedAt: null,
        createdAt: {
          lte: ninetyDaysAgo,
        },
      },
      // TODO: Add projects relation when Project model exists
      // include: {
      //   projects: {
      //     where: {
      //       createdAt: { gte: ninetyDaysAgo }
      //     },
      //     take: 1
      //   }
      // }
    });

    console.log(`[Job] Checking ${brands.length} brands for inactivity`);

    // TODO: When Project model exists, filter brands with no recent projects
    // const inactiveBrands = brands.filter((b: any) => b.projects.length === 0);

    // For now, send re-engagement emails to all old brands
    let emailsSent = 0;
    for (const brand of brands) {
      const contactEmail = (brand as any).contactInfo?.primaryContact?.email;
      if (contactEmail) {
        try {
          await emailService.sendTransactional({
            userId: (brand as any).userId,
            email: contactEmail,
            subject: 'We Miss You on YES GODDESS',
            template: 'welcome', // TODO: Create brand-reengagement template
            variables: {
              brandName: (brand as any).companyName,
              ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/projects/new`,
            },
          });
          emailsSent++;
        } catch (error) {
          console.error(`[Job] Failed to send reengagement email to ${contactEmail}:`, error);
        }
      }
    }

    console.log(`[Job] Sent ${emailsSent} re-engagement emails`);
  } catch (error) {
    console.error('[Job] Brand inactivity check job failed:', error);
    throw error;
  }
}

// Export for scheduler
export const brandInactivityCheckJobConfig = {
  name: 'brand-inactivity-check',
  schedule: '0 0 * * 1', // Weekly on Mondays at midnight
  handler: brandInactivityCheckJob,
};
