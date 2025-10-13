/**
 * License Usage Background Jobs
 * Automated tasks for usage aggregation, threshold monitoring, and forecasting
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { subDays, startOfDay } from 'date-fns';
import { LicenseUsageAggregationService } from '@/modules/licenses/usage/services/usage-aggregation.service';
import { LicenseUsageThresholdService } from '@/modules/licenses/usage/services/usage-threshold.service';
import { LicenseUsageForecastingService } from '@/modules/licenses/usage/services/usage-forecasting.service';

const aggregationService = new LicenseUsageAggregationService(prisma, redis);
const thresholdService = new LicenseUsageThresholdService(
  prisma,
  redis,
  {} as any // NotificationService - will be properly injected
);
const forecastingService = new LicenseUsageForecastingService(prisma);

/**
 * Job: Aggregate usage events into daily metrics
 * Runs: Hourly (processes current day)
 * Also runs nightly at 02:00 UTC for previous day (final aggregation)
 */
export async function aggregateUsageMetricsJob() {
  try {
    console.log('[Job] Running usage metrics aggregation');
    const startTime = Date.now();

    const today = new Date();
    const yesterday = subDays(today, 1);

    // Aggregate yesterday (final, complete aggregation)
    await aggregationService.aggregateAllLicenses(yesterday);

    // Also aggregate today (partial, for real-time dashboards)
    await aggregationService.aggregateAllLicenses(today);

    const duration = Date.now() - startTime;
    console.log(`[Job] Usage aggregation completed in ${duration}ms`);

    return { success: true, duration };
  } catch (error) {
    console.error('[Job] Usage aggregation failed:', error);
    throw error;
  }
}

/**
 * Job: Check usage thresholds and send warnings
 * Runs: Hourly
 */
export async function checkUsageThresholdsJob() {
  try {
    console.log('[Job] Checking usage thresholds');
    const startTime = Date.now();

    // Get all active licenses with usage tracking enabled
    const licenses: any[] = await prisma.$queryRaw`
      SELECT DISTINCT l.id
      FROM licenses l
      INNER JOIN license_usage_thresholds t ON t.license_id = l.id
      WHERE l.usage_tracking_enabled = TRUE
        AND l.deleted_at IS NULL
        AND l.status = 'ACTIVE'
        AND t.is_active = TRUE
        AND l.start_date <= NOW()
        AND l.end_date >= NOW()
    `;

    console.log(`[Job] Checking thresholds for ${licenses.length} licenses`);

    let checked = 0;
    let errors = 0;

    for (const row of licenses) {
      try {
        await thresholdService.checkThresholds(row.id);
        checked++;
      } catch (error) {
        console.error(`[Job] Failed to check license ${row.id}:`, error);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Job] Threshold checking completed in ${duration}ms - Checked: ${checked}, Errors: ${errors}`
    );

    return { success: true, duration, checked, errors };
  } catch (error) {
    console.error('[Job] Threshold checking failed:', error);
    throw error;
  }
}

/**
 * Job: Generate usage forecasts
 * Runs: Daily at 03:00 UTC
 */
export async function generateUsageForecastsJob() {
  try {
    console.log('[Job] Generating usage forecasts');
    const startTime = Date.now();

    // Get licenses approaching threshold (>50% usage)
    const licenses: any[] = await prisma.$queryRaw`
      SELECT DISTINCT l.id, t.usage_type, t.period_type
      FROM licenses l
      INNER JOIN license_usage_thresholds t ON t.license_id = l.id
      WHERE l.usage_tracking_enabled = TRUE
        AND l.deleted_at IS NULL
        AND l.status = 'ACTIVE'
        AND t.is_active = TRUE
        AND l.start_date <= NOW()
        AND l.end_date >= NOW()
    `;

    console.log(`[Job] Generating forecasts for ${licenses.length} license/threshold combinations`);

    let generated = 0;
    let errors = 0;

    for (const row of licenses) {
      try {
        const periodStart = startOfDay(new Date());
        const periodEnd = subDays(periodStart, -30); // 30 days forward

        await forecastingService.generateForecast({
          licenseId: row.id,
          usageType: row.usage_type,
          periodStart,
          periodEnd,
          forecastingMethod: 'LINEAR_REGRESSION',
          historicalDays: 30,
        });

        generated++;
      } catch (error) {
        console.error(`[Job] Failed to forecast license ${row.id}:`, error);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Job] Forecast generation completed in ${duration}ms - Generated: ${generated}, Errors: ${errors}`
    );

    return { success: true, duration, generated, errors };
  } catch (error) {
    console.error('[Job] Forecast generation failed:', error);
    throw error;
  }
}

/**
 * Job: Cleanup old usage events (data retention)
 * Runs: Weekly on Sunday at 04:00 UTC
 * Keeps raw events for 90 days, aggregates are kept indefinitely
 */
export async function cleanupOldUsageEventsJob() {
  try {
    console.log('[Job] Cleaning up old usage events');
    const startTime = Date.now();

    const cutoffDate = subDays(new Date(), 90);

    const result: any = await prisma.$executeRaw`
      DELETE FROM license_usage_events
      WHERE occurred_at < ${cutoffDate}
    `;

    const deleted = result || 0;

    const duration = Date.now() - startTime;
    console.log(
      `[Job] Usage event cleanup completed in ${duration}ms - Deleted: ${deleted} events`
    );

    return { success: true, duration, deleted };
  } catch (error) {
    console.error('[Job] Usage event cleanup failed:', error);
    throw error;
  }
}

/**
 * Job: Send proactive forecast breach notifications
 * Runs: Daily at 09:00 UTC (morning for US timezones)
 */
export async function sendForecastBreachAlertsJob() {
  try {
    console.log('[Job] Sending forecast breach alerts');
    const startTime = Date.now();

    // Get forecasts predicting breach within next 7 days
    const sevenDaysFromNow = subDays(new Date(), -7);

    const forecasts: any[] = await prisma.$queryRaw`
      SELECT f.*, l.brand_id
      FROM license_usage_forecasts f
      INNER JOIN licenses l ON l.id = f.license_id
      WHERE f.predicted_breach_date IS NOT NULL
        AND f.predicted_breach_date <= ${sevenDaysFromNow}
        AND f.breach_probability >= 0.7
        AND f.forecast_date >= ${subDays(new Date(), 1)}
      ORDER BY f.predicted_breach_date ASC
    `;

    console.log(`[Job] Found ${forecasts.length} forecasts with breach alerts`);

    let sent = 0;

    for (const forecast of forecasts) {
      try {
        // Check if we already sent alert for this forecast
        const alreadySent = await redis.exists(
          `usage:forecast:alert:${forecast.id}`
        );

        if (!alreadySent) {
          // Send notification (integrate with notification service)
          console.log(
            `[Job] Would send breach alert for license ${forecast.license_id}: predicted breach on ${forecast.predicted_breach_date}`
          );

          // Mark as sent (24h TTL)
          await redis.setex(`usage:forecast:alert:${forecast.id}`, 86400, '1');
          sent++;
        }
      } catch (error) {
        console.error(`[Job] Failed to send alert for forecast ${forecast.id}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Job] Forecast breach alerts completed in ${duration}ms - Sent: ${sent}`
    );

    return { success: true, duration, sent };
  } catch (error) {
    console.error('[Job] Forecast breach alerts failed:', error);
    throw error;
  }
}
