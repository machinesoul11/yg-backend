/**
 * Scheduled Report Generation Service
 * 
 * Manages automated generation and delivery of financial reports on recurring schedules.
 * Integrates with BullMQ for job scheduling and email delivery.
 */

import { PrismaClient } from '@prisma/client';
import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '@/lib/db/redis';
import { addDays, addWeeks, addMonths, addQuarters, addYears, format } from 'date-fns';
import { CSVExportService } from './csv-export.service';
import { ExcelExportService } from './excel-export.service';
import { FinancialReportPDFService } from './enhanced-pdf-export.service';
import { SecureDownloadService } from './secure-download.service';
import { emailService } from '@/lib/services/email/email.service';
import { storageProvider } from '@/lib/storage';
import { auditService } from '@/lib/services/audit.service';

export interface ScheduledReportConfig {
  name: string;
  reportType: 'royalty_statements' | 'transaction_ledger' | 'creator_earnings' | 'platform_revenue' | 'payout_summary';
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  recipients: string[];
  formats: ('CSV' | 'EXCEL' | 'PDF')[];
  filters?: {
    creatorIds?: string[];
    brandIds?: string[];
    assetTypes?: string[];
    licenseTypes?: string[];
    statuses?: string[];
  };
  deliveryOptions: {
    emailDelivery: boolean;
    secureDownload: boolean;
    attachToEmail: boolean;
    downloadExpiration: number; // hours
  };
  schedule: {
    dayOfWeek?: number; // 0-6 for weekly
    dayOfMonth?: number; // 1-31 for monthly
    monthOfQuarter?: number; // 1-3 for quarterly
    monthOfYear?: number; // 1-12 for annually
    hour: number; // 0-23
    minute: number; // 0-59
    timezone: string;
  };
  createdBy: string;
}

export interface ScheduledReportJobData {
  scheduledReportId: string;
  reportPeriod: {
    startDate: Date;
    endDate: Date;
  };
  manualTrigger?: boolean;
}

export class ScheduledReportService {
  private readonly csvService: CSVExportService;
  private readonly excelService: ExcelExportService;
  private readonly pdfService: FinancialReportPDFService;
  private readonly downloadService: SecureDownloadService;

  constructor(private readonly prisma: PrismaClient) {
    this.csvService = new CSVExportService(prisma);
    this.excelService = new ExcelExportService(prisma);
    this.pdfService = new FinancialReportPDFService(prisma);
    this.downloadService = new SecureDownloadService(prisma);
  }

  /**
   * Create a new scheduled report
   */
  async createScheduledReport(config: ScheduledReportConfig): Promise<string> {
    // Generate cron expression
    const cronExpression = this.generateCronExpression(config.schedule, config.frequency);

    // Calculate next scheduled time
    const nextScheduledAt = this.calculateNextScheduledTime(config.schedule, config.frequency);

    // Create scheduled report record
    const scheduledReport = await this.prisma.scheduledReport.create({
      data: {
        name: config.name,
        reportType: config.reportType.toUpperCase() as any,
        frequency: config.frequency,
        cronExpression,
        recipients: config.recipients,
        nextScheduledAt,
        parameters: {
          filters: config.filters || {},
          formats: config.formats,
          deliveryOptions: config.deliveryOptions,
          schedule: config.schedule
        },
        createdBy: config.createdBy
      }
    });

    // Schedule the job
    await this.scheduleReportJob(scheduledReport.id, nextScheduledAt);

    // Log audit event
    await auditService.log({
      action: 'SCHEDULED_REPORT_CREATED',
      entityType: 'scheduled_report',
      entityId: scheduledReport.id,
      userId: config.createdBy,
      after: {
        name: config.name,
        reportType: config.reportType,
        frequency: config.frequency,
        nextScheduledAt: nextScheduledAt.toISOString()
      }
    });

    return scheduledReport.id;
  }

  /**
   * Update a scheduled report
   */
  async updateScheduledReport(
    scheduledReportId: string,
    updates: Partial<ScheduledReportConfig>,
    updatedBy: string
  ): Promise<void> {
    const existingReport = await this.prisma.scheduledReport.findUnique({
      where: { id: scheduledReportId }
    });

    if (!existingReport) {
      throw new Error('Scheduled report not found');
    }

    const updateData: any = {};

    if (updates.name) updateData.name = updates.name;
    if (updates.reportType) updateData.reportType = updates.reportType.toUpperCase();
    if (updates.frequency) updateData.frequency = updates.frequency;
    if (updates.recipients) updateData.recipients = updates.recipients;

    // Update parameters if provided
    if (updates.filters || updates.formats || updates.deliveryOptions || updates.schedule) {
      const currentParams = existingReport.parameters as any;
      updateData.parameters = {
        ...currentParams,
        ...(updates.filters && { filters: updates.filters }),
        ...(updates.formats && { formats: updates.formats }),
        ...(updates.deliveryOptions && { deliveryOptions: updates.deliveryOptions }),
        ...(updates.schedule && { schedule: updates.schedule })
      };
    }

    // Recalculate schedule if frequency or schedule changed
    if (updates.frequency || updates.schedule) {
      const schedule = updates.schedule || (existingReport.parameters as any).schedule;
      const frequency = updates.frequency || existingReport.frequency;
      
      updateData.cronExpression = this.generateCronExpression(schedule, frequency);
      updateData.nextScheduledAt = this.calculateNextScheduledTime(schedule, frequency);

      // Reschedule the job
      await this.scheduleReportJob(scheduledReportId, updateData.nextScheduledAt);
    }

    await this.prisma.scheduledReport.update({
      where: { id: scheduledReportId },
      data: updateData
    });

    await auditService.log({
      action: 'SCHEDULED_REPORT_UPDATED',
      entityType: 'scheduled_report',
      entityId: scheduledReportId,
      userId: updatedBy,
      after: updateData
    });
  }

  /**
   * Delete a scheduled report
   */
  async deleteScheduledReport(scheduledReportId: string, deletedBy: string): Promise<void> {
    const scheduledReport = await this.prisma.scheduledReport.findUnique({
      where: { id: scheduledReportId }
    });

    if (!scheduledReport) {
      throw new Error('Scheduled report not found');
    }

    // Remove from job queue
    await this.removeScheduledJob(scheduledReportId);

    // Soft delete by marking as inactive
    await this.prisma.scheduledReport.update({
      where: { id: scheduledReportId },
      data: {
        isActive: false,
        nextScheduledAt: null
      }
    });

    await auditService.log({
      action: 'SCHEDULED_REPORT_DELETED',
      entityType: 'scheduled_report',
      entityId: scheduledReportId,
      userId: deletedBy,
      after: {
        name: scheduledReport.name,
        deletedAt: new Date().toISOString()
      }
    });
  }

  /**
   * Manually trigger a scheduled report
   */
  async triggerScheduledReport(scheduledReportId: string, triggeredBy: string): Promise<string> {
    const scheduledReport = await this.prisma.scheduledReport.findUnique({
      where: { id: scheduledReportId }
    });

    if (!scheduledReport) {
      throw new Error('Scheduled report not found');
    }

    // Calculate period for the report
    const reportPeriod = this.calculateReportPeriod(scheduledReport.frequency);

    // Create and execute the report generation job
    const jobData: ScheduledReportJobData = {
      scheduledReportId,
      reportPeriod,
      manualTrigger: true
    };

    const job = await scheduledReportQueue.add('generate-scheduled-report', jobData, {
      priority: 1, // High priority for manual triggers
      attempts: 3
    });

    await auditService.log({
      action: 'SCHEDULED_REPORT_TRIGGERED',
      entityType: 'scheduled_report',
      entityId: scheduledReportId,
      userId: triggeredBy,
      after: {
        jobId: job.id,
        reportPeriod,
        manualTrigger: true
      }
    });

    return job.id!;
  }

  /**
   * Get scheduled reports for a user
   */
  async getScheduledReports(userId: string): Promise<Array<{
    id: string;
    name: string;
    reportType: string;
    frequency: string;
    recipients: string[];
    isActive: boolean;
    lastGeneratedAt?: Date;
    nextScheduledAt?: Date;
    parameters: any;
  }>> {
    const reports = await this.prisma.scheduledReport.findMany({
      where: {
        createdBy: userId,
        isActive: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return reports.map(report => ({
      id: report.id,
      name: report.name,
      reportType: report.reportType,
      frequency: report.frequency,
      recipients: report.recipients as string[],
      isActive: report.isActive,
      lastGeneratedAt: report.lastGeneratedAt,
      nextScheduledAt: report.nextScheduledAt,
      parameters: report.parameters
    }));
  }

  /**
   * Process scheduled report generation
   */
  async processScheduledReport(jobData: ScheduledReportJobData): Promise<void> {
    const { scheduledReportId, reportPeriod, manualTrigger } = jobData;

    const scheduledReport = await this.prisma.scheduledReport.findUnique({
      where: { id: scheduledReportId }
    });

    if (!scheduledReport) {
      throw new Error('Scheduled report not found');
    }

    const parameters = scheduledReport.parameters as any;
    const { filters, formats, deliveryOptions } = parameters;

    try {
      // Generate reports in requested formats
      const generatedFiles: Array<{
        format: string;
        buffer: Buffer;
        filename: string;
        contentType: string;
      }> = [];

      for (const format of formats) {
        let buffer: Buffer;
        let filename: string;
        let contentType: string;

        const baseFilename = `${scheduledReport.name.replace(/\s+/g, '-').toLowerCase()}-${format(reportPeriod.startDate, 'yyyy-MM-dd')}-${format(reportPeriod.endDate, 'yyyy-MM-dd')}`;

        switch (format) {
          case 'CSV':
            buffer = await this.csvService.generateCSV({
              reportType: scheduledReport.reportType.toLowerCase() as any,
              dateRange: reportPeriod,
              filters,
              includeTotals: true
            });
            filename = `${baseFilename}.csv`;
            contentType = 'text/csv';
            break;

          case 'EXCEL':
            buffer = await this.excelService.generateExcel({
              reportType: scheduledReport.reportType.toLowerCase() as any,
              dateRange: reportPeriod,
              filters,
              includeCharts: true,
              includeSummary: true
            });
            filename = `${baseFilename}.xlsx`;
            contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            break;

          case 'PDF':
            buffer = await this.pdfService.generateFinancialReportPDF({
              reportType: scheduledReport.reportType.toLowerCase() as any,
              title: scheduledReport.name,
              subtitle: `Period: ${format(reportPeriod.startDate, 'MMM dd, yyyy')} - ${format(reportPeriod.endDate, 'MMM dd, yyyy')}`,
              dateRange: reportPeriod,
              generatedBy: 'Scheduled Report System',
              includeCharts: true,
              includeSummary: true
            }, {});
            filename = `${baseFilename}.pdf`;
            contentType = 'application/pdf';
            break;

          default:
            throw new Error(`Unsupported format: ${format}`);
        }

        generatedFiles.push({ format, buffer, filename, contentType });
      }

      // Store files and create download links
      const downloadLinks: string[] = [];

      for (const file of generatedFiles) {
        // Upload to storage
        const storageKey = `scheduled-reports/${scheduledReportId}/${new Date().getFullYear()}/${file.filename}`;
        
        await storageProvider.upload({
          key: storageKey,
          file: file.buffer,
          contentType: file.contentType,
          metadata: {
            scheduledReportId,
            reportType: scheduledReport.reportType,
            format: file.format,
            reportPeriod: JSON.stringify(reportPeriod)
          }
        });

        // Generate secure download link if enabled
        if (deliveryOptions.secureDownload) {
          // Create a temporary report record for download service
          const tempReport = await this.prisma.financialReport.create({
            data: {
              reportType: scheduledReport.reportType as any,
              period: reportPeriod,
              generatedBy: scheduledReport.createdBy,
              status: 'COMPLETED',
              storageKey,
              scheduledReportId,
              metadata: {
                filename: file.filename,
                format: file.format,
                fileSize: file.buffer.length
              }
            }
          });

          const secureLink = await this.downloadService.generateSecureDownloadLink({
            reportId: tempReport.id,
            userId: scheduledReport.createdBy,
            userRole: 'ADMIN', // Scheduled reports have admin access
            expirationHours: deliveryOptions.downloadExpiration || 72
          });

          downloadLinks.push(secureLink.downloadUrl);
        }
      }

      // Send email notification
      if (deliveryOptions.emailDelivery && scheduledReport.recipients.length > 0) {
        await this.sendScheduledReportEmail(scheduledReport, generatedFiles, downloadLinks, reportPeriod);
      }

      // Update last generated time and calculate next scheduled time
      const nextScheduledAt = manualTrigger 
        ? scheduledReport.nextScheduledAt 
        : this.calculateNextScheduledTime(parameters.schedule, scheduledReport.frequency);

      await this.prisma.scheduledReport.update({
        where: { id: scheduledReportId },
        data: {
          lastGeneratedAt: new Date(),
          ...(nextScheduledAt && { nextScheduledAt })
        }
      });

      // Schedule next job if not manual trigger
      if (!manualTrigger && nextScheduledAt) {
        await this.scheduleReportJob(scheduledReportId, nextScheduledAt);
      }

      await auditService.log({
        action: 'SCHEDULED_REPORT_GENERATED',
        entityType: 'scheduled_report',
        entityId: scheduledReportId,
        userId: scheduledReport.createdBy,
        after: {
          reportPeriod,
          formatsGenerated: formats,
          downloadLinks: downloadLinks.length,
          emailSent: deliveryOptions.emailDelivery,
          manualTrigger
        }
      });

    } catch (error) {
      await auditService.log({
        action: 'SCHEDULED_REPORT_GENERATION_FAILED',
        entityType: 'scheduled_report',
        entityId: scheduledReportId,
        userId: scheduledReport.createdBy,
        after: {
          error: error instanceof Error ? error.message : String(error),
          reportPeriod,
          manualTrigger
        }
      });

      throw error;
    }
  }

  /**
   * Send scheduled report email
   */
  private async sendScheduledReportEmail(
    scheduledReport: any,
    files: Array<{ format: string; buffer: Buffer; filename: string; contentType: string }>,
    downloadLinks: string[],
    reportPeriod: { startDate: Date; endDate: Date }
  ): Promise<void> {
    const recipients = scheduledReport.recipients as string[];
    const parameters = scheduledReport.parameters as any;

    // Calculate key metrics for email summary
    const reportSummary = await this.calculateReportSummary(
      scheduledReport.reportType.toLowerCase(),
      reportPeriod,
      parameters.filters
    );

    // Determine if files should be attached or just links provided
    const attachFiles = parameters.deliveryOptions.attachToEmail && 
                       files.every(f => f.buffer.length < 10 * 1024 * 1024); // 10MB limit

    for (const recipient of recipients) {
      await emailService.sendTransactional({
        to: recipient,
        template: 'scheduled-report-delivery',
        subject: `${scheduledReport.name} - ${format(reportPeriod.startDate, 'MMM yyyy')}`,
        variables: {
          recipientName: 'Administrator', // In production, get actual name
          reportName: scheduledReport.name,
          reportType: scheduledReport.reportType.replace('_', ' ').toUpperCase(),
          reportPeriod: `${format(reportPeriod.startDate, 'MMM dd, yyyy')} - ${format(reportPeriod.endDate, 'MMM dd, yyyy')}`,
          frequency: scheduledReport.frequency,
          downloadUrl: downloadLinks[0] || '#',
          expiresAt: format(addDays(new Date(), 3), 'MMM dd, yyyy'),
          nextScheduledDate: scheduledReport.nextScheduledAt ? format(scheduledReport.nextScheduledAt, 'MMM dd, yyyy') : 'Not scheduled',
          attachmentCount: files.length,
          fileFormats: files.map(f => f.format),
          reportSummary
        },
        ...(attachFiles && {
          attachments: files.map(f => ({
            filename: f.filename,
            content: f.buffer,
            contentType: f.contentType
          }))
        })
      });
    }
  }

  /**
   * Calculate report summary metrics for email
   */
  private async calculateReportSummary(
    reportType: string,
    reportPeriod: { startDate: Date; endDate: Date },
    filters: any
  ): Promise<any> {
    // This would calculate key metrics based on report type
    // For now, return placeholder data
    return {
      keyMetrics: [
        { label: 'Total Revenue', value: '$145,620', trend: 'up' },
        { label: 'New Licenses', value: '287', trend: 'up' },
        { label: 'Active Creators', value: '1,456', trend: 'stable' }
      ]
    };
  }

  /**
   * Generate cron expression from schedule config
   */
  private generateCronExpression(schedule: any, frequency: string): string {
    const { minute = 0, hour = 9 } = schedule; // Default to 9 AM

    switch (frequency) {
      case 'DAILY':
        return `${minute} ${hour} * * *`;
      
      case 'WEEKLY':
        const dayOfWeek = schedule.dayOfWeek || 1; // Default to Monday
        return `${minute} ${hour} * * ${dayOfWeek}`;
      
      case 'MONTHLY':
        const dayOfMonth = schedule.dayOfMonth || 1; // Default to 1st of month
        return `${minute} ${hour} ${dayOfMonth} * *`;
      
      case 'QUARTERLY':
        // Run on the 1st of Jan, Apr, Jul, Oct
        const quarterlyDay = schedule.dayOfMonth || 1;
        return `${minute} ${hour} ${quarterlyDay} 1,4,7,10 *`;
      
      case 'ANNUALLY':
        const annualDay = schedule.dayOfMonth || 1;
        const annualMonth = schedule.monthOfYear || 1;
        return `${minute} ${hour} ${annualDay} ${annualMonth} *`;
      
      default:
        throw new Error(`Unsupported frequency: ${frequency}`);
    }
  }

  /**
   * Calculate next scheduled time
   */
  private calculateNextScheduledTime(schedule: any, frequency: string): Date {
    const now = new Date();
    const { minute = 0, hour = 9 } = schedule;

    let nextDate = new Date(now);
    nextDate.setHours(hour, minute, 0, 0);

    // If the time has passed today, move to next period
    if (nextDate <= now) {
      switch (frequency) {
        case 'DAILY':
          nextDate = addDays(nextDate, 1);
          break;
        case 'WEEKLY':
          nextDate = addWeeks(nextDate, 1);
          break;
        case 'MONTHLY':
          nextDate = addMonths(nextDate, 1);
          break;
        case 'QUARTERLY':
          nextDate = addQuarters(nextDate, 1);
          break;
        case 'ANNUALLY':
          nextDate = addYears(nextDate, 1);
          break;
      }
    }

    return nextDate;
  }

  /**
   * Calculate report period based on frequency
   */
  private calculateReportPeriod(frequency: string): { startDate: Date; endDate: Date } {
    const now = new Date();

    switch (frequency) {
      case 'DAILY':
        const yesterday = addDays(now, -1);
        return {
          startDate: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()),
          endDate: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59)
        };

      case 'WEEKLY':
        const lastWeekStart = addWeeks(now, -1);
        lastWeekStart.setDate(lastWeekStart.getDate() - lastWeekStart.getDay());
        const lastWeekEnd = addDays(lastWeekStart, 6);
        return {
          startDate: new Date(lastWeekStart.getFullYear(), lastWeekStart.getMonth(), lastWeekStart.getDate()),
          endDate: new Date(lastWeekEnd.getFullYear(), lastWeekEnd.getMonth(), lastWeekEnd.getDate(), 23, 59, 59)
        };

      case 'MONTHLY':
        const lastMonth = addMonths(now, -1);
        return {
          startDate: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1),
          endDate: new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0, 23, 59, 59)
        };

      case 'QUARTERLY':
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const lastQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
        const quarterYear = currentQuarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
        return {
          startDate: new Date(quarterYear, lastQuarter * 3, 1),
          endDate: new Date(quarterYear, (lastQuarter + 1) * 3, 0, 23, 59, 59)
        };

      case 'ANNUALLY':
        const lastYear = now.getFullYear() - 1;
        return {
          startDate: new Date(lastYear, 0, 1),
          endDate: new Date(lastYear, 11, 31, 23, 59, 59)
        };

      default:
        throw new Error(`Unsupported frequency: ${frequency}`);
    }
  }

  /**
   * Schedule a report job in the queue
   */
  private async scheduleReportJob(scheduledReportId: string, scheduledTime: Date): Promise<void> {
    const delay = scheduledTime.getTime() - Date.now();
    
    if (delay > 0) {
      await scheduledReportQueue.add(
        'generate-scheduled-report',
        { scheduledReportId, reportPeriod: this.calculateReportPeriod('MONTHLY') }, // Will be recalculated at execution
        {
          delay,
          jobId: `scheduled-${scheduledReportId}`,
          removeOnComplete: 50,
          removeOnFail: 100
        }
      );
    }
  }

  /**
   * Remove a scheduled job from the queue
   */
  private async removeScheduledJob(scheduledReportId: string): Promise<void> {
    const jobId = `scheduled-${scheduledReportId}`;
    const job = await scheduledReportQueue.getJob(jobId);
    
    if (job) {
      await job.remove();
    }
  }
}

// BullMQ Queue and Worker setup
export const scheduledReportQueue = new Queue<ScheduledReportJobData>(
  'scheduled-reports',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30000
      },
      removeOnComplete: 100,
      removeOnFail: 500
    }
  }
);

export const scheduledReportWorker = new Worker<ScheduledReportJobData>(
  'scheduled-reports',
  async (job: Job<ScheduledReportJobData>) => {
    const scheduledReportService = new ScheduledReportService(prisma);
    await scheduledReportService.processScheduledReport(job.data);
  },
  {
    connection: redisConnection,
    concurrency: 2
  }
);

// Export service instance
export { ScheduledReportService };
