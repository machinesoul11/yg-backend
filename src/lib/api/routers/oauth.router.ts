/**
 * OAuth Account Management Router (tRPC)
 * API endpoints for managing OAuth provider connections
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { OAuthProfileSyncService } from '@/lib/services/oauth-profile-sync.service';
import { AuditService } from '@/lib/services/audit.service';

// Initialize services
const auditService = new AuditService(prisma);
const oauthProfileSyncService = new OAuthProfileSyncService(prisma, auditService);

/**
 * Helper to extract request context
 */
function getRequestContext(ctx: any) {
  return {
    ipAddress: ctx.req?.ip || ctx.req?.headers?.['x-forwarded-for'] || 'unknown',
    userAgent: ctx.req?.headers?.['user-agent'] || 'unknown',
  };
}

/**
 * OAuth Account Management Router
 */
export const oauthRouter = createTRPCRouter({
  /**
   * Get linked OAuth accounts
   */
  getLinkedAccounts: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const accounts = await oauthProfileSyncService.getLinkedAccounts(userId);

    return {
      success: true,
      data: accounts.map((account) => ({
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        type: account.type,
      })),
    };
  }),

  /**
   * Check if user has password set
   */
  hasPassword: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password_hash: true },
    });

    return {
      success: true,
      data: {
        hasPassword: !!user?.password_hash,
      },
    };
  }),

  /**
   * Disconnect OAuth provider
   */
  disconnectProvider: protectedProcedure
    .input(
      z.object({
        provider: z.enum(['google', 'github', 'linkedin']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.session.user.id;
        const context = getRequestContext(ctx);

        await oauthProfileSyncService.unlinkProvider(
          userId,
          input.provider,
          context
        );

        return {
          success: true,
          data: {
            message: `${input.provider} account disconnected successfully`,
            provider: input.provider,
          },
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to disconnect OAuth provider',
        });
      }
    }),

  /**
   * Check if profile sync is available
   */
  canSyncProfile: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const canSync = await oauthProfileSyncService.canSyncProfile(userId);

    return {
      success: true,
      data: {
        canSync,
      },
    };
  }),

  /**
   * Manual profile sync from OAuth provider
   */
  syncProfile: protectedProcedure
    .input(
      z.object({
        provider: z.enum(['google', 'github', 'linkedin']),
        syncAvatar: z.boolean().optional().default(true),
        syncName: z.boolean().optional().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.session.user.id;

        // Get account to verify it exists
        const account = await prisma.account.findFirst({
          where: {
            userId,
            provider: input.provider,
          },
        });

        if (!account) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `No ${input.provider} account linked`,
          });
        }

        // Note: We can't trigger a fresh OAuth profile fetch here
        // This would require redirecting the user through OAuth flow again
        // Instead, we just return a message
        return {
          success: true,
          data: {
            message:
              'Profile sync will occur automatically on your next sign-in with this provider',
            provider: input.provider,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to sync profile',
        });
      }
    }),
});
