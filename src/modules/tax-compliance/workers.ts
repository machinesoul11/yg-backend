/**
 * Tax Compliance Background Job Workers
 * BullMQ workers for processing tax-related background jobs
 */

import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/db/redis';

// Import services
import { TaxDocumentService } from '../services/tax-document.service';
import { PaymentThresholdService } from '../services/payment-threshold.service';
import { TaxFormJobService } from '../services/tax-form-job.service';
import { TaxFormPDFGenerator } from '../services/tax-form-pdf-generator.service';

// Initialize services
const taxDocumentService = new TaxDocumentService(prisma, redis);
const paymentThresholdService = new PaymentThresholdService(prisma, redis);
const pdfGenerator = new TaxFormPDFGenerator(prisma);
const taxFormJobService = new TaxFormJobService(
  prisma,
  redis,
  taxDocumentService,
  paymentThresholdService,
  pdfGenerator
);

// Job types and interfaces
export interface TaxFormJobData {
  jobId: string;
  taxYear: number;
  jobType: 'YEAR_END_GENERATION' | 'THRESHOLD_CHECK' | 'RENEWAL_REMINDER';
  metadata?: Record<string, any>;
  triggeredBy: string;
}

export interface TaxDocumentGenerationJobData {
  documentId: string;
  retryCount?: number;
}

export interface ThresholdNotificationJobData {
  creatorId: string;
  taxYear: number;
  thresholdType: string;
  currentAmount: number;
  thresholdAmount: number;
}

// Queue names
const TAX_FORM_QUEUE = 'tax-form-processing';
const TAX_DOCUMENT_GENERATION_QUEUE = 'tax-document-generation';
const THRESHOLD_NOTIFICATION_QUEUE = 'threshold-notifications';

// Create queues
export const taxFormQueue = new Queue(TAX_FORM_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export const taxDocumentGenerationQueue = new Queue(TAX_DOCUMENT_GENERATION_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 25,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const thresholdNotificationQueue = new Queue(THRESHOLD_NOTIFICATION_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  },
});

// ============================================================================
// Tax Form Processing Worker
// ============================================================================

export const taxFormWorker = new Worker(
  TAX_FORM_QUEUE,
  async (job: Job<TaxFormJobData>) => {
    const { jobId, jobType } = job.data;
    
    console.log(`[TaxFormWorker] Processing ${jobType} job ${jobId}`, {
      jobId,
      jobType,
      data: job.data,
    });

    try {
      // Update job status to processing
      await taxFormJobService.updateJobStatus(jobId, 'PROCESSING');

      switch (jobType) {
        case 'YEAR_END_GENERATION':
          await taxFormJobService.processYearEndGeneration(jobId);
          break;
        
        case 'THRESHOLD_CHECK':
          await taxFormJobService.processThresholdCheck(jobId);
          break;
        
        case 'RENEWAL_REMINDER':
          await taxFormJobService.processRenewalReminder(jobId);
          break;
        
        default:
          throw new Error(`Unknown job type: ${jobType}`);
      }

      // Update job status to completed
      await taxFormJobService.updateJobStatus(jobId, 'COMPLETED');
      
      console.log(`[TaxFormWorker] Successfully processed ${jobType} job ${jobId}`);
      
      return { success: true, jobId, jobType };
    } catch (error) {
      console.error(`[TaxFormWorker] Failed to process ${jobType} job ${jobId}`, {
        jobId,
        jobType,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Update job status to failed
      await taxFormJobService.updateJobStatus(jobId, 'FAILED', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

// ============================================================================
// Tax Document Generation Worker
// ============================================================================

export const taxDocumentGenerationWorker = new Worker(
  TAX_DOCUMENT_GENERATION_QUEUE,
  async (job: Job<TaxDocumentGenerationJobData>) => {
    const { documentId, retryCount = 0 } = job.data;
    
    console.log(`[TaxDocumentGenerationWorker] Generating PDF for document ${documentId}`, {
      documentId,
      retryCount,
    });

    try {
      // Get the tax document
      const document = await taxDocumentService.getTaxDocumentById(documentId);
      if (!document) {
        throw new Error(`Tax document not found: ${documentId}`);
      }

      // Generate the appropriate tax form PDF
      let pdfResult;
      
      if (document.documentType === 'FORM_1099_NEC' || document.documentType === 'FORM_1099_MISC') {
        const form1099Data = await taxDocumentService.generateForm1099Data(
          document.creatorId,
          document.taxYear
        );
        
        if (document.documentType === 'FORM_1099_NEC') {
          pdfResult = await pdfGenerator.generateForm1099NEC(form1099Data);
        } else {
          pdfResult = await pdfGenerator.generateForm1099MISC(form1099Data);
        }
      } else {
        throw new Error(`Unsupported document type for PDF generation: ${document.documentType}`);
      }

      // Update document with PDF info
      await taxDocumentService.updateTaxDocument({
        id: documentId,
        pdfStorageKey: pdfResult.storageKey,
        pdfGeneratedAt: new Date(),
        filingStatus: 'GENERATED' as any, // TODO: Use proper enum once migrated
      });

      console.log(`[TaxDocumentGenerationWorker] Successfully generated PDF for document ${documentId}`, {
        documentId,
        storageKey: pdfResult.storageKey,
        fileSize: pdfResult.metadata.fileSize,
      });

      return {
        success: true,
        documentId,
        storageKey: pdfResult.storageKey,
        fileSize: pdfResult.metadata.fileSize,
      };
    } catch (error) {
      console.error(`[TaxDocumentGenerationWorker] Failed to generate PDF for document ${documentId}`, {
        documentId,
        retryCount,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // If this is the final retry, mark document as failed
      if (retryCount >= 4) {
        await taxDocumentService.updateTaxDocument({
          id: documentId,
          filingStatus: 'FAILED' as any,
        });
      }

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

// ============================================================================
// Threshold Notification Worker
// ============================================================================

export const thresholdNotificationWorker = new Worker(
  THRESHOLD_NOTIFICATION_QUEUE,
  async (job: Job<ThresholdNotificationJobData>) => {
    const { creatorId, taxYear, thresholdType, currentAmount, thresholdAmount } = job.data;
    
    console.log(`[ThresholdNotificationWorker] Sending threshold notification`, {
      creatorId,
      taxYear,
      thresholdType,
      currentAmount,
      thresholdAmount,
    });

    try {
      // Get creator details
      const creator = await prisma.creator.findUnique({
        where: { id: creatorId },
        include: { user: true },
      });

      if (!creator || !creator.user) {
        throw new Error(`Creator not found: ${creatorId}`);
      }

      // Calculate percentage reached
      const percentageReached = Math.round((currentAmount / thresholdAmount) * 100);
      
      // Determine notification type and content
      let subject: string;
      let templateType: string;
      
      if (percentageReached >= 100) {
        subject = `Tax Reporting Required - ${taxYear} Payment Threshold Reached`;
        templateType = 'threshold-reached';
      } else if (percentageReached >= 90) {
        subject = `Tax Reporting Alert - Approaching ${taxYear} Payment Threshold`;
        templateType = 'threshold-warning';
      } else {
        subject = `Tax Reporting Update - ${taxYear} Payment Threshold Progress`;
        templateType = 'threshold-update';
      }

      // TODO: Integrate with email service once available
      // For now, just log the notification
      console.log(`[ThresholdNotificationWorker] Would send email notification`, {
        to: creator.user.email,
        subject,
        templateType,
        templateData: {
          creatorName: creator.user.name || creator.user.email,
          taxYear,
          thresholdType,
          currentAmount: currentAmount.toFixed(2),
          thresholdAmount: thresholdAmount.toFixed(2),
          percentageReached,
        },
      });

      // Create notification record
      await prisma.notification.create({
        data: {
          userId: creator.user.id,
          type: 'SYSTEM', // Using existing notification type instead of TAX_THRESHOLD
          title: subject,
          message: `Your ${taxYear} payments have reached ${percentageReached}% of the tax reporting threshold (${currentAmount.toFixed(2)} of ${thresholdAmount.toFixed(2)}).`,
          metadata: {
            taxYear,
            thresholdType,
            currentAmount,
            thresholdAmount,
            percentageReached,
          },
        },
      });

      console.log(`[ThresholdNotificationWorker] Successfully sent threshold notification`, {
        creatorId,
        taxYear,
        percentageReached,
      });

      return {
        success: true,
        creatorId,
        taxYear,
        notificationType: templateType,
        percentageReached,
      };
    } catch (error) {
      console.error(`[ThresholdNotificationWorker] Failed to send threshold notification`, {
        creatorId,
        taxYear,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 10,
  }
);

// ============================================================================
// Job Queue Utilities
// ============================================================================

/**
 * Add a tax form processing job to the queue
 */
export async function queueTaxFormJob(data: TaxFormJobData, options?: any) {
  console.log(`[TaxQueue] Adding ${data.jobType} job to queue`, { 
    jobId: data.jobId,
    taxYear: data.taxYear,
  });

  return await taxFormQueue.add(
    `${data.jobType}-${data.taxYear}`,
    data,
    {
      priority: data.jobType === 'YEAR_END_GENERATION' ? 1 : 5,
      delay: data.jobType === 'YEAR_END_GENERATION' ? 5000 : 0, // Delay year-end jobs slightly
      ...options,
    }
  );
}

/**
 * Add a tax document PDF generation job to the queue
 */
export async function queueTaxDocumentGeneration(documentId: string, retryCount = 0) {
  console.log(`[TaxQueue] Adding document generation job to queue`, { 
    documentId,
    retryCount,
  });

  return await taxDocumentGenerationQueue.add(
    `generate-pdf-${documentId}`,
    { documentId, retryCount },
    {
      priority: retryCount > 0 ? 10 : 5, // Higher priority for retries
    }
  );
}

/**
 * Add a threshold notification job to the queue
 */
export async function queueThresholdNotification(data: ThresholdNotificationJobData) {
  console.log(`[TaxQueue] Adding threshold notification job to queue`, {
    creatorId: data.creatorId,
    taxYear: data.taxYear,
    thresholdType: data.thresholdType,
  });

  return await thresholdNotificationQueue.add(
    `threshold-notification-${data.creatorId}-${data.taxYear}`,
    data,
    {
      priority: 3,
      // Deduplicate notifications for the same creator/year within 1 hour
      jobId: `threshold-${data.creatorId}-${data.taxYear}-${data.thresholdType}`,
      delay: 0,
    }
  );
}

// ============================================================================
// Scheduled Jobs
// ============================================================================

/**
 * Schedule recurring tax compliance jobs
 */
export async function setupScheduledTaxJobs() {
  console.log('[TaxQueue] Setting up scheduled tax compliance jobs');

  // Year-end generation (January 15th each year)
  await taxFormQueue.add(
    'yearly-1099-generation',
    {
      jobType: 'YEAR_END_GENERATION',
      taxYear: new Date().getFullYear() - 1,
      metadata: { automated: true },
    } as any,
    {
      repeat: {
        pattern: '0 9 15 1 *', // 9 AM on January 15th
        tz: 'America/New_York',
      },
      priority: 1,
    }
  );

  // Monthly threshold checks
  await taxFormQueue.add(
    'monthly-threshold-check',
    {
      jobType: 'THRESHOLD_CHECK',
      taxYear: new Date().getFullYear(),
      metadata: { automated: true },
    } as any,
    {
      repeat: {
        pattern: '0 10 1 * *', // 10 AM on 1st of each month
        tz: 'America/New_York',
      },
      priority: 5,
    }
  );

  // Quarterly renewal reminders (for international forms)
  await taxFormQueue.add(
    'quarterly-renewal-reminders',
    {
      jobType: 'RENEWAL_REMINDER',
      taxYear: new Date().getFullYear(),
      metadata: { automated: true },
    } as any,
    {
      repeat: {
        pattern: '0 11 1 1,4,7,10 *', // 11 AM on 1st of Jan, Apr, Jul, Oct
        tz: 'America/New_York',
      },
      priority: 7,
    }
  );

  console.log('[TaxQueue] Scheduled tax compliance jobs configured');
}

// ============================================================================
// Error Handlers and Cleanup
// ============================================================================

// Worker error handlers
taxFormWorker.on('failed', (job, err) => {
  console.error(`[TaxFormWorker] Job failed`, {
    jobId: job?.id,
    jobName: job?.name,
    error: err.message,
    data: job?.data,
  });
});

taxDocumentGenerationWorker.on('failed', (job, err) => {
  console.error(`[TaxDocumentGenerationWorker] Job failed`, {
    jobId: job?.id,
    documentId: job?.data?.documentId,
    error: err.message,
  });
});

thresholdNotificationWorker.on('failed', (job, err) => {
  console.error(`[ThresholdNotificationWorker] Job failed`, {
    jobId: job?.id,
    creatorId: job?.data?.creatorId,
    error: err.message,
  });
});

// Graceful shutdown
export async function shutdownTaxWorkers() {
  console.log('[TaxQueue] Shutting down tax compliance workers');
  
  await Promise.all([
    taxFormWorker.close(),
    taxDocumentGenerationWorker.close(),
    thresholdNotificationWorker.close(),
  ]);
  
  console.log('[TaxQueue] Tax compliance workers shut down');
}

// Export workers for external management
export const workers = {
  taxFormWorker,
  taxDocumentGenerationWorker,
  thresholdNotificationWorker,
};
