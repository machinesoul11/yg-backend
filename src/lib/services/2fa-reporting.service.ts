/**
 * 2FA Compliance Reporting Service
 * 
 * Generates comprehensive security and compliance reports.
 * Supports multiple formats (PDF, CSV, JSON) and scheduled delivery.
 * 
 * Features:
 * - Monthly security reports
 * - Adoption trend reports
 * - Security incident reports
 * - Custom reports with date ranges
 * - Report scheduling and automation
 * - Report archival and retrieval
 */

import { PrismaClient } from '@prisma/client';
import { TwoFactorComplianceService } from './2fa-compliance.service';
import { TwoFactorSecurityEventsService } from './2fa-security-events.service';

export interface MonthlySecurityReportData {
  reportPeriod: {
    start: Date;
    end: Date;
    month: string;
  };
  executiveSummary: {
    adoptionRate: number;
    adoptionChange: number;
    totalUsers: number;
    usersWithTwoFactor: number;
    totalAuthAttempts: number;
    failureRate: number;
    securityIncidents: number;
  };
  adoptionMetrics: {
    overall: { total: number; enabled: number; rate: number };
    byRole: Record<string, { total: number; enabled: number; rate: number }>;
    trend: Array<{ date: string; rate: number }>;
  };
  authenticationMetrics: {
    totalAttempts: number;
    successfulAuths: number;
    failedAuths: number;
    failureRate: number;
    byMethod: { totp: number; sms: number; backupCode: number };
    failureTrend: Array<{ date: string; failureRate: number }>;
  };
  securityEvents: {
    totalIncidents: number;
    accountLockouts: number;
    suspiciousActivities: number;
    adminResets: number;
    emergencyCodesGenerated: number;
    byType: Record<string, number>;
  };
  backupCodeMetrics: {
    regenerated: number;
    used: number;
    usersWithLowCodes: number;
    averageCodesPerUser: number;
  };
  alerts: {
    totalAlerts: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    resolvedAlerts: number;
    averageResolutionTime: number;
  };
  topIncidents: Array<{
    type: string;
    description: string;
    timestamp: Date;
    severity: string;
  }>;
  recommendations: string[];
}

export class TwoFactorReportingService {
  private complianceService: TwoFactorComplianceService;
  private securityEventsService: TwoFactorSecurityEventsService;

  constructor(private prisma: PrismaClient) {
    this.complianceService = new TwoFactorComplianceService(prisma);
    this.securityEventsService = new TwoFactorSecurityEventsService(prisma);
  }

  /**
   * Generate monthly security report
   */
  async generateMonthlySecurityReport(
    year: number,
    month: number,
    generatedBy?: string
  ): Promise<string> {
    console.log(`[ReportingService] Generating monthly security report for ${year}-${month}`);

    // Calculate period dates
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

    // Gather report data
    const reportData = await this.gatherMonthlyReportData(periodStart, periodEnd);

    // Create report record
    const report = await this.prisma.twoFactorComplianceReport.create({
      data: {
        reportType: 'monthly_security',
        format: 'json',
        periodStart,
        periodEnd,
        generatedBy,
        generationStatus: 'completed',
        reportData: reportData as any,
        summary: this.generateReportSummary(reportData),
      },
    });

    console.log(`[ReportingService] ✓ Monthly report generated: ${report.id}`);

    return report.id;
  }

  /**
   * Gather all data for monthly report
   */
  private async gatherMonthlyReportData(
    periodStart: Date,
    periodEnd: Date
  ): Promise<MonthlySecurityReportData> {
    // Get compliance metrics for the month
    const monthlyMetrics = await this.prisma.twoFactorComplianceMetrics.findMany({
      where: {
        periodStart: { gte: periodStart, lte: periodEnd },
        periodType: 'daily',
      },
      orderBy: { periodStart: 'asc' },
    });

    // Calculate aggregated values
    const latestMetrics = monthlyMetrics[monthlyMetrics.length - 1];
    const firstMetrics = monthlyMetrics[0];

    const adoptionRate = latestMetrics?.adoptionRate.toNumber() || 0;
    const adoptionChange = latestMetrics && firstMetrics
      ? latestMetrics.adoptionRate.toNumber() - firstMetrics.adoptionRate.toNumber()
      : 0;

    const totalAuthAttempts = monthlyMetrics.reduce(
      (sum, m) => sum + m.totalAuthAttempts,
      0
    );
    const totalFailures = monthlyMetrics.reduce((sum, m) => sum + m.failedAuths, 0);
    const failureRate = totalAuthAttempts > 0 ? (totalFailures / totalAuthAttempts) * 100 : 0;

    // Get security events
    const securityEvents = await this.prisma.twoFactorSecurityEvent.findMany({
      where: {
        timestamp: { gte: periodStart, lte: periodEnd },
        eventCategory: 'security',
      },
      select: {
        eventType: true,
        timestamp: true,
      },
    });

    const eventsByType: Record<string, number> = {};
    securityEvents.forEach(e => {
      eventsByType[e.eventType] = (eventsByType[e.eventType] || 0) + 1;
    });

    // Get alerts
    const alerts = await this.prisma.twoFactorSecurityAlert.findMany({
      where: {
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: {
        severity: true,
        alertType: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        title: true,
        description: true,
      },
    });

    const alertsBySeverity: Record<string, number> = {};
    const alertsByType: Record<string, number> = {};
    let totalResolutionTime = 0;
    let resolvedCount = 0;

    alerts.forEach(a => {
      alertsBySeverity[a.severity] = (alertsBySeverity[a.severity] || 0) + 1;
      alertsByType[a.alertType] = (alertsByType[a.alertType] || 0) + 1;

      if (a.resolvedAt) {
        totalResolutionTime += a.resolvedAt.getTime() - a.createdAt.getTime();
        resolvedCount++;
      }
    });

    const avgResolutionTimeMs = resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0;
    const avgResolutionTimeHours = avgResolutionTimeMs / (1000 * 60 * 60);

    // Get backup code stats
    const backupCodesUsed = await this.prisma.twoFactorBackupCode.count({
      where: {
        used: true,
        usedAt: { gte: periodStart, lte: periodEnd },
      },
    });

    const usersWithBackupCodes = await this.prisma.user.findMany({
      where: {
        deleted_at: null,
        two_factor_enabled: true,
      },
      select: {
        twoFactorBackupCodes: {
          where: { used: false },
          select: { id: true },
        },
      },
    });

    const totalBackupCodes = usersWithBackupCodes.reduce(
      (sum, u) => sum + u.twoFactorBackupCodes.length,
      0
    );
    const avgCodesPerUser = usersWithBackupCodes.length > 0
      ? totalBackupCodes / usersWithBackupCodes.length
      : 0;

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      adoptionRate,
      failureRate,
      alerts,
      usersWithLowCodes: latestMetrics?.usersWithLowBackupCodes || 0,
    });

    return {
      reportPeriod: {
        start: periodStart,
        end: periodEnd,
        month: periodStart.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
      },
      executiveSummary: {
        adoptionRate,
        adoptionChange,
        totalUsers: latestMetrics?.totalUsers || 0,
        usersWithTwoFactor: latestMetrics?.usersWithTwoFactor || 0,
        totalAuthAttempts,
        failureRate,
        securityIncidents: securityEvents.length,
      },
      adoptionMetrics: {
        overall: {
          total: latestMetrics?.totalUsers || 0,
          enabled: latestMetrics?.usersWithTwoFactor || 0,
          rate: adoptionRate,
        },
        byRole: {
          ADMIN: {
            total: latestMetrics?.adminTotal || 0,
            enabled: latestMetrics?.adminEnabled || 0,
            rate: latestMetrics
              ? (latestMetrics.adminEnabled / (latestMetrics.adminTotal || 1)) * 100
              : 0,
          },
          CREATOR: {
            total: latestMetrics?.creatorTotal || 0,
            enabled: latestMetrics?.creatorEnabled || 0,
            rate: latestMetrics
              ? (latestMetrics.creatorEnabled / (latestMetrics.creatorTotal || 1)) * 100
              : 0,
          },
          BRAND: {
            total: latestMetrics?.brandTotal || 0,
            enabled: latestMetrics?.brandEnabled || 0,
            rate: latestMetrics
              ? (latestMetrics.brandEnabled / (latestMetrics.brandTotal || 1)) * 100
              : 0,
          },
          VIEWER: {
            total: latestMetrics?.viewerTotal || 0,
            enabled: latestMetrics?.viewerEnabled || 0,
            rate: latestMetrics
              ? (latestMetrics.viewerEnabled / (latestMetrics.viewerTotal || 1)) * 100
              : 0,
          },
        },
        trend: monthlyMetrics.map(m => ({
          date: m.periodStart.toISOString().split('T')[0],
          rate: m.adoptionRate.toNumber(),
        })),
      },
      authenticationMetrics: {
        totalAttempts: totalAuthAttempts,
        successfulAuths: monthlyMetrics.reduce((sum, m) => sum + m.successfulAuths, 0),
        failedAuths: totalFailures,
        failureRate,
        byMethod: {
          totp: monthlyMetrics.reduce((sum, m) => sum + m.totpAttempts, 0),
          sms: monthlyMetrics.reduce((sum, m) => sum + m.smsAttempts, 0),
          backupCode: monthlyMetrics.reduce((sum, m) => sum + m.backupCodeAttempts, 0),
        },
        failureTrend: monthlyMetrics.map(m => ({
          date: m.periodStart.toISOString().split('T')[0],
          failureRate: m.failureRate.toNumber(),
        })),
      },
      securityEvents: {
        totalIncidents: securityEvents.length,
        accountLockouts: eventsByType['lockout'] || 0,
        suspiciousActivities: securityEvents.filter(e => e.eventType === 'suspicious_activity').length,
        adminResets: eventsByType['admin_reset'] || 0,
        emergencyCodesGenerated: eventsByType['emergency_code_generated'] || 0,
        byType: eventsByType,
      },
      backupCodeMetrics: {
        regenerated: monthlyMetrics.reduce((sum, m) => sum + m.backupCodesRegenerated, 0),
        used: backupCodesUsed,
        usersWithLowCodes: latestMetrics?.usersWithLowBackupCodes || 0,
        averageCodesPerUser: avgCodesPerUser,
      },
      alerts: {
        totalAlerts: alerts.length,
        bySeverity: alertsBySeverity,
        byType: alertsByType,
        resolvedAlerts: resolvedCount,
        averageResolutionTime: avgResolutionTimeHours,
      },
      topIncidents: alerts
        .filter(a => a.severity === 'critical' || a.severity === 'urgent')
        .slice(0, 10)
        .map(a => ({
          type: a.alertType,
          description: a.title,
          timestamp: a.createdAt,
          severity: a.severity,
        })),
      recommendations,
    };
  }

  /**
   * Generate report summary text
   */
  private generateReportSummary(data: MonthlySecurityReportData): string {
    const { executiveSummary, reportPeriod } = data;

    return `
2FA Security Report - ${reportPeriod.month}

EXECUTIVE SUMMARY:
- Current 2FA Adoption: ${executiveSummary.adoptionRate.toFixed(1)}% (${executiveSummary.adoptionChange > 0 ? '+' : ''}${executiveSummary.adoptionChange.toFixed(1)}%)
- Total Users: ${executiveSummary.totalUsers} (${executiveSummary.usersWithTwoFactor} with 2FA)
- Authentication Attempts: ${executiveSummary.totalAuthAttempts}
- Failure Rate: ${executiveSummary.failureRate.toFixed(2)}%
- Security Incidents: ${executiveSummary.securityIncidents}

KEY HIGHLIGHTS:
${data.recommendations.slice(0, 3).map(r => `- ${r}`).join('\n')}
`.trim();
  }

  /**
   * Generate recommendations based on metrics
   */
  private generateRecommendations(params: {
    adoptionRate: number;
    failureRate: number;
    alerts: any[];
    usersWithLowCodes: number;
  }): string[] {
    const recommendations: string[] = [];

    if (params.adoptionRate < 50) {
      recommendations.push(
        `2FA adoption rate is ${params.adoptionRate.toFixed(1)}%. Consider implementing mandatory 2FA for high-privilege roles.`
      );
    } else if (params.adoptionRate < 80) {
      recommendations.push(
        `Good progress on 2FA adoption (${params.adoptionRate.toFixed(1)}%). Continue encouraging voluntary adoption.`
      );
    } else {
      recommendations.push(
        `Excellent 2FA adoption rate (${params.adoptionRate.toFixed(1)}%). Maintain current policies.`
      );
    }

    if (params.failureRate > 10) {
      recommendations.push(
        `Failure rate of ${params.failureRate.toFixed(1)}% is elevated. Review user education materials and consider improving error messages.`
      );
    }

    const criticalAlerts = params.alerts.filter(a => a.severity === 'critical' || a.severity === 'urgent');
    if (criticalAlerts.length > 0) {
      recommendations.push(
        `${criticalAlerts.length} critical/urgent alerts occurred. Review security incident response procedures.`
      );
    }

    if (params.usersWithLowCodes > 0) {
      recommendations.push(
        `${params.usersWithLowCodes} users have fewer than 3 backup codes remaining. Send reminder notifications.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('No significant issues detected. Continue monitoring security metrics.');
    }

    return recommendations;
  }

  /**
   * Export report to CSV format
   */
  async exportReportToCSV(reportId: string): Promise<string> {
    const report = await this.prisma.twoFactorComplianceReport.findUnique({
      where: { id: reportId },
    });

    if (!report || !report.reportData) {
      throw new Error('Report not found or has no data');
    }

    const data = report.reportData as MonthlySecurityReportData;

    // Generate CSV content
    const lines: string[] = [];
    lines.push('2FA Compliance Report - CSV Export');
    lines.push(`Report Period: ${data.reportPeriod.month}`);
    lines.push('');
    
    // Executive Summary
    lines.push('EXECUTIVE SUMMARY');
    lines.push('Metric,Value');
    lines.push(`Adoption Rate,${data.executiveSummary.adoptionRate.toFixed(1)}%`);
    lines.push(`Total Users,${data.executiveSummary.totalUsers}`);
    lines.push(`Users with 2FA,${data.executiveSummary.usersWithTwoFactor}`);
    lines.push(`Authentication Attempts,${data.executiveSummary.totalAuthAttempts}`);
    lines.push(`Failure Rate,${data.executiveSummary.failureRate.toFixed(2)}%`);
    lines.push(`Security Incidents,${data.executiveSummary.securityIncidents}`);
    lines.push('');

    // Adoption by Role
    lines.push('ADOPTION BY ROLE');
    lines.push('Role,Total Users,Enabled,Rate');
    Object.entries(data.adoptionMetrics.byRole).forEach(([role, metrics]) => {
      lines.push(`${role},${metrics.total},${metrics.enabled},${metrics.rate.toFixed(1)}%`);
    });

    return lines.join('\n');
  }

  /**
   * Schedule recurring report
   */
  async scheduleRecurringReport(params: {
    reportType: string;
    frequency: 'monthly' | 'weekly' | 'quarterly';
    emailTo: string[];
    generatedBy: string;
  }): Promise<string> {
    const now = new Date();
    let nextGenerationDate: Date;

    switch (params.frequency) {
      case 'monthly':
        nextGenerationDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'weekly':
        nextGenerationDate = new Date(now);
        nextGenerationDate.setDate(nextGenerationDate.getDate() + 7);
        break;
      case 'quarterly':
        nextGenerationDate = new Date(now.getFullYear(), now.getMonth() + 3, 1);
        break;
    }

    const report = await this.prisma.twoFactorComplianceReport.create({
      data: {
        reportType: params.reportType,
        format: 'json',
        periodStart: now,
        periodEnd: now,
        generatedBy: params.generatedBy,
        generationStatus: 'pending',
        isScheduled: true,
        scheduleFrequency: params.frequency,
        nextGenerationDate,
        emailedTo: params.emailTo,
      },
    });

    console.log(`[ReportingService] Scheduled ${params.frequency} report: ${report.id}`);

    return report.id;
  }

  /**
   * Get report by ID
   */
  async getReport(reportId: string) {
    return this.prisma.twoFactorComplianceReport.findUnique({
      where: { id: reportId },
    });
  }

  /**
   * List reports with filtering
   */
  async listReports(options?: {
    reportType?: string;
    startDate?: Date;
    endDate?: Date;
    generatedBy?: string;
    limit?: number;
  }) {
    const { reportType, startDate, endDate, generatedBy, limit = 50 } = options || {};

    return this.prisma.twoFactorComplianceReport.findMany({
      where: {
        ...(reportType && { reportType }),
        ...(generatedBy && { generatedBy }),
        ...(startDate || endDate ? {
          generatedAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        } : {}),
      },
      orderBy: {
        generatedAt: 'desc',
      },
      take: limit,
      select: {
        id: true,
        reportType: true,
        format: true,
        periodStart: true,
        periodEnd: true,
        generatedBy: true,
        generatedAt: true,
        generationStatus: true,
        summary: true,
        downloadCount: true,
        isScheduled: true,
        scheduleFrequency: true,
      },
    });
  }

  /**
   * Increment download count
   */
  async trackDownload(reportId: string): Promise<void> {
    await this.prisma.twoFactorComplianceReport.update({
      where: { id: reportId },
      data: {
        downloadCount: { increment: 1 },
        lastDownloadedAt: new Date(),
      },
    });
  }
}
