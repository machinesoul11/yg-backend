/**
 * Example usage of the Reports Module
 * 
 * This file demonstrates how to integrate and use the reports module
 * in your application.
 */

import { PrismaClient } from '@prisma/client';
import { redis } from '@/lib/redis'; // Use singleton Redis instance
import { 
  FinancialReportingService,
  ReportGenerationError,
  ReportValidationError,
  classifyReportError
} from './index';

/**
 * Example: Generate a financial report programmatically
 */
async function generateMonthlyFinancialReport() {
  // Initialize dependencies
  const prisma = new PrismaClient();
  // Use singleton Redis instance instead of creating new connection
  
  // Create service instance
  const financialService = new FinancialReportingService(prisma, redis);
  
  try {
    // Generate report for current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const report = await financialService.generateFinancialStatement({
      name: `Monthly Financial Statement - ${startOfMonth.toISOString().slice(0, 7)}`,
      type: 'financial_statement',
      startDate: startOfMonth,
      endDate: endOfMonth,
      format: 'json',
      includeBalanceSheet: true,
      includeCashFlow: true,
      includeBreakdowns: true,
      generatedBy: 'system',
      filters: {
        // Optional: filter by specific brands or regions
        regions: ['US', 'EU', 'APAC']
      }
    });
    
    console.log('Financial Report Generated Successfully!');
    console.log(`Total Revenue: $${(report.data.summary.totalRevenueCents / 100).toFixed(2)}`);
    console.log(`Net Income: $${(report.data.netIncome.netIncomeCents / 100).toFixed(2)}`);
    console.log(`Active Creators: ${report.data.summary.activeCreators}`);
    console.log(`Active Brands: ${report.data.summary.activeBrands}`);
    
    return report;
    
  } catch (error) {
    if (error instanceof ReportValidationError) {
      console.error('Validation Error:', error.message);
      console.error('Field Errors:', error.details);
    } else if (error instanceof ReportGenerationError) {
      console.error('Generation Error:', error.message);
      
      // Get error classification for better handling
      const classification = classifyReportError(error);
      console.error('Error Classification:', classification);
      
      if (classification.retryable) {
        console.log('This error is retryable, consider implementing retry logic');
      }
    } else {
      console.error('Unexpected Error:', error);
    }
    
    throw error;
  } finally {
    // Clean up connections
    await prisma.$disconnect();
    // Redis singleton is managed globally - don't disconnect
  }
}

/**
 * Example: Integration with your existing API routes
 */
async function integrateWithExistingAPI() {
  // This shows how you might integrate the reports module
  // with your existing API framework
  
  return {
    // Express.js route example
    expressRoute: async (req: any, res: any) => {
      try {
        const { startDate, endDate, format = 'json' } = req.body;
        
        const prisma = new PrismaClient();
        // Use singleton Redis instance
        const service = new FinancialReportingService(prisma, redis);
        
        const report = await service.generateFinancialStatement({
          name: `Custom Financial Report`,
          type: 'financial_statement',
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          format,
          includeBalanceSheet: true,
          includeCashFlow: true,
          includeBreakdowns: true,
          generatedBy: req.user?.id || 'anonymous'
        });
        
        res.json({
          success: true,
          data: report,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        const classification = classifyReportError(error as any);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          classification
        });
      }
    },
    
    // Next.js API route example
    nextjsRoute: async (req: any, res: any) => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      
      // Similar implementation to Express example
      // ...
    }
  };
}

/**
 * Example: Scheduled report generation
 */
async function scheduledReportExample() {
  // This could be used with a job scheduler like node-cron
  // or integrated with your existing background job system
  
  const generateWeeklyReport = async () => {
    const prisma = new PrismaClient();
    // Use singleton Redis instance
    const service = new FinancialReportingService(prisma, redis);
    
    try {
      // Generate report for last week
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const report = await service.generateFinancialStatement({
        name: `Weekly Financial Report - Week of ${startDate.toISOString().slice(0, 10)}`,
        type: 'financial_statement',
        startDate,
        endDate,
        format: 'json',
        includeBalanceSheet: true,
        includeCashFlow: true,
        includeBreakdowns: true,
        generatedBy: 'scheduled-job'
      });
      
      // Here you could:
      // 1. Store the report in your database
      // 2. Send it via email to stakeholders
      // 3. Post it to a Slack channel
      // 4. Generate a PDF and store in cloud storage
      
      console.log('Weekly report generated and processed');
      return report;
      
    } catch (error) {
      console.error('Scheduled report generation failed:', error);
      // Implement alerting for failed scheduled reports
    } finally {
      await prisma.$disconnect();
      // Redis singleton is managed globally - don't disconnect
    }
  };
  
  return generateWeeklyReport;
}

/**
 * Example: Advanced filtering and customization
 */
async function advancedReportExample() {
  const prisma = new PrismaClient();
  // Use singleton Redis instance
  const service = new FinancialReportingService(prisma, redis);
  
  try {
    // Generate a custom report with advanced filtering
    const report = await service.generateFinancialStatement({
      name: 'Q1 Creator Performance Analysis',
      type: 'financial_statement',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-03-31'),
      format: 'json',
      includeBalanceSheet: true,
      includeCashFlow: true,
      includeBreakdowns: true,
      generatedBy: 'analyst-team',
      filters: {
        // Focus on specific brands
        brandIds: ['brand-1', 'brand-2', 'brand-3'],
        // Only exclusive licenses
        licenseTypes: ['EXCLUSIVE'],
        // Specific regions
        regions: ['US', 'CA'],
        // Only completed payments
        paymentStatuses: ['COMPLETED']
      }
    });
    
    // You can then further process the data
    const { summary, revenueBreakdown, expenseBreakdown } = report.data;
    
    // Calculate custom metrics
    const profitMargin = ((report.data.netIncome.netIncomeCents / summary.totalRevenueCents) * 100);
    const averageRevenuePerBrand = summary.totalRevenueCents / (report.filters?.brandIds?.length || 1);
    
    console.log(`Profit Margin: ${profitMargin.toFixed(2)}%`);
    console.log(`Average Revenue per Brand: $${(averageRevenuePerBrand / 100).toFixed(2)}`);
    
    return {
      originalReport: report,
      customMetrics: {
        profitMargin,
        averageRevenuePerBrand
      }
    };
    
  } finally {
    await prisma.$disconnect();
    // Redis singleton is managed globally - don't disconnect
  }
}

// Export examples for use
export {
  generateMonthlyFinancialReport,
  integrateWithExistingAPI,
  scheduledReportExample,
  advancedReportExample
};

// If running this file directly, run the monthly report example
if (require.main === module) {
  generateMonthlyFinancialReport()
    .then(() => console.log('Example completed successfully'))
    .catch(console.error);
}
