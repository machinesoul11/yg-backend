/**
 * License Usage Threshold Monitoring Service
 * Monitors usage against configured thresholds and detects overages
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { startOfDay, startOfWeek, startOfMonth, endOfDay } from 'date-fns';
import type {
  CreateThresholdInput,
  UpdateThresholdInput,
  ThresholdStatus,
  OverageDetectionResult,
  ApproveOverageInput,
} from '../types';
import { NotificationService } from '@/lib/services/notification.service';

export class LicenseUsageThresholdService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly notificationService: NotificationService
  ) {}

  /**
   * Create a usage threshold for a license
   */
  async createThreshold(input: CreateThresholdInput) {
    return this.prisma.licenseUsageThreshold.create({
      data: {
        licenseId: input.licenseId,
        usageType: input.usageType,
        limitQuantity: input.limitQuantity,
        periodType: input.periodType,
        gracePercentage: input.gracePercentage ?? 0,
        warningAt50: input.warningAt50 ?? true,
        warningAt75: input.warningAt75 ?? true,
        warningAt90: input.warningAt90 ?? true,
        warningAt100: input.warningAt100 ?? true,
        allowOverage: input.allowOverage ?? false,
        overageRateCents: input.overageRateCents,
        isActive: true,
      },
    });
  }

  /**
   * Update a threshold configuration
   */
  async updateThreshold(input: UpdateThresholdInput) {
    const { thresholdId, ...data } = input;

    return this.prisma.licenseUsageThreshold.update({
      where: { id: thresholdId },
      data,
    });
  }

  /**
   * Get threshold status (current usage vs. limit)
   */
  async getThresholdStatus(
    licenseId: string,
    usageType?: string
  ): Promise<ThresholdStatus[]> {
    const thresholds = await this.prisma.licenseUsageThreshold.findMany({
      where: {
        licenseId,
        isActive: true,
        ...(usageType && { usageType }),
      },
    });

    const statuses: ThresholdStatus[] = [];

    for (const threshold of thresholds) {
      const currentUsage = await this.getCurrentUsageForPeriod(
        licenseId,
        threshold.usageType,
        threshold.periodType as any
      );

      const limitWithGrace = Math.floor(
        threshold.limitQuantity * (1 + threshold.gracePercentage / 100)
      );

      const percentageUsed = (currentUsage / threshold.limitQuantity) * 100;
      const remaining = threshold.limitQuantity - currentUsage;
      const isOverLimit = currentUsage > limitWithGrace;
      
      // Determine if at warning level
      const isWarningLevel =
        (threshold.warningAt50 && percentageUsed >= 50 && percentageUsed < 75) ||
        (threshold.warningAt75 && percentageUsed >= 75 && percentageUsed < 90) ||
        (threshold.warningAt90 && percentageUsed >= 90 && percentageUsed < 100) ||
        (threshold.warningAt100 && percentageUsed >= 100);

      statuses.push({
        threshold,
        currentUsage,
        limit: threshold.limitQuantity,
        limitWithGrace,
        percentageUsed,
        remaining,
        isWarningLevel,
        isOverLimit,
      });
    }

    return statuses;
  }

  /**
   * Check thresholds for a license and send warnings if needed
   * Called by background job after usage events
   */
  async checkThresholds(licenseId: string): Promise<void> {
    const statuses = await this.getThresholdStatus(licenseId);

    for (const status of statuses) {
      const threshold = status.threshold;
      
      // Determine warning level based on percentage
      let warningLevel = 0;
      if (status.percentageUsed >= 100) warningLevel = 100;
      else if (status.percentageUsed >= 90) warningLevel = 90;
      else if (status.percentageUsed >= 75) warningLevel = 75;
      else if (status.percentageUsed >= 50) warningLevel = 50;

      // Only send warning if:
      // 1. We're at a new warning level (higher than last warning)
      // 2. The threshold has the corresponding warning enabled
      // 3. We haven't sent this warning recently (throttle)
      const shouldWarn =
        warningLevel > threshold.lastWarningLevel &&
        this.isWarningEnabled(threshold, warningLevel) &&
        !(await this.wasRecentlyWarned(licenseId, threshold.id, warningLevel));

      if (shouldWarn) {
        await this.sendThresholdWarning(licenseId, status, warningLevel);
        
        // Update last warning
        await this.prisma.licenseUsageThreshold.update({
          where: { id: threshold.id },
          data: {
            lastWarningLevel: warningLevel,
            lastWarningAt: new Date(),
          },
        });
      }

      // Detect overage if over limit (including grace)
      if (status.isOverLimit && !threshold.allowOverage) {
        await this.detectOverage(licenseId, status);
      }
    }
  }

  /**
   * Detect and record overage
   */
  async detectOverage(
    licenseId: string,
    status: ThresholdStatus
  ): Promise<void> {
    const threshold = status.threshold;
    const { periodStart, periodEnd } = this.getPeriodBounds(
      threshold.periodType as any
    );

    // Check if overage already exists for this period
    const existing = await this.prisma.licenseUsageOverage.findFirst({
      where: {
        licenseId,
        thresholdId: threshold.id,
        periodStart,
        periodEnd,
      },
    });

    if (existing) {
      // Update existing overage
      await this.prisma.licenseUsageOverage.update({
        where: { id: existing.id },
        data: {
          actualQuantity: status.currentUsage,
          overageQuantity: status.currentUsage - status.limitWithGrace,
          calculatedFeeCents: threshold.overageRateCents
            ? (status.currentUsage - status.limitWithGrace) *
              threshold.overageRateCents
            : null,
        },
      });
    } else {
      // Create new overage record
      const overageQuantity = status.currentUsage - status.limitWithGrace;
      const calculatedFeeCents = threshold.overageRateCents
        ? overageQuantity * threshold.overageRateCents
        : null;

      const overage = await this.prisma.licenseUsageOverage.create({
        data: {
          licenseId,
          thresholdId: threshold.id,
          periodStart,
          periodEnd,
          usageType: threshold.usageType,
          limitQuantity: threshold.limitQuantity,
          actualQuantity: status.currentUsage,
          overageQuantity,
          overageRateCents: threshold.overageRateCents,
          calculatedFeeCents,
          status: 'DETECTED',
          approvalRequired: calculatedFeeCents ? calculatedFeeCents > 10000 : false, // Require approval for >$100
        },
      });

      // Notify about overage
      await this.sendOverageNotification(licenseId, overage);
    }
  }

  /**
   * Get detected overages
   */
  async getOverages(
    licenseId?: string,
    brandId?: string,
    status?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<OverageDetectionResult[]> {
    const where: any = {};

    if (licenseId) {
      where.licenseId = licenseId;
    }

    if (brandId) {
      where.license = { brandId };
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.detectedAt = {};
      if (startDate) where.detectedAt.gte = startDate;
      if (endDate) where.detectedAt.lte = endDate;
    }

    const overages = await this.prisma.licenseUsageOverage.findMany({
      where,
      include: {
        license: {
          include: {
            brand: true,
            ipAsset: true,
          },
        },
        threshold: true,
      },
      orderBy: {
        detectedAt: 'desc',
      },
    });

    // Group by license
    const grouped = new Map<string, typeof overages>();
    for (const overage of overages) {
      const existing = grouped.get(overage.licenseId) || [];
      existing.push(overage);
      grouped.set(overage.licenseId, existing);
    }

    return Array.from(grouped.entries()).map(([licenseId, overages]) => ({
      licenseId,
      hasOverages: overages.length > 0,
      overages: overages as any,
      totalOverageQuantity: overages.reduce(
        (sum, o) => sum + o.overageQuantity,
        0
      ),
      totalOverageFeeCents: overages.reduce(
        (sum, o) => sum + (o.calculatedFeeCents || 0),
        0
      ),
    }));
  }

  /**
   * Approve an overage for billing
   */
  async approveOverage(input: ApproveOverageInput) {
    return this.prisma.licenseUsageOverage.update({
      where: { id: input.overageId },
      data: {
        status: 'APPROVED',
        approvedBy: input.approvedBy,
        approvedAt: new Date(),
        billedFeeCents: input.billedFeeCents,
        notes: input.notes,
      },
    });
  }

  /**
   * Private helper methods
   */

  private async getCurrentUsageForPeriod(
    licenseId: string,
    usageType: string,
    periodType: 'daily' | 'weekly' | 'monthly' | 'total'
  ): Promise<number> {
    const { periodStart, periodEnd } = this.getPeriodBounds(periodType);

    const aggregates = await this.prisma.licenseUsageDailyAggregate.findMany({
      where: {
        licenseId,
        date: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
    });

    const fieldMap: Record<string, string> = {
      view: 'totalViews',
      download: 'totalDownloads',
      impression: 'totalImpressions',
      click: 'totalClicks',
      play: 'totalPlays',
      stream: 'totalStreams',
    };

    const field = fieldMap[usageType] || 'totalQuantity';
    return aggregates.reduce((sum, agg) => sum + (agg[field as keyof typeof agg] as number), 0);
  }

  private getPeriodBounds(periodType: 'daily' | 'weekly' | 'monthly' | 'total') {
    const now = new Date();
    const today = startOfDay(now);

    switch (periodType) {
      case 'daily':
        return {
          periodStart: today,
          periodEnd: endOfDay(now),
        };
      case 'weekly':
        return {
          periodStart: startOfWeek(now),
          periodEnd: endOfDay(now),
        };
      case 'monthly':
        return {
          periodStart: startOfMonth(now),
          periodEnd: endOfDay(now),
        };
      case 'total':
      default:
        return {
          periodStart: new Date('2020-01-01'),
          periodEnd: endOfDay(now),
        };
    }
  }

  private isWarningEnabled(threshold: any, level: number): boolean {
    switch (level) {
      case 50:
        return threshold.warningAt50;
      case 75:
        return threshold.warningAt75;
      case 90:
        return threshold.warningAt90;
      case 100:
        return threshold.warningAt100;
      default:
        return false;
    }
  }

  private async wasRecentlyWarned(
    licenseId: string,
    thresholdId: string,
    level: number
  ): Promise<boolean> {
    const key = `usage:warning:${licenseId}:${thresholdId}:${level}`;
    const exists = await this.redis.exists(key);
    
    if (!exists) {
      // Set throttle for 1 hour
      await this.redis.setex(key, 3600, '1');
      return false;
    }
    
    return true;
  }

  private async sendThresholdWarning(
    licenseId: string,
    status: ThresholdStatus,
    level: number
  ): Promise<void> {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        brand: { include: { user: true } },
        ipAsset: true,
      },
    });

    if (!license) return;

    const message = `Usage for ${license.ipAsset.title} has reached ${level}% of the ${status.threshold.usageType} limit (${status.currentUsage}/${status.limit})`;

    // Send notification to brand
    await this.notificationService.create({
      userId: license.brand.userId,
      type: 'LICENSE',
      priority: level >= 90 ? 'HIGH' : 'MEDIUM',
      title: `Usage Warning: ${level}% Threshold`,
      message,
      actionUrl: `/licenses/${licenseId}/usage`,
    });

    console.log(`[ThresholdMonitor] Sent ${level}% warning for license ${licenseId}`);
  }

  private async sendOverageNotification(
    licenseId: string,
    overage: any
  ): Promise<void> {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        brand: { include: { user: true } },
        ipAsset: true,
      },
    });

    if (!license) return;

    const message = `Usage overage detected for ${license.ipAsset.title}: ${overage.overageQuantity} ${overage.usageType}s over limit`;

    await this.notificationService.create({
      userId: license.brand.userId,
      type: 'LICENSE',
      priority: 'URGENT',
      title: 'Usage Overage Detected',
      message,
      actionUrl: `/licenses/${licenseId}/usage/overages`,
    });

    console.log(`[ThresholdMonitor] Sent overage notification for license ${licenseId}`);
  }
}
