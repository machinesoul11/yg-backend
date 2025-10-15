/**
 * Financial Report Generation Background Job
 * 
 * Handles asynchronous generation of financial reports including:
 * - Revenue reports with time-series analysis
 * - Payout summaries with creator breakdowns
 * - Tax document compilation
 * - Stripe reconciliation reports
 * - Custom financial reports
 * 
 * Features PDF generation, email delivery, and secure storage
 */

import { Queue, Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { redisConnection } from '@/lib/db/redis';
import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';
import { FinancialReportingService } from '@/modules/reports/services/financial-reporting.service';
import { 
  StripeReconciliationService,
  createAuditReconciliationServices 
} from '@/modules/audit-reconciliation';
import { AuditService } from '@/lib/services/audit.service';
import { EmailService } from '@/lib/services/email/email.service';
import { redis } from '@/lib/redis';
import type { FinancialReportType } from '@prisma/client';

export interface ReportGenerationJobData {
  reportId: string;
  reportType: 'revenue' | 'payouts' | 'tax' | 'reconciliation' | 'custom';
  parameters: Record<string, any>;
  format: 'pdf' | 'csv' | 'excel' | 'json';
  generatedBy: string;
  emailDelivery?: {
    recipients: string[];
    subject?: string;
    message?: string;
  };
}

export interface ReportGenerationResult {
  reportId: string;
  status: 'COMPLETED' | 'FAILED';
  storageKey?: string;
  downloadUrl?: string;
  fileSize?: number;
  errorMessage?: string;
  generatedAt: Date;
}

// Initialize services
const auditService = new AuditService(prisma);
const emailService = new EmailService();
const financialService = new FinancialReportingService(prisma, redis);

/**
 * Report Generation Queue
 */
export const reportGenerationQueue = new Queue<ReportGenerationJobData>(
  'financial-report-generation',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30000, // 30 seconds
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
);

/**
 * Report Generation Worker
 */
export const reportGenerationWorker = new Worker<ReportGenerationJobData>(
  'financial-report-generation',
  async (job: Job<ReportGenerationJobData>) => {
    return await generateFinancialReport(job);
  },
  {
    connection: redisConnection,
    concurrency: 2, // Process 2 reports simultaneously
  }
);

/**
 * Main report generation function
 */
async function generateFinancialReport(
  job: Job<ReportGenerationJobData>
): Promise<ReportGenerationResult> {
  const { reportId, reportType, parameters, format, generatedBy, emailDelivery } = job.data;

  try {
    job.updateProgress(10);
    await job.log(`Starting ${reportType} report generation`);

    // Update report status to processing
    await prisma.financialReport.update({
      where: { id: reportId },
      data: { 
        status: 'GENERATING',
        metadata: {
          ...((await prisma.financialReport.findUnique({ where: { id: reportId } }))?.metadata as any || {}),
          processingStarted: new Date().toISOString()
        }
      }
    });

    job.updateProgress(20);

    // Generate report data based on type
    let reportData: any;
    let filename: string;

    switch (reportType) {
      case 'revenue':
        reportData = await generateRevenueReport(parameters, job);
        filename = `revenue_report_${parameters.startDate?.split('T')[0] || 'custom'}_${Date.now()}`;
        break;

      case 'payouts':
        reportData = await generatePayoutReport(parameters, job);
        filename = `payout_report_${parameters.startDate?.split('T')[0] || 'custom'}_${Date.now()}`;
        break;

      case 'tax':
        reportData = await generateTaxReport(parameters, job);
        filename = `tax_report_${parameters.taxYear || new Date().getFullYear()}_${Date.now()}`;
        break;

      case 'reconciliation':
        reportData = await generateReconciliationReport(parameters, job);
        filename = `reconciliation_report_${parameters.startDate?.split('T')[0] || 'custom'}_${Date.now()}`;
        break;

      case 'custom':
        reportData = await generateCustomReport(parameters, job);
        filename = `custom_report_${Date.now()}`;
        break;

      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }

    job.updateProgress(60);

    // Generate file based on format
    const fileBuffer = await generateReportFile(reportData, format, filename, job);
    
    job.updateProgress(80);

    // Upload to storage
    const storageKey = `reports/${reportType}/${new Date().getFullYear()}/${filename}.${format}`;
    
    await storageProvider.upload({
      key: storageKey,
      file: fileBuffer,
      contentType: getContentType(format),
      metadata: {
        reportId,
        reportType,
        generatedBy,
        format,
        originalFilename: `${filename}.${format}`
      }
    });

    job.updateProgress(90);

    // Generate secure download URL (expires in 7 days)
    const downloadUrl = await storageProvider.getDownloadUrl(storageKey, 7 * 24 * 60 * 60);

    // Update report record
    await prisma.financialReport.update({
      where: { id: reportId },
      data: {
        status: 'COMPLETED',
        storageKey,
        metadata: {
          ...((await prisma.financialReport.findUnique({ where: { id: reportId } }))?.metadata as any || {}),
          filename: `${filename}.${format}`,
          fileSize: fileBuffer.length,
          downloadUrl,
          completedAt: new Date().toISOString()
        }
      }
    });

    // Send email notification if requested
    if (emailDelivery && emailDelivery.recipients.length > 0) {
      await sendReportNotification(reportId, reportData, emailDelivery, downloadUrl);
    }

    // Log success
    await auditService.log({
      action: 'FINANCIAL_REPORT_GENERATED',
      entityType: 'financial_report',
      entityId: reportId,
      userId: generatedBy,
      after: {
        reportType,
        format,
        fileSize: fileBuffer.length,
        storageKey
      }
    });

    job.updateProgress(100);
    await job.log(`Report generation completed successfully`);

    return {
      reportId,
      status: 'COMPLETED',
      storageKey,
      downloadUrl,
      fileSize: fileBuffer.length,
      generatedAt: new Date()
    };

  } catch (error) {
    await job.log(`Report generation failed: ${error instanceof Error ? error.message : String(error)}`);

    // Update report status to failed
    await prisma.financialReport.update({
      where: { id: reportId },
      data: {
        status: 'FAILED',
        metadata: {
          ...((await prisma.financialReport.findUnique({ where: { id: reportId } }))?.metadata as any || {}),
          error: error instanceof Error ? error.message : String(error),
          failedAt: new Date().toISOString()
        }
      }
    });

    // Log failure
    await auditService.log({
      action: 'FINANCIAL_REPORT_GENERATION_FAILED',
      entityType: 'financial_report',
      entityId: reportId,
      userId: generatedBy,
      after: {
        error: error instanceof Error ? error.message : String(error),
        reportType,
        format
      }
    });

    return {
      reportId,
      status: 'FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
      generatedAt: new Date()
    };
  }
}

/**
 * Generate revenue report data
 */
async function generateRevenueReport(parameters: any, job: Job): Promise<any> {
  await job.log('Generating revenue report data');
  
  const { startDate, endDate, granularity = 'daily', filters } = parameters;
  
  const [revenueBreakdown, timeSeries, totalRevenue] = await Promise.all([
    financialService.generateRevenueBreakdown(new Date(startDate), new Date(endDate), filters),
    financialService.getRevenueTimeSeries(new Date(startDate), new Date(endDate), granularity, filters),
    financialService.getTotalRevenue(new Date(startDate), new Date(endDate), filters)
  ]);

  return {
    type: 'revenue',
    period: { startDate, endDate, granularity },
    summary: { totalRevenueCents: totalRevenue },
    breakdown: revenueBreakdown,
    timeSeries,
    generatedAt: new Date()
  };
}

/**
 * Generate payout report data
 */
async function generatePayoutReport(parameters: any, job: Job): Promise<any> {
  await job.log('Generating payout report data');
  
  const { startDate, endDate, status = 'all', creatorId } = parameters;
  
  const whereClause: any = {
    createdAt: { gte: new Date(startDate), lte: new Date(endDate) }
  };

  if (status !== 'all') whereClause.status = status.toUpperCase();
  if (creatorId) whereClause.creatorId = creatorId;

  const [payouts, summary, statusBreakdown] = await Promise.all([
    prisma.payout.findMany({
      where: whereClause,
      include: {
        creator: {
          select: {
            id: true,
            user: { select: { name: true, email: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.payout.aggregate({
      where: whereClause,
      _sum: { amountCents: true },
      _count: { id: true },
      _avg: { amountCents: true }
    }),
    prisma.payout.groupBy({
      by: ['status'],
      where: whereClause,
      _sum: { amountCents: true },
      _count: { id: true }
    })
  ]);

  return {
    type: 'payouts',
    period: { startDate, endDate },
    summary,
    statusBreakdown,
    payouts,
    generatedAt: new Date()
  };
}

/**
 * Generate tax report data
 */
async function generateTaxReport(parameters: any, job: Job): Promise<any> {
  await job.log('Generating tax report data');
  
  const { taxYear, documentType = 'all' } = parameters;
  
  const whereClause: any = {};
  if (taxYear) whereClause.taxYear = parseInt(taxYear);
  if (documentType !== 'all') whereClause.documentType = documentType.toUpperCase();

  const [documents, summary] = await Promise.all([
    prisma.taxDocument.findMany({
      where: whereClause,
      include: {
        creator: {
          select: {
            id: true,
            user: { select: { name: true, email: true } }
          }
        }
      },
      orderBy: { generatedAt: 'desc' }
    }),
    prisma.taxDocument.groupBy({
      by: ['taxYear', 'documentType'],
      where: whereClause,
      _count: { id: true },
      _sum: { totalEarningsCents: true }
    })
  ]);

  return {
    type: 'tax',
    parameters: { taxYear, documentType },
    summary,
    documents,
    generatedAt: new Date()
  };
}

/**
 * Generate reconciliation report data
 */
async function generateReconciliationReport(parameters: any, job: Job): Promise<any> {
  await job.log('Generating reconciliation report data');
  
  const { startDate, endDate } = parameters;
  
  const services = createAuditReconciliationServices(
    prisma,
    auditService,
    process.env.STRIPE_SECRET_KEY
  );

  const reconciliationReport = await services.stripeReconciliation.generateStripeReconciliationReport({
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    requestedBy: 'system'
  });

  return {
    type: 'reconciliation',
    period: { startDate, endDate },
    reconciliation: reconciliationReport,
    generatedAt: new Date()
  };
}

/**
 * Generate custom report data
 */
async function generateCustomReport(parameters: any, job: Job): Promise<any> {
  await job.log('Generating custom report data');
  
  // Custom report logic would go here based on parameters
  // For now, return a comprehensive financial statement
  const { startDate, endDate, includeDetails = true, filters } = parameters;
  
  const report = await financialService.generateFinancialStatement({
    name: `Custom Financial Report`,
    type: 'financial_statement',
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    format: 'json',
    includeBalanceSheet: includeDetails,
    includeCashFlow: includeDetails,
    includeBreakdowns: includeDetails,
    filters,
    generatedBy: 'system'
  });

  return {
    type: 'custom',
    ...report,
    generatedAt: new Date()
  };
}

/**
 * Generate report file in specified format
 */
async function generateReportFile(
  reportData: any,
  format: string,
  filename: string,
  job: Job
): Promise<Buffer> {
  await job.log(`Generating ${format.toUpperCase()} file`);

  switch (format) {
    case 'json':
      return Buffer.from(JSON.stringify(reportData, null, 2));
      
    case 'csv':
      return generateCSVReport(reportData);
      
    case 'excel':
      return generateExcelReport(reportData);
      
    case 'pdf':
      return generatePDFReport(reportData, filename);
      
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Generate CSV report
 */
function generateCSVReport(reportData: any): Buffer {
  // Simple CSV generation - in production you'd use a library like csv-writer
  const rows = [];
  
  // Add headers based on report type
  if (reportData.type === 'revenue' && reportData.timeSeries) {
    rows.push(['Period', 'Revenue (Cents)', 'Transaction Count']);
    reportData.timeSeries.forEach((period: any) => {
      rows.push([period.period, period.revenueCents, period.transactionCount]);
    });
  } else if (reportData.type === 'payouts' && reportData.payouts) {
    rows.push(['Creator', 'Amount (Cents)', 'Status', 'Created At', 'Processed At']);
    reportData.payouts.forEach((payout: any) => {
      rows.push([
        payout.creator.user?.name || 'Unknown',
        payout.amountCents,
        payout.status,
        payout.createdAt,
        payout.processedAt || ''
      ]);
    });
  } else {
    // Generic JSON to CSV conversion
    rows.push(['Key', 'Value']);
    Object.entries(reportData).forEach(([key, value]) => {
      rows.push([key, typeof value === 'object' ? JSON.stringify(value) : String(value)]);
    });
  }

  const csvContent = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  return Buffer.from(csvContent);
}

/**
 * Generate Excel report
 */
function generateExcelReport(reportData: any): Buffer {
  // Placeholder - in production you'd use a library like exceljs
  // For now, return CSV format with Excel content type
  return generateCSVReport(reportData);
}

/**
 * Generate PDF report
 */
function generatePDFReport(reportData: any, filename: string): Buffer {
  // Placeholder - in production you'd use a library like puppeteer, jsPDF, or react-pdf
  // For now, return a simple text representation
  const content = `
FINANCIAL REPORT
================

Report Type: ${reportData.type}
Generated At: ${reportData.generatedAt}
Period: ${reportData.period ? `${reportData.period.startDate} to ${reportData.period.endDate}` : 'N/A'}

${JSON.stringify(reportData, null, 2)}
  `;
  
  return Buffer.from(content);
}

/**
 * Send email notification for completed report
 */
async function sendReportNotification(
  reportId: string,
  reportData: any,
  emailDelivery: any,
  downloadUrl: string
): Promise<void> {
  const subject = emailDelivery.subject || `Financial Report Ready: ${reportData.type}`;
  const message = emailDelivery.message || 'Your requested financial report has been generated and is ready for download.';

  for (const recipient of emailDelivery.recipients) {
    try {
      await emailService.sendTransactional({
        email: recipient,
        subject,
        template: 'financial_report_ready',
        variables: {
          message,
          reportType: reportData.type,
          generatedAt: reportData.generatedAt,
          period: reportData.period,
          downloadUrl,
        },
      });

      console.log(`Email sent successfully to ${recipient}`);
    } catch (error) {
      console.error(`Failed to send report notification to ${recipient}:`, error);
      // Continue with other recipients
    }
  }
}

/**
 * Get content type for format
 */
function getContentType(format: string): string {
  switch (format) {
    case 'pdf': return 'application/pdf';
    case 'csv': return 'text/csv';
    case 'excel': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'json': return 'application/json';
    default: return 'application/octet-stream';
  }
}

// Worker event handlers
reportGenerationWorker.on('completed', (job, result) => {
  console.log(`[ReportGeneration] Job ${job.id} completed for report ${result.reportId}`);
});

reportGenerationWorker.on('failed', (job, error) => {
  console.error(`[ReportGeneration] Job ${job?.id} failed:`, error.message);
});

reportGenerationWorker.on('error', (error) => {
  console.error('[ReportGeneration] Worker error:', error);
});

// Helper function to queue a report generation job
export async function queueReportGeneration(data: ReportGenerationJobData): Promise<string> {
  const job = await reportGenerationQueue.add('generate-report', data, {
    priority: 1, // Normal priority
    delay: 0
  });
  
  return job.id!;
}

// Helper function to check report generation status
export async function getReportGenerationStatus(jobId: string) {
  const job = await reportGenerationQueue.getJob(jobId);
  if (!job) return null;
  
  return {
    id: job.id,
    status: await job.getState(),
    progress: job.progress,
    data: job.data,
    result: job.returnvalue,
    error: job.failedReason,
    logs: [] // Job logs would need to be fetched from Redis directly
  };
}
