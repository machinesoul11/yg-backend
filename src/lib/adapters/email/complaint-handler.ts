import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import type {
  IComplaintHandler,
  ComplaintInfo,
} from './types';

/**
 * Complaint handler implementation for managing spam complaints
 * and maintaining sender reputation.
 * 
 * Features:
 * - Automatic suppression list management
 * - Complaint rate monitoring and alerting
 * - Pattern analysis for content issues
 * - Regulatory compliance (CAN-SPAM, GDPR)
 * 
 * @class ComplaintHandler
 * @implements {IComplaintHandler}
 */
export class ComplaintHandler implements IComplaintHandler {
  private readonly COMPLAINT_RATE_THRESHOLD = 0.1; // 0.1% = industry standard
  private readonly ALERT_THRESHOLD = 0.05; // Alert at 0.05%

  /**
   * Process a spam complaint
   * - Immediately add to suppression list
   * - Log complaint event for analysis
   * - Check if complaint rate exceeds thresholds
   * - Alert administrators if needed
   */
  async handleComplaint(complaint: ComplaintInfo & { email: string }): Promise<void> {
    try {
      // Log complaint event
      await prisma.emailEvent.create({
        data: {
          messageId: `complaint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          email: complaint.email,
          eventType: 'COMPLAINED',
          complainedAt: complaint.timestamp,
          metadata: {
            complaintType: complaint.type,
            feedbackType: complaint.feedbackType,
            userAgent: complaint.userAgent,
            suppressionRecommended: complaint.suppressionRecommended,
          },
        },
      });

      // Always add to suppression list immediately
      await this.addToSuppressionList(complaint.email, complaint);

      // Check complaint rate and alert if necessary
      const recentRate = await this.getComplaintRate({
        startDate: new Date(Date.now() - 86400000), // Last 24 hours
        endDate: new Date(),
      });

      if (recentRate >= this.ALERT_THRESHOLD) {
        await this.alertHighComplaintRate(recentRate);
      }

      console.info(`[ComplaintHandler] Processed complaint for ${complaint.email}`, {
        type: complaint.type,
        rate: recentRate,
      });
    } catch (error) {
      console.error(`[ComplaintHandler] Error processing complaint for ${complaint.email}:`, error);
      throw error;
    }
  }

  /**
   * Check if an email has filed a complaint
   */
  async hasComplained(email: string): Promise<boolean> {
    // Check suppression list for complaint reason
    const suppression = await prisma.emailSuppression.findUnique({
      where: {
        email,
      },
    });

    return suppression?.reason === 'COMPLAINT';
  }

  /**
   * Calculate complaint rate for a time period
   * Complaint rate = (complaints / emails sent) * 100
   */
  async getComplaintRate(params: {
    startDate: Date;
    endDate: Date;
    tags?: Record<string, string>;
  }): Promise<number> {
    try {
      // Check cache for recent rate
      const cacheKey = `complaint-rate:${params.startDate.getTime()}-${params.endDate.getTime()}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return parseFloat(cached);
      }

      // Get total emails sent in period
      const totalSent = await prisma.emailEvent.count({
        where: {
          eventType: 'SENT',
          sentAt: {
            gte: params.startDate,
            lte: params.endDate,
          },
          ...(params.tags && {
            metadata: {
              path: ['tags'],
              equals: params.tags,
            },
          }),
        },
      });

      if (totalSent === 0) {
        return 0;
      }

      // Get total complaints in period
      const totalComplaints = await prisma.emailEvent.count({
        where: {
          eventType: 'COMPLAINED',
          complainedAt: {
            gte: params.startDate,
            lte: params.endDate,
          },
          ...(params.tags && {
            metadata: {
              path: ['tags'],
              equals: params.tags,
            },
          }),
        },
      });

      const rate = (totalComplaints / totalSent) * 100;

      // Cache for 5 minutes
      await redis.set(cacheKey, rate.toString(), 'EX', 300);

      return rate;
    } catch (error) {
      console.error('[ComplaintHandler] Error calculating complaint rate:', error);
      return 0;
    }
  }

  /**
   * Get complaint statistics by template or campaign
   */
  async getComplaintsByTemplate(params: {
    startDate: Date;
    endDate: Date;
  }): Promise<Array<{
    templateName: string;
    complaints: number;
    sent: number;
    rate: number;
  }>> {
    try {
      // Get all complaint events
      const complaints = await prisma.emailEvent.findMany({
        where: {
          eventType: 'COMPLAINED',
          complainedAt: {
            gte: params.startDate,
            lte: params.endDate,
          },
        },
        select: {
          templateName: true,
        },
      });

      // Group by template
      const templateCounts = complaints.reduce((acc, c) => {
        const template = c.templateName || 'unknown';
        acc[template] = (acc[template] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Get sent counts for each template
      const results = await Promise.all(
        Object.entries(templateCounts).map(async ([templateName, complaintCount]) => {
          const sentCount = await prisma.emailEvent.count({
            where: {
              eventType: 'SENT',
              templateName,
              sentAt: {
                gte: params.startDate,
                lte: params.endDate,
              },
            },
          });

          return {
            templateName,
            complaints: complaintCount,
            sent: sentCount,
            rate: sentCount > 0 ? (complaintCount / sentCount) * 100 : 0,
          };
        })
      );

      return results.sort((a, b) => b.rate - a.rate);
    } catch (error) {
      console.error('[ComplaintHandler] Error getting complaints by template:', error);
      return [];
    }
  }

  /**
   * Get recent complaints for review
   */
  async getRecentComplaints(params?: {
    limit?: number;
    offset?: number;
  }): Promise<Array<{
    email: string;
    complainedAt: Date;
    templateName?: string;
    complaintType: string;
  }>> {
    const complaints = await prisma.emailEvent.findMany({
      where: {
        eventType: 'COMPLAINED',
      },
      take: params?.limit || 50,
      skip: params?.offset || 0,
      orderBy: {
        complainedAt: 'desc',
      },
      select: {
        email: true,
        complainedAt: true,
        templateName: true,
        metadata: true,
      },
    });

    return complaints.map(c => ({
      email: c.email,
      complainedAt: c.complainedAt || new Date(),
      templateName: c.templateName || undefined,
      complaintType: (c.metadata as any)?.complaintType || 'abuse',
    }));
  }

  // --- Private Helper Methods ---

  /**
   * Add email to suppression list with complaint reason
   */
  private async addToSuppressionList(
    email: string,
    complaint: ComplaintInfo
  ): Promise<void> {
    await prisma.emailSuppression.upsert({
      where: { email },
      update: {
        reason: 'COMPLAINT',
        suppressedAt: new Date(),
      },
      create: {
        email,
        reason: 'COMPLAINT',
      },
    });

    // Invalidate suppression cache
    await redis.del(`email-suppressed:${email}`);

    console.info(`[ComplaintHandler] Added ${email} to suppression list (complaint)`);
  }

  /**
   * Alert administrators about high complaint rate
   */
  private async alertHighComplaintRate(rate: number): Promise<void> {
    // Log critical alert
    console.error(`[ComplaintHandler] ALERT: High complaint rate detected: ${rate.toFixed(4)}%`);

    // Store alert in Redis for dashboard monitoring
    const alertKey = `email-alert:high-complaint-rate:${Date.now()}`;
    await redis.set(
      alertKey,
      JSON.stringify({
        type: 'high_complaint_rate',
        rate,
        threshold: this.ALERT_THRESHOLD,
        timestamp: new Date().toISOString(),
        severity: rate >= this.COMPLAINT_RATE_THRESHOLD ? 'critical' : 'warning',
      }),
      'EX',
      86400 // Keep for 24 hours
    );

    // TODO: Integrate with notification system to alert admins
    // This could send internal notifications, Slack alerts, etc.
  }

  /**
   * Check if complaint rate is healthy
   */
  async isComplaintRateHealthy(): Promise<{
    healthy: boolean;
    currentRate: number;
    threshold: number;
  }> {
    const rate = await this.getComplaintRate({
      startDate: new Date(Date.now() - 86400000 * 7), // Last 7 days
      endDate: new Date(),
    });

    return {
      healthy: rate < this.ALERT_THRESHOLD,
      currentRate: rate,
      threshold: this.ALERT_THRESHOLD,
    };
  }

  /**
   * Generate complaint report for analysis
   */
  async generateComplaintReport(params: {
    startDate: Date;
    endDate: Date;
  }): Promise<{
    totalComplaints: number;
    complaintRate: number;
    byTemplate: Array<{ templateName: string; complaints: number; rate: number }>;
    trend: 'increasing' | 'stable' | 'decreasing';
  }> {
    const [totalComplaints, complaintRate, byTemplate] = await Promise.all([
      prisma.emailEvent.count({
        where: {
          eventType: 'COMPLAINED',
          complainedAt: {
            gte: params.startDate,
            lte: params.endDate,
          },
        },
      }),
      this.getComplaintRate(params),
      this.getComplaintsByTemplate(params),
    ]);

    // Calculate trend (compare to previous period)
    const periodLength = params.endDate.getTime() - params.startDate.getTime();
    const previousPeriodRate = await this.getComplaintRate({
      startDate: new Date(params.startDate.getTime() - periodLength),
      endDate: params.startDate,
    });

    let trend: 'increasing' | 'stable' | 'decreasing';
    if (complaintRate > previousPeriodRate * 1.1) {
      trend = 'increasing';
    } else if (complaintRate < previousPeriodRate * 0.9) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }

    return {
      totalComplaints,
      complaintRate,
      byTemplate,
      trend,
    };
  }
}
