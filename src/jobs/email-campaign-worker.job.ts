/**
 * Email Campaign Worker
 * Processes email campaign sends with rate limiting and batching
 */
import { Worker, Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';
import { emailService } from '@/lib/services/email/email.service';

interface CampaignJobData {
  campaignId: string;
}

export const campaignWorker = new Worker<CampaignJobData>(
  'email-campaigns',
  async (job: Job<CampaignJobData>) => {
    const { campaignId } = job.data;

    job.log(`Starting campaign send: ${campaignId}`);

    // Get campaign
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    // Update status to SENDING
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENDING',
        sendStartedAt: new Date(),
      },
    });

    try {
      // Get all pending recipients
      const recipients = await prisma.campaignRecipient.findMany({
        where: {
          campaignId,
          status: 'PENDING',
        },
        select: {
          id: true,
          email: true,
          userId: true,
          personalizationData: true,
        },
      });

      job.log(`Found ${recipients.length} pending recipients`);

      const batchSize = campaign.batchSize;
      const messagesPerHour = campaign.messagesPerHour;
      
      // Calculate delay between batches to maintain rate limit
      const batchesPerHour = Math.ceil(messagesPerHour / batchSize);
      const delayBetweenBatches = (3600 * 1000) / batchesPerHour;

      let sentCount = 0;
      let failedCount = 0;

      // Process in batches
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);

        job.log(`Processing batch ${Math.floor(i / batchSize) + 1}`);

        // Mark batch as queued
        await prisma.campaignRecipient.updateMany({
          where: {
            id: { in: batch.map((r) => r.id) },
          },
          data: { status: 'QUEUED' },
        });

        // Send emails in parallel within batch
        const results = await Promise.allSettled(
          batch.map(async (recipient) => {
            try {
              // Send email
              const result = await emailService.sendTransactional({
                userId: recipient.userId || undefined,
                email: recipient.email,
                subject: campaign.subject,
                template: campaign.templateId as any,
                variables: {
                  ...(recipient.personalizationData as any),
                },
                tags: {
                  campaignId: campaign.id,
                  campaignName: campaign.name,
                },
              });

              if (result.success) {
                // Update recipient status
                await prisma.campaignRecipient.update({
                  where: { id: recipient.id },
                  data: {
                    status: 'SENT',
                    sentAt: new Date(),
                    messageId: result.messageId,
                  },
                });
                return { success: true };
              } else {
                throw new Error(result.error || 'Unknown error');
              }
            } catch (error) {
              // Update recipient with error
              await prisma.campaignRecipient.update({
                where: { id: recipient.id },
                data: {
                  status: 'FAILED',
                  errorMessage: error instanceof Error ? error.message : 'Unknown error',
                  retryCount: { increment: 1 },
                },
              });
              return { success: false };
            }
          })
        );

        // Count successes and failures
        const batchSent = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
        const batchFailed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

        sentCount += batchSent;
        failedCount += batchFailed;

        // Update campaign stats
        await prisma.emailCampaign.update({
          where: { id: campaignId },
          data: {
            sentCount: { increment: batchSent },
            failedCount: { increment: batchFailed },
          },
        });

        // Update progress
        await job.updateProgress((i + batch.length) / recipients.length * 100);

        // Rate limiting delay between batches
        if (i + batchSize < recipients.length) {
          job.log(`Waiting ${delayBetweenBatches}ms before next batch`);
          await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
        }
      }

      // Mark campaign as completed
      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: {
          status: 'COMPLETED',
          sendCompletedAt: new Date(),
        },
      });

      job.log(`Campaign completed: ${sentCount} sent, ${failedCount} failed`);

      return { sentCount, failedCount };
    } catch (error) {
      // Mark campaign as failed
      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: {
          status: 'FAILED',
        },
      });

      job.log(`Campaign failed: ${error}`);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1, // Process one campaign at a time
    removeOnComplete: { age: 24 * 3600, count: 100 },
    removeOnFail: { age: 7 * 24 * 3600 },
  }
);

campaignWorker.on('completed', (job) => {
  console.log(`Campaign job completed: ${job.id}`);
});

campaignWorker.on('failed', (job, error) => {
  console.error(`Campaign job failed: ${job?.id}`, error);
});

campaignWorker.on('error', (error) => {
  console.error('Campaign worker error:', error);
});
