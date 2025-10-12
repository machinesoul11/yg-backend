/**
 * Email Campaign Event Tracker
 * Processes email events (opens, clicks, bounces) for campaigns
 */
import { prisma } from '@/lib/db';

export class CampaignEventTracker {
  /**
   * Track email event from webhook and update campaign statistics
   */
  async trackEvent(event: {
    type: string;
    messageId: string;
    email: string;
    timestamp: Date;
    details?: {
      url?: string;
      userAgent?: string;
      ipAddress?: string;
      deviceType?: string;
      geographic?: any;
    };
  }) {
    // Find recipient by messageId
    const recipient = await prisma.campaignRecipient.findFirst({
      where: { messageId: event.messageId },
      include: { campaign: true },
    });

    if (!recipient) {
      // Not a campaign email, ignore
      return;
    }

    const campaignId = recipient.campaignId;

    // Update recipient record based on event type
    switch (event.type) {
      case 'delivered':
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: 'DELIVERED',
            deliveredAt: event.timestamp,
          },
        });
        
        await prisma.emailCampaign.update({
          where: { id: campaignId },
          data: { deliveredCount: { increment: 1 } },
        });
        break;

      case 'opened':
        // Only update first open
        if (!recipient.openedAt) {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'OPENED',
              openedAt: event.timestamp,
            },
          });
          
          await prisma.emailCampaign.update({
            where: { id: campaignId },
            data: { openedCount: { increment: 1 } },
          });
        }
        break;

      case 'clicked':
        // Track click
        await prisma.emailCampaignClick.create({
          data: {
            campaignId,
            recipientId: recipient.id,
            email: recipient.email,
            clickedUrl: event.details?.url || '',
            userAgent: event.details?.userAgent,
            ipAddress: event.details?.ipAddress,
            deviceType: event.details?.deviceType,
            geographicData: event.details?.geographic as any,
          },
        });

        // Only update first click
        if (!recipient.firstClickedAt) {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'CLICKED',
              firstClickedAt: event.timestamp,
            },
          });
          
          await prisma.emailCampaign.update({
            where: { id: campaignId },
            data: { clickedCount: { increment: 1 } },
          });
        }
        break;

      case 'bounced':
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: 'BOUNCED',
            bouncedAt: event.timestamp,
            errorMessage: 'Email bounced',
          },
        });
        
        await prisma.emailCampaign.update({
          where: { id: campaignId },
          data: { bouncedCount: { increment: 1 } },
        });
        break;

      case 'complained':
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: 'COMPLAINED',
            complainedAt: event.timestamp,
          },
        });
        
        await prisma.emailCampaign.update({
          where: { id: campaignId },
          data: { complainedCount: { increment: 1 } },
        });
        break;

      case 'unsubscribed':
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: 'UNSUBSCRIBED',
            unsubscribedAt: event.timestamp,
          },
        });
        
        await prisma.emailCampaign.update({
          where: { id: campaignId },
          data: { unsubscribedCount: { increment: 1 } },
        });
        break;
    }
  }

  /**
   * Generate campaign analytics report
   */
  async generateReport(campaignId: string) {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: {
        recipients: {
          select: {
            status: true,
            sentAt: true,
            openedAt: true,
            deliveredAt: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get click data
    const clicks = await prisma.emailCampaignClick.findMany({
      where: { campaignId },
    });

    // Calculate hourly breakdown
    const hourlyData: Record<number, number> = {};
    campaign.recipients.forEach((r: any) => {
      if (r.sentAt) {
        const hour = new Date(r.sentAt).getHours();
        hourlyData[hour] = (hourlyData[hour] || 0) + 1;
      }
    });

    // Device breakdown
    const deviceData: Record<string, number> = {};
    clicks.forEach((c: any) => {
      if (c.deviceType) {
        deviceData[c.deviceType] = (deviceData[c.deviceType] || 0) + 1;
      }
    });

    // Link performance
    const linkData: Record<string, number> = {};
    clicks.forEach((c: any) => {
      linkData[c.clickedUrl] = (linkData[c.clickedUrl] || 0) + 1;
    });

    // Store report
    await prisma.emailCampaignReport.upsert({
      where: { campaignId },
      create: {
        campaignId,
        reportType: 'summary',
        metrics: {
          totalSent: campaign.sentCount,
          totalDelivered: campaign.deliveredCount,
          totalOpened: campaign.openedCount,
          totalClicked: campaign.clickedCount,
          totalBounced: campaign.bouncedCount,
          totalUnsubscribed: campaign.unsubscribedCount,
          deliveryRate: campaign.sentCount > 0 ? (campaign.deliveredCount / campaign.sentCount) * 100 : 0,
          openRate: campaign.deliveredCount > 0 ? (campaign.openedCount / campaign.deliveredCount) * 100 : 0,
          clickRate: campaign.openedCount > 0 ? (campaign.clickedCount / campaign.openedCount) * 100 : 0,
        } as any,
        hourlyBreakdown: hourlyData as any,
        deviceBreakdown: deviceData as any,
        linkPerformance: linkData as any,
      },
      update: {
        metrics: {
          totalSent: campaign.sentCount,
          totalDelivered: campaign.deliveredCount,
          totalOpened: campaign.openedCount,
          totalClicked: campaign.clickedCount,
          totalBounced: campaign.bouncedCount,
          totalUnsubscribed: campaign.unsubscribedCount,
          deliveryRate: campaign.sentCount > 0 ? (campaign.deliveredCount / campaign.sentCount) * 100 : 0,
          openRate: campaign.deliveredCount > 0 ? (campaign.openedCount / campaign.deliveredCount) * 100 : 0,
          clickRate: campaign.openedCount > 0 ? (campaign.clickedCount / campaign.openedCount) * 100 : 0,
        } as any,
        hourlyBreakdown: hourlyData as any,
        deviceBreakdown: deviceData as any,
        linkPerformance: linkData as any,
      },
    });

    return { success: true };
  }
}

export const campaignEventTracker = new CampaignEventTracker();
