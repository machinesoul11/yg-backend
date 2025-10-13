/**
 * License Usage Tracking Module
 * Main service aggregator and exports
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { Queue } from 'bullmq';
import { LicenseUsageTrackingService } from './services/usage-tracking.service';
import { LicenseUsageAggregationService } from './services/usage-aggregation.service';
import { LicenseUsageThresholdService } from './services/usage-threshold.service';
import { LicenseUsageAnalyticsService } from './services/usage-analytics.service';
import { LicenseUsageForecastingService } from './services/usage-forecasting.service';
import { UsageBasedBillingService } from './services/usage-billing.service';

// Create job queue for usage tracking
const usageQueue = new Queue('license-usage', {
  connection: redis as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Initialize services
export const usageTrackingService = new LicenseUsageTrackingService(
  prisma,
  redis,
  usageQueue
);

export const usageAggregationService = new LicenseUsageAggregationService(
  prisma,
  redis
);

export const usageThresholdService = new LicenseUsageThresholdService(
  prisma,
  redis,
  {} as any // NotificationService will be injected properly
);

export const usageAnalyticsService = new LicenseUsageAnalyticsService(
  prisma,
  redis
);

export const usageForecastingService = new LicenseUsageForecastingService(prisma);

export const usageBillingService = new UsageBasedBillingService(prisma);

// Re-export types
export * from './types';
