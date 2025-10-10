import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { emailService } from '@/lib/services/email/email.service';

export async function sendDigestEmails(job: Job) {
  const { frequency } = job.data; // 'DAILY' or 'WEEKLY'

  try {
    // Find all users who want digests at this frequency
    // Note: This will work once the Prisma schema is migrated
    const users = await prisma.user.findMany({
      // where: {
      //   emailPreferences: {
      //     digestFrequency: frequency,
      //     unsubscribedAt: null,
      //   },
      // },
      // include: {
      //   emailPreferences: true,
      // },
    });

    job.log(`Sending ${frequency} digest to ${users.length} users`);

    for (const user of users) {
      try {
        await emailService.sendDigest({
          userId: user.id,
          email: user.email,
          frequency,
        });
      } catch (error) {
        job.log(
          `Failed to send digest to ${user.email}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return { sent: users.length };
  } catch (error) {
    job.log(`Digest job failed: ${error}`);
    throw error;
  }
}
