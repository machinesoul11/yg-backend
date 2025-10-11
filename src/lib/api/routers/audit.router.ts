/**
 * Audit Router
 * Exposes audit history to admins and users (filtered by permissions)
 * 
 * Access Control:
 * - Admins: Can view all audit history
 * - Users: Can only view their own activity
 */

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { auditService } from '@/lib/services/audit.service';

export const auditRouter = createTRPCRouter({
  /**
   * Get audit history for specific entity (admin only)
   */
  getHistory: adminProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const events = await auditService.getHistory(
        input.entityType,
        input.entityId
      );

      return {
        data: events.map((event) => ({
          id: event.id,
          timestamp: event.timestamp.toISOString(),
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          userId: event.userId,
          userName: event.user?.name ?? null,
          userEmail: event.user?.email ?? null,
          before: event.beforeJson,
          after: event.afterJson,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          requestId: event.requestId,
        })),
      };
    }),

  /**
   * Get current user's activity (own data only)
   */
  getMyActivity: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      // TODO: Uncomment when auth is implemented
      // const userId = ctx.session.user.id;
      const userId = 'mock-user-id'; // Temporary until auth is ready

      const events = await auditService.getUserActivity(userId, input.limit);

      return {
        data: events.map((event) => ({
          id: event.id,
          timestamp: event.timestamp.toISOString(),
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
        })),
      };
    }),

  /**
   * Get changes to entity within date range (admin only)
   */
  getChanges: adminProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string(),
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
      })
    )
    .query(async ({ input }) => {
      const events = await auditService.getChanges(
        input.entityType,
        input.entityId,
        new Date(input.startDate),
        new Date(input.endDate)
      );

      return {
        data: events.map((event) => ({
          id: event.id,
          timestamp: event.timestamp.toISOString(),
          action: event.action,
          before: event.beforeJson,
          after: event.afterJson,
        })),
      };
    }),

  /**
   * Search audit events with filters (admin only)
   */
  search: adminProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        email: z.string().optional(),
        action: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        requestId: z.string().optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const events = await auditService.searchEvents({
        userId: input.userId,
        email: input.email,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId: input.requestId,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        limit: input.limit,
      });

      return {
        data: events.map((event) => ({
          id: event.id,
          timestamp: event.timestamp.toISOString(),
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          userId: event.userId,
          email: event.email,
          userName: event.user?.name ?? null,
          before: event.beforeJson,
          after: event.afterJson,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          requestId: event.requestId,
        })),
        total: events.length,
      };
    }),
});
