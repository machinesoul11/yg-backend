/**
 * Financial Analytics Reports Service
 * 
 * Main orchestrator for all financial analytics reports including monthly revenue,
 * quarterly summaries, annual statements, cash flow analysis, and more.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { AnnualFinancialStatementsService } from './annual-financial-statements.service';
import { AccountsReceivableAgingService } from './accounts-receivable-aging.service';
import { PDFReportGenerationService, PDFReportConfig } from './pdf-generation.service';
import { ReportGenerationError } from '../errors/report.errors';

export interface FinancialAnalyticsConfig {
  startDate: Date;
  endDate: Date;
  includeComparisons?: boolean;
  includeForecast?: boolean;
  format?: 'pdf' | 'csv' | 'json';
  filters?: {
    brandIds?: string[];
    creatorIds?: string[];
    regions?: string[];
  };
}

export interface GenerateReportParams {
  reportType: 'monthly_revenue' | 'quarterly_summary' | 'annual_statement' | 'cash_flow' | 'accounts_receivable' | 'accounts_payable' | 'commission_tracking';
  config: FinancialAnalyticsConfig;
  generatedBy: string;
  deliveryOptions?: {
    email?: string[];
    storage?: boolean;
  };
}

export interface FinancialReportResult {
  id: string;
  reportType: string;
  generatedAt: Date;
  storageUrl?: string;
  downloadUrl?: string;
  metadata: {
    recordCount: number;
    period: {
      startDate: Date;
      endDate: Date;
    };
    generatedBy: string;
  };
}

export class FinancialAnalyticsReportsService {
  private annualService: AnnualFinancialStatementsService;
  private arAgingService: AccountsReceivableAgingService;
  private pdfService: PDFReportGenerationService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {
    this.annualService = new AnnualFinancialStatementsService(prisma, redis);
    this.arAgingService = new AccountsReceivableAgingService(prisma, redis);
    this.pdfService = new PDFReportGenerationService();
  }

  /**
   * Generate any type of financial report
   */
  async generateReport(params: GenerateReportParams): Promise<FinancialReportResult> {
    try {
      let reportData: any;
      let reportTitle: string;

      // Generate the appropriate report
      switch (params.reportType) {
        case 'monthly_revenue':
          reportData = await this.generateBasicRevenueReport(params.config);
          reportTitle = 'Monthly Revenue Report';
          break;

        case 'quarterly_summary':
          reportData = await this.generateBasicQuarterlyReport(params.config);
          reportTitle = 'Quarterly Financial Summary';
          break;

        case 'annual_statement':
          const year = params.config.startDate.getFullYear();
          reportData = await this.annualService.generateAnnualFinancialStatement(year);
          reportTitle = 'Annual Financial Statement';
          break;

        case 'cash_flow':
          reportData = await this.generateBasicCashFlowReport(params.config);
          reportTitle = 'Cash Flow Analysis';
          break;

        case 'accounts_receivable':
          reportData = await this.arAgingService.generateAccountsReceivableAgingReport(params.config.endDate);
          reportTitle = 'Accounts Receivable Aging';
          break;

        case 'accounts_payable':
          reportData = await this.generateBasicPayablesReport(params.config);
          reportTitle = 'Accounts Payable Report';
          break;

        case 'commission_tracking':
          reportData = await this.generateBasicCommissionReport(params.config);
          reportTitle = 'Commission Tracking Report';
          break;

        default:
          throw new ReportGenerationError(`Unsupported report type: ${params.reportType}`);
      }

      // Create a simple report result since DB models aren't available yet
      const reportResult: FinancialReportResult = {
        id: `report_${Date.now()}`,
        reportType: params.reportType,
        generatedAt: new Date(),
        metadata: {
          recordCount: this.getRecordCount(reportData),
          period: {
            startDate: params.config.startDate,
            endDate: params.config.endDate,
          },
          generatedBy: params.generatedBy,
        },
      };

      // Generate PDF if requested
      if (params.config.format === 'pdf' || !params.config.format) {
        const pdfBuffer = await this.generatePDFReport(reportTitle, reportData, params.config, params.generatedBy);
        
        // TODO: Upload to storage service (R2/S3)
        const storageKey = `reports/${reportResult.id}/${reportResult.id}.pdf`;
        reportResult.storageUrl = storageKey;
        
        // Generate secure download URL
        reportResult.downloadUrl = `/api/reports/download/${reportResult.id}`;
      }

      // Handle delivery options
      if (params.deliveryOptions?.email) {
        await this.sendReportByEmail(reportResult.id, params.deliveryOptions.email, reportTitle);
      }

      return reportResult;

    } catch (error) {
      throw new ReportGenerationError(
        `Failed to generate ${params.reportType} report`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Generate comprehensive dashboard report with all key metrics
   */
  async generateDashboardReport(
    period: { startDate: Date; endDate: Date },
    generatedBy: string
  ): Promise<FinancialReportResult> {
    const config: FinancialAnalyticsConfig = {
      ...period,
      includeComparisons: true,
      includeForecast: true,
      format: 'pdf',
    };

    // Generate all core reports
    const [
      monthlyRevenue,
      cashFlow,
      receivables,
      payables,
      commissions,
    ] = await Promise.all([
      this.generateBasicRevenueReport(config),
      this.generateBasicCashFlowReport(config),
      this.arAgingService.generateAccountsReceivableAgingReport(config.endDate),
      this.generateBasicPayablesReport(config),
      this.generateBasicCommissionReport(config),
    ]);

    // Combine into comprehensive dashboard
    const dashboardData = {
      executiveSummary: this.createExecutiveSummary({
        monthlyRevenue,
        cashFlow,
        receivables,
        payables,
        commissions,
      }),
      revenueAnalysis: monthlyRevenue,
      cashFlowAnalysis: cashFlow,
      receivablesAnalysis: receivables,
      payablesAnalysis: payables,
      commissionAnalysis: commissions,
    };

    // Generate PDF
    const pdfBuffer = await this.generatePDFReport(
      'Financial Analytics Dashboard',
      dashboardData,
      config,
      generatedBy
    );

    return {
      id: `dashboard_${Date.now()}`,
      reportType: 'dashboard',
      generatedAt: new Date(),
      downloadUrl: `/api/reports/download/dashboard_${Date.now()}`,
      metadata: {
        recordCount: this.getRecordCount(dashboardData),
        period: config,
        generatedBy,
      },
    };
  }

  /**
   * Generate basic revenue report using existing data models
   */
  private async generateBasicRevenueReport(config: FinancialAnalyticsConfig): Promise<any> {
    // Query payments and licenses for revenue data
    const payments = await this.prisma.payment.findMany({
      where: {
        createdAt: {
          gte: config.startDate,
          lte: config.endDate,
        },
        status: 'COMPLETED',
      },
      include: {
        brand: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    const licenses = await this.prisma.license.findMany({
      where: {
        createdAt: {
          gte: config.startDate,
          lte: config.endDate,
        },
        status: {
          in: ['ACTIVE', 'EXPIRED', 'RENEWED'],
        },
      },
      include: {
        brand: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    // Calculate basic metrics
    const totalRevenue = payments.reduce((sum, payment) => {
      return sum + Number(payment.amount) * 100; // Convert to cents
    }, 0);

    const totalLicenseValue = licenses.reduce((sum, license) => {
      return sum + license.feeCents;
    }, 0);

    return {
      summary: {
        totalRevenue: totalRevenue + totalLicenseValue,
        paymentRevenue: totalRevenue,
        licenseRevenue: totalLicenseValue,
        transactionCount: payments.length + licenses.length,
      },
      payments: payments.map(p => ({
        id: p.id,
        amount: Number(p.amount) * 100,
        brandName: p.brand.companyName,
        createdAt: p.createdAt,
      })),
      licenses: licenses.map(l => ({
        id: l.id,
        feeCents: l.feeCents,
        brandName: l.brand.companyName,
        createdAt: l.createdAt,
      })),
    };
  }

  /**
   * Generate basic quarterly report
   */
  private async generateBasicQuarterlyReport(config: FinancialAnalyticsConfig): Promise<any> {
    const revenueData = await this.generateBasicRevenueReport(config);
    
    return {
      summary: {
        ...revenueData.summary,
        quarterPeriod: this.formatDateRange(config),
      },
      monthlyBreakdown: [], // TODO: Implement monthly breakdown
      comparison: {}, // TODO: Implement quarter-over-quarter comparison
    };
  }

  /**
   * Generate basic cash flow report
   */
  private async generateBasicCashFlowReport(config: FinancialAnalyticsConfig): Promise<any> {
    const payouts = await this.prisma.payout.findMany({
      where: {
        createdAt: {
          gte: config.startDate,
          lte: config.endDate,
        },
      },
    });

    const totalOutflow = payouts.reduce((sum, payout) => sum + payout.amountCents, 0);
    const revenueData = await this.generateBasicRevenueReport(config);

    return {
      summary: {
        totalInflow: revenueData.summary.totalRevenue,
        totalOutflow,
        netCashFlow: revenueData.summary.totalRevenue - totalOutflow,
      },
      cashFlowByMonth: [], // TODO: Implement monthly breakdown
      projections: [], // TODO: Implement projections
    };
  }

  /**
   * Generate basic payables report
   */
  private async generateBasicPayablesReport(config: FinancialAnalyticsConfig): Promise<any> {
    const pendingPayouts = await this.prisma.payout.findMany({
      where: {
        status: 'PENDING',
        createdAt: {
          lte: config.endDate,
        },
      },
      include: {
        creator: {
          select: {
            id: true,
            stageName: true,
          },
        },
      },
    });

    const totalPending = pendingPayouts.reduce((sum, payout) => sum + payout.amountCents, 0);

    return {
      summary: {
        totalPending,
        pendingCount: pendingPayouts.length,
      },
      pendingPayouts: pendingPayouts.map(p => ({
        id: p.id,
        amountCents: p.amountCents,
        creatorName: p.creator.stageName,
        createdAt: p.createdAt,
      })),
    };
  }

  /**
   * Generate basic commission report
   */
  private async generateBasicCommissionReport(config: FinancialAnalyticsConfig): Promise<any> {
    // For now, calculate platform fees as a percentage of revenue
    const revenueData = await this.generateBasicRevenueReport(config);
    const platformFeeRate = 0.10; // 10% platform fee
    const estimatedCommissions = Math.round(revenueData.summary.totalRevenue * platformFeeRate);

    return {
      summary: {
        totalCommissions: estimatedCommissions,
        averageCommissionRate: platformFeeRate,
        transactionCount: revenueData.summary.transactionCount,
      },
      commissionsByType: [
        {
          type: 'PLATFORM_FEE',
          amount: estimatedCommissions,
          rate: platformFeeRate,
        },
      ],
    };
  }

  // Helper methods

  private async generatePDFReport(
    title: string,
    data: any,
    config: FinancialAnalyticsConfig,
    generatedBy: string
  ): Promise<Buffer> {
    const pdfConfig: PDFReportConfig = {
      title,
      reportType: 'Financial Analytics Report',
      generatedAt: new Date(),
      generatedBy,
      period: {
        startDate: config.startDate,
        endDate: config.endDate,
      },
      branding: {
        companyName: 'YesGoddess Platform',
        primaryColor: '#1a365d',
        secondaryColor: '#4299e1',
      },
    };

    const sections = this.convertDataToPDFSections(data);
    
    return this.pdfService.generateReport(pdfConfig, { sections });
  }

  private convertDataToPDFSections(data: any): any[] {
    // Convert report data to PDF sections
    return [
      {
        title: 'Executive Summary',
        content: [
          {
            type: 'summary_box',
            title: 'Key Highlights',
            content: 'Financial performance summary for the reporting period.',
          },
          {
            type: 'key_metrics',
            content: this.extractKeyMetrics(data),
          },
        ],
      },
      {
        title: 'Detailed Analysis',
        content: [
          {
            type: 'text',
            content: 'Detailed financial analysis and metrics follow...',
          },
        ],
      },
    ];
  }

  private extractKeyMetrics(data: any): Array<{ label: string; value: string; change?: string }> {
    const metrics = [];
    
    if (data.summary?.totalRevenue !== undefined) {
      metrics.push({
        label: 'Total Revenue',
        value: this.formatCurrency(data.summary.totalRevenue),
      });
    }
    
    if (data.summary?.transactionCount !== undefined) {
      metrics.push({
        label: 'Transactions',
        value: data.summary.transactionCount.toString(),
      });
    }
    
    if (data.summary?.netCashFlow !== undefined) {
      metrics.push({
        label: 'Net Cash Flow',
        value: this.formatCurrency(data.summary.netCashFlow),
      });
    }

    return metrics;
  }

  private createExecutiveSummary(reports: any): any {
    return {
      totalRevenue: reports.monthlyRevenue?.summary?.totalRevenue || 0,
      netCashFlow: reports.cashFlow?.summary?.netCashFlow || 0,
      outstandingReceivables: reports.receivables?.summary?.totalOutstanding || 0,
      pendingPayables: reports.payables?.summary?.totalPending || 0,
      platformCommissions: reports.commissions?.summary?.totalCommissions || 0,
      keyInsights: [
        'Revenue performance analysis',
        'Cash flow optimization opportunities',
        'Collection efficiency metrics',
      ],
    };
  }

  private formatCurrency(amountCents: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amountCents / 100);
  }

  private formatDateRange(config: FinancialAnalyticsConfig): string {
    const start = config.startDate.toLocaleDateString();
    const end = config.endDate.toLocaleDateString();
    return `${start} - ${end}`;
  }

  private getRecordCount(data: any): number {
    if (Array.isArray(data)) return data.length;
    if (data?.items && Array.isArray(data.items)) return data.items.length;
    if (data?.summary?.recordCount) return data.summary.recordCount;
    if (data?.summary?.transactionCount) return data.summary.transactionCount;
    return 1;
  }

  private async sendReportByEmail(reportId: string, recipients: string[], title: string): Promise<void> {
    // TODO: Integrate with email service
    console.log(`Sending report ${reportId} to ${recipients.length} recipients: ${title}`);
  }
}