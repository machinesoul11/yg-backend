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
            period: input.parameters as any,
            generatedBy: ctx.session?.user?.id || 'anonymous',
            status: 'GENERATING',
            metadata: {
              format: input.format,
              name: input.name || `${input.reportType}_report_${new Date().toISOString().split('T')[0]}`,
              requestedAt: new Date().toISOString(),
              parameters: input.parameters
            } as any
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

        const metadata = report.metadata as any;
        
        return {
          downloadUrl,
          filename: `${metadata?.name || 'financial_report'}.${metadata?.format || 'pdf'}`,
          expiresAt: downloadRecord.expiresAt,
          reportInfo: {
            id: report.id,
            type: report.reportType,
            generatedAt: report.createdAt,
            size: metadata?.fileSize || 'Unknown'
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
    }),

  /**
   * GET /reports/templates
   * Get all available report templates
   */
  getTemplates: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();
        const { ReportTemplatesService } = await import('./services/report-templates.service');
        const templatesService = new ReportTemplatesService(prisma);

        const templates = templatesService.getAllTemplates();

        // Filter templates based on user role
        const userRole = ctx.session?.user?.role || 'VIEWER';
        const filteredTemplates = templates.filter(template => 
          template.accessLevel.includes(userRole as any)
        );

        return {
          templates: filteredTemplates,
          total: filteredTemplates.length
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch report templates',
          cause: error
        });
      }
    }),

  /**
   * POST /reports/templates/generate
   * Generate report from template
   */
  generateFromTemplate: protectedProcedure
    .input(z.object({
      templateId: z.string(),
      parameters: z.object({
        period: z.object({
          startDate: z.coerce.date().optional(),
          endDate: z.coerce.date().optional(),
          month: z.number().min(0).max(11).optional(),
          quarter: z.number().min(1).max(4).optional(),
          year: z.number().optional()
        }).optional(),
        userId: z.string().optional(),
        filters: z.record(z.string(), z.any()).optional(),
        format: z.enum(['pdf', 'csv', 'excel']).default('pdf')
      })
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();
        const { ReportTemplatesService } = await import('./services/report-templates.service');
        const templatesService = new ReportTemplatesService(prisma);

        const reportId = await templatesService.generateFromTemplate(
          input.templateId,
          input.parameters,
          ctx.session!.user!.id
        );

        return {
          reportId,
          status: 'queued',
          message: 'Report generation queued successfully'
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate report from template',
          cause: error
        });
      }
    }),

  /**
   * GET /reports/custom-builder/fields
   * Get available fields for custom report builder
   */
  getCustomBuilderFields: protectedProcedure
    .input(z.object({
      dataSource: z.enum(['transactions', 'royalties', 'licenses', 'assets', 'creators', 'brands'])
    }))
    .query(async ({ input }) => {
      try {
        const { CustomReportBuilderService } = await import('./services/custom-report-builder.service');
        const builderService = new CustomReportBuilderService(new PrismaClient());

        const fields = builderService.getAvailableFields(input.dataSource);

        return {
          dataSource: input.dataSource,
          fields,
          total: fields.length
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch available fields',
          cause: error
        });
      }
    }),

  /**
   * GET /reports/custom-builder/defaults
   * Get intelligent defaults for report category
   */
  getCustomBuilderDefaults: protectedProcedure
    .input(z.object({
      category: z.enum(['financial', 'operational', 'creator_performance', 'brand_campaign', 'asset_portfolio', 'license_analytics'])
    }))
    .query(async ({ input }) => {
      try {
        const { CustomReportBuilderService } = await import('./services/custom-report-builder.service');
        const builderService = new CustomReportBuilderService(new PrismaClient());

        const defaults = builderService.getReportDefaults(input.category);

        return {
          category: input.category,
          defaults
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch report defaults',
          cause: error
        });
      }
    }),

  /**
   * POST /reports/custom-builder/validate
   * Validate custom report configuration
   */
  validateCustomReport: protectedProcedure
    .input(z.object({
      config: z.any() // Would use CustomReportConfigSchema
    }))
    .mutation(async ({ input }) => {
      try {
        const { CustomReportBuilderService, CustomReportConfigSchema } = await import('./services/custom-report-builder.service');
        const builderService = new CustomReportBuilderService(new PrismaClient());

        // Validate schema
        const config = CustomReportConfigSchema.parse(input.config);

        // Validate business rules
        const validation = await builderService.validateReportConfig(config);

        return validation;
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid report configuration',
            cause: error
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to validate report configuration',
          cause: error
        });
      }
    }),

  /**
   * POST /reports/custom-builder/generate
   * Generate custom report
   */
  generateCustomReport: protectedProcedure
    .input(z.object({
      config: z.any() // Would use CustomReportConfigSchema
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();
        const { CustomReportBuilderService, CustomReportConfigSchema } = await import('./services/custom-report-builder.service');
        const builderService = new CustomReportBuilderService(prisma);

        // Validate and parse config
        const config = CustomReportConfigSchema.parse(input.config);

        // Generate report
        const reportId = await builderService.generateCustomReport(
          config,
          ctx.session!.user!.id,
          ctx.session!.user!.role
        );

        return {
          reportId,
          status: 'queued',
          message: 'Custom report generation queued successfully'
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid report configuration',
            cause: error
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate custom report',
          cause: error
        });
      }
    }),

  /**
   * POST /reports/custom-builder/save
   * Save custom report configuration for reuse
   */
  saveCustomReportConfig: protectedProcedure
    .input(z.object({
      config: z.any(), // Would use CustomReportConfigSchema
      isPublic: z.boolean().default(false),
      tags: z.array(z.string()).optional()
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();
        const { CustomReportBuilderService, CustomReportConfigSchema } = await import('./services/custom-report-builder.service');
        const builderService = new CustomReportBuilderService(prisma);

        const config = CustomReportConfigSchema.parse(input.config);

        const saved = await builderService.saveReportConfig(
          config,
          ctx.session!.user!.id,
          { isPublic: input.isPublic, tags: input.tags }
        );

        return {
          success: true,
          savedConfig: saved
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save report configuration',
          cause: error
        });
      }
    }),

  /**
   * GET /reports/custom-builder/saved
   * List saved report configurations
   */
  getSavedConfigs: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();
        const { CustomReportBuilderService } = await import('./services/custom-report-builder.service');
        const builderService = new CustomReportBuilderService(prisma);

        const configs = await builderService.listSavedConfigs(
          ctx.session!.user!.id,
          ctx.session!.user!.role
        );

        return {
          configs,
          total: configs.length
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch saved configurations',
          cause: error
        });
      }
    }),

  /**
   * POST /reports/schedule
   * Schedule a recurring report
   */
  scheduleReport: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      reportType: z.enum(['royalty_statements', 'transaction_ledger', 'creator_earnings', 'platform_revenue', 'payout_summary']),
      frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']),
      recipients: z.array(z.string().email()).min(1),
      formats: z.array(z.enum(['CSV', 'EXCEL', 'PDF'])).min(1).default(['PDF']),
      filters: z.object({
        creatorIds: z.array(z.string()).optional(),
        brandIds: z.array(z.string()).optional(),
        assetTypes: z.array(z.string()).optional(),
        licenseTypes: z.array(z.string()).optional(),
        statuses: z.array(z.string()).optional()
      }).optional(),
      deliveryOptions: z.object({
        emailDelivery: z.boolean().default(true),
        secureDownload: z.boolean().default(true),
        attachToEmail: z.boolean().default(false),
        downloadExpiration: z.number().min(1).max(720).default(168) // hours, default 1 week
      }).default({
        emailDelivery: true,
        secureDownload: true,
        attachToEmail: false,
        downloadExpiration: 168
      }),
      schedule: z.object({
        dayOfWeek: z.number().min(0).max(6).optional(), // 0-6 for weekly
        dayOfMonth: z.number().min(1).max(31).optional(), // 1-31 for monthly
        monthOfQuarter: z.number().min(1).max(3).optional(), // 1-3 for quarterly
        monthOfYear: z.number().min(1).max(12).optional(), // 1-12 for annually
        hour: z.number().min(0).max(23).default(9), // 0-23
        minute: z.number().min(0).max(59).default(0), // 0-59
        timezone: z.string().default('America/New_York')
      })
    }).refine(
      (data) => {
        // Weekly reports need dayOfWeek
        if (data.frequency === 'WEEKLY' && data.schedule.dayOfWeek === undefined) {
          return false;
        }
        // Monthly reports need dayOfMonth
        if (data.frequency === 'MONTHLY' && data.schedule.dayOfMonth === undefined) {
          return false;
        }
        // Quarterly reports need monthOfQuarter and dayOfMonth
        if (data.frequency === 'QUARTERLY' && (data.schedule.monthOfQuarter === undefined || data.schedule.dayOfMonth === undefined)) {
          return false;
        }
        // Annual reports need monthOfYear and dayOfMonth
        if (data.frequency === 'ANNUALLY' && (data.schedule.monthOfYear === undefined || data.schedule.dayOfMonth === undefined)) {
          return false;
        }
        return true;
      },
      { message: 'Schedule configuration must match frequency type' }
    ))
    .mutation(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();
        const { ScheduledReportService } = await import('./services/scheduled-reports.service');
        const scheduledService = new ScheduledReportService(prisma);

        // Verify user has permission to schedule reports
        const userRole = ctx.session?.user?.role;
        if (!userRole || !['ADMIN', 'CREATOR', 'BRAND'].includes(userRole)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Insufficient permissions to schedule reports'
          });
        }

        // Create the scheduled report
        const scheduledReportId = await scheduledService.createScheduledReport({
          name: input.name,
          reportType: input.reportType,
          frequency: input.frequency,
          recipients: input.recipients,
          formats: input.formats,
          filters: input.filters,
          deliveryOptions: input.deliveryOptions,
          schedule: input.schedule,
          createdBy: ctx.session!.user!.id
        });

        // Fetch the created report to return details
        const scheduledReport = await prisma.scheduledReport.findUnique({
          where: { id: scheduledReportId },
          include: {
            createdByUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });

        if (!scheduledReport) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to retrieve created scheduled report'
          });
        }

        return {
          success: true,
          scheduledReport: {
            id: scheduledReport.id,
            name: scheduledReport.name,
            reportType: scheduledReport.reportType,
            frequency: scheduledReport.frequency,
            cronExpression: scheduledReport.cronExpression,
            recipients: scheduledReport.recipients,
            isActive: scheduledReport.isActive,
            nextScheduledAt: scheduledReport.nextScheduledAt,
            parameters: scheduledReport.parameters,
            createdAt: scheduledReport.createdAt,
            createdBy: {
              id: scheduledReport.createdByUser.id,
              name: scheduledReport.createdByUser.name,
              email: scheduledReport.createdByUser.email
            }
          },
          message: `Report scheduled successfully. Next execution: ${scheduledReport.nextScheduledAt?.toISOString()}`
        };

      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to schedule report',
          cause: error
        });
      }
    }),

  /**
   * PUT /reports/schedule/:id
   * Update a scheduled report
   */
  updateScheduledReport: protectedProcedure
    .input(z.object({
      scheduledReportId: z.string(),
      name: z.string().min(1).max(255).optional(),
      reportType: z.enum(['royalty_statements', 'transaction_ledger', 'creator_earnings', 'platform_revenue', 'payout_summary']).optional(),
      frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']).optional(),
      recipients: z.array(z.string().email()).min(1).optional(),
      formats: z.array(z.enum(['CSV', 'EXCEL', 'PDF'])).min(1).optional(),
      filters: z.object({
        creatorIds: z.array(z.string()).optional(),
        brandIds: z.array(z.string()).optional(),
        assetTypes: z.array(z.string()).optional(),
        licenseTypes: z.array(z.string()).optional(),
        statuses: z.array(z.string()).optional()
      }).optional(),
      deliveryOptions: z.object({
        emailDelivery: z.boolean(),
        secureDownload: z.boolean(),
        attachToEmail: z.boolean(),
        downloadExpiration: z.number().min(1).max(720)
      }).optional(),
      schedule: z.object({
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(31).optional(),
        monthOfQuarter: z.number().min(1).max(3).optional(),
        monthOfYear: z.number().min(1).max(12).optional(),
        hour: z.number().min(0).max(23),
        minute: z.number().min(0).max(59),
        timezone: z.string()
      }).optional(),
      isActive: z.boolean().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();
        const { ScheduledReportService } = await import('./services/scheduled-reports.service');
        const scheduledService = new ScheduledReportService(prisma);

        // Check if user has permission to update this scheduled report
        const existingReport = await prisma.scheduledReport.findUnique({
          where: { id: input.scheduledReportId }
        });

        if (!existingReport) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Scheduled report not found'
          });
        }

        // Verify user owns this report or is admin
        if (existingReport.createdBy !== ctx.session?.user?.id && ctx.session?.user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Access denied to this scheduled report'
          });
        }

        // Only call update if there are actual updates to make
        const hasUpdates = input.name || input.reportType || input.frequency || 
                          input.recipients || input.formats || input.filters || 
                          input.deliveryOptions || input.schedule;

        if (hasUpdates) {
          // Update the scheduled report
          await scheduledService.updateScheduledReport(
            input.scheduledReportId,
            {
              name: input.name,
              reportType: input.reportType,
              frequency: input.frequency,
              recipients: input.recipients,
              formats: input.formats,
              filters: input.filters,
              deliveryOptions: input.deliveryOptions,
              schedule: input.schedule
            },
            ctx.session!.user!.id
          );
        }

        // If isActive is provided, update that separately
        if (input.isActive !== undefined) {
          await prisma.scheduledReport.update({
            where: { id: input.scheduledReportId },
            data: { isActive: input.isActive }
          });
        }

        // Fetch updated report
        const updatedReport = await prisma.scheduledReport.findUnique({
          where: { id: input.scheduledReportId },
          include: {
            createdByUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        });

        return {
          success: true,
          scheduledReport: {
            id: updatedReport!.id,
            name: updatedReport!.name,
            reportType: updatedReport!.reportType,
            frequency: updatedReport!.frequency,
            cronExpression: updatedReport!.cronExpression,
            recipients: updatedReport!.recipients,
            isActive: updatedReport!.isActive,
            nextScheduledAt: updatedReport!.nextScheduledAt,
            parameters: updatedReport!.parameters,
            updatedAt: updatedReport!.updatedAt,
            createdBy: {
              id: updatedReport!.createdByUser.id,
              name: updatedReport!.createdByUser.name,
              email: updatedReport!.createdByUser.email
            }
          },
          message: 'Scheduled report updated successfully'
        };

      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update scheduled report',
          cause: error
        });
      }
    }),

  /**
   * DELETE /reports/schedule/:id
   * Delete/deactivate a scheduled report
   */
  deleteScheduledReport: protectedProcedure
    .input(z.object({
      scheduledReportId: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const prisma = ctx.db || new PrismaClient();
        const { ScheduledReportService } = await import('./services/scheduled-reports.service');
        const scheduledService = new ScheduledReportService(prisma);

        // Check if user has permission to delete this scheduled report
        const existingReport = await prisma.scheduledReport.findUnique({
          where: { id: input.scheduledReportId }
        });

        if (!existingReport) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Scheduled report not found'
          });
        }

        // Verify user owns this report or is admin
        if (existingReport.createdBy !== ctx.session?.user?.id && ctx.session?.user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Access denied to this scheduled report'
          });
        }

        // Delete the scheduled report
        await scheduledService.deleteScheduledReport(
          input.scheduledReportId,
          ctx.session!.user!.id
        );

        return {
          success: true,
          message: 'Scheduled report deleted successfully'
        };

      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete scheduled report',
          cause: error
        });
      }
    })
});

export type ReportsRouter = typeof reportsRouter;
