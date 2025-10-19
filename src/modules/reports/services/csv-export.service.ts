/**
 * CSV Export Service
 * 
 * Handles generation of CSV files for all financial data types including
 * royalty statements, transaction ledgers, creator earnings, and platform revenue.
 */

import { PrismaClient } from '@prisma/client';
import { Transform } from 'json2csv';
import { format } from 'date-fns';

export interface CSVExportConfig {
  reportType: 'royalty_statements' | 'transaction_ledger' | 'creator_earnings' | 'platform_revenue' | 'payout_summary';
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  filters?: {
    creatorIds?: string[];
    brandIds?: string[];
    assetTypes?: string[];
    licenseTypes?: string[];
    statuses?: string[];
  };
  columns?: string[];
  includeTotals?: boolean;
}

export interface CSVDataRow {
  [key: string]: string | number | boolean | null;
}

export class CSVExportService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Generate CSV file for the specified data type
   */
  async generateCSV(config: CSVExportConfig): Promise<Buffer> {
    let data: CSVDataRow[];
    let fields: string[];

    switch (config.reportType) {
      case 'royalty_statements':
        ({ data, fields } = await this.generateRoyaltyStatementsCSV(config));
        break;
      case 'transaction_ledger':
        ({ data, fields } = await this.generateTransactionLedgerCSV(config));
        break;
      case 'creator_earnings':
        ({ data, fields } = await this.generateCreatorEarningsCSV(config));
        break;
      case 'platform_revenue':
        ({ data, fields } = await this.generatePlatformRevenueCSV(config));
        break;
      case 'payout_summary':
        ({ data, fields } = await this.generatePayoutSummaryCSV(config));
        break;
      default:
        throw new Error(`Unsupported report type: ${config.reportType}`);
    }

    // Apply column filtering if specified
    if (config.columns && config.columns.length > 0) {
      fields = fields.filter(field => config.columns!.includes(field));
      data = data.map(row => {
        const filteredRow: CSVDataRow = {};
        config.columns!.forEach(col => {
          if (col in row) filteredRow[col] = row[col];
        });
        return filteredRow;
      });
    }

    // Add totals row if requested
    if (config.includeTotals && data.length > 0) {
      const totalsRow = this.calculateTotalsRow(data, fields);
      if (totalsRow) {
        data.push(totalsRow);
      }
    }

    // Convert to CSV
    const json2csvParser = new Transform({
      fields,
      formatters: {
        number: (value: any) => {
          if (typeof value === 'number' && value % 1 !== 0) {
            return value.toFixed(2);
          }
          return value;
        }
      }
    });

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      
      json2csvParser.on('data', (chunk: Buffer) => chunks.push(chunk));
      json2csvParser.on('end', () => resolve(Buffer.concat(chunks)));
      json2csvParser.on('error', reject);
      
      data.forEach(row => json2csvParser.write(row));
      json2csvParser.end();
    });
  }

  /**
   * Generate royalty statements CSV data
   */
  private async generateRoyaltyStatementsCSV(config: CSVExportConfig): Promise<{ data: CSVDataRow[]; fields: string[] }> {
    const whereClause: any = {
      createdAt: {
        gte: config.dateRange.startDate,
        lte: config.dateRange.endDate
      }
    };

    // Apply filters
    if (config.filters?.creatorIds?.length) {
      whereClause.creatorId = { in: config.filters.creatorIds };
    }
    if (config.filters?.statuses?.length) {
      whereClause.status = { in: config.filters.statuses };
    }

    const statements = await this.prisma.royaltyStatement.findMany({
      where: whereClause,
      include: {
        creator: {
          include: {
            user: true
          }
        },
        royaltyRun: true,
        royaltyLines: {
          include: {
            ipAsset: true,
            license: {
              include: {
                brand: {
                  include: {
                    user: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { royaltyRun: { periodStart: 'desc' } },
        { creator: { user: { name: 'asc' } } }
      ]
    });

    const data: CSVDataRow[] = [];
    
    for (const statement of statements) {
      for (const line of statement.royaltyLines) {
        data.push({
          'Statement ID': statement.id,
          'Creator Name': statement.creator.stageName || statement.creator.user.name || 'Unknown',
          'Creator Email': statement.creator.user.email,
          'Period Start': format(statement.royaltyRun.periodStart, 'yyyy-MM-dd'),
          'Period End': format(statement.royaltyRun.periodEnd, 'yyyy-MM-dd'),
          'Asset Title': line.ipAsset.title,
          'Asset Type': line.ipAsset.type,
          'Brand Name': line.license.brand.displayName || line.license.brand.user.name || 'Unknown',
          'License Type': line.license.licenseType,
          'Revenue (USD)': (line.revenueCents / 100),
          'Ownership Share (%)': (line.shareBps / 100),
          'Calculated Royalty (USD)': (line.calculatedRoyaltyCents / 100),
          'Statement Status': statement.status,
          'Statement Total (USD)': (statement.totalEarningsCents / 100),
          'Created At': format(statement.createdAt, 'yyyy-MM-dd HH:mm:ss'),
          'Reviewed At': statement.reviewedAt ? format(statement.reviewedAt, 'yyyy-MM-dd HH:mm:ss') : null,
          'Paid At': statement.paidAt ? format(statement.paidAt, 'yyyy-MM-dd HH:mm:ss') : null
        });
      }
    }

    const fields = [
      'Statement ID',
      'Creator Name', 
      'Creator Email',
      'Period Start',
      'Period End',
      'Asset Title',
      'Asset Type',
      'Brand Name',
      'License Type',
      'Revenue (USD)',
      'Ownership Share (%)',
      'Calculated Royalty (USD)',
      'Statement Status',
      'Statement Total (USD)',
      'Created At',
      'Reviewed At',
      'Paid At'
    ];

    return { data, fields };
  }

  /**
   * Generate transaction ledger CSV data
   */
  private async generateTransactionLedgerCSV(config: CSVExportConfig): Promise<{ data: CSVDataRow[]; fields: string[] }> {
    const whereClause: any = {
      createdAt: {
        gte: config.dateRange.startDate,
        lte: config.dateRange.endDate
      }
    };

    // Apply filters
    if (config.filters?.brandIds?.length) {
      whereClause.brandId = { in: config.filters.brandIds };
    }
    if (config.filters?.licenseTypes?.length) {
      whereClause.licenseType = { in: config.filters.licenseTypes };
    }
    if (config.filters?.statuses?.length) {
      whereClause.status = { in: config.filters.statuses };
    }

    const licenses = await this.prisma.license.findMany({
      where: whereClause,
      include: {
        brand: {
          include: {
            user: true
          }
        },
        ipAsset: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const data: CSVDataRow[] = licenses.map(license => ({
      'Transaction ID': license.id,
      'Transaction Date': format(license.createdAt, 'yyyy-MM-dd'),
      'Transaction Type': 'License Fee',
      'Brand Name': license.brand.displayName || license.brand.user.name || 'Unknown',
      'Brand Email': license.brand.user.email,
      'Asset Title': license.ipAsset.title,
      'Asset Type': license.ipAsset.type,
      'License Type': license.licenseType,
      'License Fee (USD)': (license.feeCents / 100),
      'License Status': license.status,
      'License Start': format(license.startDate, 'yyyy-MM-dd'),
      'License End': format(license.endDate, 'yyyy-MM-dd'),
      'Usage Rights': license.usageRights,
      'Geographic Scope': license.geographicScope
    }));

    const fields = [
      'Transaction ID',
      'Transaction Date',
      'Transaction Type',
      'Brand Name',
      'Brand Email',
      'Asset Title',
      'Asset Type',
      'License Type',
      'License Fee (USD)',
      'License Status',
      'License Start',
      'License End',
      'Usage Rights',
      'Geographic Scope'
    ];

    return { data, fields };
  }

  /**
   * Generate creator earnings summary CSV data
   */
  private async generateCreatorEarningsCSV(config: CSVExportConfig): Promise<{ data: CSVDataRow[]; fields: string[] }> {
    const whereClause: any = {
      createdAt: {
        gte: config.dateRange.startDate,
        lte: config.dateRange.endDate
      }
    };

    if (config.filters?.creatorIds?.length) {
      whereClause.creatorId = { in: config.filters.creatorIds };
    }

    const statements = await this.prisma.royaltyStatement.findMany({
      where: whereClause,
      include: {
        creator: {
          include: {
            user: true
          }
        },
        royaltyRun: true
      },
      orderBy: { creator: { user: { name: 'asc' } } }
    });

    // Group by creator
    const creatorEarnings = new Map<string, {
      creator: any;
      totalEarnings: number;
      paidEarnings: number;
      pendingEarnings: number;
      statementCount: number;
      firstPayment: Date | null;
      lastPayment: Date | null;
    }>();

    statements.forEach(statement => {
      const key = statement.creatorId;
      const existing = creatorEarnings.get(key);
      
      if (existing) {
        existing.totalEarnings += statement.totalEarningsCents;
        existing.statementCount += 1;
        
        if (statement.status === 'PAID') {
          existing.paidEarnings += statement.totalEarningsCents;
          if (statement.paidAt) {
            if (!existing.firstPayment || statement.paidAt < existing.firstPayment) {
              existing.firstPayment = statement.paidAt;
            }
            if (!existing.lastPayment || statement.paidAt > existing.lastPayment) {
              existing.lastPayment = statement.paidAt;
            }
          }
        } else {
          existing.pendingEarnings += statement.totalEarningsCents;
        }
      } else {
        creatorEarnings.set(key, {
          creator: statement.creator,
          totalEarnings: statement.totalEarningsCents,
          paidEarnings: statement.status === 'PAID' ? statement.totalEarningsCents : 0,
          pendingEarnings: statement.status !== 'PAID' ? statement.totalEarningsCents : 0,
          statementCount: 1,
          firstPayment: statement.status === 'PAID' ? statement.paidAt : null,
          lastPayment: statement.status === 'PAID' ? statement.paidAt : null
        });
      }
    });

    const data: CSVDataRow[] = Array.from(creatorEarnings.values()).map(earning => ({
      'Creator Name': earning.creator.stageName || earning.creator.user.name || 'Unknown',
      'Creator Email': earning.creator.user.email,
      'Total Earnings (USD)': (earning.totalEarnings / 100),
      'Paid Earnings (USD)': (earning.paidEarnings / 100),
      'Pending Earnings (USD)': (earning.pendingEarnings / 100),
      'Statement Count': earning.statementCount,
      'First Payment Date': earning.firstPayment ? format(earning.firstPayment, 'yyyy-MM-dd') : null,
      'Last Payment Date': earning.lastPayment ? format(earning.lastPayment, 'yyyy-MM-dd') : null,
      'Average Per Statement (USD)': ((earning.totalEarnings / earning.statementCount) / 100)
    }));

    const fields = [
      'Creator Name',
      'Creator Email',
      'Total Earnings (USD)',
      'Paid Earnings (USD)',
      'Pending Earnings (USD)',
      'Statement Count',
      'First Payment Date',
      'Last Payment Date',
      'Average Per Statement (USD)'
    ];

    return { data, fields };
  }

  /**
   * Generate platform revenue summary CSV data
   */
  private async generatePlatformRevenueCSV(config: CSVExportConfig): Promise<{ data: CSVDataRow[]; fields: string[] }> {
    const whereClause: any = {
      createdAt: {
        gte: config.dateRange.startDate,
        lte: config.dateRange.endDate
      }
    };

    if (config.filters?.licenseTypes?.length) {
      whereClause.licenseType = { in: config.filters.licenseTypes };
    }

    const licenses = await this.prisma.license.findMany({
      where: whereClause,
      include: {
        ipAsset: true,
        brand: {
          include: {
            user: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Group by month and asset type
    const monthlyRevenue = new Map<string, Map<string, {
      revenue: number;
      licenseCount: number;
      brandCount: Set<string>;
    }>>();

    licenses.forEach(license => {
      const monthKey = format(license.createdAt, 'yyyy-MM');
      const assetType = license.ipAsset.type;
      
      if (!monthlyRevenue.has(monthKey)) {
        monthlyRevenue.set(monthKey, new Map());
      }
      
      const monthData = monthlyRevenue.get(monthKey)!;
      
      if (!monthData.has(assetType)) {
        monthData.set(assetType, {
          revenue: 0,
          licenseCount: 0,
          brandCount: new Set()
        });
      }
      
      const typeData = monthData.get(assetType)!;
      typeData.revenue += license.feeCents;
      typeData.licenseCount += 1;
      typeData.brandCount.add(license.brandId);
    });

    const data: CSVDataRow[] = [];
    
    monthlyRevenue.forEach((monthData, month) => {
      monthData.forEach((typeData, assetType) => {
        data.push({
          'Month': month,
          'Asset Type': assetType,
          'Revenue (USD)': (typeData.revenue / 100),
          'License Count': typeData.licenseCount,
          'Unique Brands': typeData.brandCount.size,
          'Average License Value (USD)': ((typeData.revenue / typeData.licenseCount) / 100)
        });
      });
    });

    // Sort by month and asset type
    data.sort((a, b) => {
      const monthCompare = String(a['Month']).localeCompare(String(b['Month']));
      if (monthCompare !== 0) return monthCompare;
      return String(a['Asset Type']).localeCompare(String(b['Asset Type']));
    });

    const fields = [
      'Month',
      'Asset Type',
      'Revenue (USD)',
      'License Count',
      'Unique Brands',
      'Average License Value (USD)'
    ];

    return { data, fields };
  }

  /**
   * Generate payout summary CSV data
   */
  private async generatePayoutSummaryCSV(config: CSVExportConfig): Promise<{ data: CSVDataRow[]; fields: string[] }> {
    const whereClause: any = {
      createdAt: {
        gte: config.dateRange.startDate,
        lte: config.dateRange.endDate
      }
    };

    if (config.filters?.creatorIds?.length) {
      whereClause.creatorId = { in: config.filters.creatorIds };
    }
    if (config.filters?.statuses?.length) {
      whereClause.status = { in: config.filters.statuses };
    }

    const payouts = await this.prisma.payout.findMany({
      where: whereClause,
      include: {
        creator: {
          include: {
            user: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const data: CSVDataRow[] = payouts.map(payout => ({
      'Payout ID': payout.id,
      'Creator Name': payout.creator.stageName || payout.creator.user.name || 'Unknown',
      'Creator Email': payout.creator.user.email,
      'Amount (USD)': (payout.amountCents / 100),
      'Currency': payout.currency,
      'Status': payout.status,
      'Method': payout.method,
      'Transaction Reference': payout.transactionReference || '',
      'Created At': format(payout.createdAt, 'yyyy-MM-dd HH:mm:ss'),
      'Processed At': payout.processedAt ? format(payout.processedAt, 'yyyy-MM-dd HH:mm:ss') : null,
      'Failed At': payout.failedAt ? format(payout.failedAt, 'yyyy-MM-dd HH:mm:ss') : null,
      'Failure Reason': payout.failureReason || ''
    }));

    const fields = [
      'Payout ID',
      'Creator Name',
      'Creator Email',
      'Amount (USD)',
      'Currency',
      'Status',
      'Method',
      'Transaction Reference',
      'Created At',
      'Processed At',
      'Failed At',
      'Failure Reason'
    ];

    return { data, fields };
  }

  /**
   * Calculate totals row for numeric columns
   */
  private calculateTotalsRow(data: CSVDataRow[], fields: string[]): CSVDataRow | null {
    if (data.length === 0) return null;

    const totalsRow: CSVDataRow = {};
    let hasNumericData = false;

    fields.forEach((field, index) => {
      const values = data.map(row => row[field]).filter(val => typeof val === 'number');
      
      if (values.length > 0) {
        totalsRow[field] = values.reduce((sum, val) => sum + (val as number), 0);
        hasNumericData = true;
      } else if (index === 0) {
        totalsRow[field] = 'TOTAL';
      } else {
        totalsRow[field] = '';
      }
    });

    return hasNumericData ? totalsRow : null;
  }
}
