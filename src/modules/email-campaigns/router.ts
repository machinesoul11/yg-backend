/**
 * Email Campaigns tRPC Router
 * Handles campaign creation, scheduling, and analytics
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { campaignService } from '@/lib/services/email/campaign.service';
import { preferenceCenterService } from '@/lib/services/email/preference-center.service';
import {
  createCampaignSchema,
  updateCampaignSchema,
  sendTestEmailSchema,
  cancelCampaignSchema,
  updateEmailPreferencesSchema,
  unsubscribeSchema,
} from '@/lib/validators/email.validators';

export const emailCampaignsRouter = createTRPCRouter({
  // Campaign Management
  create: adminProcedure
    .input(createCampaignSchema)
    .mutation(async ({ ctx, input }) => {
      return campaignService.createCampaign(ctx.session.user.id, input);
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        data: updateCampaignSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      return campaignService.updateCampaign(
        input.id,
        ctx.session.user.id,
        input.data
      );
    }),

  schedule: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return campaignService.scheduleCampaign(input.id, ctx.session.user.id);
    }),

  cancel: adminProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return campaignService.cancelCampaign(
        input.id,
        ctx.session.user.id,
        input.reason
      );
    }),

  sendTest: adminProcedure
    .input(
      z.object({
        id: z.string(),
        testEmails: z.array(z.string().email()).min(1).max(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return campaignService.sendTestEmail(
        input.id,
        ctx.session.user.id,
        input.testEmails
      );
    }),

  // Queries
  get: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const campaign = await ctx.db.emailCampaign.findUnique({
        where: { id: input.id },
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

      return campaign;
    }),

  list: adminProcedure
    .input(
      z.object({
        status: z
          .enum(['DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'CANCELLED', 'FAILED'])
          .optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const campaigns = await ctx.db.emailCampaign.findMany({
        where: {
          ...(input.status && { status: input.status }),
          ...(input.cursor && {
            createdAt: { lt: new Date(input.cursor) },
          }),
        },
        include: {
          _count: {
            select: {
              recipients: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
      });

      let nextCursor: string | undefined = undefined;
      if (campaigns.length > input.limit) {
        const nextItem = campaigns.pop();
        nextCursor = nextItem!.createdAt.toISOString();
      }

      return {
        campaigns,
        nextCursor,
      };
    }),

  analytics: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return campaignService.getCampaignAnalytics(input.id);
    }),

  recipients: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z
          .enum([
            'PENDING',
            'QUEUED',
            'SENT',
            'DELIVERED',
            'OPENED',
            'CLICKED',
            'BOUNCED',
            'FAILED',
            'UNSUBSCRIBED',
            'COMPLAINED',
          ])
          .optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const recipients = await ctx.db.campaignRecipient.findMany({
        where: {
          campaignId: input.id,
          ...(input.status && { status: input.status }),
          ...(input.cursor && {
            createdAt: { lt: new Date(input.cursor) },
          }),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
      });

      let nextCursor: string | undefined = undefined;
      if (recipients.length > input.limit) {
        const nextItem = recipients.pop();
        nextCursor = nextItem!.createdAt.toISOString();
      }

      return {
        recipients,
        nextCursor,
      };
    }),

  // Preference Center (User-facing)
  getMyPreferences: protectedProcedure.query(async ({ ctx }) => {
    return preferenceCenterService.getPreferences(ctx.session.user.id);
  }),

  updateMyPreferences: protectedProcedure
    .input(updateEmailPreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      return preferenceCenterService.updatePreferences(
        ctx.session.user.id,
        input
      );
    }),

  generateUnsubscribeToken: protectedProcedure.mutation(async ({ ctx }) => {
    return preferenceCenterService.generateUnsubscribeToken(
      ctx.session.user.id
    );
  }),

  // Public endpoints for unsubscribe links
  verifyUnsubscribeToken: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      return preferenceCenterService.verifyUnsubscribeToken(input.token);
    }),

  unsubscribe: protectedProcedure
    .input(unsubscribeSchema)
    .mutation(async ({ input }) => {
      return preferenceCenterService.globalUnsubscribe(input);
    }),

  resubscribe: protectedProcedure.mutation(async ({ ctx }) => {
    return preferenceCenterService.resubscribe(ctx.session.user.id);
  }),

  // GDPR Compliance
  exportMyEmailData: protectedProcedure.query(async ({ ctx }) => {
    return preferenceCenterService.exportUserEmailData(ctx.session.user.id);
  }),

  deleteMyEmailData: protectedProcedure.mutation(async ({ ctx }) => {
    return preferenceCenterService.deleteUserEmailData(ctx.session.user.id);
  }),
});
