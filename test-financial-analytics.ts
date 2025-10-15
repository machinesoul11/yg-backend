/**
 * Test script for Financial Analytics Reports Service
 * 
 * This script demonstrates how to use the Financial Analytics Reports Service
 * to generate various types of financial reports.
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { 
  FinancialAnalyticsReportsService, 
  type FinancialAnalyticsConfig,
  type GenerateReportParams 
} from './src/modules/reports/services/financial-analytics-reports.service';

// Initialize services
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);

const financialAnalyticsService = new FinancialAnalyticsReportsService(prisma, redis);

async function testFinancialAnalytics() {
  try {
    console.log('🔄 Testing Financial Analytics Reports Service...\n');

    // Test configuration for the current quarter
    const config: FinancialAnalyticsConfig = {
      startDate: new Date('2024-10-01'),
      endDate: new Date('2024-12-31'),
      includeComparisons: true,
      includeForecast: true,
      format: 'pdf',
      filters: {
        // Optional: filter by specific brands or creators
        // brandIds: ['brand_123'],
        // creatorIds: ['creator_456'],
      },
    };

    console.log('📊 1. Generating Monthly Revenue Report...');
    const monthlyRevenue = await financialAnalyticsService.generateReport({
      reportType: 'monthly_revenue',
      config,
      generatedBy: 'test-user',
      deliveryOptions: {
        email: ['admin@yesgoddess.com'],
        storage: true,
      },
    });
    console.log('✅ Monthly Revenue Report generated:', {
      id: monthlyRevenue.id,
      recordCount: monthlyRevenue.metadata.recordCount,
      downloadUrl: monthlyRevenue.downloadUrl,
    });

    console.log('\n📈 2. Generating Quarterly Summary...');
    const quarterlySummary = await financialAnalyticsService.generateReport({
      reportType: 'quarterly_summary',
      config,
      generatedBy: 'test-user',
    });
    console.log('✅ Quarterly Summary generated:', {
      id: quarterlySummary.id,
      recordCount: quarterlySummary.metadata.recordCount,
    });

    console.log('\n📋 3. Generating Annual Statement...');
    const annualStatement = await financialAnalyticsService.generateReport({
      reportType: 'annual_statement',
      config: {
        ...config,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      },
      generatedBy: 'test-user',
    });
    console.log('✅ Annual Statement generated:', {
      id: annualStatement.id,
      recordCount: annualStatement.metadata.recordCount,
    });

    console.log('\n💰 4. Generating Cash Flow Analysis...');
    const cashFlow = await financialAnalyticsService.generateReport({
      reportType: 'cash_flow',
      config,
      generatedBy: 'test-user',
    });
    console.log('✅ Cash Flow Analysis generated:', {
      id: cashFlow.id,
      recordCount: cashFlow.metadata.recordCount,
    });

    console.log('\n🏦 5. Generating Accounts Receivable Aging...');
    const receivables = await financialAnalyticsService.generateReport({
      reportType: 'accounts_receivable',
      config,
      generatedBy: 'test-user',
    });
    console.log('✅ Accounts Receivable generated:', {
      id: receivables.id,
      recordCount: receivables.metadata.recordCount,
    });

    console.log('\n💳 6. Generating Accounts Payable Report...');
    const payables = await financialAnalyticsService.generateReport({
      reportType: 'accounts_payable',
      config,
      generatedBy: 'test-user',
    });
    console.log('✅ Accounts Payable generated:', {
      id: payables.id,
      recordCount: payables.metadata.recordCount,
    });

    console.log('\n🎯 7. Generating Commission Tracking Report...');
    const commissions = await financialAnalyticsService.generateReport({
      reportType: 'commission_tracking',
      config,
      generatedBy: 'test-user',
    });
    console.log('✅ Commission Tracking generated:', {
      id: commissions.id,
      recordCount: commissions.metadata.recordCount,
    });

    console.log('\n📊 8. Generating Comprehensive Dashboard Report...');
    const dashboard = await financialAnalyticsService.generateDashboardReport(
      {
        startDate: config.startDate,
        endDate: config.endDate,
      },
      'test-user'
    );
    console.log('✅ Dashboard Report generated:', {
      id: dashboard.id,
      recordCount: dashboard.metadata.recordCount,
      downloadUrl: dashboard.downloadUrl,
    });

    console.log('\n🎉 All Financial Analytics Reports generated successfully!');
    console.log('\n📝 Summary:');
    console.log(`- Monthly Revenue: ${monthlyRevenue.metadata.recordCount} records`);
    console.log(`- Quarterly Summary: ${quarterlySummary.metadata.recordCount} records`);
    console.log(`- Annual Statement: ${annualStatement.metadata.recordCount} records`);
    console.log(`- Cash Flow: ${cashFlow.metadata.recordCount} records`);
    console.log(`- Receivables: ${receivables.metadata.recordCount} records`);
    console.log(`- Payables: ${payables.metadata.recordCount} records`);
    console.log(`- Commissions: ${commissions.metadata.recordCount} records`);
    console.log(`- Dashboard: ${dashboard.metadata.recordCount} records`);

  } catch (error) {
    console.error('❌ Error testing Financial Analytics:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await redis.quit();
  }
}

async function testErrorHandling() {
  console.log('\n🧪 Testing Error Handling...');
  
  try {
    // Test invalid report type
    await financialAnalyticsService.generateReport({
      reportType: 'invalid_report' as any,
      config: {
        startDate: new Date('2024-10-01'),
        endDate: new Date('2024-12-31'),
      },
      generatedBy: 'test-user',
    });
  } catch (error) {
    console.log('✅ Error handling working correctly:', (error as Error).message);
  }
}

// Run the tests
if (require.main === module) {
  testFinancialAnalytics()
    .then(() => testErrorHandling())
    .then(() => {
      console.log('\n✨ All tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

export { testFinancialAnalytics, testErrorHandling };
