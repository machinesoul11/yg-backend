/**
 * Security Monitoring Middleware
 * Integrates security monitoring into tRPC procedures
 * 
 * Features:
 * - Automatic logging of permission violations
 * - Tracking of approval actions
 * - Detection of suspicious patterns
 */

import { TRPCError } from '@trpc/server';
import { AdminSecurityMonitoringService } from '../services/admin-security-monitoring.service';
import { AuditService } from '../services/audit.service';
import { SecurityLoggingService } from '../services/security-logging.service';
import { prisma } from '../db';

const auditService = new AuditService(prisma);
const securityLoggingService = new SecurityLoggingService(prisma, auditService);
const securityMonitoringService = new AdminSecurityMonitoringService(
  prisma,
  auditService,
  securityLoggingService
);

/**
 * Wrap permission checks to log violations
 * This extends the existing requirePermission middleware
 */
export function withSecurityMonitoring<T extends (...args: any[]) => any>(
  permissionCheckFn: T,
  permissionName: string
) {
  return async function (options: any) {
    try {
      // Call the original permission check
      return await permissionCheckFn(options);
    } catch (error) {
      // If it's a permission denied error, log it
      if (error instanceof TRPCError && error.code === 'FORBIDDEN') {
        const { ctx } = options;
        
        if (ctx.session?.user) {
          await securityMonitoringService.logPermissionViolation({
            userId: ctx.session.user.id,
            email: ctx.session.user.email,
            attemptedPermission: permissionName as any,
            ipAddress: ctx.req?.headers?.get?.('x-forwarded-for') || 
                      ctx.req?.headers?.get?.('x-real-ip') ||
                      undefined,
            userAgent: ctx.req?.headers?.get?.('user-agent') || undefined,
            timestamp: new Date(),
          });
        }
      }

      // Re-throw the error
      throw error;
    }
  };
}

/**
 * Log approval actions for monitoring
 * Use after successful approval operations
 */
export async function logApprovalAction(
  ctx: any,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, any>
): Promise<void> {
  if (!ctx.session?.user?.id) {
    return;
  }

  try {
    await securityMonitoringService.trackApprovalAction(
      ctx.session.user.id,
      resourceType,
      resourceId,
      metadata
    );
  } catch (error) {
    console.error('[SecurityMonitoring] Failed to log approval action:', error);
    // Don't throw - logging failures shouldn't break the application
  }
}

/**
 * Log permission escalation attempt
 * Use when detecting attempts to gain elevated permissions
 */
export async function logPermissionEscalation(
  ctx: any,
  currentRole: string,
  attemptedPermissions: string[],
  context?: string
): Promise<void> {
  if (!ctx.session?.user?.id) {
    return;
  }

  try {
    await securityMonitoringService.trackPermissionEscalation({
      userId: ctx.session.user.id,
      currentRole,
      attemptedPermissions: attemptedPermissions as any[],
      timestamp: new Date(),
      context,
    });
  } catch (error) {
    console.error('[SecurityMonitoring] Failed to log escalation attempt:', error);
  }
}

/**
 * Export the monitoring service for direct use
 */
export { securityMonitoringService };
