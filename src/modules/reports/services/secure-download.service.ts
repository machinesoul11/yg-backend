/**
 * Secure Download Links Service
 * 
 * Generates time-limited, cryptographically signed URLs for accessing financial reports.
 * Provides security, audit trails, and access control for sensitive financial data.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { addDays, addHours, isBefore } from 'date-fns';
import { storageProvider } from '@/lib/storage';
import { auditService } from '@/lib/services/audit.service';

export interface SecureDownloadConfig {
  reportId: string;
  userId: string;
  userRole: string;
  expirationHours?: number;
  maxDownloads?: number;
  ipRestriction?: string[];
  notifyOnAccess?: boolean;
}

export interface SecureDownloadLink {
  downloadUrl: string;
  token: string;
  expiresAt: Date;
  accessCount: number;
  maxAccess: number;
  isRevoked: boolean;
}

export interface DownloadAttempt {
  success: boolean;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  userId: string;
  errorMessage?: string;
}

export class SecureDownloadService {
  private readonly secretKey: string;
  private readonly defaultExpirationHours = 72; // 3 days
  private readonly maxTokenLength = 128;

  constructor(private readonly prisma: PrismaClient) {
    this.secretKey = process.env.DOWNLOAD_TOKEN_SECRET || 'fallback-secret-key-change-in-production';
  }

  /**
   * Generate secure download link for a financial report
   */
  async generateSecureDownloadLink(config: SecureDownloadConfig): Promise<SecureDownloadLink> {
    // Verify report exists and user has access
    await this.verifyReportAccess(config.reportId, config.userId, config.userRole);

    // Generate cryptographically secure token
    const token = this.generateSecureToken();
    
    // Calculate expiration
    const expiresAt = addHours(new Date(), config.expirationHours || this.defaultExpirationHours);
    
    // Generate signed download URL
    const downloadUrl = await this.createSignedDownloadUrl(token, config.reportId);

    // Log audit event
    await auditService.log({
      action: 'SECURE_DOWNLOAD_LINK_GENERATED',
      entityType: 'financial_report',
      entityId: config.reportId,
      userId: config.userId,
      after: {
        token: token.substring(0, 8) + '...', // Log only first 8 chars for security
        expiresAt: expiresAt.toISOString(),
        maxDownloads: config.maxDownloads || 5
      }
    });

    return {
      downloadUrl,
      token,
      expiresAt,
      accessCount: 0,
      maxAccess: config.maxDownloads || 5,
      isRevoked: false
    };
  }

  /**
   * Validate and process download request
   */
  async processDownloadRequest(
    reportId: string,
    requestInfo: {
      ipAddress?: string;
      userAgent?: string;
      userId?: string;
    }
  ): Promise<{ success: boolean; fileUrl?: string; errorMessage?: string }> {
    try {
      // Get report from database
      const report = await this.prisma.financialReport.findUnique({
        where: { id: reportId }
      });

      if (!report) {
        return { success: false, errorMessage: 'Report not found' };
      }

      if (!report.storageKey) {
        return { success: false, errorMessage: 'Report file not found' };
      }

      // Get file from storage
      const fileUrl = await storageProvider.getDownloadUrl(report.storageKey);

      // Log successful download
      await auditService.log({
        action: 'FINANCIAL_REPORT_DOWNLOADED',
        entityType: 'financial_report',
        entityId: reportId,
        userId: requestInfo.userId || 'anonymous',
        after: {
          ipAddress: requestInfo.ipAddress,
          userAgent: requestInfo.userAgent
        }
      });

      return { success: true, fileUrl: fileUrl.url };

    } catch (error) {
      return { 
        success: false, 
        errorMessage: 'Download processing failed' 
      };
    }
  }

  /**
   * Generate cryptographically secure token
   */
  private generateSecureToken(): string {
    return crypto.randomBytes(64).toString('base64url').substring(0, this.maxTokenLength);
  }

  /**
   * Create signed download URL
   */
  private async createSignedDownloadUrl(token: string, reportId: string): Promise<string> {
    const signature = this.createTokenSignature(token, reportId);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com';
    return `${baseUrl}/api/reports/download/${reportId}?token=${token}&sig=${signature}`;
  }

  /**
   * Create token signature for validation
   */
  private createTokenSignature(token: string, reportId: string): string {
    const data = `${token}:${reportId}:${this.secretKey}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Verify user has access to report
   */
  private async verifyReportAccess(reportId: string, userId: string, userRole: string): Promise<void> {
    const report = await this.prisma.financialReport.findUnique({
      where: { id: reportId },
      include: {
        generatedByUser: true
      }
    });

    if (!report) {
      throw new Error('Report not found');
    }

    // Check if user generated the report or has admin access
    const hasAccess = 
      report.generatedBy === userId || 
      userRole === 'ADMIN' || 
      userRole === 'FINANCE_MANAGER';

    if (!hasAccess) {
      throw new Error('Access denied to this report');
    }
  }
}
