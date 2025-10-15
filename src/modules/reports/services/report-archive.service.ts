/**
 * Report Archive Service
 * 
 * Manages storage, retrieval, and lifecycle of historical financial reports.
 * Provides search, filtering, retention policies, and bulk operations.
 */

import { PrismaClient } from '@prisma/client';
import { storageProvider } from '@/lib/storage';
import { auditService } from '@/lib/services/audit.service';
import { addDays, addMonths, addYears, isBefore, format } from 'date-fns';
import { SecureDownloadService } from './secure-download.service';

export interface ArchiveSearchFilters {
  reportTypes?: string[];
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  generatedBy?: string[];
  status?: string[];
  formats?: string[];
  tags?: string[];
}

export interface ArchiveSearchOptions {
  page?: number;
  limit?: number;
  sortBy?: 'generatedAt' | 'reportType' | 'fileSize' | 'accessCount';
  sortOrder?: 'asc' | 'desc';
}

export interface ArchivedReport {
  id: string;
  reportType: string;
  title: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  generatedAt: Date;
  generatedBy: {
    id: string;
    name: string;
    email: string;
  };
  status: string;
  fileInfo: {
    storageKey: string;
    fileSize: number;
    format: string;
    downloadCount: number;
    lastAccessedAt?: Date;
  };
  metadata: any;
  tags: string[];
  retentionInfo: {
    expiresAt?: Date;
    retentionPolicy: string;
    isArchived: boolean;
  };
}

export interface RetentionPolicy {
  name: string;
  reportTypes: string[];
  retentionPeriodMonths: number;
  archiveAfterMonths?: number;
  autoDelete: boolean;
  compressAfterMonths?: number;
  tags?: string[];
}

export interface BulkOperationResult {
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{
    reportId: string;
    error: string;
  }>;
}

export class ReportArchiveService {
  private readonly downloadService: SecureDownloadService;

  // Default retention policies
  private readonly defaultRetentionPolicies: RetentionPolicy[] = [
    {
      name: 'Financial Statements',
      reportTypes: ['MONTHLY_REVENUE', 'QUARTERLY_SUMMARY', 'ANNUAL_STATEMENT'],
      retentionPeriodMonths: 84, // 7 years for financial records
      archiveAfterMonths: 24,
      autoDelete: false,
      compressAfterMonths: 12
    },
    {
      name: 'Operational Reports',
      reportTypes: ['TRANSACTION_LEDGER', 'CREATOR_EARNINGS', 'PAYOUT_SUMMARY'],
      retentionPeriodMonths: 36, // 3 years
      archiveAfterMonths: 12,
      autoDelete: true,
      compressAfterMonths: 6
    },
    {
      name: 'Analytical Reports',
      reportTypes: ['PLATFORM_REVENUE', 'COMMISSION_TRACKING'],
      retentionPeriodMonths: 24, // 2 years
      archiveAfterMonths: 6,
      autoDelete: true,
      compressAfterMonths: 3
    }
  ];

  constructor(private readonly prisma: PrismaClient) {
    this.downloadService = new SecureDownloadService(prisma);
  }

  /**
   * Archive a newly generated report
   */
  async archiveReport(
    reportId: string,
    metadata: {
      title?: string;
      tags?: string[];
      customRetentionPolicy?: string;
    } = {}
  ): Promise<void> {
    const report = await this.prisma.financialReport.findUnique({
      where: { id: reportId },
      include: {
        generatedByUser: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!report) {
      throw new Error('Report not found');
    }

    // Determine retention policy
    const retentionPolicy = this.getRetentionPolicy(
      report.reportType,
      metadata.customRetentionPolicy,
      metadata.tags
    );

    // Calculate retention dates
    const retentionInfo = this.calculateRetentionDates(retentionPolicy, report.generatedAt);

    // Update report with archive metadata
    await this.prisma.financialReport.update({
      where: { id: reportId },
      data: {
        metadata: {
          ...(report.metadata as any),
          archive: {
            title: metadata.title || this.generateReportTitle(report),
            tags: metadata.tags || [],
            retentionPolicy: retentionPolicy.name,
            archivedAt: new Date().toISOString(),
            ...retentionInfo
          }
        }
      }
    });

    // Log archive event
    await auditService.log({
      action: 'REPORT_ARCHIVED',
      entityType: 'financial_report',
      entityId: reportId,
      userId: report.generatedBy,
      after: {
        title: metadata.title,
        tags: metadata.tags,
        retentionPolicy: retentionPolicy.name,
        retentionInfo
      }
    });
  }

  /**
   * Search archived reports with filters and pagination
   */
  async searchArchive(
    filters: ArchiveSearchFilters = {},
    options: ArchiveSearchOptions = {},
    userId?: string,
    userRole?: string
  ): Promise<{
    reports: ArchivedReport[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 25, 100);
    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause: any = {
      status: 'COMPLETED'
    };

    if (filters.reportTypes?.length) {
      whereClause.reportType = { in: filters.reportTypes };
    }

    if (filters.dateRange) {
      whereClause.generatedAt = {
        gte: filters.dateRange.startDate,
        lte: filters.dateRange.endDate
      };
    }

    if (filters.generatedBy?.length) {
      whereClause.generatedBy = { in: filters.generatedBy };
    }

    // Add user access control
    if (userId && userRole !== 'ADMIN') {
      whereClause.generatedBy = userId;
    }

    // Build order by clause
    const orderBy: any = {};
    const sortBy = options.sortBy || 'generatedAt';
    const sortOrder = options.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    // Execute query
    const [reports, total] = await Promise.all([
      this.prisma.financialReport.findMany({
        where: whereClause,
        include: {
          generatedByUser: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy,
        take: limit,
        skip: offset
      }),
      this.prisma.financialReport.count({ where: whereClause })
    ]);

    // Transform to archive format
    const archivedReports = await Promise.all(
      reports.map(report => this.transformToArchivedReport(report))
    );

    // Apply additional filters on metadata
    let filteredReports = archivedReports;

    if (filters.formats?.length) {
      filteredReports = filteredReports.filter(report =>
        filters.formats!.includes(report.fileInfo.format)
      );
    }

    if (filters.tags?.length) {
      filteredReports = filteredReports.filter(report =>
        filters.tags!.some(tag => report.tags.includes(tag))
      );
    }

    return {
      reports: filteredReports,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get report by ID for authorized users
   */
  async getArchivedReport(
    reportId: string,
    userId: string,
    userRole: string
  ): Promise<ArchivedReport | null> {
    const report = await this.prisma.financialReport.findUnique({
      where: { id: reportId },
      include: {
        generatedByUser: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!report) {
      return null;
    }

    // Check access permissions
    const hasAccess = 
      userRole === 'ADMIN' || 
      userRole === 'FINANCE_MANAGER' ||
      report.generatedBy === userId;

    if (!hasAccess) {
      throw new Error('Access denied to this report');
    }

    return await this.transformToArchivedReport(report);
  }

  /**
   * Generate secure download link for archived report
   */
  async generateArchiveDownloadLink(
    reportId: string,
    userId: string,
    userRole: string,
    expirationHours: number = 24
  ): Promise<{
    downloadUrl: string;
    expiresAt: Date;
  }> {
    // Verify access
    const report = await this.getArchivedReport(reportId, userId, userRole);
    if (!report) {
      throw new Error('Report not found or access denied');
    }

    // Generate secure download link
    const secureLink = await this.downloadService.generateSecureDownloadLink({
      reportId,
      userId,
      userRole,
      expirationHours
    });

    // Update access tracking
    await this.updateAccessTracking(reportId, userId);

    return {
      downloadUrl: secureLink.downloadUrl,
      expiresAt: secureLink.expiresAt
    };
  }

  /**
   * Bulk download multiple reports as ZIP
   */
  async bulkDownloadReports(
    reportIds: string[],
    userId: string,
    userRole: string
  ): Promise<{
    downloadUrl: string;
    expiresAt: Date;
    fileCount: number;
    totalSize: number;
  }> {
    // Verify access to all reports
    const reports = await Promise.all(
      reportIds.map(id => this.getArchivedReport(id, userId, userRole))
    );

    const accessibleReports = reports.filter(r => r !== null) as ArchivedReport[];
    
    if (accessibleReports.length === 0) {
      throw new Error('No accessible reports found');
    }

    // Create ZIP file with all reports
    const zipBuffer = await this.createZipArchive(accessibleReports);
    
    // Upload ZIP to temporary storage
    const zipKey = `temp/bulk-downloads/${userId}/${Date.now()}.zip`;
    await storageProvider.upload({
      key: zipKey,
      file: zipBuffer,
      contentType: 'application/zip',
      metadata: {
        userId,
        reportCount: accessibleReports.length,
        createdAt: new Date().toISOString()
      }
    });

    // Generate download URL
    const downloadUrl = await storageProvider.getDownloadUrl(zipKey);

    // Calculate total size
    const totalSize = accessibleReports.reduce((sum, r) => sum + r.fileInfo.fileSize, 0);

    // Log bulk download
    await auditService.log({
      action: 'BULK_ARCHIVE_DOWNLOAD',
      entityType: 'financial_report',
      entityId: 'bulk',
      userId,
      after: {
        reportIds: accessibleReports.map(r => r.id),
        fileCount: accessibleReports.length,
        totalSize
      }
    });

    return {
      downloadUrl: downloadUrl.url,
      expiresAt: downloadUrl.expiresAt,
      fileCount: accessibleReports.length,
      totalSize
    };
  }

  /**
   * Apply retention policies and cleanup expired reports
   */
  async applyRetentionPolicies(): Promise<{
    archived: number;
    compressed: number;
    deleted: number;
    errors: string[];
  }> {
    const result = {
      archived: 0,
      compressed: 0,
      deleted: 0,
      errors: []
    };

    try {
      // Get all reports that need retention processing
      const reports = await this.prisma.financialReport.findMany({
        where: {
          status: 'COMPLETED'
        }
      });

      for (const report of reports) {
        try {
          const metadata = report.metadata as any;
          const archiveInfo = metadata?.archive;

          if (!archiveInfo) {
            // Apply default archiving for unarchived reports
            await this.archiveReport(report.id);
            result.archived++;
            continue;
          }

          const retentionPolicy = this.getRetentionPolicyByName(archiveInfo.retentionPolicy);
          
          // Check if report should be moved to cold storage
          if (retentionPolicy.archiveAfterMonths && !archiveInfo.isInColdStorage) {
            const archiveDate = addMonths(report.generatedAt, retentionPolicy.archiveAfterMonths);
            if (isBefore(archiveDate, new Date())) {
              await this.moveToFoldStorage(report.id);
              result.archived++;
            }
          }

          // Check if report should be compressed
          if (retentionPolicy.compressAfterMonths && !archiveInfo.isCompressed) {
            const compressDate = addMonths(report.generatedAt, retentionPolicy.compressAfterMonths);
            if (isBefore(compressDate, new Date())) {
              await this.compressReport(report.id);
              result.compressed++;
            }
          }

          // Check if report should be deleted
          if (retentionPolicy.autoDelete && archiveInfo.expiresAt) {
            const expirationDate = new Date(archiveInfo.expiresAt);
            if (isBefore(expirationDate, new Date())) {
              await this.deleteExpiredReport(report.id);
              result.deleted++;
            }
          }

        } catch (error) {
          result.errors.push(`Report ${report.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

    } catch (error) {
      result.errors.push(`Global error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Log retention policy execution
    await auditService.log({
      action: 'RETENTION_POLICY_APPLIED',
      entityType: 'financial_report',
      entityId: 'batch',
      userId: 'system',
      after: result
    });

    return result;
  }

  /**
   * Tag reports for categorization
   */
  async tagReports(
    reportIds: string[],
    tags: string[],
    userId: string
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      processed: reportIds.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const reportId of reportIds) {
      try {
        const report = await this.prisma.financialReport.findUnique({
          where: { id: reportId }
        });

        if (!report) {
          result.errors.push({ reportId, error: 'Report not found' });
          result.failed++;
          continue;
        }

        const metadata = report.metadata as any;
        const currentTags = metadata?.archive?.tags || [];
        const newTags = [...new Set([...currentTags, ...tags])]; // Remove duplicates

        await this.prisma.financialReport.update({
          where: { id: reportId },
          data: {
            metadata: {
              ...metadata,
              archive: {
                ...metadata?.archive,
                tags: newTags,
                lastTaggedAt: new Date().toISOString(),
                lastTaggedBy: userId
              }
            }
          }
        });

        result.successful++;
      } catch (error) {
        result.errors.push({
          reportId,
          error: error instanceof Error ? error.message : String(error)
        });
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Get archive statistics
   */
  async getArchiveStatistics(userId?: string): Promise<{
    totalReports: number;
    totalSize: number;
    reportsByType: Array<{ type: string; count: number; size: number }>;
    reportsByMonth: Array<{ month: string; count: number; size: number }>;
    storageBreakdown: {
      active: { count: number; size: number };
      archived: { count: number; size: number };
      compressed: { count: number; size: number };
    };
    retentionStatus: Array<{ policy: string; count: number; sizeGB: number }>;
  }> {
    const whereClause: any = { status: 'COMPLETED' };
    if (userId) {
      whereClause.generatedBy = userId;
    }

    const reports = await this.prisma.financialReport.findMany({
      where: whereClause,
      select: {
        id: true,
        reportType: true,
        generatedAt: true,
        metadata: true
      }
    });

    const totalReports = reports.length;
    const totalSize = reports.reduce((sum, r) => {
      const metadata = r.metadata as any;
      return sum + (metadata?.fileSize || 0);
    }, 0);

    // Group by type
    const reportsByType = reports.reduce((acc, report) => {
      const type = report.reportType;
      const size = (report.metadata as any)?.fileSize || 0;
      
      const existing = acc.find(item => item.type === type);
      if (existing) {
        existing.count++;
        existing.size += size;
      } else {
        acc.push({ type, count: 1, size });
      }
      return acc;
    }, [] as Array<{ type: string; count: number; size: number }>);

    // Group by month
    const reportsByMonth = reports.reduce((acc, report) => {
      const month = format(report.generatedAt, 'yyyy-MM');
      const size = (report.metadata as any)?.fileSize || 0;
      
      const existing = acc.find(item => item.month === month);
      if (existing) {
        existing.count++;
        existing.size += size;
      } else {
        acc.push({ month, count: 1, size });
      }
      return acc;
    }, [] as Array<{ month: string; count: number; size: number }>);

    // Storage breakdown
    const storageBreakdown = {
      active: { count: 0, size: 0 },
      archived: { count: 0, size: 0 },
      compressed: { count: 0, size: 0 }
    };

    reports.forEach(report => {
      const metadata = report.metadata as any;
      const archiveInfo = metadata?.archive;
      const size = metadata?.fileSize || 0;

      if (archiveInfo?.isCompressed) {
        storageBreakdown.compressed.count++;
        storageBreakdown.compressed.size += size;
      } else if (archiveInfo?.isInColdStorage) {
        storageBreakdown.archived.count++;
        storageBreakdown.archived.size += size;
      } else {
        storageBreakdown.active.count++;
        storageBreakdown.active.size += size;
      }
    });

    // Retention status
    const retentionStatus = this.defaultRetentionPolicies.map(policy => {
      const policyReports = reports.filter(r => {
        const metadata = r.metadata as any;
        return metadata?.archive?.retentionPolicy === policy.name;
      });

      return {
        policy: policy.name,
        count: policyReports.length,
        sizeGB: policyReports.reduce((sum, r) => sum + ((r.metadata as any)?.fileSize || 0), 0) / (1024 * 1024 * 1024)
      };
    });

    return {
      totalReports,
      totalSize,
      reportsByType,
      reportsByMonth: reportsByMonth.sort((a, b) => a.month.localeCompare(b.month)),
      storageBreakdown,
      retentionStatus
    };
  }

  /**
   * Helper methods
   */

  private async transformToArchivedReport(report: any): Promise<ArchivedReport> {
    const metadata = report.metadata as any;
    const archiveInfo = metadata?.archive || {};

    return {
      id: report.id,
      reportType: report.reportType,
      title: archiveInfo.title || this.generateReportTitle(report),
      period: report.period,
      generatedAt: report.generatedAt,
      generatedBy: report.generatedByUser,
      status: report.status,
      fileInfo: {
        storageKey: report.storageKey || '',
        fileSize: metadata?.fileSize || 0,
        format: metadata?.format || 'PDF',
        downloadCount: metadata?.downloadCount || 0,
        lastAccessedAt: metadata?.lastAccessedAt ? new Date(metadata.lastAccessedAt) : undefined
      },
      metadata: metadata || {},
      tags: archiveInfo.tags || [],
      retentionInfo: {
        expiresAt: archiveInfo.expiresAt ? new Date(archiveInfo.expiresAt) : undefined,
        retentionPolicy: archiveInfo.retentionPolicy || 'Default',
        isArchived: archiveInfo.isInColdStorage || false
      }
    };
  }

  private generateReportTitle(report: any): string {
    const period = report.period;
    const startDate = period.startDate || report.generatedAt;
    const endDate = period.endDate || report.generatedAt;
    
    return `${report.reportType.replace('_', ' ')} - ${format(startDate, 'MMM yyyy')} to ${format(endDate, 'MMM yyyy')}`;
  }

  private getRetentionPolicy(
    reportType: string,
    customPolicy?: string,
    tags?: string[]
  ): RetentionPolicy {
    if (customPolicy) {
      const policy = this.getRetentionPolicyByName(customPolicy);
      if (policy) return policy;
    }

    return this.defaultRetentionPolicies.find(policy =>
      policy.reportTypes.includes(reportType)
    ) || this.defaultRetentionPolicies[1]; // Default to operational reports policy
  }

  private getRetentionPolicyByName(name: string): RetentionPolicy | undefined {
    return this.defaultRetentionPolicies.find(policy => policy.name === name);
  }

  private calculateRetentionDates(
    policy: RetentionPolicy,
    generatedAt: Date
  ): {
    expiresAt?: string;
    archiveAt?: string;
    compressAt?: string;
  } {
    const result: any = {};

    if (policy.retentionPeriodMonths > 0) {
      result.expiresAt = addMonths(generatedAt, policy.retentionPeriodMonths).toISOString();
    }

    if (policy.archiveAfterMonths) {
      result.archiveAt = addMonths(generatedAt, policy.archiveAfterMonths).toISOString();
    }

    if (policy.compressAfterMonths) {
      result.compressAt = addMonths(generatedAt, policy.compressAfterMonths).toISOString();
    }

    return result;
  }

  private async updateAccessTracking(reportId: string, userId: string): Promise<void> {
    const report = await this.prisma.financialReport.findUnique({
      where: { id: reportId }
    });

    if (report) {
      const metadata = report.metadata as any;
      
      await this.prisma.financialReport.update({
        where: { id: reportId },
        data: {
          metadata: {
            ...metadata,
            downloadCount: (metadata?.downloadCount || 0) + 1,
            lastAccessedAt: new Date().toISOString(),
            lastAccessedBy: userId
          }
        }
      });
    }
  }

  private async createZipArchive(reports: ArchivedReport[]): Promise<Buffer> {
    // In a real implementation, this would use a library like JSZip
    // For now, return a placeholder buffer
    return Buffer.from('ZIP file placeholder');
  }

  private async moveToFoldStorage(reportId: string): Promise<void> {
    // Move file to cold storage tier and update metadata
    // Implementation would depend on storage provider capabilities
  }

  private async compressReport(reportId: string): Promise<void> {
    // Compress the report file and update metadata
    // Implementation would use compression libraries
  }

  private async deleteExpiredReport(reportId: string): Promise<void> {
    const report = await this.prisma.financialReport.findUnique({
      where: { id: reportId }
    });

    if (report && report.storageKey) {
      // Delete from storage
      await storageProvider.delete(report.storageKey);
      
      // Mark as deleted in database
      await this.prisma.financialReport.update({
        where: { id: reportId },
        data: {
          status: 'ARCHIVED' as any,
          metadata: {
            ...(report.metadata as any),
            deletedAt: new Date().toISOString(),
            deletedBy: 'retention-policy'
          }
        }
      });
    }
  }
}
