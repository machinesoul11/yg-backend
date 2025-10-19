/**
 * Security Router (tRPC)
 * API endpoints for security logging, timeline, and dashboard
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { securityLoggingService, SecurityEventType } from '@/lib/services/security-logging.service';

// Validation schemas
const securityTimelineSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventTypes: z.array(z.nativeEnum(SecurityEventType)).optional(),
});

const searchSecurityEventsSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
  eventTypes: z.array(z.nativeEnum(SecurityEventType)).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  ipAddress: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

/**
 * Security Router
 */
export const securityRouter = createTRPCRouter({
  /**
   * Get current user's security timeline
   * Shows all security-related events for their account
   */
  getMyTimeline: protectedProcedure
    .input(securityTimelineSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const events = await securityLoggingService.getUserSecurityTimeline(userId, {
        limit: input.limit,
        offset: input.offset,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        eventTypes: input.eventTypes,
      });

      return {
        success: true,
        data: {
          events,
          pagination: {
            limit: input.limit,
            offset: input.offset,
            hasMore: events.length === input.limit,
          },
        },
      };
    }),

  /**
   * Get security timeline for a specific user (Admin only)
   */
  getUserTimeline: adminProcedure
    .input(
      z.object({
        userId: z.string(),
      }).merge(securityTimelineSchema)
    )
    .query(async ({ input }) => {
      const events = await securityLoggingService.getUserSecurityTimeline(input.userId, {
        limit: input.limit,
        offset: input.offset,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        eventTypes: input.eventTypes,
      });

      return {
        success: true,
        data: {
          userId: input.userId,
          events,
          pagination: {
            limit: input.limit,
            offset: input.offset,
            hasMore: events.length === input.limit,
          },
        },
      };
    }),

  /**
   * Get security dashboard metrics (Admin only)
   * Provides comprehensive overview of 2FA adoption and security events
   */
  getDashboardMetrics: adminProcedure.query(async () => {
    const metrics = await securityLoggingService.getSecurityDashboardMetrics();

    return {
      success: true,
      data: metrics,
    };
  }),

  /**
   * Search security events across all users (Admin only)
   */
  searchEvents: adminProcedure
    .input(searchSecurityEventsSchema)
    .query(async ({ input }) => {
      const events = await securityLoggingService.searchSecurityEvents({
        userId: input.userId,
        email: input.email,
        eventTypes: input.eventTypes,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        ipAddress: input.ipAddress,
        limit: input.limit,
        offset: input.offset,
      });

      return {
        success: true,
        data: {
          events,
          pagination: {
            limit: input.limit,
            offset: input.offset,
            hasMore: events.length === input.limit,
          },
          filters: {
            userId: input.userId,
            email: input.email,
            eventTypes: input.eventTypes,
            startDate: input.startDate,
            endDate: input.endDate,
            ipAddress: input.ipAddress,
          },
        },
      };
    }),

  /**
   * Get security statistics summary (Admin only)
   */
  getSecurityStats: adminProcedure.query(async ({ ctx }) => {
    const metrics = await securityLoggingService.getSecurityDashboardMetrics();

    return {
      success: true,
      data: {
        overview: {
          totalUsers: metrics.twoFactorAdoption.total,
          usersWith2FA: metrics.twoFactorAdoption.enabled,
          adoptionRate: metrics.twoFactorAdoption.percentage.toFixed(2) + '%',
        },
        methodBreakdown: metrics.twoFactorAdoption.byMethod,
        recentActivity: {
          verifications24h: metrics.verificationMetrics.last24Hours.total,
          successRate24h: metrics.verificationMetrics.last24Hours.successRate.toFixed(2) + '%',
          backupCodesUsed24h: metrics.backupCodeUsage.last24Hours,
          securityAlerts24h: metrics.securityAlerts.last24Hours,
        },
        trends: {
          verifications7d: metrics.verificationMetrics.last7Days.total,
          verifications30d: metrics.verificationMetrics.last30Days.total,
          successRate7d: metrics.verificationMetrics.last7Days.successRate.toFixed(2) + '%',
          successRate30d: metrics.verificationMetrics.last30Days.successRate.toFixed(2) + '%',
        },
      },
    };
  }),

  /**
   * Get available security event types
   */
  getEventTypes: protectedProcedure.query(() => {
    const eventTypes = Object.values(SecurityEventType).map(type => ({
      value: type,
      label: type.replace(/_/g, ' ').toLowerCase(),
      category: categorizeEventType(type),
    }));

    return {
      success: true,
      data: { eventTypes },
    };
  }),
});

/**
 * Categorize event types for filtering
 */
function categorizeEventType(eventType: SecurityEventType): string {
  if (eventType.includes('SETUP')) return '2FA Setup';
  if (eventType.includes('DISABLE')) return '2FA Disable';
  if (eventType.includes('VERIFICATION')) return 'Verification';
  if (eventType.includes('BACKUP_CODE')) return 'Backup Codes';
  if (eventType.includes('PHONE')) return 'Phone Number';
  if (eventType.includes('TRUSTED_DEVICE')) return 'Trusted Devices';
  if (eventType.includes('ALERT') || eventType.includes('SUSPICIOUS') || eventType.includes('UNUSUAL')) {
    return 'Security Alerts';
  }
  return 'Other';
}
