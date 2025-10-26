/**
 * Admin Security Router
 * Endpoints for security monitoring dashboard and management
 */

import { z } from 'zod';
import { createTRPCRouter, adminProcedure } from '@/lib/trpc';
import { AdminSecurityMonitoringService } from '@/lib/services/admin-security-monitoring.service';
import { AdminSessionSecurityService } from '@/lib/services/admin-session-security.service';
import { adminRateLimitService } from '@/lib/services/admin-rate-limit.service';
import { AuditService } from '@/lib/services/audit.service';
import { SecurityLoggingService } from '@/lib/services/security-logging.service';
import { prisma } from '@/lib/db';
import { withReadOperationRateLimit } from '@/lib/middleware/admin-rate-limit.middleware';
import { checkAdminSessionTimeout } from '@/lib/middleware/admin-session-timeout.middleware';

// Initialize services
const auditService = new AuditService(prisma);
const securityLoggingService = new SecurityLoggingService(prisma, auditService);
const securityMonitoringService = new AdminSecurityMonitoringService(
  prisma,
  auditService,
  securityLoggingService
);
const adminSessionService = new AdminSessionSecurityService(prisma);

export const adminSecurityRouter = createTRPCRouter({
  /**
   * Get security dashboard metrics
   * Provides overview of security events, violations, and alerts
   */
  getDashboardMetrics: adminProcedure
    .use(checkAdminSessionTimeout)
    .use(withReadOperationRateLimit)
    .query(async () => {
      return await securityMonitoringService.getDashboardMetrics();
    }),

  /**
   * Acknowledge a security alert
   */
  acknowledgeAlert: adminProcedure
    .use(checkAdminSessionTimeout)
    .input(z.object({
      alertId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const acknowledgedBy = ctx.session.user.id;

      await securityMonitoringService.acknowledgeAlert(
        input.alertId,
        acknowledgedBy
      );

      return {
        success: true,
        message: 'Alert acknowledged',
      };
    }),

  /**
   * Get admin rate limit status for current user
   */
  getRateLimitStatus: adminProcedure
    .use(checkAdminSessionTimeout)
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const status = await adminRateLimitService.getAllTierStatus(userId);

      return {
        userId,
        tiers: status,
      };
    }),

  /**
   * Get admin session status
   */
  getSessionStatus: adminProcedure
    .input(z.object({
      sessionToken: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const sessionToken = input.sessionToken || ctx.req?.headers?.get?.('authorization')?.replace('Bearer ', '');

      if (!sessionToken) {
        return {
          isActive: false,
          message: 'No session token provided',
        };
      }

      const status = await adminSessionService.checkAdminSession(userId, sessionToken);

      return {
        ...status,
        message: status.isActive 
          ? `Session active. ${Math.round(status.timeUntilTimeout / 1000 / 60)} minutes remaining.`
          : 'Session expired',
      };
    }),

  /**
   * Get all active admin sessions for current user
   */
  getActiveSessions: adminProcedure
    .use(checkAdminSessionTimeout)
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const sessions = await adminSessionService.getActiveAdminSessions(userId);

      return {
        userId,
        sessions,
        count: sessions.length,
      };
    }),

  /**
   * Revoke a specific admin session
   */
  revokeSession: adminProcedure
    .use(checkAdminSessionTimeout)
    .input(z.object({
      sessionToken: z.string(),
    }))
    .mutation(async ({ input }) => {
      await adminSessionService.revokeAdminSession(input.sessionToken, 'manual_revocation');

      return {
        success: true,
        message: 'Session revoked successfully',
      };
    }),

  /**
   * Request elevated session token for sensitive operation
   */
  requestElevatedToken: adminProcedure
    .use(checkAdminSessionTimeout)
    .input(z.object({
      password: z.string(),
      operationType: z.enum([
        'role_change',
        'permission_grant',
        'user_deletion',
        'data_export',
        'system_config',
        'security_settings',
      ]),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const result = await adminSessionService.requireReauthentication(
        userId,
        input.password,
        input.operationType
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Authentication failed',
        };
      }

      return {
        success: true,
        elevatedToken: result.elevatedToken,
        expiresAt: result.expiresAt,
        message: 'Elevated session token created. Valid for 5 minutes.',
      };
    }),

  /**
   * Verify elevated session token
   */
  verifyElevatedToken: adminProcedure
    .input(z.object({
      token: z.string(),
      operationType: z.enum([
        'role_change',
        'permission_grant',
        'user_deletion',
        'data_export',
        'system_config',
        'security_settings',
      ]),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const isValid = await adminSessionService.verifyElevatedToken(
        input.token,
        userId,
        input.operationType
      );

      return {
        valid: isValid,
        message: isValid 
          ? 'Token is valid'
          : 'Token is invalid or expired',
      };
    }),

  /**
   * Consume elevated session token (one-time use)
   */
  consumeElevatedToken: adminProcedure
    .input(z.object({
      token: z.string(),
    }))
    .mutation(async ({ input }) => {
      await adminSessionService.consumeElevatedToken(input.token);

      return {
        success: true,
        message: 'Token consumed',
      };
    }),

  /**
   * Check if current session requires 2FA
   */
  check2FARequirement: adminProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      const requires2FA = await adminSessionService.requires2FA(userId);
      const hasRecent2FA = requires2FA 
        ? await adminSessionService.hasRecent2FAVerification(userId)
        : false;

      return {
        requires2FA,
        hasRecent2FA,
        message: requires2FA && !hasRecent2FA
          ? '2FA verification required for sensitive operations'
          : requires2FA
            ? '2FA verified recently'
            : '2FA not required',
      };
    }),

  /**
   * Mark 2FA as verified (called after successful 2FA verification)
   */
  mark2FAVerified: adminProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      await adminSessionService.mark2FAVerified(userId);

      return {
        success: true,
        message: '2FA marked as verified. Grace period: 15 minutes.',
      };
    }),
});
