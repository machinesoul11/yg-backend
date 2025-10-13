/**
 * License Usage Forecasting Service
 * Predicts future usage and threshold breaches using simple trend analysis
 */

import { PrismaClient } from '@prisma/client';
import { subDays, addDays, differenceInDays } from 'date-fns';
import type { GenerateForecastInput, ForecastResult } from '../types';

export class LicenseUsageForecastingService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Generate usage forecast using linear regression
   */
  async generateForecast(input: GenerateForecastInput): Promise<ForecastResult> {
    const { licenseId, usageType, periodStart, periodEnd, historicalDays = 30 } = input;

    // Get historical data
    const historicalStart = subDays(periodStart, historicalDays);
    const historicalData = await this.getHistoricalUsage(
      licenseId,
      usageType,
      historicalStart,
      periodStart
    );

    // Calculate trend (simple linear regression)
    const { slope, intercept } = this.calculateLinearTrend(historicalData);

    // Project future usage
    const forecastDays = differenceInDays(periodEnd, periodStart);
    const predictedQuantity = Math.max(
      0,
      Math.round(slope * (historicalDays + forecastDays) + intercept)
    );

    // Calculate confidence bounds (±20%)
    const lowerBound = Math.floor(predictedQuantity * 0.8);
    const upperBound = Math.ceil(predictedQuantity * 1.2);

    // Check for threshold breach
    const threshold = await this.getActiveThreshold(licenseId, usageType);
    let thresholdBreach;

    if (threshold && predictedQuantity > threshold.limitQuantity) {
      const daysUntilBreach = this.estimateDaysUntilBreach(
        historicalData,
        slope,
        threshold.limitQuantity
      );

      thresholdBreach = {
        threshold,
        predictedBreachDate: addDays(periodStart, daysUntilBreach),
        daysUntilBreach,
        breachProbability: 0.8, // Simplified probability
      };
    }

    // Save forecast
    const forecast = await this.prisma.licenseUsageForecast.create({
      data: {
        licenseId,
        usageType,
        forecastDate: new Date(),
        periodStart,
        periodEnd,
        predictedQuantity,
        lowerBound,
        upperBound,
        confidenceLevel: input.confidenceLevel || 0.95,
        predictedBreachDate: thresholdBreach?.predictedBreachDate,
        breachProbability: thresholdBreach?.breachProbability,
        forecastingMethod: input.forecastingMethod || 'LINEAR_REGRESSION',
        historicalDaysUsed: historicalDays,
      },
    });

    return { forecast: forecast as any, thresholdBreach };
  }

  private async getHistoricalUsage(
    licenseId: string,
    usageType: string,
    startDate: Date,
    endDate: Date
  ): Promise<number[]> {
    const aggregates: any[] = await this.prisma.$queryRaw`
      SELECT date, total_quantity
      FROM license_usage_daily_aggregates
      WHERE license_id = ${licenseId}
        AND date >= ${startDate}::date
        AND date < ${endDate}::date
      ORDER BY date ASC
    `;

    return aggregates.map((a) => parseInt(a.total_quantity as string) || 0);
  }

  private calculateLinearTrend(data: number[]): { slope: number; intercept: number } {
    if (data.length < 2) return { slope: 0, intercept: 0 };

    const n = data.length;
    const sumX = data.reduce((sum, _, i) => sum + i, 0);
    const sumY = data.reduce((sum, val) => sum + val, 0);
    const sumXY = data.reduce((sum, val, i) => sum + i * val, 0);
    const sumX2 = data.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  private estimateDaysUntilBreach(
    historicalData: number[],
    slope: number,
    limit: number
  ): number {
    if (slope <= 0) return 999; // No breach expected
    const currentUsage = historicalData[historicalData.length - 1] || 0;
    return Math.ceil((limit - currentUsage) / slope);
  }

  private async getActiveThreshold(licenseId: string, usageType: string) {
    return this.prisma.licenseUsageThreshold.findFirst({
      where: { licenseId, usageType, isActive: true },
    });
  }
}
