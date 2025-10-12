/**
 * Email Campaign Service
 * Handles campaign creation, management, and analytics
 */
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { TRPCError } from '@trpc/server';
import { Queue } from 'bullmq';
import { redisConnection } from '@/lib/db/redis';
import type {
  EmailCampaignStatus,
  CampaignRecipientStatus,
  UserRole,
} from '@prisma/client';

export interface SegmentCriteria {
  role?: UserRole[];
  verificationStatus?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  lastLoginAfter?: Date;
  hasEmailPreference?: {
    [key: string]: boolean;
  };
  creatorSpecialties?: string[];
  brandIndustries?: string[];
  custom?: {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in';
    value: any;
  }[];
}

export interface CreateCampaignParams {
  name: string;
  description?: string;
  templateId: string;
  subject: string;
  previewText?: string;
  segmentCriteria?: SegmentCriteria;
  scheduledSendTime?: Date;
  timezone?: string;
  messagesPerHour?: number;
  batchSize?: number;
  tags?: string[];
  metadata?: any;
}

export interface UpdateCampaignParams {
  name?: string;
  description?: string;
  subject?: string;
  previewText?: string;
  segmentCriteria?: SegmentCriteria;
  scheduledSendTime?: Date;
  timezone?: string;
  messagesPerHour?: number;
  batchSize?: number;
  tags?: string[];
  metadata?: any;
}

export class CampaignService {
  private campaignQueue: Queue;

  constructor() {
    this.campaignQueue = new Queue('email-campaigns', {
      connection: redisConnection,
    });
  }

  /**
   * Create a new campaign in DRAFT status
   */
  async createCampaign(
    userId: string,
    params: CreateCampaignParams
  ) {
    // Validate template exists
    await this.validateTemplate(params.templateId);

    // Estimate recipient count
    const recipientCount = await this.estimateRecipientCount(params.segmentCriteria);

    // Validate scheduling
    if (params.scheduledSendTime) {
      this.validateScheduledTime(params.scheduledSendTime);
    }

    // Create campaign
    const campaign = await prisma.emailCampaign.create({
      data: {
        name: params.name,
        description: params.description,
        createdBy: userId,
        templateId: params.templateId,
        subject: params.subject,
        previewText: params.previewText,
        segmentCriteria: params.segmentCriteria as any,
        recipientCount,
        scheduledSendTime: params.scheduledSendTime,
        timezone: params.timezone || 'UTC',
        messagesPerHour: params.messagesPerHour || 1000,
        batchSize: params.batchSize || 100,
        tags: params.tags || [],
        metadata: params.metadata,
        status: 'DRAFT',
      },
    });

    // Generate recipient records
    await this.generateRecipients(campaign.id, params.segmentCriteria);

    return campaign;
  }

  /**
   * Update campaign (only if in DRAFT or SCHEDULED status)
   */
  async updateCampaign(
    campaignId: string,
    userId: string,
    params: UpdateCampaignParams
  ) {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Campaign not found',
      });
    }

    if (campaign.createdBy !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to update this campaign',
      });
    }

    if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot update campaign in current status',
      });
    }

    // If segmentation changes, recalculate recipients
    let recipientCount = campaign.recipientCount;
    if (params.segmentCriteria) {
      recipientCount = await this.estimateRecipientCount(params.segmentCriteria);
      
      // Delete existing recipients and regenerate
      await prisma.campaignRecipient.deleteMany({
        where: { campaignId },
      });
      await this.generateRecipients(campaignId, params.segmentCriteria);
    }

    const updated = await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        ...(params.name && { name: params.name }),
        ...(params.description !== undefined && { description: params.description }),
        ...(params.subject && { subject: params.subject }),
        ...(params.previewText !== undefined && { previewText: params.previewText }),
        ...(params.segmentCriteria && {
          segmentCriteria: params.segmentCriteria as any,
          recipientCount,
        }),
        ...(params.scheduledSendTime !== undefined && {
          scheduledSendTime: params.scheduledSendTime,
        }),
        ...(params.timezone && { timezone: params.timezone }),
        ...(params.messagesPerHour && { messagesPerHour: params.messagesPerHour }),
        ...(params.batchSize && { batchSize: params.batchSize }),
        ...(params.tags && { tags: params.tags }),
        ...(params.metadata && { metadata: params.metadata }),
      },
    });

    return updated;
  }

  /**
   * Schedule campaign for sending
   */
  async scheduleCampaign(campaignId: string, userId: string) {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Campaign not found',
      });
    }

    if (campaign.createdBy !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to schedule this campaign',
      });
    }

    if (campaign.status !== 'DRAFT') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Can only schedule campaigns in DRAFT status',
      });
    }

    // Final pre-send validation
    await this.validateCampaign(campaign);

    // Update status
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'SCHEDULED' },
    });

    // Queue campaign job
    const delay = campaign.scheduledSendTime
      ? campaign.scheduledSendTime.getTime() - Date.now()
      : 0;

    await this.campaignQueue.add(
      'send-campaign',
      { campaignId },
      {
        delay: Math.max(0, delay),
        jobId: `campaign-${campaignId}`,
        removeOnComplete: {
          age: 24 * 3600, // Keep for 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep for 7 days
        },
      }
    );

    return { success: true, scheduledFor: campaign.scheduledSendTime };
  }

  /**
   * Cancel a scheduled campaign
   */
  async cancelCampaign(
    campaignId: string,
    userId: string,
    reason?: string
  ) {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Campaign not found',
      });
    }

    if (campaign.createdBy !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to cancel this campaign',
      });
    }

    if (!['SCHEDULED', 'SENDING'].includes(campaign.status)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Can only cancel SCHEDULED or SENDING campaigns',
      });
    }

    // Remove from queue
    const job = await this.campaignQueue.getJob(`campaign-${campaignId}`);
    if (job) {
      await job.remove();
    }

    // Update campaign status
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: reason,
      },
    });

    // Update pending recipients
    await prisma.campaignRecipient.updateMany({
      where: {
        campaignId,
        status: { in: ['PENDING', 'QUEUED'] },
      },
      data: { status: 'FAILED', errorMessage: 'Campaign cancelled' },
    });

    return { success: true };
  }

  /**
   * Send test email
   */
  async sendTestEmail(
    campaignId: string,
    userId: string,
    testEmails: string[]
  ) {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Campaign not found',
      });
    }

    if (campaign.createdBy !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to test this campaign',
      });
    }

    // Import email service
    const { emailService } = await import('@/lib/services/email/email.service');

    // Send test emails
    const results = await Promise.allSettled(
      testEmails.map(async (email) => {
        return emailService.sendTransactional({
          email,
          subject: `[TEST] ${campaign.subject}`,
          template: campaign.templateId as any,
          variables: {
            userName: 'Test User',
            ...campaign.metadata,
          },
          tags: {
            campaignId: campaign.id,
            type: 'test',
          },
        });
      })
    );

    return {
      success: true,
      sent: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    };
  }

  /**
   * Get campaign analytics
   */
  async getCampaignAnalytics(campaignId: string) {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: {
        _count: {
          select: {
            recipients: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Campaign not found',
      });
    }

    // Get recipient status breakdown
    const statusBreakdown = await prisma.campaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: true,
    });

    // Get click statistics
    const clicks = await prisma.emailCampaignClick.groupBy({
      by: ['clickedUrl'],
      where: { campaignId },
      _count: true,
      orderBy: { _count: { clickedUrl: 'desc' } },
      take: 10,
    });

    // Calculate rates
    const deliveryRate =
      campaign.sentCount > 0
        ? (campaign.deliveredCount / campaign.sentCount) * 100
        : 0;
    const openRate =
      campaign.deliveredCount > 0
        ? (campaign.openedCount / campaign.deliveredCount) * 100
        : 0;
    const clickRate =
      campaign.openedCount > 0
        ? (campaign.clickedCount / campaign.openedCount) * 100
        : 0;
    const bounceRate =
      campaign.sentCount > 0
        ? (campaign.bouncedCount / campaign.sentCount) * 100
        : 0;
    const unsubscribeRate =
      campaign.deliveredCount > 0
        ? (campaign.unsubscribedCount / campaign.deliveredCount) * 100
        : 0;

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        sentCount: campaign.sentCount,
        deliveredCount: campaign.deliveredCount,
        openedCount: campaign.openedCount,
        clickedCount: campaign.clickedCount,
        bouncedCount: campaign.bouncedCount,
        unsubscribedCount: campaign.unsubscribedCount,
        failedCount: campaign.failedCount,
      },
      rates: {
        deliveryRate: Number(deliveryRate.toFixed(2)),
        openRate: Number(openRate.toFixed(2)),
        clickRate: Number(clickRate.toFixed(2)),
        bounceRate: Number(bounceRate.toFixed(2)),
        unsubscribeRate: Number(unsubscribeRate.toFixed(2)),
      },
      statusBreakdown,
      topLinks: clicks.map((c) => ({
        url: c.clickedUrl,
        clicks: c._count,
      })),
    };
  }

  // --- Private helper methods ---

  private validateTemplate(templateId: string) {
    // Check if template exists in the templates registry
    const validTemplates = [
      'email-verification',
      'password-reset',
      'welcome-email',
      'brand-welcome',
      'creator-welcome',
      'monthly-newsletter',
      'license-expiry',
      'royalty-statement-ready',
      'project-invitation',
      'payout-confirmation',
    ];

    if (!validTemplates.includes(templateId)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Invalid template ID: ${templateId}`,
      });
    }
  }

  private validateScheduledTime(scheduledTime: Date) {
    const now = new Date();
    if (scheduledTime <= now) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Scheduled time must be in the future',
      });
    }

    // Prevent scheduling too far in future (1 year)
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    if (scheduledTime > oneYearFromNow) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot schedule more than 1 year in advance',
      });
    }
  }

  private async validateCampaign(campaign: any) {
    // Ensure there are recipients
    const recipientCount = await prisma.campaignRecipient.count({
      where: { campaignId: campaign.id },
    });

    if (recipientCount === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Campaign has no recipients',
      });
    }

    // Validate template
    this.validateTemplate(campaign.templateId);

    // Check rate limiting is reasonable
    if (campaign.messagesPerHour > 10000) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Messages per hour exceeds platform limits',
      });
    }
  }

  private async estimateRecipientCount(criteria?: SegmentCriteria): Promise<number> {
    if (!criteria) {
      // All users with email preferences
      return prisma.user.count({
        where: {
          email_verified: { not: null },
          deleted_at: null,
          emailPreferences: {
            globalUnsubscribe: false,
          },
        },
      });
    }

    const whereClause = this.buildSegmentWhereClause(criteria);
    return prisma.user.count({ where: whereClause });
  }

  private async generateRecipients(campaignId: string, criteria?: SegmentCriteria) {
    const whereClause = this.buildSegmentWhereClause(criteria);

    // Fetch users matching criteria
    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    // Batch create recipients
    const batchSize = 1000;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      await prisma.campaignRecipient.createMany({
        data: batch.map((user) => ({
          campaignId,
          userId: user.id,
          email: user.email,
          status: 'PENDING' as CampaignRecipientStatus,
          personalizationData: {
            userName: user.name || 'User',
            userRole: user.role,
          },
        })),
      });
    }

    // Update recipient count
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { recipientCount: users.length },
    });
  }

  private buildSegmentWhereClause(criteria?: SegmentCriteria): any {
    const where: any = {
      email_verified: { not: null },
      deleted_at: null,
      emailPreferences: {
        globalUnsubscribe: false,
      },
    };

    if (!criteria) return where;

    if (criteria.role && criteria.role.length > 0) {
      where.role = { in: criteria.role };
    }

    if (criteria.createdAfter) {
      where.createdAt = { ...where.createdAt, gte: criteria.createdAfter };
    }

    if (criteria.createdBefore) {
      where.createdAt = { ...where.createdAt, lte: criteria.createdBefore };
    }

    if (criteria.lastLoginAfter) {
      where.lastLoginAt = { gte: criteria.lastLoginAfter };
    }

    if (criteria.creatorSpecialties && criteria.creatorSpecialties.length > 0) {
      where.creator = {
        specialties: {
          path: [],
          array_contains: criteria.creatorSpecialties,
        },
      };
    }

    if (criteria.brandIndustries && criteria.brandIndustries.length > 0) {
      where.brand = {
        industry: { in: criteria.brandIndustries },
      };
    }

    return where;
  }
}

export const campaignService = new CampaignService();
