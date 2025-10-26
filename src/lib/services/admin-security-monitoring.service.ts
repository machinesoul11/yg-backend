/**
 * Admin Security Monitoring Service
 * Tracks and alerts on security-relevant admin operations
 * 
 * Features:
 * - Log all failed permission checks
 * - Alert on repeated permission violations
 * - Monitor for suspicious approval patterns
 * - Track permission escalation attempts
 * - Generate security reports and dashboards
 */

import { PrismaClient } from '@prisma/client';
import { AuditService } from './audit.service';
import { SecurityLoggingService } from './security-logging.service';
import { getRedisClient } from '../redis/client';
import type { Permission } from '../constants/permissions';

export interface PermissionViolation {
  userId: string;
  email?: string;
  attemptedPermission: Permission;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface ApprovalPattern {
  adminId: string;
  approvalCount: number;
  timeWindow: number; // minutes
  resourceTypes: string[];
  isAnomalous: boolean;
}

export interface PermissionEscalationAttempt {
  userId: string;
  currentRole: string;
  attemptedRole?: string;
  attemptedPermissions: Permission[];
  timestamp: Date;
  context?: string;
}

export interface SecurityAlert {
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type: 'PERMISSION_VIOLATION' | 'APPROVAL_ANOMALY' | 'ESCALATION_ATTEMPT' | 'RATE_LIMIT_ABUSE';
  title: string;
  description: string;
  userId: string;
  metadata: Record<string, any>;
  timestamp: Date;
  acknowledged: boolean;
}

export interface SecurityDashboard {
  permissionViolations: {
    last24Hours: number;
    last7Days: number;
    byUser: Array<{ userId: string; email: string; count: number }>;
    byPermission: Array<{ permission: string; count: number }>;
  };
  approvalPatterns: {
    totalApprovals: number;
    anomalousApprovals: number;
    byAdmin: Array<{ adminId: string; email: string; count: number; anomalous: boolean }>;
  };
  escalationAttempts: {
    last24Hours: number;
    last7Days: number;
    byUser: Array<{ userId: string; email: string; count: number }>;
  };
  activeAlerts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export class AdminSecurityMonitoringService {
  private redis = getRedisClient();

  constructor(
    private prisma: PrismaClient,
    private auditService: AuditService,
    private securityLoggingService: SecurityLoggingService
  ) {}

  /**
   * Log a failed permission check
   * 
   * @param violation - Permission violation details
   */
  async logPermissionViolation(violation: PermissionViolation): Promise<void> {
    try {
      // Log to audit service
      await this.auditService.log({
        action: 'PERMISSION_DENIED',
        entityType: 'permission',
        entityId: violation.attemptedPermission,
        userId: violation.userId,
        email: violation.email,
        ipAddress: violation.ipAddress,
        userAgent: violation.userAgent,
        metadata: {
          permission: violation.attemptedPermission,
          resourceType: violation.resourceType,
          resourceId: violation.resourceId,
        },
      });

      // Track violation count in Redis
      const violationKey = `security:violations:${violation.userId}:${this.getDateKey()}`;
      await this.redis.incr(violationKey);
      await this.redis.expire(violationKey, 86400); // 24 hours

      // Check for repeated violations
      const violationCount = await this.redis.get(violationKey);
      const count = violationCount ? parseInt(violationCount) : 0;

      // Alert on repeated violations (threshold: 5 in 24 hours)
      if (count >= 5) {
        await this.createSecurityAlert({
          severity: 'MEDIUM',
          type: 'PERMISSION_VIOLATION',
          title: 'Repeated Permission Violations',
          description: `User has attempted ${count} unauthorized actions in the last 24 hours`,
          userId: violation.userId,
          metadata: {
            violationCount: count,
            latestPermission: violation.attemptedPermission,
            latestResource: violation.resourceType,
          },
        });
      }

      // Critical alert for rapid violations (10+ in 1 hour)
      const hourlyKey = `security:violations:${violation.userId}:hourly:${this.getHourKey()}`;
      await this.redis.incr(hourlyKey);
      await this.redis.expire(hourlyKey, 3600);

      const hourlyCount = await this.redis.get(hourlyKey);
      if (hourlyCount && parseInt(hourlyCount) >= 10) {
        await this.createSecurityAlert({
          severity: 'HIGH',
          type: 'PERMISSION_VIOLATION',
          title: 'Rapid Permission Violation Pattern',
          description: `User has attempted ${hourlyCount} unauthorized actions in the last hour`,
          userId: violation.userId,
          metadata: {
            hourlyViolations: parseInt(hourlyCount),
            possibleAttack: true,
          },
        });
      }
    } catch (error) {
      console.error('[AdminSecurityMonitoring] Failed to log permission violation:', error);
      // Don't throw - logging failures shouldn't break the application
    }
  }

  /**
   * Track approval action and detect anomalous patterns
   * 
   * @param adminId - Admin performing the approval
   * @param resourceType - Type of resource being approved
   * @param resourceId - ID of resource being approved
   * @param metadata - Additional context
   */
  async trackApprovalAction(
    adminId: string,
    resourceType: string,
    resourceId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Log to audit service
      await this.auditService.log({
        action: 'APPROVAL_GRANTED',
        entityType: resourceType,
        entityId: resourceId,
        userId: adminId,
        metadata: {
          ...metadata,
          approvalType: resourceType,
        },
      });

      // Track approval count
      const approvalKey = `security:approvals:${adminId}:${this.getDateKey()}`;
      await this.redis.incr(approvalKey);
      await this.redis.expire(approvalKey, 86400);

      // Track approval in last hour for anomaly detection
      const hourlyKey = `security:approvals:${adminId}:hourly:${this.getHourKey()}`;
      await this.redis.incr(hourlyKey);
      await this.redis.expire(hourlyKey, 3600);

      const hourlyCount = await this.redis.get(hourlyKey);
      const count = hourlyCount ? parseInt(hourlyCount) : 0;

      // Detect approval spikes (threshold: 20 approvals in 1 hour)
      if (count >= 20) {
        await this.createSecurityAlert({
          severity: 'MEDIUM',
          type: 'APPROVAL_ANOMALY',
          title: 'Unusual Approval Activity',
          description: `Admin has approved ${count} items in the last hour`,
          userId: adminId,
          metadata: {
            approvalCount: count,
            resourceType,
            timeWindow: '1 hour',
          },
        });
      }

      // Check for off-hours approvals (outside 9 AM - 6 PM UTC)
      const hour = new Date().getUTCHours();
      if (hour < 9 || hour >= 18) {
        // Track off-hours approvals
        const offHoursKey = `security:approvals:off-hours:${adminId}:${this.getDateKey()}`;
        await this.redis.incr(offHoursKey);
        await this.redis.expire(offHoursKey, 86400);

        const offHoursCount = await this.redis.get(offHoursKey);
        if (offHoursCount && parseInt(offHoursCount) >= 5) {
          await this.createSecurityAlert({
            severity: 'LOW',
            type: 'APPROVAL_ANOMALY',
            title: 'Off-Hours Approval Pattern',
            description: `Admin has approved ${offHoursCount} items outside normal business hours today`,
            userId: adminId,
            metadata: {
              approvalCount: parseInt(offHoursCount),
              currentHour: hour,
              businessHours: '9:00-18:00 UTC',
            },
          });
        }
      }

      // Detect rapid consecutive approvals of same type (possible mass approval abuse)
      const recentApprovalsKey = `security:approvals:recent:${adminId}:${resourceType}`;
      await this.redis.lpush(recentApprovalsKey, JSON.stringify({
        resourceId,
        timestamp: Date.now(),
      }));
      await this.redis.ltrim(recentApprovalsKey, 0, 9); // Keep last 10
      await this.redis.expire(recentApprovalsKey, 600); // 10 minutes

      const recentApprovals = await this.redis.lrange(recentApprovalsKey, 0, -1);
      if (recentApprovals.length >= 10) {
        const timestamps = recentApprovals.map(a => JSON.parse(a).timestamp);
        const timeSpan = timestamps[0] - timestamps[timestamps.length - 1];

        // Alert if 10 approvals in less than 2 minutes
        if (timeSpan < 120000) {
          await this.createSecurityAlert({
            severity: 'HIGH',
            type: 'APPROVAL_ANOMALY',
            title: 'Rapid Mass Approval Detected',
            description: `Admin approved 10 ${resourceType} items in ${Math.round(timeSpan / 1000)} seconds`,
            userId: adminId,
            metadata: {
              resourceType,
              approvalCount: 10,
              timeSpan: Math.round(timeSpan / 1000),
              possibleAutomation: true,
            },
          });
        }
      }
    } catch (error) {
      console.error('[AdminSecurityMonitoring] Failed to track approval action:', error);
    }
  }

  /**
   * Track permission escalation attempt
   * 
   * @param attempt - Escalation attempt details
   */
  async trackPermissionEscalation(attempt: PermissionEscalationAttempt): Promise<void> {
    try {
      // Log to audit service
      await this.auditService.log({
        action: 'PERMISSION_ESCALATION_ATTEMPT',
        entityType: 'user',
        entityId: attempt.userId,
        userId: attempt.userId,
        metadata: {
          currentRole: attempt.currentRole,
          attemptedRole: attempt.attemptedRole,
          attemptedPermissions: attempt.attemptedPermissions,
          context: attempt.context,
        },
      });

      // Track escalation attempts
      const escalationKey = `security:escalation:${attempt.userId}:${this.getDateKey()}`;
      await this.redis.incr(escalationKey);
      await this.redis.expire(escalationKey, 86400);

      // Always alert on escalation attempts - these are critical
      await this.createSecurityAlert({
        severity: 'CRITICAL',
        type: 'ESCALATION_ATTEMPT',
        title: 'Permission Escalation Attempt Detected',
        description: `User attempted to gain elevated permissions`,
        userId: attempt.userId,
        metadata: {
          currentRole: attempt.currentRole,
          attemptedRole: attempt.attemptedRole,
          attemptedPermissions: attempt.attemptedPermissions,
          context: attempt.context,
        },
      });

      // Check for repeated attempts (any repeat is highly suspicious)
      const count = await this.redis.get(escalationKey);
      if (count && parseInt(count) > 1) {
        await this.createSecurityAlert({
          severity: 'CRITICAL',
          type: 'ESCALATION_ATTEMPT',
          title: 'Multiple Permission Escalation Attempts',
          description: `User has attempted permission escalation ${count} times today - possible account compromise`,
          userId: attempt.userId,
          metadata: {
            attemptCount: parseInt(count),
            recommendedAction: 'IMMEDIATE_INVESTIGATION',
            suspectedCompromise: true,
          },
        });
      }
    } catch (error) {
      console.error('[AdminSecurityMonitoring] Failed to track escalation attempt:', error);
    }
  }

  /**
   * Create a security alert
   */
  private async createSecurityAlert(
    alert: Omit<SecurityAlert, 'id' | 'timestamp' | 'acknowledged'>
  ): Promise<SecurityAlert> {
    try {
      const fullAlert: SecurityAlert = {
        ...alert,
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        acknowledged: false,
      };

      // Store alert in Redis
      const alertKey = `security:alerts:${fullAlert.severity}:${fullAlert.id}`;
      await this.redis.setex(
        alertKey,
        86400 * 7, // Keep for 7 days
        JSON.stringify(fullAlert)
      );

      // Add to alerts index
      const indexKey = `security:alerts:index:${this.getDateKey()}`;
      await this.redis.lpush(indexKey, fullAlert.id);
      await this.redis.expire(indexKey, 86400 * 7);

      // TODO: Send alert notifications (email, Slack, etc.)
      // This would integrate with existing notification infrastructure
      console.warn(`[SECURITY ALERT] ${fullAlert.severity}: ${fullAlert.title}`, {
        userId: fullAlert.userId,
        metadata: fullAlert.metadata,
      });

      return fullAlert;
    } catch (error) {
      console.error('[AdminSecurityMonitoring] Failed to create security alert:', error);
      throw error;
    }
  }

  /**
   * Get security dashboard metrics
   */
  async getDashboardMetrics(): Promise<SecurityDashboard> {
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      const weekAgo = new Date(now.getTime() - 86400000 * 7);

      // Get permission violations from audit logs
      const violations24h = await this.prisma.auditEvent.count({
        where: {
          action: 'PERMISSION_DENIED',
          timestamp: { gte: yesterday },
        },
      });

      const violations7d = await this.prisma.auditEvent.count({
        where: {
          action: 'PERMISSION_DENIED',
          timestamp: { gte: weekAgo },
        },
      });

      // Get top violators
      const violationsByUser = await this.prisma.auditEvent.groupBy({
        by: ['userId'],
        where: {
          action: 'PERMISSION_DENIED',
          timestamp: { gte: weekAgo },
          userId: { not: null },
        },
        _count: true,
        orderBy: {
          _count: {
            userId: 'desc',
          },
        },
        take: 10,
      });

      // Get user details for violators
      const userIds = violationsByUser.map(v => v.userId).filter((id): id is string => id !== null);
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true },
      });

      const userMap = new Map(users.map(u => [u.id, u.email]));

      // Get approval metrics
      const totalApprovals = await this.prisma.auditEvent.count({
        where: {
          action: 'APPROVAL_GRANTED',
          timestamp: { gte: weekAgo },
        },
      });

      // Get escalation attempts
      const escalations24h = await this.prisma.auditEvent.count({
        where: {
          action: 'PERMISSION_ESCALATION_ATTEMPT',
          timestamp: { gte: yesterday },
        },
      });

      const escalations7d = await this.prisma.auditEvent.count({
        where: {
          action: 'PERMISSION_ESCALATION_ATTEMPT',
          timestamp: { gte: weekAgo },
        },
      });

      // Get active alerts counts
      const alertCounts = await this.getActiveAlertCounts();

      return {
        permissionViolations: {
          last24Hours: violations24h,
          last7Days: violations7d,
          byUser: violationsByUser.map(v => ({
            userId: v.userId || 'unknown',
            email: v.userId ? userMap.get(v.userId) || 'unknown' : 'unknown',
            count: v._count,
          })),
          byPermission: [], // TODO: Add permission grouping
        },
        approvalPatterns: {
          totalApprovals,
          anomalousApprovals: 0, // TODO: Calculate from alerts
          byAdmin: [], // TODO: Group by admin
        },
        escalationAttempts: {
          last24Hours: escalations24h,
          last7Days: escalations7d,
          byUser: [], // TODO: Group by user
        },
        activeAlerts: alertCounts,
      };
    } catch (error) {
      console.error('[AdminSecurityMonitoring] Failed to get dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * Get active alert counts by severity
   */
  private async getActiveAlertCounts(): Promise<{
    critical: number;
    high: number;
    medium: number;
    low: number;
  }> {
    try {
      const severities: Array<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      const counts = await Promise.all(
        severities.map(async (severity) => {
          const pattern = `security:alerts:${severity}:*`;
          const keys = await this.redis.keys(pattern);

          // Filter unacknowledged
          const unacknowledged = await Promise.all(
            keys.map(async (key) => {
              const data = await this.redis.get(key);
              if (!data) return false;
              const alert = JSON.parse(data) as SecurityAlert;
              return !alert.acknowledged;
            })
          );

          return unacknowledged.filter(Boolean).length;
        })
      );

      return {
        critical: counts[0],
        high: counts[1],
        medium: counts[2],
        low: counts[3],
      };
    } catch (error) {
      console.error('[AdminSecurityMonitoring] Failed to get alert counts:', error);
      return { critical: 0, high: 0, medium: 0, low: 0 };
    }
  }

  /**
   * Acknowledge a security alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    try {
      // Find the alert
      const severities: Array<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

      for (const severity of severities) {
        const alertKey = `security:alerts:${severity}:${alertId}`;
        const data = await this.redis.get(alertKey);

        if (data) {
          const alert = JSON.parse(data) as SecurityAlert;
          alert.acknowledged = true;

          await this.redis.setex(
            alertKey,
            86400 * 7,
            JSON.stringify(alert)
          );

          // Log acknowledgement
          await this.auditService.log({
            action: 'SECURITY_ALERT_ACKNOWLEDGED',
            entityType: 'alert',
            entityId: alertId,
            userId: acknowledgedBy,
            metadata: {
              alertType: alert.type,
              severity: alert.severity,
              originalUserId: alert.userId,
            },
          });

          return;
        }
      }

      throw new Error('Alert not found');
    } catch (error) {
      console.error('[AdminSecurityMonitoring] Failed to acknowledge alert:', error);
      throw error;
    }
  }

  /**
   * Get date key for Redis (YYYY-MM-DD)
   */
  private getDateKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get hour key for Redis (YYYY-MM-DD:HH)
   */
  private getHourKey(): string {
    const now = new Date();
    return `${now.toISOString().split('T')[0]}:${now.getUTCHours().toString().padStart(2, '0')}`;
  }
}
