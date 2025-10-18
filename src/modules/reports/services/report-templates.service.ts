/**
 * Report Templates Service
 * 
 * Pre-defined report templates for common business intelligence needs:
 * - Monthly operational reports
 * - Quarterly strategic reports
 * - Annual comprehensive reports
 * - Specialized reports (tax, creator earnings, brand campaigns)
 */

import { PrismaClient } from '@prisma/client';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, subQuarters, subYears, format } from 'date-fns';
import type { CustomReportConfig } from './custom-report-builder.service';

export interface ReportTemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: 'temporal' | 'financial' | 'operational' | 'compliance';
  scope: 'platform' | 'creator' | 'brand';
  frequency: 'monthly' | 'quarterly' | 'annual' | 'on-demand';
  sections: TemplateSection[];
  dataRequirements: string[];
  estimatedGenerationTime: string;
  supportedFormats: ('pdf' | 'csv' | 'excel')[];
  accessLevel: ('ADMIN' | 'CREATOR' | 'BRAND')[];
}

export interface TemplateSection {
  id: string;
  title: string;
  description: string;
  type: 'summary' | 'timeseries' | 'breakdown' | 'comparison' | 'table' | 'chart';
  required: boolean;
  dataQuery: any;
  visualization?: {
    type: 'line' | 'bar' | 'pie' | 'table' | 'metric';
    config: any;
  };
}

export interface MonthlyReportData {
  period: {
    month: number;
    year: number;
    label: string;
  };
  operationalMetrics: {
    totalRevenueCents: number;
    revenueGrowth: number;
    transactionCount: number;
    transactionGrowth: number;
    averageTransactionCents: number;
  };
  userMetrics: {
    newCreators: number;
    activeCreators: number;
    newBrands: number;
    activeBrands: number;
    churnRate: number;
  };
  assetMetrics: {
    newAssets: number;
    totalActiveAssets: number;
    assetsApproved: number;
    approvalRate: number;
  };
  licenseMetrics: {
    newLicenses: number;
    activeLicenses: number;
    expiredLicenses: number;
    renewalRate: number;
  };
  topPerformers: {
    creators: Array<{ id: string; name: string; earningsCents: number }>;
    assets: Array<{ id: string; title: string; revenueCents: number }>;
    brands: Array<{ id: string; name: string; spendingCents: number }>;
  };
  anomalies: Array<{
    type: string;
    description: string;
    severity: 'info' | 'warning' | 'critical';
    value: any;
  }>;
}

export interface QuarterlyReportData {
  period: {
    quarter: number;
    year: number;
    label: string;
  };
  executiveSummary: {
    totalRevenueCents: number;
    quarterOverQuarterGrowth: number;
    yearOverYearGrowth: number;
    grossMargin: number;
    netMargin: number;
  };
  trendAnalysis: {
    revenueByMonth: Array<{ month: string; revenueCents: number; growth: number }>;
    seasonalAdjustment: number;
    trendDirection: 'up' | 'down' | 'stable';
  };
  cohortAnalysis: {
    creatorRetention: Array<{ cohort: string; retentionRate: number; revenueContribution: number }>;
    brandRetention: Array<{ cohort: string; retentionRate: number; spendingContribution: number }>;
  };
  strategicMetrics: {
    customerAcquisitionCost: number;
    lifetimeValue: number;
    ltvcacRatio: number;
    paybackPeriodDays: number;
  };
  marketAnalysis: {
    topCategories: Array<{ category: string; revenueCents: number; growth: number }>;
    geographicDistribution: Array<{ region: string; revenueCents: number; percentage: number }>;
  };
}

export interface AnnualReportData {
  period: {
    year: number;
    label: string;
  };
  financialSummary: {
    totalRevenueCents: number;
    totalPayoutsCents: number;
    platformFeesCents: number;
    grossProfitCents: number;
    grossMargin: number;
  };
  yearOverYearComparison: {
    revenueCents: number;
    revenueGrowth: number;
    transactionCount: number;
    transactionGrowth: number;
    userCount: number;
    userGrowth: number;
  };
  platformMetrics: {
    totalCreators: number;
    activeCreators: number;
    totalBrands: number;
    activeBrands: number;
    totalAssets: number;
    totalLicenses: number;
    averageCreatorEarningsCents: number;
  };
  milestones: Array<{
    date: Date;
    title: string;
    description: string;
    impact: string;
  }>;
  topPerformers: {
    creators: Array<{ id: string; name: string; earningsCents: number; licenses: number }>;
    assets: Array<{ id: string; title: string; revenueCents: number; licenses: number }>;
    brands: Array<{ id: string; name: string; spendingCents: number; licenses: number }>;
  };
  strategicInsights: {
    growthDrivers: string[];
    challenges: string[];
    opportunities: string[];
    recommendations: string[];
  };
}

export class ReportTemplatesService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Get all available report templates
   */
  getAllTemplates(): ReportTemplateDefinition[] {
    return [
      this.getMonthlyReportTemplate(),
      this.getQuarterlyReportTemplate(),
      this.getAnnualReportTemplate(),
      this.getCreatorEarningsTemplate(),
      this.getBrandCampaignTemplate(),
      this.getTaxComplianceTemplate(),
      this.getAssetPortfolioTemplate()
    ];
  }

  /**
   * Get template by ID
   */
  getTemplateById(templateId: string): ReportTemplateDefinition | null {
    const templates = this.getAllTemplates();
    return templates.find(t => t.id === templateId) || null;
  }

  /**
   * Monthly Report Template
   */
  private getMonthlyReportTemplate(): ReportTemplateDefinition {
    return {
      id: 'monthly_operational',
      name: 'Monthly Operational Report',
      description: 'Comprehensive monthly metrics for operational review and performance tracking',
      category: 'temporal',
      scope: 'platform',
      frequency: 'monthly',
      sections: [
        {
          id: 'executive_summary',
          title: 'Executive Summary',
          description: 'High-level KPIs and month-over-month comparisons',
          type: 'summary',
          required: true,
          dataQuery: {}
        },
        {
          id: 'revenue_analysis',
          title: 'Revenue Analysis',
          description: 'Revenue breakdown by source, category, and geography',
          type: 'breakdown',
          required: true,
          dataQuery: {},
          visualization: {
            type: 'bar',
            config: { stacked: true }
          }
        },
        {
          id: 'user_metrics',
          title: 'User Acquisition & Engagement',
          description: 'New user signups, active users, and churn analysis',
          type: 'timeseries',
          required: true,
          dataQuery: {},
          visualization: {
            type: 'line',
            config: { showTrend: true }
          }
        },
        {
          id: 'asset_performance',
          title: 'Asset Performance',
          description: 'New assets, approvals, and licensing activity',
          type: 'table',
          required: true,
          dataQuery: {}
        },
        {
          id: 'top_performers',
          title: 'Top Performers',
          description: 'Highest earning creators and most licensed assets',
          type: 'table',
          required: true,
          dataQuery: {}
        },
        {
          id: 'anomalies',
          title: 'Anomalies & Alerts',
          description: 'Notable deviations from expected patterns',
          type: 'table',
          required: false,
          dataQuery: {}
        }
      ],
      dataRequirements: [
        'transactions',
        'royalty_statements',
        'users',
        'assets',
        'licenses',
        'analytics_events'
      ],
      estimatedGenerationTime: '30-60 seconds',
      supportedFormats: ['pdf', 'excel'],
      accessLevel: ['ADMIN']
    };
  }

  /**
   * Quarterly Report Template
   */
  private getQuarterlyReportTemplate(): ReportTemplateDefinition {
    return {
      id: 'quarterly_strategic',
      name: 'Quarterly Strategic Report',
      description: 'Strategic analysis with trends, cohorts, and forward-looking indicators',
      category: 'temporal',
      scope: 'platform',
      frequency: 'quarterly',
      sections: [
        {
          id: 'executive_summary',
          title: 'Executive Summary',
          description: 'Quarterly highlights and QoQ/YoY comparisons',
          type: 'summary',
          required: true,
          dataQuery: {}
        },
        {
          id: 'trend_analysis',
          title: 'Trend Analysis',
          description: 'Revenue trends with seasonal adjustments',
          type: 'timeseries',
          required: true,
          dataQuery: {},
          visualization: {
            type: 'line',
            config: { showSeasonality: true }
          }
        },
        {
          id: 'cohort_analysis',
          title: 'Cohort Analysis',
          description: 'User retention and revenue contribution by cohort',
          type: 'table',
          required: true,
          dataQuery: {}
        },
        {
          id: 'strategic_metrics',
          title: 'Strategic Metrics',
          description: 'CAC, LTV, and unit economics',
          type: 'summary',
          required: true,
          dataQuery: {}
        },
        {
          id: 'market_analysis',
          title: 'Market Analysis',
          description: 'Category and geographic performance',
          type: 'breakdown',
          required: true,
          dataQuery: {},
          visualization: {
            type: 'pie',
            config: {}
          }
        }
      ],
      dataRequirements: [
        'transactions',
        'royalty_statements',
        'users',
        'assets',
        'licenses',
        'analytics_events',
        'marketing_data'
      ],
      estimatedGenerationTime: '2-5 minutes',
      supportedFormats: ['pdf', 'excel'],
      accessLevel: ['ADMIN']
    };
  }

  /**
   * Annual Report Template
   */
  private getAnnualReportTemplate(): ReportTemplateDefinition {
    return {
      id: 'annual_comprehensive',
      name: 'Annual Comprehensive Report',
      description: 'Full fiscal year summary suitable for board presentations and strategic planning',
      category: 'temporal',
      scope: 'platform',
      frequency: 'annual',
      sections: [
        {
          id: 'financial_summary',
          title: 'Financial Summary',
          description: 'Complete fiscal year financial performance',
          type: 'summary',
          required: true,
          dataQuery: {}
        },
        {
          id: 'yoy_comparison',
          title: 'Year-Over-Year Comparison',
          description: 'Growth across all key metrics',
          type: 'comparison',
          required: true,
          dataQuery: {}
        },
        {
          id: 'platform_metrics',
          title: 'Platform Metrics',
          description: 'Comprehensive user and activity metrics',
          type: 'summary',
          required: true,
          dataQuery: {}
        },
        {
          id: 'milestones',
          title: 'Key Milestones',
          description: 'Major achievements and events throughout the year',
          type: 'table',
          required: true,
          dataQuery: {}
        },
        {
          id: 'top_performers',
          title: 'Annual Top Performers',
          description: 'Highest performing creators, assets, and brands',
          type: 'table',
          required: true,
          dataQuery: {}
        },
        {
          id: 'strategic_insights',
          title: 'Strategic Insights',
          description: 'Growth drivers, challenges, and recommendations',
          type: 'summary',
          required: false,
          dataQuery: {}
        }
      ],
      dataRequirements: [
        'transactions',
        'royalty_statements',
        'users',
        'assets',
        'licenses',
        'analytics_events',
        'financial_statements',
        'milestones'
      ],
      estimatedGenerationTime: '5-10 minutes',
      supportedFormats: ['pdf'],
      accessLevel: ['ADMIN']
    };
  }

  /**
   * Creator Earnings Statement Template
   */
  private getCreatorEarningsTemplate(): ReportTemplateDefinition {
    return {
      id: 'creator_earnings_statement',
      name: 'Creator Earnings Statement',
      description: 'Detailed breakdown of royalties, licenses, and payments for creators',
      category: 'financial',
      scope: 'creator',
      frequency: 'on-demand',
      sections: [
        {
          id: 'earnings_summary',
          title: 'Earnings Summary',
          description: 'Total earnings, payouts, and pending amounts',
          type: 'summary',
          required: true,
          dataQuery: {}
        },
        {
          id: 'royalty_breakdown',
          title: 'Royalty Breakdown',
          description: 'Line-by-line royalty calculations',
          type: 'table',
          required: true,
          dataQuery: {}
        },
        {
          id: 'license_contributions',
          title: 'License Contributions',
          description: 'Revenue by asset and license type',
          type: 'breakdown',
          required: true,
          dataQuery: {}
        },
        {
          id: 'ownership_splits',
          title: 'Ownership Splits',
          description: 'Percentage splits for collaborative works',
          type: 'table',
          required: false,
          dataQuery: {}
        },
        {
          id: 'adjustments',
          title: 'Adjustments & Credits',
          description: 'Any corrections or special adjustments',
          type: 'table',
          required: false,
          dataQuery: {}
        }
      ],
      dataRequirements: [
        'royalty_statements',
        'royalty_lines',
        'licenses',
        'assets',
        'ip_ownership',
        'payouts'
      ],
      estimatedGenerationTime: '10-30 seconds',
      supportedFormats: ['pdf', 'csv'],
      accessLevel: ['ADMIN', 'CREATOR']
    };
  }

  /**
   * Brand Campaign Performance Template
   */
  private getBrandCampaignTemplate(): ReportTemplateDefinition {
    return {
      id: 'brand_campaign_performance',
      name: 'Brand Campaign Performance',
      description: 'Campaign ROI, license usage, and asset performance for brands',
      category: 'operational',
      scope: 'brand',
      frequency: 'on-demand',
      sections: [
        {
          id: 'campaign_overview',
          title: 'Campaign Overview',
          description: 'Total spending, licenses, and assets used',
          type: 'summary',
          required: true,
          dataQuery: {}
        },
        {
          id: 'license_details',
          title: 'License Details',
          description: 'Active licenses with terms and expiration',
          type: 'table',
          required: true,
          dataQuery: {}
        },
        {
          id: 'asset_performance',
          title: 'Asset Performance',
          description: 'Usage metrics by asset',
          type: 'table',
          required: true,
          dataQuery: {}
        },
        {
          id: 'spending_analysis',
          title: 'Spending Analysis',
          description: 'Budget utilization and cost per asset',
          type: 'breakdown',
          required: true,
          dataQuery: {}
        },
        {
          id: 'upcoming_expirations',
          title: 'Upcoming Expirations',
          description: 'Licenses expiring soon',
          type: 'table',
          required: true,
          dataQuery: {}
        }
      ],
      dataRequirements: [
        'licenses',
        'assets',
        'transactions',
        'license_usage_analytics'
      ],
      estimatedGenerationTime: '20-40 seconds',
      supportedFormats: ['pdf', 'excel'],
      accessLevel: ['ADMIN', 'BRAND']
    };
  }

  /**
   * Tax Compliance Report Template
   */
  private getTaxComplianceTemplate(): ReportTemplateDefinition {
    return {
      id: 'tax_compliance_annual',
      name: 'Tax Compliance Report',
      description: 'Annual tax documentation for regulatory compliance',
      category: 'compliance',
      scope: 'platform',
      frequency: 'annual',
      sections: [
        {
          id: 'summary',
          title: 'Tax Summary',
          description: 'Total earnings, withholdings, and forms issued',
          type: 'summary',
          required: true,
          dataQuery: {}
        },
        {
          id: 'creator_earnings',
          title: 'Creator Earnings',
          description: 'Earnings by creator with tax classification',
          type: 'table',
          required: true,
          dataQuery: {}
        },
        {
          id: 'withholdings',
          title: 'Tax Withholdings',
          description: 'Withheld amounts by jurisdiction',
          type: 'breakdown',
          required: true,
          dataQuery: {}
        },
        {
          id: 'forms_issued',
          title: 'Forms Issued',
          description: '1099s, W-9s, and other tax forms',
          type: 'table',
          required: true,
          dataQuery: {}
        },
        {
          id: 'jurisdictions',
          title: 'Jurisdiction Summary',
          description: 'Tax obligations by jurisdiction',
          type: 'breakdown',
          required: true,
          dataQuery: {}
        }
      ],
      dataRequirements: [
        'royalty_statements',
        'tax_documents',
        'tax_withholdings',
        'tax_jurisdictions',
        'creators'
      ],
      estimatedGenerationTime: '2-3 minutes',
      supportedFormats: ['pdf', 'csv'],
      accessLevel: ['ADMIN']
    };
  }

  /**
   * Asset Portfolio Report Template
   */
  private getAssetPortfolioTemplate(): ReportTemplateDefinition {
    return {
      id: 'asset_portfolio_analysis',
      name: 'Asset Portfolio Analysis',
      description: 'Comprehensive asset inventory with performance and monetization metrics',
      category: 'operational',
      scope: 'creator',
      frequency: 'on-demand',
      sections: [
        {
          id: 'portfolio_overview',
          title: 'Portfolio Overview',
          description: 'Total assets, active licenses, and cumulative revenue',
          type: 'summary',
          required: true,
          dataQuery: {}
        },
        {
          id: 'asset_inventory',
          title: 'Asset Inventory',
          description: 'Complete list of assets with metadata',
          type: 'table',
          required: true,
          dataQuery: {}
        },
        {
          id: 'performance_metrics',
          title: 'Performance Metrics',
          description: 'Revenue and licensing activity by asset',
          type: 'table',
          required: true,
          dataQuery: {}
        },
        {
          id: 'category_analysis',
          title: 'Category Analysis',
          description: 'Performance breakdown by asset type',
          type: 'breakdown',
          required: true,
          dataQuery: {},
          visualization: {
            type: 'bar',
            config: {}
          }
        },
        {
          id: 'recommendations',
          title: 'Optimization Recommendations',
          description: 'Suggestions for improving portfolio performance',
          type: 'summary',
          required: false,
          dataQuery: {}
        }
      ],
      dataRequirements: [
        'assets',
        'licenses',
        'royalty_lines',
        'ip_ownership',
        'analytics_events'
      ],
      estimatedGenerationTime: '30-60 seconds',
      supportedFormats: ['pdf', 'excel'],
      accessLevel: ['ADMIN', 'CREATOR']
    };
  }

  /**
   * Generate report from template
   */
  async generateFromTemplate(
    templateId: string,
    parameters: {
      period?: {
        startDate?: Date;
        endDate?: Date;
        month?: number;
        quarter?: number;
        year?: number;
      };
      userId?: string;
      filters?: any;
      format?: 'pdf' | 'csv' | 'excel';
    },
    requestedBy: string
  ): Promise<string> {
    const template = this.getTemplateById(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Calculate date range based on template frequency and parameters
    const dateRange = this.calculateDateRange(template.frequency, parameters.period);

    // Gather data for each section
    const reportData: any = {
      template: template.name,
      period: dateRange,
      sections: {}
    };

    for (const section of template.sections) {
      if (section.required || parameters.filters?.[section.id]?.include !== false) {
        reportData.sections[section.id] = await this.generateSectionData(
          section,
          dateRange,
          parameters
        );
      }
    }

    // Create report record
    const report = await this.prisma.financialReport.create({
      data: {
        reportType: this.mapTemplateToReportType(templateId),
        period: {
          startDate: dateRange.startDate.toISOString(),
          endDate: dateRange.endDate.toISOString()
        },
        generatedBy: requestedBy,
        status: 'GENERATING',
        metadata: {
          templateId,
          templateName: template.name,
          parameters,
          sections: template.sections.map(s => s.id)
        }
      }
    });

    // Queue for processing
    // (Would integrate with reportGenerationQueue)

    return report.id;
  }

  /**
   * Calculate date range based on frequency
   */
  private calculateDateRange(
    frequency: string,
    period?: any
  ): { startDate: Date; endDate: Date } {
    const now = new Date();

    if (period?.startDate && period?.endDate) {
      return {
        startDate: new Date(period.startDate),
        endDate: new Date(period.endDate)
      };
    }

    switch (frequency) {
      case 'monthly':
        const month = period?.month || now.getMonth();
        const monthYear = period?.year || now.getFullYear();
        return {
          startDate: startOfMonth(new Date(monthYear, month)),
          endDate: endOfMonth(new Date(monthYear, month))
        };

      case 'quarterly':
        const quarter = period?.quarter || Math.floor(now.getMonth() / 3) + 1;
        const quarterYear = period?.year || now.getFullYear();
        const quarterDate = new Date(quarterYear, (quarter - 1) * 3);
        return {
          startDate: startOfQuarter(quarterDate),
          endDate: endOfQuarter(quarterDate)
        };

      case 'annual':
        const year = period?.year || now.getFullYear();
        return {
          startDate: startOfYear(new Date(year, 0)),
          endDate: endOfYear(new Date(year, 0))
        };

      default:
        // Default to last 30 days
        return {
          startDate: subMonths(now, 1),
          endDate: now
        };
    }
  }

  /**
   * Generate data for a specific section
   */
  private async generateSectionData(
    section: TemplateSection,
    dateRange: { startDate: Date; endDate: Date },
    parameters: any
  ): Promise<any> {
    // This would execute the actual queries to gather section data
    // Simplified placeholder
    return {
      sectionId: section.id,
      title: section.title,
      data: {},
      generatedAt: new Date()
    };
  }

  /**
   * Map template ID to report type enum
   */
  private mapTemplateToReportType(templateId: string): any {
    const mapping: Record<string, string> = {
      'monthly_operational': 'MONTHLY_REVENUE',
      'quarterly_strategic': 'QUARTERLY_SUMMARY',
      'annual_comprehensive': 'ANNUAL_STATEMENT',
      'creator_earnings_statement': 'CUSTOM',
      'brand_campaign_performance': 'CUSTOM',
      'tax_compliance_annual': 'CUSTOM',
      'asset_portfolio_analysis': 'CUSTOM'
    };

    return mapping[templateId] || 'CUSTOM';
  }
}
