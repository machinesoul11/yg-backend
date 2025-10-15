/**
 * Tax Compliance tRPC Router
 * API endpoints for tax document management and compliance reporting
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/db/redis';

// Import services
import { TaxDocumentService } from './services/tax-document.service';
import { PaymentThresholdService } from './services/payment-threshold.service';
import { TaxFormJobService } from './services/tax-form-job.service';
import { TaxFormPDFGenerator } from './services/tax-form-pdf-generator.service';

// Import schemas
import {
  createTaxDocumentSchema,
  updateTaxDocumentSchema,
  getTaxDocumentsSchema,
  generateTaxDocumentSchema,
  createPaymentThresholdSchema,
  updatePaymentThresholdSchema,
  getPaymentThresholdsSchema,
  checkThresholdStatusSchema,
  createTaxFormJobSchema,
  updateTaxFormJobSchema,
  getTaxFormJobsSchema,
  generateVATReportSchema,
  generateGSTReportSchema,
  validateCreatorTaxComplianceSchema,
  getCreatorTaxComplianceStatusSchema,
  generateTaxReportSchema,
} from './schemas';

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

export const taxComplianceRouter = createTRPCRouter({
  // ========================================================================
  // Tax Document Management
  // ========================================================================

  createTaxDocument: protectedProcedure
    .input(createTaxDocumentSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await taxDocumentService.createTaxDocument(input);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to create tax document',
        });
      }
    }),

  updateTaxDocument: protectedProcedure
    .input(updateTaxDocumentSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await taxDocumentService.updateTaxDocument(input);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to update tax document',
        });
      }
    }),

  getTaxDocuments: protectedProcedure
    .input(getTaxDocumentsSchema)
    .query(async ({ input, ctx }) => {
      try {
        // If not admin, restrict to own creator documents
        const filters = { ...input };
        if (ctx.session.user.role !== 'ADMIN' && ctx.session.user.creatorId) {
          filters.creatorId = ctx.session.user.creatorId;
        }

        return await taxDocumentService.getTaxDocuments(filters);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch tax documents',
        });
      }
    }),

  getTaxDocumentById: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      try {
        const document = await taxDocumentService.getTaxDocumentById(input.id);
        
        if (!document) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Tax document not found',
          });
        }

        // Check permissions - creators can only see their own documents
        if (ctx.session.user.role !== 'ADMIN' && ctx.session.user.creatorId !== document.creatorId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Access denied',
          });
        }

        return document;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch tax document',
        });
      }
    }),

  generateTaxDocument: protectedProcedure
    .input(generateTaxDocumentSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const document = await taxDocumentService.getTaxDocumentById(input.documentId);
        
        if (!document) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Tax document not found',
          });
        }

        // Check permissions
        if (ctx.session.user.role !== 'ADMIN' && ctx.session.user.creatorId !== document.creatorId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Access denied',
          });
        }

        // Generate PDF based on document type
        const form1099Data = await taxDocumentService.generateForm1099Data(
          document.creatorId,
          document.taxYear
        );

        const pdfResult = await pdfGenerator.generateForm1099NEC(form1099Data);

        // Update document with PDF info
        const updatedDocument = await taxDocumentService.updateTaxDocument({
          id: document.id,
          pdfStorageKey: pdfResult.storageKey,
          pdfGeneratedAt: new Date(),
          filingStatus: 'FILED' as any, // TODO: Use proper enum value once Prisma schema is migrated
        });

        return {
          document: updatedDocument,
          pdfInfo: {
            storageKey: pdfResult.storageKey,
            fileSize: pdfResult.metadata.fileSize,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to generate tax document',
        });
      }
    }),

  deleteTaxDocument: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ input }) => {
      try {
        await taxDocumentService.deleteTaxDocument(input.id);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to delete tax document',
        });
      }
    }),

  createCorrectionDocument: adminProcedure
    .input(z.object({
      originalDocumentId: z.string().cuid(),
      correctionData: createTaxDocumentSchema.partial(),
    }))
    .mutation(async ({ input }) => {
      try {
        return await taxDocumentService.createCorrectionDocument(
          input.originalDocumentId,
          input.correctionData
        );
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to create correction document',
        });
      }
    }),

  // ========================================================================
  // Payment Threshold Management
  // ========================================================================

  createPaymentThreshold: adminProcedure
    .input(createPaymentThresholdSchema)
    .mutation(async ({ input }) => {
      try {
        return await paymentThresholdService.createOrUpdateThreshold(input);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to create payment threshold',
        });
      }
    }),

  getPaymentThresholds: protectedProcedure
    .input(getPaymentThresholdsSchema)
    .query(async ({ input, ctx }) => {
      try {
        // If not admin, restrict to own creator thresholds
        const filters = { ...input };
        if (ctx.session.user.role !== 'ADMIN' && ctx.session.user.creatorId) {
          filters.creatorId = ctx.session.user.creatorId;
        }

        return await paymentThresholdService.getPaymentThresholds(filters);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch payment thresholds',
        });
      }
    }),

  checkThresholdStatus: protectedProcedure
    .input(checkThresholdStatusSchema)
    .query(async ({ input, ctx }) => {
      try {
        // If not admin, only allow checking own creator threshold
        if (ctx.session.user.role !== 'ADMIN' && ctx.session.user.creatorId !== input.creatorId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Access denied',
          });
        }

        return await paymentThresholdService.getThresholdStatus(
          input.creatorId,
          input.taxYear,
          input.jurisdiction
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to check threshold status',
        });
      }
    }),

  getThresholdStatistics: adminProcedure
    .input(z.object({ taxYear: z.number().int().min(2020).max(2050) }))
    .query(async ({ input }) => {
      try {
        return await paymentThresholdService.getThresholdStatistics(input.taxYear);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch threshold statistics',
        });
      }
    }),

  getCreatorsApproachingThreshold: adminProcedure
    .input(z.object({
      taxYear: z.number().int().min(2020).max(2050),
      percentageThreshold: z.number().min(1).max(100).default(90),
    }))
    .query(async ({ input }) => {
      try {
        return await paymentThresholdService.getCreatorsApproachingThreshold(
          input.taxYear,
          input.percentageThreshold
        );
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch creators approaching threshold',
        });
      }
    }),

  // ========================================================================
  // Tax Form Job Management
  // ========================================================================

  createTaxFormJob: adminProcedure
    .input(createTaxFormJobSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await taxFormJobService.createTaxFormJob(input, ctx.session.user.id);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to create tax form job',
        });
      }
    }),

  getTaxFormJobs: adminProcedure
    .input(getTaxFormJobsSchema)
    .query(async ({ input }) => {
      try {
        return await taxFormJobService.getJobs(input);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch tax form jobs',
        });
      }
    }),

  getTaxFormJobStatus: adminProcedure
    .input(z.object({ jobId: z.string().cuid() }))
    .query(async ({ input }) => {
      try {
        const job = await taxFormJobService.getJobStatus(input.jobId);
        if (!job) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Tax form job not found',
          });
        }
        return job;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch job status',
        });
      }
    }),

  cancelTaxFormJob: adminProcedure
    .input(z.object({ jobId: z.string().cuid() }))
    .mutation(async ({ input }) => {
      try {
        return await taxFormJobService.cancelJob(input.jobId);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to cancel tax form job',
        });
      }
    }),

  // ========================================================================
  // Tax Compliance & Validation
  // ========================================================================

  validateCreatorTaxCompliance: protectedProcedure
    .input(validateCreatorTaxComplianceSchema)
    .query(async ({ input, ctx }) => {
      try {
        // If not admin, only allow validating own creator compliance
        if (ctx.session.user.role !== 'ADMIN' && ctx.session.user.creatorId !== input.creatorId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Access denied',
          });
        }

        // Simple validation logic - in real implementation would be more comprehensive
        const threshold = await paymentThresholdService.getThresholdStatus(
          input.creatorId,
          input.taxYear
        );

        const documents = await taxDocumentService.getTaxDocuments({
          creatorId: input.creatorId,
          taxYear: input.taxYear,
        });

        const errors: string[] = [];
        const warnings: string[] = [];
        const requiredDocuments: string[] = [];
        const recommendedActions: string[] = [];

        if (threshold.thresholdMet && documents.documents.length === 0) {
          errors.push('1099 form required but not generated');
          requiredDocuments.push('FORM_1099_NEC');
        }

        if (threshold.percentageReached > 75 && threshold.percentageReached < 100) {
          warnings.push('Approaching tax reporting threshold');
          recommendedActions.push('Ensure tax information is up to date');
        }

        return {
          isValid: errors.length === 0,
          errors,
          warnings,
          requiredDocuments,
          recommendedActions,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to validate tax compliance',
        });
      }
    }),

  getFilingStatistics: adminProcedure
    .input(z.object({ taxYear: z.number().int().min(2020).max(2050) }))
    .query(async ({ input }) => {
      try {
        return await taxDocumentService.getFilingStatistics(input.taxYear);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch filing statistics',
        });
      }
    }),

  // ========================================================================
  // Administrative Actions
  // ========================================================================

  processYearEndGeneration: adminProcedure
    .input(z.object({
      taxYear: z.number().int().min(2020).max(2050),
      forceRegenerate: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Create and start year-end generation job
        const job = await taxFormJobService.createTaxFormJob({
          taxYear: input.taxYear,
          jobType: 'YEAR_END_GENERATION',
          metadata: {
            forceRegenerate: input.forceRegenerate,
            triggeredBy: ctx.session.user.id,
          },
        }, ctx.session.user.id);

        // Start processing in background (in real implementation, would use job queue)
        setTimeout(() => {
          taxFormJobService.processYearEndGeneration(job.id).catch(error => {
            console.error('[TaxCompliance] Year-end generation failed:', error);
          });
        }, 1000);

        return { job };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start year-end generation',
        });
      }
    }),

  runThresholdCheck: adminProcedure
    .input(z.object({ taxYear: z.number().int().min(2020).max(2050) }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Create and start threshold check job
        const job = await taxFormJobService.createTaxFormJob({
          taxYear: input.taxYear,
          jobType: 'THRESHOLD_CHECK',
          metadata: {
            triggeredBy: ctx.session.user.id,
          },
        }, ctx.session.user.id);

        // Start processing in background
        setTimeout(() => {
          taxFormJobService.processThresholdCheck(job.id).catch(error => {
            console.error('[TaxCompliance] Threshold check failed:', error);
          });
        }, 1000);

        return { job };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start threshold check',
        });
      }
    }),

  sendRenewalReminders: adminProcedure
    .input(z.object({ taxYear: z.number().int().min(2020).max(2050) }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Create and start renewal reminder job
        const job = await taxFormJobService.createTaxFormJob({
          taxYear: input.taxYear,
          jobType: 'RENEWAL_REMINDER',
          metadata: {
            triggeredBy: ctx.session.user.id,
          },
        }, ctx.session.user.id);

        // Start processing in background
        setTimeout(() => {
          taxFormJobService.processRenewalReminder(job.id).catch(error => {
            console.error('[TaxCompliance] Renewal reminder failed:', error);
          });
        }, 1000);

        return { job };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start renewal reminders',
        });
      }
    }),
});
