import type { Job } from 'bullmq';
import { emailService } from '@/lib/services/email/email.service';

export async function processCampaignEmail(job: Job) {
  const { recipients, subject, template, tags } = job.data;

  job.log(`Starting campaign send for ${recipients.length} recipients`);

  // Send in batches of 100
  const batchSize = 100;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);

    try {
      const result = await emailService.sendCampaign({
        recipients: batch,
        subject,
        template,
        tags,
      });

      sent += batch.length;

      // Update progress
      await job.updateProgress(
        ((i + batch.length) / recipients.length) * 100
      );

      // Rate limiting: wait 1 second between batches
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      failed += batch.length;
      job.log(`Batch ${Math.floor(i / batchSize)} failed: ${error}`);
    }
  }

  job.log(`Campaign complete: ${sent} sent, ${failed} failed`);

  return { sent, failed };
}
