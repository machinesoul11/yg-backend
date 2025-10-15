import { z } from 'zod';
import { protectedProcedure, createTRPCRouter } from '../../lib/trpc';
import { TRPCError } from '@trpc/server';
import { PrismaClient } from '@prisma/client';
import { FinancialReportingService } from './services/financial-reporting.service';
import { 
  ReportGenerationError,
  ReportValidationError,
  ReportAccessDeniedError 
} from './errors/report.errors';
import { 
  StripeReconciliationService,
  createAuditReconciliationServices,
  type StripeReconciliationReport
} from '@/modules/audit-reconciliation';
import { AuditService } from '@/lib/services/audit.service';
import { redis } from '@/lib/redis';
import { queueReportGeneration } from '@/jobs/financial-report-generation.job';

/**
 * Financial Reports tRPC Router
 * 
 * Provides comprehensive financial reporting API endpoints including:
 * - Platform revenue reporting
 * - Payout summaries  
 * - Tax documents
 * - Stripe reconciliation
 * - Custom report generation
 * - PDF downloads
 * - Scheduled reports management
 */

// Input schemas
const dateRangeSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

const revenueReportInput = dateRangeSchema.extend({
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  filters: z.object({
    brandIds: z.array(z.string()).optional(),
    licenseTypes: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional()
  }).optional()
});

const payoutSummaryInput = dateRangeSchema.extend({
  status: z.enum(['all', 'pending', 'completed', 'failed']).default('all'),
  creatorId: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

const reconciliationInput = dateRangeSchema;

const generateReportInput = z.object({
  reportType: z.enum(['revenue', 'payouts', 'reconciliation', 'custom']),
  parameters: z.record(z.string(), z.any()),
  format: z.enum(['pdf', 'csv', 'excel', 'json']).default('pdf'),
  name: z.string().optional(),
  emailDelivery: z.object({
    recipients: z.array(z.string().email()),
    subject: z.string().optional(),
    message: z.string().optional()
  }).optional()
});

const downloadReportInput = z.object({
  reportId: z.string()
});

const scheduledReportsInput = z.object({
  isActive: z.boolean().optional(),
  reportType: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

export const reportsRouter = createTRPCRouter({
  /**
   * GET /reports/financial/revenue
   * Platform revenue reporting with time-series data and breakdowns
   */
  getRevenue: protectedProcedure
    .input(revenueReportInput)
    .query(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();
        const financialService = new FinancialReportingService(prisma, redis);

        // Validate date range
        if (input.startDate >= input.endDate) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Start date must be before end date'
          });
        }

        // Check if date range is reasonable (max 2 years)
        const daysDiff = Math.abs(input.endDate.getTime() - input.startDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 730) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Date range too large. Maximum 2 years allowed.'
          });
        }

        // Calculate intelligent granularity based on date range
        let granularity = input.granularity;
        if (daysDiff <= 31) {
          granularity = 'daily';
        } else if (daysDiff <= 92) {
          granularity = 'weekly';
        } else {
          granularity = 'monthly';
        }

        // Get time-series data
        const timeSeries = await financialService.getRevenueTimeSeries(
          input.startDate,
          input.endDate,
          granularity,
          input.filters
        );

        // Calculate summary metrics
        const totalRevenue = timeSeries.reduce((sum, period) => sum + period.revenueCents, 0);
        const avgPerPeriod = timeSeries.length > 0 ? totalRevenue / timeSeries.length : 0;
        const transactionCount = timeSeries.reduce((sum, period) => sum + period.transactionCount, 0);

        // Calculate growth rate compared to previous period
        const previousPeriodStart = new Date(input.startDate.getTime() - (input.endDate.getTime() - input.startDate.getTime()));
        const previousRevenue = await financialService.getTotalRevenue(previousPeriodStart, input.startDate, input.filters);
        const growthRate = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;

        return {
          summary: {
            totalRevenueCents: totalRevenue,
            averageRevenuePerPeriod: avgPerPeriod,
            transactionCount,
            growthRatePercent: growthRate,
            period: {
              startDate: input.startDate,
              endDate: input.endDate,
              granularity
            }
          },
          timeSeries,
          metadata: {
            generatedAt: new Date(),
            requestedBy: ctx.session?.user?.id,
            filters: input.filters
          }
        };

      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate revenue report',
          cause: error
        });
      }
    }),

  /**
   * GET /reports/financial/payouts  
   * Payout summary with creator details and status tracking
   */
  getPayouts: protectedProcedure
    .input(payoutSummaryInput)
    .query(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();

        // Build filter conditions
        const whereClause: any = {
          createdAt: {
            gte: input.startDate,
            lte: input.endDate
          }
        };

        if (input.status !== 'all') {
          whereClause.status = input.status.toUpperCase();
        }

        if (input.creatorId) {
          whereClause.creatorId = input.creatorId;
        }

        // Get payouts with creator details
        const [payouts, total] = await Promise.all([
          prisma.payout.findMany({
            where: whereClause,
            include: {
              creator: {
                select: {
                  id: true,
                  user: {
                    select: {
                      name: true,
                      email: true
                    }
                  }
                }
              },
              royaltyStatement: {
                select: {
                  id: true,
                  royaltyRun: {
                    select: {
                      periodStart: true,
                      periodEnd: true
                    }
                  }
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: input.limit,
            skip: input.offset
          }),
          prisma.payout.count({ where: whereClause })
        ]);

        // Calculate summary statistics
        const summary = await prisma.payout.aggregate({
          where: whereClause,
          _sum: { amountCents: true },
          _count: { id: true },
          _avg: { amountCents: true }
        });

        // Get status breakdown
        const statusBreakdown = await prisma.payout.groupBy({
          by: ['status'],
          where: {
            createdAt: {
              gte: input.startDate,
              lte: input.endDate
            }
          },
          _sum: { amountCents: true },
          _count: { id: true }
        });

        // Get pending amount separately
        const pendingAmount = await prisma.payout.aggregate({
          where: {
            status: 'PENDING',
            createdAt: {
              gte: input.startDate,
              lte: input.endDate
            }
          },
          _sum: { amountCents: true }
        });

        return {
          summary: {
            totalPayoutsCents: summary._sum.amountCents || 0,
            payoutCount: summary._count.id,
            averagePayoutCents: Math.round(summary._avg.amountCents || 0),
            pendingPayoutsCents: pendingAmount._sum.amountCents || 0
          },
          statusBreakdown: statusBreakdown.map(status => ({
            status: status.status,
            count: status._count.id,
            totalCents: status._sum.amountCents || 0
          })),
          payouts: payouts.map(payout => ({
            id: payout.id,
            amountCents: payout.amountCents,
            status: payout.status,
            createdAt: payout.createdAt,
            processedAt: payout.processedAt,
            failedReason: payout.failedReason,
            retryCount: payout.retryCount,
            stripeTransferId: payout.stripeTransferId,
            creator: {
              id: payout.creator.id,
              name: payout.creator.user?.name || 'Unknown',
              email: payout.creator.user?.email || 'Unknown'
            },
            royaltyPeriod: payout.royaltyStatement ? {
              start: payout.royaltyStatement.royaltyRun?.periodStart,
              end: payout.royaltyStatement.royaltyRun?.periodEnd
            } : null
          })),
          pagination: {
            total,
            offset: input.offset,
            limit: input.limit,
            hasMore: input.offset + input.limit < total
          },
          metadata: {
            generatedAt: new Date(),
            requestedBy: ctx.session?.user?.id,
            filters: {
              status: input.status,
              creatorId: input.creatorId
            }
          }
        };

      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate payout summary',
          cause: error
        });
      }
    }),

  /**
   * GET /reports/financial/reconciliation
   * Stripe reconciliation reporting with discrepancy detection
   */
  getReconciliation: protectedProcedure
    .input(reconciliationInput)
    .query(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();
        const auditService = new AuditService(prisma);

        // Create audit reconciliation services
        const services = createAuditReconciliationServices(
          prisma,
          auditService,
          process.env.STRIPE_SECRET_KEY
        );

        // Generate Stripe reconciliation report
        const reconciliationReport = await services.stripeReconciliation.generateReconciliationReport({
          startDate: input.startDate,
          endDate: input.endDate,
          requestedBy: ctx.session?.user?.id
        });

        // Format response for API consumers
        return {
          summary: {
            periodStart: reconciliationReport.periodStart,
            periodEnd: reconciliationReport.periodEnd,
            totalInternalCents: reconciliationReport.totalInternalCents,
            totalStripeCents: reconciliationReport.totalStripeCents,
            discrepancyCents: reconciliationReport.discrepancyCents,
            reconciliationRate: reconciliationReport.reconciliationRate,
            matchedCount: reconciliationReport.matchedCount,
            unmatchedInternalCount: reconciliationReport.unmatchedInternalCount,
            unmatchedStripeCount: reconciliationReport.unmatchedStripeCount,
            discrepancyCount: reconciliationReport.discrepancyCount
          },
          reconciliation: {
            matchedTransactions: reconciliationReport.matchedTransactions,
            unmatchedInternal: reconciliationReport.unmatchedInternal,
            unmatchedStripe: reconciliationReport.unmatchedStripe,
            discrepancies: reconciliationReport.discrepancies
          },
          metadata: {
            reportId: reconciliationReport.id,
            generatedAt: reconciliationReport.generatedAt,
            generatedBy: reconciliationReport.generatedBy
          }
        };

      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate reconciliation report',
          cause: error
        });
      }
    }),

  /**
   * POST /reports/financial/generate
   * Custom report generation with background processing
   */
  generate: protectedProcedure
    .input(generateReportInput)
    .mutation(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();
        
        // Generate unique report ID
        const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create report record
        const report = await prisma.financialReport.create({
          data: {
            id: reportId,
            reportType: input.reportType.toUpperCase() as any,
            generatedBy: ctx.session?.user?.id || 'anonymous',
            status: 'GENERATING',
            parameters: input.parameters,
            metadata: {
              format: input.format,
              name: input.name || `${input.reportType}_report_${new Date().toISOString().split('T')[0]}`,
              requestedAt: new Date().toISOString()
            }
          }
        });

        // Queue background job for report generation
        const jobId = await queueReportGeneration({
          reportId,
          reportType: input.reportType,
          parameters: input.parameters,
          format: input.format,
          generatedBy: ctx.session?.user?.id || 'anonymous',
          emailDelivery: input.emailDelivery
        });

        return {
          reportId,
          jobId,
          status: 'GENERATING',
          estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes estimate
          message: 'Report generation has been queued. You will be notified when complete.'
        };

      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to queue report generation',
          cause: error
        });
      }
    }),

  /**
   * GET /reports/financial/:id/download
   * Secure PDF download with expiring URLs
   */
  download: protectedProcedure
    .input(downloadReportInput)
    .query(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();

        // Get report record
        const report = await prisma.financialReport.findUnique({
          where: { id: input.reportId }
        });

        if (!report) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Report not found'
          });
        }

        // Verify user has access to this report
        if (report.generatedBy !== ctx.session?.user?.id && ctx.session?.user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Access denied to this report'
          });
        }

        // Check if report is ready
        if (report.status !== 'COMPLETED') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Report is not ready for download. Current status: ${report.status}`
          });
        }

        // Check if report has expired (30 days)
        const expirationDate = new Date(report.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        if (new Date() > expirationDate) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Report has expired and is no longer available for download'
          });
        }

        // Generate download record for audit trail
        const downloadRecord = await prisma.reportDownload.create({
          data: {
            reportId: report.id,
            userId: ctx.session?.user?.id || 'anonymous',
            downloadUrl: 'generated',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour expiry
          }
        });

        // In a real implementation, you would generate a signed URL from your storage provider
        const downloadUrl = `/api/reports/${report.id}/file?token=${downloadRecord.id}`;

        return {
          downloadUrl,
          filename: `${report.metadata?.name || 'financial_report'}.${report.metadata?.format || 'pdf'}`,
          expiresAt: downloadRecord.expiresAt,
          reportInfo: {
            id: report.id,
            type: report.reportType,
            generatedAt: report.createdAt,
            size: report.metadata?.fileSize || 'Unknown'
          }
        };

      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate download link',
          cause: error
        });
      }
    }),

  /**
   * GET /reports/financial/scheduled
   * Scheduled reports management
   */
  getScheduled: protectedProcedure
    .input(scheduledReportsInput)
    .query(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();

        // Build filter conditions
        const whereClause: any = {};

        if (input.isActive !== undefined) {
          whereClause.isActive = input.isActive;
        }

        if (input.reportType) {
          whereClause.reportType = input.reportType;
        }

        // Get scheduled reports
        const [scheduledReports, total] = await Promise.all([
          prisma.scheduledReport.findMany({
            where: whereClause,
            include: {
              createdByUser: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              reports: {
                select: {
                  id: true,
                  status: true,
                  createdAt: true
                },
                orderBy: { createdAt: 'desc' },
                take: 5 // Last 5 generated reports
              }
            },
            orderBy: { createdAt: 'desc' },
            take: input.limit,
            skip: input.offset
          }),
          prisma.scheduledReport.count({ where: whereClause })
        ]);

        return {
          summary: {
            totalScheduled: total,
            activeCount: await prisma.scheduledReport.count({
              where: { ...whereClause, isActive: true }
            }),
            nextExecution: await prisma.scheduledReport.findFirst({
              where: { ...whereClause, isActive: true },
              orderBy: { nextScheduledAt: 'asc' },
              select: { nextScheduledAt: true }
            }).then((r: any) => r?.nextScheduledAt)
          },
          scheduledReports: scheduledReports.map((scheduled: any) => ({
            id: scheduled.id,
            name: scheduled.name,
            reportType: scheduled.reportType,
            frequency: scheduled.frequency,
            cronExpression: scheduled.cronExpression,
            recipients: scheduled.recipients,
            isActive: scheduled.isActive,
            lastGeneratedAt: scheduled.lastGeneratedAt,
            nextScheduledAt: scheduled.nextScheduledAt,
            parameters: scheduled.parameters,
            createdBy: {
              id: scheduled.createdByUser.id,
              name: scheduled.createdByUser.name,
              email: scheduled.createdByUser.email
            },
            recentReports: scheduled.reports.map((report: any) => ({
              id: report.id,
              status: report.status,
              generatedAt: report.createdAt
            }))
          })),
          pagination: {
            total,
            offset: input.offset,
            limit: input.limit,
            hasMore: input.offset + input.limit < total
          },
          metadata: {
            generatedAt: new Date(),
            requestedBy: ctx.session?.user?.id
          }
        };

      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve scheduled reports',
          cause: error
        });
      }
    }),

  /**
   * Get report generation status
   */
  getReportStatus: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();

        const report = await prisma.financialReport.findUnique({
          where: { id: input.reportId },
          include: {
            generatedByUser: {
              select: {
                name: true,
                email: true
              }
            }
          }
        });

        if (!report) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Report not found'
          });
        }

        // Verify user has access
        if (report.generatedBy !== ctx.session?.user?.id && ctx.session?.user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Access denied to this report'
          });
        }

        return {
          id: report.id,
          status: report.status,
          reportType: report.reportType,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
          metadata: report.metadata,
          generatedBy: report.generatedByUser
        };

      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get report status',
          cause: error
        });
      }
    }),

  /**
   * Get available report types and capabilities
   */
  getReportTypes: protectedProcedure
    .query(async () => {
      return {
        reportTypes: [
          {
            type: 'revenue',
            name: 'Platform Revenue Report',
            description: 'Comprehensive revenue analysis with time-series data and growth metrics',
            supportedFormats: ['pdf', 'csv', 'excel', 'json'],
            estimatedGenerationTime: '30-60 seconds',
            availableFilters: ['brandIds', 'licenseTypes', 'regions']
          },
          {
            type: 'payouts',
            name: 'Payout Summary Report',
            description: 'Creator payout tracking with status breakdowns and processing metrics',
            supportedFormats: ['pdf', 'csv', 'excel', 'json'],
            estimatedGenerationTime: '30-45 seconds',
            availableFilters: ['creatorId', 'status', 'paymentMethod']
          },
          {
            type: 'reconciliation',
            name: 'Stripe Reconciliation Report',
            description: 'Financial reconciliation with Stripe payment records and discrepancy detection',
            supportedFormats: ['pdf', 'csv', 'excel', 'json'],
            estimatedGenerationTime: '60-120 seconds',
            availableFilters: ['paymentMethod', 'transactionType']
          },
          {
            type: 'custom',
            name: 'Custom Financial Report',
            description: 'Configurable financial report with custom parameters and data sources',
            supportedFormats: ['pdf', 'csv', 'excel', 'json'],
            estimatedGenerationTime: '60-180 seconds',
            availableFilters: ['customizable']
          }
        ],
        capabilities: {
          maxDateRange: '2 years',
          supportedFormats: ['pdf', 'csv', 'excel', 'json'],
          schedulingAvailable: true,
          realTimeGeneration: true,
          backgroundProcessing: true,
          auditTrail: true,
          downloadExpiration: '30 days'
        }
      };
    })
});

export type ReportsRouter = typeof reportsRouter;
