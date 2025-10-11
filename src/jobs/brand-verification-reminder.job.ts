/**
 * Brand Verification Reminder Job
 * Reminds admins about pending brand verifications
 * Schedule: Daily at 9 AM
 */

import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email/email.service';

const emailService = new EmailService();

export async function brandVerificationReminderJob() {
  try {
    console.log('[Job] Running brand verification reminder job');

    // Find brands pending verification for more than 24 hours
    const pendingBrands = await (prisma.brand as any).findMany({
      where: {
        verificationStatus: 'pending',
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
        deletedAt: null,
      },
      include: { user: true },
      take: 50, // Limit to prevent email spam
    });

    if (pendingBrands.length === 0) {
      console.log('[Job] No pending brands found');
      return;
    }

    console.log(`[Job] Found ${pendingBrands.length} pending brands`);

    // Send summary email to admin
    await emailService.sendTransactional({
      email: process.env.ADMIN_EMAIL || 'admin@yesgoddess.com',
      subject: `${pendingBrands.length} Brands Awaiting Verification`,
      template: 'welcome', // TODO: Create admin-verification-reminder template
      variables: {
        count: pendingBrands.length,
        brands: pendingBrands.map((b: any) => ({
          id: b.id,
          companyName: b.companyName,
          createdAt: b.createdAt,
          verifyUrl: `${process.env.NEXT_PUBLIC_ADMIN_URL || process.env.NEXT_PUBLIC_APP_URL}/admin/brands/${b.id}/verify`,
        })),
      },
    });

    console.log('[Job] Brand verification reminder email sent');
  } catch (error) {
    console.error('[Job] Brand verification reminder job failed:', error);
    throw error;
  }
}

// Export for scheduler
export const brandVerificationReminderJobConfig = {
  name: 'brand-verification-reminder',
  schedule: '0 9 * * *', // Daily at 9 AM
  handler: brandVerificationReminderJob,
};
