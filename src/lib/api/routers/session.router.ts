/**
 * Session Management tRPC Router
 * Endpoints for viewing, managing, and revoking user sessions
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { SessionManagementService } from '@/lib/services/session-management.service';

const sessionService = new SessionManagementService(prisma);

export const sessionRouter = createTRPCRouter({
  /**
   * Get all active sessions for the current user
   */
  getSessions: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    }

    try {
      // Get session token from context if available
      const currentSessionToken = ctx.req?.headers?.get('cookie')
        ?.split(';')
        .find((c) => c.trim().startsWith('next-auth.session-token='))
        ?.split('=')[1];

      const sessions = await sessionService.getUserSessions(
        ctx.session.user.id,
        currentSessionToken
      );

      return {
        success: true,
        data: {
          sessions,
          totalCount: sessions.length,
        },
      };
    } catch (error: any) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch sessions',
        cause: error,
      });
    }
  }),

  /**
   * Get session warnings (approaching timeout, limit reached, etc.)
   */
  getSessionWarnings: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    }

    try {
      const currentSessionToken = ctx.req?.headers?.get('cookie')
        ?.split(';')
        .find((c) => c.trim().startsWith('next-auth.session-token='))
        ?.split('=')[1];

      if (!currentSessionToken) {
        return { success: true, data: { warnings: [] } };
      }

      const warnings = await sessionService.getSessionWarnings(
        ctx.session.user.id,
        currentSessionToken
      );

      return {
        success: true,
        data: { warnings },
      };
    } catch (error: any) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch session warnings',
        cause: error,
      });
    }
  }),

  /**
   * Revoke a specific session
   */
  revokeSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session?.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        });
      }

      try {
        await sessionService.revokeSession(
          ctx.session.user.id,
          input.sessionId,
          'user_revoked'
        );

        return {
          success: true,
          data: {
            message: 'Session revoked successfully',
          },
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to revoke session',
          cause: error,
        });
      }
    }),

  /**
   * Revoke all sessions except the current one
   */
  revokeAllOtherSessions: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    }

    try {
      const currentSessionToken = ctx.req?.headers?.get('cookie')
        ?.split(';')
        .find((c) => c.trim().startsWith('next-auth.session-token='))
        ?.split('=')[1];

      const revokedCount = await sessionService.revokeAllUserSessions(
        ctx.session.user.id,
        'user_revoked_all_others',
        currentSessionToken
      );

      return {
        success: true,
        data: {
          message: `Successfully logged out of ${revokedCount} other session(s)`,
          revokedCount,
        },
      };
    } catch (error: any) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to revoke sessions',
        cause: error,
      });
    }
  }),

  /**
   * Revoke all sessions including the current one
   */
  revokeAllSessions: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    }

    try {
      const revokedCount = await sessionService.revokeAllUserSessions(
        ctx.session.user.id,
        'user_revoked_all'
      );

      return {
        success: true,
        data: {
          message: `Successfully logged out of all sessions`,
          revokedCount,
        },
      };
    } catch (error: any) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to revoke all sessions',
        cause: error,
      });
    }
  }),

  /**
   * Get session statistics by device type
   */
  getSessionsByDevice: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    }

    try {
      const deviceStats = await sessionService.getSessionsByDevice(
        ctx.session.user.id
      );

      return {
        success: true,
        data: { deviceStats },
      };
    } catch (error: any) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch device statistics',
        cause: error,
      });
    }
  }),

  /**
   * Update session activity (heartbeat)
   */
  updateActivity: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    }

    try {
      const currentSessionToken = ctx.req?.headers?.get('cookie')
        ?.split(';')
        .find((c) => c.trim().startsWith('next-auth.session-token='))
        ?.split('=')[1];

      if (currentSessionToken) {
        await sessionService.updateSessionActivity(currentSessionToken);
      }

      return {
        success: true,
        data: {
          message: 'Activity updated',
        },
      };
    } catch (error: any) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update activity',
        cause: error,
      });
    }
  }),
});
