/**
 * Financial Reports PDF Generation Service
 * 
 * Creates professional PDF reports with charts, tables, and proper formatting
 * for financial analytics reports including monthly revenue, quarterly summaries,
 * annual statements, cash flow analysis, and commission tracking.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { MonthlyRevenueReportData } from './monthly-revenue-reports.service';
import { QuarterlyFinancialSummaryData } from './quarterly-financial-summaries.service';
import { AnnualFinancialStatementData } from './annual-financial-statements.service';
import { CashFlowAnalysisData } from './cash-flow-analysis-reports.service';
import { AccountsReceivableAgingData } from './accounts-receivable-aging.service';
import { AccountsPayableData } from './accounts-payable-reports.service';
import { CommissionTrackingData } from './commission-tracking-reports.service';

export interface PDFGenerationOptions {
  includeCharts?: boolean;
  includeDetailedBreakdowns?: boolean;
  watermark?: string;
  headerLogo?: string;
  footerText?: string;
  pageMargins?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export interface GeneratedPDFInfo {
  filePath: string;
  fileSize: number;
  pageCount: number;
  generatedAt: Date;
  reportType: string;
  reportPeriod: string;
}

export class FinancialReportsPDFService {
  private readonly outputDir: string;
  private readonly fontSizes = {
    title: 20,
    subtitle: 16,
    heading: 14,
    subheading: 12,
    body: 10,
    caption: 8
  };

  private readonly colors = {
    primary: '#2563eb',
    secondary: '#64748b',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    text: '#1f2937',
    lightGray: '#f3f4f6',
    mediumGray: '#d1d5db'
  };

  constructor(
    private readonly prisma: PrismaClient,
    outputDirectory: string = './generated-reports'
  ) {
    this.outputDir = outputDirectory;
    this.ensureOutputDirectory();
  }

  /**
   * Generate PDF for Monthly Revenue Report
   */
  async generateMonthlyRevenuePDF(
    data: MonthlyRevenueData,
    options: PDFGenerationOptions = {}
  ): Promise<GeneratedPDFInfo> {
    const fileName = `monthly-revenue-${format(data.month, 'yyyy-MM')}.pdf`;
    const filePath = path.join(this.outputDir, fileName);

    const doc = new PDFDocument({
      size: 'A4',
      margins: options.pageMargins || { top: 50, bottom: 50, left: 50, right: 50 }
    });

    doc.pipe(fs.createWriteStream(filePath));

    // Header
    this.addHeader(doc, 'Monthly Revenue Report', format(data.month, 'MMMM yyyy'));

    // Executive Summary
    this.addSection(doc, 'Executive Summary');
    this.addSummaryBox(doc, [
      { label: 'Total Revenue', value: this.formatCurrency(data.summary.totalRevenueCents) },
      { label: 'License Revenue', value: this.formatCurrency(data.summary.licenseRevenueCents) },
      { label: 'Royalty Revenue', value: this.formatCurrency(data.summary.royaltyRevenueCents) },
      { label: 'Total Transactions', value: data.summary.totalTransactions.toLocaleString() }
    ]);

    // Revenue Breakdown
    this.addSection(doc, 'Revenue Breakdown');
    this.addRevenueBreakdownTable(doc, data.revenueBreakdown);

    // Geographic Performance
    if (data.geographicBreakdown.length > 0) {
      this.addSection(doc, 'Geographic Performance');
      this.addGeographicTable(doc, data.geographicBreakdown);
    }

    // Top Performers
    if (data.topPerformers.creators.length > 0) {
      this.addSection(doc, 'Top Performing Creators');
      this.addTopPerformersTable(doc, data.topPerformers.creators, 'creator');
    }

    // Footer
    this.addFooter(doc, options.footerText);

    doc.end();

    return this.getFileInfo(filePath, 'Monthly Revenue Report', format(data.month, 'MMMM yyyy'));
  }

  /**
   * Generate PDF for Quarterly Financial Summary
   */
  async generateQuarterlyFinancialPDF(
    data: QuarterlyFinancialData,
    options: PDFGenerationOptions = {}
  ): Promise<GeneratedPDFInfo> {
    const fileName = `quarterly-summary-Q${data.quarter}-${data.year}.pdf`;
    const filePath = path.join(this.outputDir, fileName);

    const doc = new PDFDocument({ size: 'A4' });
    doc.pipe(fs.createWriteStream(filePath));

    // Header
    this.addHeader(doc, 'Quarterly Financial Summary', `Q${data.quarter} ${data.year}`);

    // Executive Summary
    this.addSection(doc, 'Executive Summary');
    this.addExecutiveSummaryContent(doc, data.executiveSummary);

    // Key Performance Indicators
    this.addSection(doc, 'Key Performance Indicators');
    this.addKPITable(doc, data.keyPerformanceIndicators);

    // Financial Performance
    this.addSection(doc, 'Financial Performance');
    this.addFinancialPerformanceContent(doc, data.financialPerformance);

    // Business Intelligence
    if (options.includeDetailedBreakdowns) {
      this.addSection(doc, 'Business Intelligence');
      this.addBusinessIntelligenceContent(doc, data.businessIntelligence);
    }

    this.addFooter(doc, options.footerText);
    doc.end();

    return this.getFileInfo(filePath, 'Quarterly Financial Summary', `Q${data.quarter} ${data.year}`);
  }

  /**
   * Generate PDF for Annual Financial Statements
   */
  async generateAnnualFinancialPDF(
    data: AnnualFinancialStatementsData,
    options: PDFGenerationOptions = {}
  ): Promise<GeneratedPDFInfo> {
    const fileName = `annual-statements-${data.year}.pdf`;
    const filePath = path.join(this.outputDir, fileName);

    const doc = new PDFDocument({ size: 'A4' });
    doc.pipe(fs.createWriteStream(filePath));

    // Header
    this.addHeader(doc, 'Annual Financial Statements', data.year.toString());

    // Financial Summary
    this.addSection(doc, 'Financial Summary');
    this.addFinancialSummaryContent(doc, data.financialSummary);

    // Profit & Loss Statement
    this.addSection(doc, 'Profit & Loss Statement');
    this.addProfitLossStatement(doc, data.profitAndLoss);

    // Balance Sheet
    this.addSection(doc, 'Balance Sheet');
    this.addBalanceSheet(doc, data.balanceSheet);

    // Cash Flow Statement
    this.addSection(doc, 'Cash Flow Statement');
    this.addCashFlowStatement(doc, data.cashFlowStatement);

    this.addFooter(doc, options.footerText);
    doc.end();

    return this.getFileInfo(filePath, 'Annual Financial Statements', data.year.toString());
  }

  /**
   * Generate PDF for Cash Flow Analysis
   */
  async generateCashFlowAnalysisPDF(
    data: CashFlowAnalysisData,
    options: PDFGenerationOptions = {}
  ): Promise<GeneratedPDFInfo> {
    const fileName = `cash-flow-analysis-${format(data.asOfDate, 'yyyy-MM-dd')}.pdf`;
    const filePath = path.join(this.outputDir, fileName);

    const doc = new PDFDocument({ size: 'A4' });
    doc.pipe(fs.createWriteStream(filePath));

    // Header
    this.addHeader(doc, 'Cash Flow Analysis Report', format(data.asOfDate, 'MMMM dd, yyyy'));

    // Cash Flow Summary
    this.addSection(doc, 'Cash Flow Summary');
    this.addCashFlowSummaryContent(doc, data.cashFlowSummary);

    // Payment Velocity Metrics
    this.addSection(doc, 'Payment Velocity Analysis');
    this.addPaymentVelocityContent(doc, data.paymentVelocityMetrics);

    // Liquidity Analysis
    this.addSection(doc, 'Liquidity Analysis');
    this.addLiquidityAnalysisContent(doc, data.liquidityAnalysis);

    this.addFooter(doc, options.footerText);
    doc.end();

    return this.getFileInfo(filePath, 'Cash Flow Analysis', format(data.asOfDate, 'MMMM dd, yyyy'));
  }

  /**
   * Generate PDF for Accounts Receivable Aging
   */
  async generateAccountsReceivableAgingPDF(
    data: AccountsReceivableAgingData,
    options: PDFGenerationOptions = {}
  ): Promise<GeneratedPDFInfo> {
    const fileName = `accounts-receivable-aging-${format(data.asOfDate, 'yyyy-MM-dd')}.pdf`;
    const filePath = path.join(this.outputDir, fileName);

    const doc = new PDFDocument({ size: 'A4' });
    doc.pipe(fs.createWriteStream(filePath));

    // Header
    this.addHeader(doc, 'Accounts Receivable Aging Report', format(data.asOfDate, 'MMMM dd, yyyy'));

    // Summary
    this.addSection(doc, 'Summary');
    this.addARSummaryContent(doc, data.summary);

    // Aging Buckets
    this.addSection(doc, 'Aging Analysis');
    this.addAgingBucketsTable(doc, data.agingBuckets);

    // Customer Breakdown
    this.addSection(doc, 'Customer Breakdown');
    this.addCustomerBreakdownTable(doc, data.customerBreakdown.slice(0, 10)); // Top 10

    this.addFooter(doc, options.footerText);
    doc.end();

    return this.getFileInfo(filePath, 'Accounts Receivable Aging', format(data.asOfDate, 'MMMM dd, yyyy'));
  }

  /**
   * Generate comprehensive financial package (all reports)
   */
  async generateFinancialPackage(
    monthlyData: MonthlyRevenueData,
    quarterlyData: QuarterlyFinancialData,
    annualData: AnnualFinancialStatementsData,
    options: PDFGenerationOptions = {}
  ): Promise<GeneratedPDFInfo[]> {
    const results = await Promise.all([
      this.generateMonthlyRevenuePDF(monthlyData, options),
      this.generateQuarterlyFinancialPDF(quarterlyData, options),
      this.generateAnnualFinancialPDF(annualData, options)
    ]);

    return results;
  }

  // Private helper methods for PDF generation

  private addHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
    doc.fontSize(this.fontSizes.title)
       .fillColor(this.colors.primary)
       .text(title, 50, 50, { align: 'center' });

    doc.fontSize(this.fontSizes.subtitle)
       .fillColor(this.colors.secondary)
       .text(subtitle, 50, 80, { align: 'center' });

    doc.moveDown(2);
  }

  private addSection(doc: PDFKit.PDFDocument, title: string) {
    doc.fontSize(this.fontSizes.heading)
       .fillColor(this.colors.text)
       .text(title, { underline: true });
    
    doc.moveDown();
  }

  private addSummaryBox(doc: PDFKit.PDFDocument, items: Array<{ label: string; value: string }>) {
    const startY = doc.y;
    const boxHeight = 120;
    const boxWidth = 500;

    // Draw box background
    doc.rect(50, startY, boxWidth, boxHeight)
       .fillAndStroke(this.colors.lightGray, this.colors.mediumGray);

    // Add content
    let currentY = startY + 20;
    const columnWidth = boxWidth / 2;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const x = i % 2 === 0 ? 70 : 70 + columnWidth;
      
      if (i > 0 && i % 2 === 0) {
        currentY += 25;
      }

      doc.fontSize(this.fontSizes.caption)
         .fillColor(this.colors.secondary)
         .text(item.label, x, currentY);

      doc.fontSize(this.fontSizes.body)
         .fillColor(this.colors.text)
         .text(item.value, x, currentY + 12, { width: columnWidth - 20 });
    }

    doc.y = startY + boxHeight + 20;
  }

  private addRevenueBreakdownTable(doc: PDFKit.PDFDocument, breakdown: any) {
    const headers = ['Category', 'Amount', 'Percentage', 'Growth'];
    const rows = [
      ['License Revenue', this.formatCurrency(breakdown.licenseRevenue.totalCents), 
       `${breakdown.licenseRevenue.percentage.toFixed(1)}%`, 
       `${breakdown.licenseRevenue.growthRate > 0 ? '+' : ''}${breakdown.licenseRevenue.growthRate.toFixed(1)}%`],
      ['Royalty Revenue', this.formatCurrency(breakdown.royaltyRevenue.totalCents), 
       `${breakdown.royaltyRevenue.percentage.toFixed(1)}%`, 
       `${breakdown.royaltyRevenue.growthRate > 0 ? '+' : ''}${breakdown.royaltyRevenue.growthRate.toFixed(1)}%`]
    ];

    this.addTable(doc, headers, rows);
  }

  private addTable(doc: PDFKit.PDFDocument, headers: string[], rows: string[][]) {
    const startY = doc.y;
    const tableWidth = 500;
    const columnWidth = tableWidth / headers.length;
    const rowHeight = 25;

    // Headers
    doc.fontSize(this.fontSizes.body)
       .fillColor(this.colors.text);

    for (let i = 0; i < headers.length; i++) {
      doc.rect(50 + i * columnWidth, startY, columnWidth, rowHeight)
         .fillAndStroke(this.colors.primary, this.colors.primary);
      
      doc.fillColor('white')
         .text(headers[i], 55 + i * columnWidth, startY + 8, {
           width: columnWidth - 10,
           align: 'center'
         });
    }

    // Rows
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const y = startY + (rowIndex + 1) * rowHeight;
      
      for (let colIndex = 0; colIndex < rows[rowIndex].length; colIndex++) {
        doc.rect(50 + colIndex * columnWidth, y, columnWidth, rowHeight)
           .stroke(this.colors.mediumGray);
        
        doc.fillColor(this.colors.text)
           .text(rows[rowIndex][colIndex], 55 + colIndex * columnWidth, y + 8, {
             width: columnWidth - 10,
             align: colIndex === 0 ? 'left' : 'center'
           });
      }
    }

    doc.y = startY + (rows.length + 1) * rowHeight + 20;
  }

  private addGeographicTable(doc: PDFKit.PDFDocument, geographic: any[]) {
    const headers = ['Region', 'Revenue', 'Transactions', 'Avg. Value'];
    const rows = geographic.slice(0, 5).map(region => [
      region.region,
      this.formatCurrency(region.revenueCents),
      region.transactionCount.toString(),
      this.formatCurrency(region.averageTransactionCents)
    ]);

    this.addTable(doc, headers, rows);
  }

  private addTopPerformersTable(doc: PDFKit.PDFDocument, performers: any[], type: string) {
    const headers = ['Name', 'Revenue', 'Growth Rate', 'Transactions'];
    const rows = performers.slice(0, 5).map(performer => [
      performer.name,
      this.formatCurrency(performer.totalRevenueCents),
      `${performer.growthRate > 0 ? '+' : ''}${performer.growthRate.toFixed(1)}%`,
      performer.transactionCount?.toString() || '0'
    ]);

    this.addTable(doc, headers, rows);
  }

  private addExecutiveSummaryContent(doc: PDFKit.PDFDocument, summary: any) {
    doc.fontSize(this.fontSizes.body)
       .fillColor(this.colors.text)
       .text(summary.overview, { align: 'justify' });
    
    doc.moveDown();

    // Key highlights
    summary.keyHighlights.forEach((highlight: string, index: number) => {
      doc.text(`${index + 1}. ${highlight}`, { indent: 20 });
    });

    doc.moveDown();
  }

  private addKPITable(doc: PDFKit.PDFDocument, kpis: any) {
    const items = [
      { label: 'Revenue Growth Rate', value: `${kpis.revenueGrowthRate > 0 ? '+' : ''}${kpis.revenueGrowthRate.toFixed(1)}%` },
      { label: 'Customer Acquisition Cost', value: this.formatCurrency(kpis.customerAcquisitionCostCents) },
      { label: 'Average Revenue Per User', value: this.formatCurrency(kpis.averageRevenuePerUserCents) },
      { label: 'Churn Rate', value: `${kpis.churnRate.toFixed(1)}%` }
    ];

    this.addSummaryBox(doc, items);
  }

  private addFinancialPerformanceContent(doc: PDFKit.PDFDocument, performance: any) {
    const headers = ['Metric', 'Current Quarter', 'Previous Quarter', 'Change'];
    const rows = [
      ['Total Revenue', this.formatCurrency(performance.totalRevenueCents), 
       this.formatCurrency(performance.previousQuarterRevenueCents),
       `${performance.quarterOverQuarterGrowth > 0 ? '+' : ''}${performance.quarterOverQuarterGrowth.toFixed(1)}%`],
      ['Gross Margin', `${performance.grossMarginPercent.toFixed(1)}%`,
       `${performance.previousGrossMarginPercent.toFixed(1)}%`,
       `${(performance.grossMarginPercent - performance.previousGrossMarginPercent).toFixed(1)}%`]
    ];

    this.addTable(doc, headers, rows);
  }

  private addBusinessIntelligenceContent(doc: PDFKit.PDFDocument, intelligence: any) {
    doc.fontSize(this.fontSizes.body)
       .fillColor(this.colors.text)
       .text('Market Analysis:', { underline: true });
    
    doc.text(intelligence.marketAnalysis.summary);
    doc.moveDown();

    doc.text('Competitive Position:', { underline: true });
    intelligence.competitivePosition.forEach((point: string) => {
      doc.text(`• ${point}`);
    });
    doc.moveDown();
  }

  private addFinancialSummaryContent(doc: PDFKit.PDFDocument, summary: any) {
    const items = [
      { label: 'Total Revenue', value: this.formatCurrency(summary.totalRevenueCents) },
      { label: 'Net Income', value: this.formatCurrency(summary.netIncomeCents) },
      { label: 'Total Assets', value: this.formatCurrency(summary.totalAssetsCents) },
      { label: 'ROI', value: `${summary.returnOnInvestment.toFixed(1)}%` }
    ];

    this.addSummaryBox(doc, items);
  }

  private addProfitLossStatement(doc: PDFKit.PDFDocument, profitLoss: any) {
    const headers = ['Item', 'Amount'];
    const rows = [
      ['Revenue', this.formatCurrency(profitLoss.totalRevenueCents)],
      ['Cost of Goods Sold', this.formatCurrency(profitLoss.costOfGoodsSoldCents)],
      ['Gross Profit', this.formatCurrency(profitLoss.grossProfitCents)],
      ['Operating Expenses', this.formatCurrency(profitLoss.operatingExpensesCents)],
      ['Net Income', this.formatCurrency(profitLoss.netIncomeCents)]
    ];

    this.addTable(doc, headers, rows);
  }

  private addBalanceSheet(doc: PDFKit.PDFDocument, balanceSheet: any) {
    doc.text('Assets', { underline: true });
    
    const assetItems = [
      { label: 'Current Assets', value: this.formatCurrency(balanceSheet.assets.currentAssetsCents) },
      { label: 'Fixed Assets', value: this.formatCurrency(balanceSheet.assets.fixedAssetsCents) },
      { label: 'Total Assets', value: this.formatCurrency(balanceSheet.assets.totalAssetsCents) }
    ];

    this.addSummaryBox(doc, assetItems);

    doc.text('Liabilities & Equity', { underline: true });
    
    const liabilityItems = [
      { label: 'Current Liabilities', value: this.formatCurrency(balanceSheet.liabilities.currentLiabilitiesCents) },
      { label: 'Long-term Liabilities', value: this.formatCurrency(balanceSheet.liabilities.longTermLiabilitiesCents) },
      { label: 'Total Equity', value: this.formatCurrency(balanceSheet.equity.totalEquityCents) }
    ];

    this.addSummaryBox(doc, liabilityItems);
  }

  private addCashFlowStatement(doc: PDFKit.PDFDocument, cashFlow: any) {
    const headers = ['Category', 'Amount'];
    const rows = [
      ['Operating Cash Flow', this.formatCurrency(cashFlow.operatingCashFlowCents)],
      ['Investing Cash Flow', this.formatCurrency(cashFlow.investingCashFlowCents)],
      ['Financing Cash Flow', this.formatCurrency(cashFlow.financingCashFlowCents)],
      ['Net Cash Flow', this.formatCurrency(cashFlow.netCashFlowCents)]
    ];

    this.addTable(doc, headers, rows);
  }

  private addCashFlowSummaryContent(doc: PDFKit.PDFDocument, summary: any) {
    const items = [
      { label: 'Total Inflows', value: this.formatCurrency(summary.totalInflowsCents) },
      { label: 'Total Outflows', value: this.formatCurrency(summary.totalOutflowsCents) },
      { label: 'Net Cash Flow', value: this.formatCurrency(summary.netCashFlowCents) },
      { label: 'Cash Burn Rate', value: this.formatCurrency(summary.cashBurnRateCents) }
    ];

    this.addSummaryBox(doc, items);
  }

  private addPaymentVelocityContent(doc: PDFKit.PDFDocument, velocity: any) {
    const items = [
      { label: 'Average Collection Time', value: `${velocity.averageCollectionDays} days` },
      { label: 'Payment Success Rate', value: `${velocity.paymentSuccessRate.toFixed(1)}%` },
      { label: 'Velocity Score', value: velocity.velocityScore.toString() },
      { label: 'Processing Efficiency', value: `${velocity.processingEfficiencyPercent.toFixed(1)}%` }
    ];

    this.addSummaryBox(doc, items);
  }

  private addLiquidityAnalysisContent(doc: PDFKit.PDFDocument, liquidity: any) {
    const items = [
      { label: 'Current Ratio', value: liquidity.currentRatio.toFixed(2) },
      { label: 'Quick Ratio', value: liquidity.quickRatio.toFixed(2) },
      { label: 'Cash Ratio', value: liquidity.cashRatio.toFixed(2) },
      { label: 'Working Capital', value: this.formatCurrency(liquidity.workingCapitalCents) }
    ];

    this.addSummaryBox(doc, items);
  }

  private addARSummaryContent(doc: PDFKit.PDFDocument, summary: any) {
    const items = [
      { label: 'Total Outstanding', value: this.formatCurrency(summary.totalOutstandingCents) },
      { label: 'Total Vendors', value: summary.totalVendorCount.toString() },
      { label: 'Overdue Amount', value: this.formatCurrency(summary.overdueAmountCents) },
      { label: 'Collection Efficiency', value: `${summary.collectionEfficiencyPercent.toFixed(1)}%` }
    ];

    this.addSummaryBox(doc, items);
  }

  private addAgingBucketsTable(doc: PDFKit.PDFDocument, buckets: any) {
    const headers = ['Age Range', 'Amount', 'Count', 'Percentage'];
    const rows = [
      ['Current (0-30)', this.formatCurrency(buckets.current.amountCents), 
       buckets.current.invoiceCount.toString(), `${buckets.current.percentage.toFixed(1)}%`],
      ['31-60 Days', this.formatCurrency(buckets.days31To60.amountCents), 
       buckets.days31To60.invoiceCount.toString(), `${buckets.days31To60.percentage.toFixed(1)}%`],
      ['61-90 Days', this.formatCurrency(buckets.days61To90.amountCents), 
       buckets.days61To90.invoiceCount.toString(), `${buckets.days61To90.percentage.toFixed(1)}%`],
      ['Over 90 Days', this.formatCurrency(buckets.over90Days.amountCents), 
       buckets.over90Days.invoiceCount.toString(), `${buckets.over90Days.percentage.toFixed(1)}%`]
    ];

    this.addTable(doc, headers, rows);
  }

  private addCustomerBreakdownTable(doc: PDFKit.PDFDocument, customers: any[]) {
    const headers = ['Customer', 'Outstanding', 'Risk Level', 'Days Overdue'];
    const rows = customers.map(customer => [
      customer.brandName,
      this.formatCurrency(customer.totalOutstandingCents),
      customer.riskLevel,
      customer.oldestInvoiceDays.toString()
    ]);

    this.addTable(doc, headers, rows);
  }

  private addFooter(doc: PDFKit.PDFDocument, customText?: string) {
    const pageHeight = doc.page.height;
    const footerY = pageHeight - 50;

    doc.fontSize(this.fontSizes.caption)
       .fillColor(this.colors.secondary)
       .text(
         customText || `Generated on ${format(new Date(), 'MMMM dd, yyyy')} - YesGoddess Financial Reports`,
         50,
         footerY,
         { align: 'center', width: 500 }
       );
  }

  private formatCurrency(cents: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  private ensureOutputDirectory() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private async getFileInfo(filePath: string, reportType: string, reportPeriod: string): Promise<GeneratedPDFInfo> {
    const stats = fs.statSync(filePath);
    
    return {
      filePath,
      fileSize: stats.size,
      pageCount: 1, // Simplified - would need PDF parsing to get actual page count
      generatedAt: new Date(),
      reportType,
      reportPeriod
    };
  }
}
