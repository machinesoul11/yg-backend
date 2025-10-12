/**
 * Campaign Analytics Service
 * Advanced analytics, reporting, and campaign performance insights
 */
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { TRPCError } from '@trpc/server';

export interface CampaignPerformanceMetrics {
  campaign: {
    id: string;
    name: string;
    status: string;
    sentAt: Date | null;
    completedAt: Date | null;
  };
  totals: {
    recipients: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
    complained: number;
    failed: number;
  };
  rates: {
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    clickToOpenRate: number;
    bounceRate: number;
    unsubscribeRate: number;
    complaintRate: number;
  };
  engagement: {
    uniqueOpens: number;
    uniqueClicks: number;
    totalOpens: number;
    totalClicks: number;
    avgOpensPerRecipient: number;
    avgClicksPerRecipient: number;
  };
  timing: {
    avgTimeToOpen: number | null; // seconds
    avgTimeToClick: number | null; // seconds
    peakOpenHour: number | null; // 0-23
    peakClickHour: number | null;
  };
}

export interface LinkPerformance {
  url: string;
  clicks: number;
  uniqueClicks: number;
  clickRate: number;
  position?: number;
}

export interface DeviceBreakdown {
  desktop: number;
  mobile: number;
  tablet: number;
  unknown: number;
}

export interface GeographicData {
  country: string;
  opens: number;
  clicks: number;
}

export interface CohortAnalysis {
  cohort: string;
  recipients: number;
  openRate: number;
  clickRate: number;
  unsubscribeRate: number;
}

export class CampaignAnalyticsService {
  /**
   * Get comprehensive campaign performance metrics
   */
  async getCampaignPerformance(campaignId: string): Promise<CampaignPerformanceMetrics> {
    const cacheKey = `campaign-performance:${campaignId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Campaign not found',
      });
    }

    // Get recipient statistics
    const stats = await prisma.campaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: true,
    });

    const statusCounts = Object.fromEntries(
      stats.map((s) => [s.status, s._count])
    );

    // Calculate engagement metrics
    const recipients = await prisma.campaignRecipient.findMany({
      where: { 
        campaignId,
        status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] }
      },
      select: {
        sentAt: true,
        openedAt: true,
        firstClickedAt: true,
      },
    });

    const uniqueOpens = recipients.filter((r: any) => r.openedAt).length;
    const uniqueClicks = recipients.filter((r: any) => r.firstClickedAt).length;

    // Calculate timing metrics
    const openTimes = recipients
      .filter((r: any) => r.sentAt && r.openedAt)
      .map((r: any) => (r.openedAt.getTime() - r.sentAt!.getTime()) / 1000);

    const clickTimes = recipients
      .filter((r: any) => r.sentAt && r.firstClickedAt)
      .map((r: any) => (r.firstClickedAt!.getTime() - r.sentAt!.getTime()) / 1000);

    const avgTimeToOpen = openTimes.length > 0
      ? openTimes.reduce((a: number, b: number) => a + b, 0) / openTimes.length
      : null;

    const avgTimeToClick = clickTimes.length > 0
      ? clickTimes.reduce((a: number, b: number) => a + b, 0) / clickTimes.length
      : null;

    // Calculate peak hours
    const openHours = recipients
      .filter((r: any) => r.openedAt)
      .map((r: any) => r.openedAt.getHours());

    const clickHours = recipients
      .filter((r: any) => r.firstClickedAt)
      .map((r: any) => r.firstClickedAt!.getHours());

    const peakOpenHour = this.getMostCommon(openHours);
    const peakClickHour = this.getMostCommon(clickHours);

    // Build metrics object
    const totals = {
      recipients: campaign.recipientCount,
      sent: campaign.sentCount,
      delivered: campaign.deliveredCount,
      opened: campaign.openedCount,
      clicked: campaign.clickedCount,
      bounced: campaign.bouncedCount,
      unsubscribed: campaign.unsubscribedCount,
      complained: campaign.complainedCount,
      failed: campaign.failedCount,
    };

    const rates = {
      deliveryRate: totals.sent > 0 ? (totals.delivered / totals.sent) * 100 : 0,
      openRate: totals.delivered > 0 ? (totals.opened / totals.delivered) * 100 : 0,
      clickRate: totals.delivered > 0 ? (totals.clicked / totals.delivered) * 100 : 0,
      clickToOpenRate: totals.opened > 0 ? (totals.clicked / totals.opened) * 100 : 0,
      bounceRate: totals.sent > 0 ? (totals.bounced / totals.sent) * 100 : 0,
      unsubscribeRate: totals.delivered > 0 ? (totals.unsubscribed / totals.delivered) * 100 : 0,
      complaintRate: totals.delivered > 0 ? (totals.complained / totals.delivered) * 100 : 0,
    };

    const result: CampaignPerformanceMetrics = {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        sentAt: campaign.sendStartedAt,
        completedAt: campaign.sendCompletedAt,
      },
      totals,
      rates: {
        deliveryRate: Number(rates.deliveryRate.toFixed(2)),
        openRate: Number(rates.openRate.toFixed(2)),
        clickRate: Number(rates.clickRate.toFixed(2)),
        clickToOpenRate: Number(rates.clickToOpenRate.toFixed(2)),
        bounceRate: Number(rates.bounceRate.toFixed(2)),
        unsubscribeRate: Number(rates.unsubscribeRate.toFixed(2)),
        complaintRate: Number(rates.complaintRate.toFixed(2)),
      },
      engagement: {
        uniqueOpens,
        uniqueClicks,
        totalOpens: totals.opened,
        totalClicks: totals.clicked,
        avgOpensPerRecipient: uniqueOpens > 0 ? totals.opened / uniqueOpens : 0,
        avgClicksPerRecipient: uniqueClicks > 0 ? totals.clicked / uniqueClicks : 0,
      },
      timing: {
        avgTimeToOpen,
        avgTimeToClick,
        peakOpenHour,
        peakClickHour,
      },
    };

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(result));

    return result;
  }

  /**
   * Get link performance analytics
   */
  async getLinkPerformance(campaignId: string): Promise<LinkPerformance[]> {
    const clicks = await prisma.emailCampaignClick.groupBy({
      by: ['clickedUrl'],
      where: { campaignId },
      _count: {
        clickedUrl: true,
      },
      _sum: {
        linkPosition: true,
      },
    });

    // Get unique clickers per link
    const uniqueClicks = await Promise.all(
      clicks.map(async (click: any) => {
        const unique = await prisma.emailCampaignClick.findMany({
          where: {
            campaignId,
            clickedUrl: click.clickedUrl,
          },
          distinct: ['email'],
        });
        return {
          url: click.clickedUrl,
          uniqueClicks: unique.length,
        };
      })
    );

    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      select: { deliveredCount: true },
    });

    return clicks.map((click: any, index) => ({
      url: click.clickedUrl,
      clicks: click._count.clickedUrl,
      uniqueClicks: uniqueClicks[index].uniqueClicks,
      clickRate: campaign?.deliveredCount 
        ? (uniqueClicks[index].uniqueClicks / campaign.deliveredCount) * 100 
        : 0,
      position: click._sum.linkPosition || undefined,
    })).sort((a, b) => b.clicks - a.clicks);
  }

  /**
   * Get device breakdown
   */
  async getDeviceBreakdown(campaignId: string): Promise<DeviceBreakdown> {
    const clicks = await prisma.emailCampaignClick.findMany({
      where: { campaignId },
      select: { deviceType: true },
    });

    const breakdown: DeviceBreakdown = {
      desktop: 0,
      mobile: 0,
      tablet: 0,
      unknown: 0,
    };

    clicks.forEach((click) => {
      const device = click.deviceType?.toLowerCase();
      if (device === 'desktop') breakdown.desktop++;
      else if (device === 'mobile') breakdown.mobile++;
      else if (device === 'tablet') breakdown.tablet++;
      else breakdown.unknown++;
    });

    return breakdown;
  }

  /**
   * Get hourly send/open/click patterns
   */
  async getHourlyBreakdown(campaignId: string): Promise<{
    hour: number;
    sent: number;
    opened: number;
    clicked: number;
  }[]> {
    const recipients = await prisma.campaignRecipient.findMany({
      where: { campaignId },
      select: {
        sentAt: true,
        openedAt: true,
        firstClickedAt: true,
      },
    });

    const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      sent: 0,
      opened: 0,
      clicked: 0,
    }));

    recipients.forEach((r: any) => {
      if (r.sentAt) {
        hourlyData[r.sentAt.getHours()].sent++;
      }
      if (r.openedAt) {
        hourlyData[r.openedAt.getHours()].opened++;
      }
      if (r.firstClickedAt) {
        hourlyData[r.firstClickedAt.getHours()].clicked++;
      }
    });

    return hourlyData;
  }

  /**
   * Compare campaigns side-by-side
   */
  async compareCampaigns(campaignIds: string[]): Promise<{
    campaigns: CampaignPerformanceMetrics[];
    averages: {
      deliveryRate: number;
      openRate: number;
      clickRate: number;
      bounceRate: number;
      unsubscribeRate: number;
    };
    bestPerforming: {
      byOpenRate: string;
      byClickRate: string;
      byEngagement: string;
    };
  }> {
    if (campaignIds.length === 0 || campaignIds.length > 10) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Must compare between 1 and 10 campaigns',
      });
    }

    const campaigns = await Promise.all(
      campaignIds.map((id) => this.getCampaignPerformance(id))
    );

    // Calculate averages
    const averages = {
      deliveryRate: this.average(campaigns.map((c) => c.rates.deliveryRate)),
      openRate: this.average(campaigns.map((c) => c.rates.openRate)),
      clickRate: this.average(campaigns.map((c) => c.rates.clickRate)),
      bounceRate: this.average(campaigns.map((c) => c.rates.bounceRate)),
      unsubscribeRate: this.average(campaigns.map((c) => c.rates.unsubscribeRate)),
    };

    // Find best performing
    const bestByOpenRate = campaigns.reduce((best, current) =>
      current.rates.openRate > best.rates.openRate ? current : best
    );

    const bestByClickRate = campaigns.reduce((best, current) =>
      current.rates.clickRate > best.rates.clickRate ? current : best
    );

    const bestByEngagement = campaigns.reduce((best, current) => {
      const currentScore = current.engagement.uniqueOpens + current.engagement.uniqueClicks * 2;
      const bestScore = best.engagement.uniqueOpens + best.engagement.uniqueClicks * 2;
      return currentScore > bestScore ? current : best;
    });

    return {
      campaigns,
      averages,
      bestPerforming: {
        byOpenRate: bestByOpenRate.campaign.id,
        byClickRate: bestByClickRate.campaign.id,
        byEngagement: bestByEngagement.campaign.id,
      },
    };
  }

  /**
   * Get campaign trends over time
   */
  async getCampaignTrends(
    days: number = 30
  ): Promise<{
    date: Date;
    campaignsSent: number;
    totalRecipients: number;
    avgOpenRate: number;
    avgClickRate: number;
    avgBounceRate: number;
  }[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const campaigns = await prisma.emailCampaign.findMany({
      where: {
        sendStartedAt: { gte: startDate },
        status: { in: ['COMPLETED', 'SENDING'] },
      },
      orderBy: { sendStartedAt: 'asc' },
    });

    // Group by date
    const dailyData = new Map<string, any>();

    campaigns.forEach((campaign) => {
      const dateKey = campaign.sendStartedAt?.toISOString().split('T')[0];
      if (!dateKey) return;

      const existing = dailyData.get(dateKey) || {
        date: new Date(dateKey),
        campaigns: [],
      };

      existing.campaigns.push(campaign);
      dailyData.set(dateKey, existing);
    });

    // Calculate metrics for each day
    return Array.from(dailyData.values()).map((day) => {
      const totalRecipients = day.campaigns.reduce((sum: number, c: any) => sum + c.recipientCount, 0);
      const totalDelivered = day.campaigns.reduce((sum: number, c: any) => sum + c.deliveredCount, 0);
      const totalOpened = day.campaigns.reduce((sum: number, c: any) => sum + c.openedCount, 0);
      const totalClicked = day.campaigns.reduce((sum: number, c: any) => sum + c.clickedCount, 0);
      const totalBounced = day.campaigns.reduce((sum: number, c: any) => sum + c.bouncedCount, 0);
      const totalSent = day.campaigns.reduce((sum: number, c: any) => sum + c.sentCount, 0);

      return {
        date: day.date,
        campaignsSent: day.campaigns.length,
        totalRecipients,
        avgOpenRate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
        avgClickRate: totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0,
        avgBounceRate: totalSent > 0 ? (totalBounced / totalSent) * 100 : 0,
      };
    });
  }

  /**
   * Generate campaign performance report
   */
  async generateCampaignReport(campaignId: string): Promise<{
    summary: CampaignPerformanceMetrics;
    linkPerformance: LinkPerformance[];
    deviceBreakdown: DeviceBreakdown;
    hourlyPattern: any[];
    recommendations: string[];
  }> {
    const summary = await this.getCampaignPerformance(campaignId);
    const linkPerformance = await this.getLinkPerformance(campaignId);
    const deviceBreakdown = await this.getDeviceBreakdown(campaignId);
    const hourlyPattern = await this.getHourlyBreakdown(campaignId);

    // Generate recommendations
    const recommendations: string[] = [];

    if (summary.rates.openRate < 15) {
      recommendations.push('Low open rate detected. Consider testing different subject lines or sender names.');
    }

    if (summary.rates.clickRate < 2) {
      recommendations.push('Low click rate. Review email content and call-to-action clarity.');
    }

    if (summary.rates.bounceRate > 2) {
      recommendations.push('High bounce rate detected. Clean email list and verify addresses.');
    }

    if (summary.rates.unsubscribeRate > 0.5) {
      recommendations.push('High unsubscribe rate. Review email frequency and content relevance.');
    }

    if (summary.rates.complaintRate > 0.1) {
      recommendations.push('Complaint rate is concerning. Ensure all recipients opted in and content is appropriate.');
    }

    // Time-based recommendations
    if (summary.timing.peakOpenHour !== null) {
      recommendations.push(
        `Peak open time is ${summary.timing.peakOpenHour}:00. Consider scheduling future campaigns around this time.`
      );
    }

    return {
      summary,
      linkPerformance,
      deviceBreakdown,
      hourlyPattern,
      recommendations,
    };
  }

  // Helper methods

  private getMostCommon(arr: number[]): number | null {
    if (arr.length === 0) return null;

    const counts = new Map<number, number>();
    arr.forEach((val) => {
      counts.set(val, (counts.get(val) || 0) + 1);
    });

    let maxCount = 0;
    let mostCommon = arr[0];

    counts.forEach((count, value) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = value;
      }
    });

    return mostCommon;
  }

  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }
}

export const campaignAnalyticsService = new CampaignAnalyticsService();
