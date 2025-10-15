/**
 * Tax Form Job Service
 * Manages background jobs for tax form generation and processing
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  TaxFormJobData,
  CreateTaxFormJobInput,
  TaxDocumentType,
  TaxFilingStatus,
} from '../types';
import { TaxDocumentService } from './tax-document.service';
import { PaymentThresholdService } from './payment-threshold.service';
import { TaxFormPDFGenerator } from './tax-form-pdf-generator.service';

export class TaxFormJobService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly taxDocumentService: TaxDocumentService,
    private readonly paymentThresholdService: PaymentThresholdService,
    private readonly pdfGenerator: TaxFormPDFGenerator
  ) {}

  /**
   * Create a new tax form job
   */
  async createTaxFormJob(input: CreateTaxFormJobInput, createdBy?: string): Promise<TaxFormJobData> {
    const job = await this.prisma.taxFormJob.create({
      data: {
        taxYear: input.taxYear,
        jobType: input.jobType,
        status: 'PENDING',
        totalCreators: input.totalCreators || 0,
        processedCreators: 0,
        failedCreators: 0,
        errorDetails: [],
        createdBy,
        metadata: input.metadata || {},
      },
    });

    return this.mapToTaxFormJobData(job);
  }

  /**
   * Update job status and progress
   */
  async updateJobProgress(
    jobId: string,
    updates: {
      status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
      processedCreators?: number;
      failedCreators?: number;
      errorDetails?: Array<{ creatorId: string; error: string; timestamp: Date }>;
      startedAt?: Date;
      completedAt?: Date;
    }
  ): Promise<TaxFormJobData> {
    const job = await this.prisma.taxFormJob.update({
      where: { id: jobId },
      data: {
        status: updates.status,
        processedCreators: updates.processedCreators,
        failedCreators: updates.failedCreators,
        errorDetails: updates.errorDetails,
        startedAt: updates.startedAt,
        completedAt: updates.completedAt,
        updatedAt: new Date(),
      },
    });

    return this.mapToTaxFormJobData(job);
  }

  /**
   * Process year-end form generation job
   */
  async processYearEndGeneration(jobId: string): Promise<void> {
    const job = await this.prisma.taxFormJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Tax form job ${jobId} not found`);
    }

    if (job.status !== 'PENDING') {
      throw new Error(`Tax form job ${jobId} is not in pending status`);
    }

    // Mark job as running
    await this.updateJobProgress(jobId, {
      status: 'RUNNING',
      startedAt: new Date(),
    });

    const errors: Array<{ creatorId: string; error: string; timestamp: Date }> = [];
    let processedCreators = 0;
    let failedCreators = 0;

    try {
      // Get all creators who met the 1099 threshold for the tax year
      const thresholds = await this.paymentThresholdService.getPaymentThresholds({
        taxYear: job.taxYear,
        thresholdMet: true,
      });

      const totalCreators = thresholds.thresholds.length;
      
      // Update total count
      await this.updateJobProgress(jobId, {
        totalCreators,
      });

      console.log(`[TaxFormJob] Processing ${totalCreators} creators for year-end ${job.taxYear} generation`);

      // Process each creator
      for (const threshold of thresholds.thresholds) {
        try {
          await this.generateTaxDocumentForCreator(threshold.creatorId, job.taxYear);
          processedCreators++;

          // Update progress every 10 creators
          if (processedCreators % 10 === 0) {
            await this.updateJobProgress(jobId, {
              processedCreators,
              failedCreators,
            });
          }
        } catch (error) {
          failedCreators++;
          errors.push({
            creatorId: threshold.creatorId,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          });

          console.error(`[TaxFormJob] Failed to generate document for creator ${threshold.creatorId}:`, error);
        }
      }

      // Mark job as completed
      await this.updateJobProgress(jobId, {
        status: 'COMPLETED',
        processedCreators,
        failedCreators,
        errorDetails: errors,
        completedAt: new Date(),
      });

      console.log(`[TaxFormJob] Year-end generation completed: ${processedCreators} processed, ${failedCreators} failed`);

    } catch (error) {
      // Mark job as failed
      await this.updateJobProgress(jobId, {
        status: 'FAILED',
        processedCreators,
        failedCreators,
        errorDetails: errors,
        completedAt: new Date(),
      });

      console.error(`[TaxFormJob] Year-end generation job ${jobId} failed:`, error);
      throw error;
    }
  }

  /**
   * Process threshold check job
   */
  async processThresholdCheck(jobId: string): Promise<void> {
    const job = await this.prisma.taxFormJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Tax form job ${jobId} not found`);
    }

    await this.updateJobProgress(jobId, {
      status: 'RUNNING',
      startedAt: new Date(),
    });

    try {
      // Run threshold check for all creators
      const result = await this.paymentThresholdService.checkAllThresholds(job.taxYear);

      await this.updateJobProgress(jobId, {
        status: 'COMPLETED',
        totalCreators: result.checked,
        processedCreators: result.checked,
        failedCreators: result.errors.length,
        errorDetails: result.errors.map(err => ({
          creatorId: err.creatorId,
          error: err.error,
          timestamp: new Date(),
        })),
        completedAt: new Date(),
      });

      console.log(`[TaxFormJob] Threshold check completed: ${result.checked} checked, ${result.newlyMet} newly met, ${result.errors.length} errors`);

    } catch (error) {
      await this.updateJobProgress(jobId, {
        status: 'FAILED',
        completedAt: new Date(),
      });

      console.error(`[TaxFormJob] Threshold check job ${jobId} failed:`, error);
      throw error;
    }
  }

  /**
   * Process renewal reminder job
   */
  async processRenewalReminder(jobId: string): Promise<void> {
    const job = await this.prisma.taxFormJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Tax form job ${jobId} not found`);
    }

    await this.updateJobProgress(jobId, {
      status: 'RUNNING',
      startedAt: new Date(),
    });

    try {
      // Get creators with expiring tax documentation (W8-BEN, etc.)
      const expiringDocs = await this.prisma.taxJurisdiction.findMany({
        where: {
          documentationExpiry: {
            gte: new Date(),
            lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // Next 90 days
          },
        },
        include: {
          creator: {
            include: { user: true },
          },
        },
      });

      let processedCreators = 0;
      const errors: Array<{ creatorId: string; error: string; timestamp: Date }> = [];

      for (const jurisdiction of expiringDocs) {
        try {
          // TODO: Send renewal reminder notification
          console.log(`[TaxFormJob] Sending renewal reminder to creator ${jurisdiction.creatorId} for ${jurisdiction.documentationType} expiring ${jurisdiction.documentationExpiry?.toLocaleDateString()}`);
          
          processedCreators++;
        } catch (error) {
          errors.push({
            creatorId: jurisdiction.creatorId,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          });
        }
      }

      await this.updateJobProgress(jobId, {
        status: 'COMPLETED',
        totalCreators: expiringDocs.length,
        processedCreators,
        failedCreators: errors.length,
        errorDetails: errors,
        completedAt: new Date(),
      });

      console.log(`[TaxFormJob] Renewal reminder completed: ${processedCreators} processed, ${errors.length} failed`);

    } catch (error) {
      await this.updateJobProgress(jobId, {
        status: 'FAILED',
        completedAt: new Date(),
      });

      console.error(`[TaxFormJob] Renewal reminder job ${jobId} failed:`, error);
      throw error;
    }
  }

  /**
   * Get job status and details
   */
  async getJobStatus(jobId: string): Promise<TaxFormJobData | null> {
    const job = await this.prisma.taxFormJob.findUnique({
      where: { id: jobId },
    });

    return job ? this.mapToTaxFormJobData(job) : null;
  }

  /**
   * Get jobs with filtering
   */
  async getJobs(filters: {
    taxYear?: number;
    jobType?: string;
    status?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ jobs: TaxFormJobData[]; total: number }> {
    const where: any = {};

    if (filters.taxYear) where.taxYear = filters.taxYear;
    if (filters.jobType) where.jobType = filters.jobType;
    if (filters.status) where.status = filters.status;

    const [jobs, total] = await Promise.all([
      this.prisma.taxFormJob.findMany({
        where,
        orderBy: {
          [filters.sortBy || 'createdAt']: filters.sortOrder || 'desc',
        },
        take: filters.limit || 50,
        skip: filters.offset || 0,
      }),
      this.prisma.taxFormJob.count({ where }),
    ]);

    return {
      jobs: jobs.map(this.mapToTaxFormJobData),
      total,
    };
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(jobId: string): Promise<TaxFormJobData> {
    const job = await this.prisma.taxFormJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Tax form job ${jobId} not found`);
    }

    if (job.status === 'RUNNING') {
      throw new Error('Cannot cancel a running job');
    }

    if (job.status !== 'PENDING') {
      throw new Error('Can only cancel pending jobs');
    }

    const updatedJob = await this.prisma.taxFormJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', completedAt: new Date() },
    });

    return this.mapToTaxFormJobData(updatedJob);
  }

  /**
   * Generate tax document for a specific creator
   */
  private async generateTaxDocumentForCreator(creatorId: string, taxYear: number): Promise<void> {
    // Check if creator meets 1099 threshold
    const meetsThreshold = await this.taxDocumentService.checkForm1099Threshold(creatorId, taxYear);
    
    if (!meetsThreshold) {
      throw new Error(`Creator ${creatorId} does not meet 1099 threshold for ${taxYear}`);
    }

    // Check if document already exists
    const existing = await this.taxDocumentService.getTaxDocuments({
      creatorId,
      taxYear,
      documentType: TaxDocumentType.FORM_1099_NEC,
    });

    if (existing.documents.length > 0) {
      console.log(`[TaxFormJob] 1099-NEC already exists for creator ${creatorId} year ${taxYear}`);
      return;
    }

    // Get payment data and generate 1099 data
    const form1099Data = await this.taxDocumentService.generateForm1099Data(creatorId, taxYear);
    
    // Create tax document record
    const document = await this.taxDocumentService.createTaxDocument({
      creatorId,
      taxYear,
      documentType: TaxDocumentType.FORM_1099_NEC,
      totalAmountCents: form1099Data.totalAmountCents,
      withholdingCents: form1099Data.federalTaxWithheldCents,
      metadata: {
        form1099Data,
        generatedBy: 'YEAR_END_JOB',
      },
    });

    // Generate PDF
    const pdfResult = await this.pdfGenerator.generateForm1099NEC(form1099Data);
    
    // Update document with PDF info
    await this.taxDocumentService.updateTaxDocument({
      id: document.id,
      pdfStorageKey: pdfResult.storageKey,
      pdfGeneratedAt: new Date(),
      filingStatus: TaxFilingStatus.GENERATED,
    });

    console.log(`[TaxFormJob] Generated 1099-NEC for creator ${creatorId} year ${taxYear}: ${pdfResult.storageKey}`);
  }

  /**
   * Helper method to map Prisma model to our data type
   */
  private mapToTaxFormJobData(job: any): TaxFormJobData {
    return {
      id: job.id,
      taxYear: job.taxYear,
      jobType: job.jobType,
      status: job.status,
      totalCreators: job.totalCreators,
      processedCreators: job.processedCreators,
      failedCreators: job.failedCreators,
      errorDetails: job.errorDetails,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdBy: job.createdBy,
      metadata: job.metadata,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
