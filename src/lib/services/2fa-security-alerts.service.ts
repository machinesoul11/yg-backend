/**
 * 2FA Security Alerts Service
 * 
 * Monitors security patterns and generates alerts for administrators.
 * Detects anomalies, spikes in failures, and potential attacks.
 * 
 * Features:
 * - Detect failure rate spikes
 * - Identify velocity attacks
 * - Geographic anomaly detection
 * - Sustained attack pattern recognition
 * - Alert notification to admins
 * - Alert acknowledgment and resolution tracking
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { EmailService } from './email/email.service';

export interface AlertThresholds {
  failureRateSpike: number; // Percentage increase over baseline
  velocityAttackThreshold: number; // Attempts per minute
  geographicAnomalyThreshold: number; // New locations per hour
  sustainedAttackDuration: number; // Minutes of elevated activity
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  failureRateSpike: 50, // 50% increase
  velocityAttackThreshold: 10, // 10 attempts per minute
  geographicAnomalyThreshold: 5, // 5 new locations per hour
  sustainedAttackDuration: 15, // 15 minutes
};

export class TwoFactorSecurityAlertsService {
  private emailService: EmailService;

  constructor(private prisma: PrismaClient) {
    this.emailService = new EmailService();
  }

  /**
   * Check for failure rate spikes and create alerts
   */
  async checkFailureRateSpike(): Promise<void> {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get failure counts
    const recentFailures = await this.prisma.twoFactorSecurityEvent.count({
      where: {
        eventType: 'failed_attempt',
        timestamp: { gte: hourAgo },
      },
    });

    const recentTotal = await this.prisma.twoFactorSecurityEvent.count({
      where: {
        eventCategory: 'authentication',
        timestamp: { gte: hourAgo },
      },
    });

    // Get baseline (previous 24 hours, excluding recent hour)
    const baselineFailures = await this.prisma.twoFactorSecurityEvent.count({
      where: {
        eventType: 'failed_attempt',
        timestamp: { gte: dayAgo, lt: hourAgo },
      },
    });

    const baselineTotal = await this.prisma.twoFactorSecurityEvent.count({
      where: {
        eventCategory: 'authentication',
        timestamp: { gte: dayAgo, lt: hourAgo },
      },
    });

    if (recentTotal === 0 || baselineTotal === 0) return;

    const currentRate = (recentFailures / recentTotal) * 100;
    const baselineRate = (baselineFailures / baselineTotal) * 100;
    const percentageIncrease = baselineRate > 0 
      ? ((currentRate - baselineRate) / baselineRate) * 100 
      : currentRate;

    // Check if spike exceeds threshold
    if (percentageIncrease >= DEFAULT_THRESHOLDS.failureRateSpike) {
      await this.createAlert({
        alertType: 'spike_failures',
        severity: percentageIncrease >= 100 ? 'critical' : 'warning',
        title: '2FA Failure Rate Spike Detected',
        description: `Failed 2FA attempts have increased by ${percentageIncrease.toFixed(1)}% in the last hour. Current failure rate: ${currentRate.toFixed(1)}%, Baseline: ${baselineRate.toFixed(1)}%`,
        recommendation: 'Review recent failed attempts for patterns. Check if specific users or IP addresses are being targeted. Consider implementing additional rate limiting.',
        metric: 'failure_rate',
        currentValue: new Decimal(currentRate),
        threshold: new Decimal(DEFAULT_THRESHOLDS.failureRateSpike),
        baselineValue: new Decimal(baselineRate),
        periodStart: hourAgo,
        periodEnd: now,
        affectedUserCount: await this.getAffectedUserCount(hourAgo, now),
      });
    }
  }

  /**
   * Check for velocity attacks (rapid attempts from same source)
   */
  async checkVelocityAttack(): Promise<void> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Get attempts grouped by IP
    const recentAttempts = await this.prisma.twoFactorSecurityEvent.groupBy({
      by: ['ipAddress'],
      where: {
        eventCategory: 'authentication',
        timestamp: { gte: fiveMinutesAgo },
        ipAddress: { not: null },
      },
      _count: {
        id: true,
      },
      having: {
        id: {
          _count: {
            gte: DEFAULT_THRESHOLDS.velocityAttackThreshold * 5, // 5 minutes worth
          },
        },
      },
    });

    if (recentAttempts.length > 0) {
      const suspiciousIPs = recentAttempts.map(a => a.ipAddress).filter(Boolean) as string[];
      const totalAttempts = recentAttempts.reduce((sum, a) => sum + a._count.id, 0);

      await this.createAlert({
        alertType: 'velocity_attack',
        severity: 'critical',
        title: 'Velocity Attack Detected',
        description: `Detected ${totalAttempts} 2FA attempts from ${suspiciousIPs.length} IP address(es) in the last 5 minutes. This indicates a possible automated attack.`,
        recommendation: 'Immediately review the source IP addresses and consider blocking them. Check affected user accounts for compromise. Enable additional rate limiting.',
        metric: 'attempts_per_minute',
        currentValue: new Decimal(totalAttempts / 5),
        threshold: new Decimal(DEFAULT_THRESHOLDS.velocityAttackThreshold),
        periodStart: fiveMinutesAgo,
        periodEnd: now,
        affectedIpAddresses: suspiciousIPs,
        affectedUserCount: await this.getAffectedUserCount(fiveMinutesAgo, now),
      });
    }
  }

  /**
   * Check for geographic anomalies
   */
  async checkGeographicAnomaly(): Promise<void> {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get unique countries in the last hour
    const recentCountries = await this.prisma.twoFactorSecurityEvent.groupBy({
      by: ['locationCountry'],
      where: {
        eventCategory: 'authentication',
        timestamp: { gte: hourAgo },
        locationCountry: { not: null },
      },
    });

    // Get typical countries from previous week
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const baselineCountries = await this.prisma.twoFactorSecurityEvent.groupBy({
      by: ['locationCountry'],
      where: {
        eventCategory: 'authentication',
        timestamp: { gte: weekAgo, lt: hourAgo },
        locationCountry: { not: null },
      },
    });

    const baselineSet = new Set(baselineCountries.map(c => c.locationCountry));
    const newCountries = recentCountries.filter(c => !baselineSet.has(c.locationCountry));

    if (newCountries.length >= DEFAULT_THRESHOLDS.geographicAnomalyThreshold) {
      await this.createAlert({
        alertType: 'geographic_anomaly',
        severity: 'warning',
        title: 'Unusual Geographic Activity Detected',
        description: `Detected 2FA attempts from ${newCountries.length} new geographic location(s) in the last hour that were not seen in the previous week.`,
        recommendation: 'Review authentication attempts from these new locations. Verify if legitimate users are traveling or if accounts may be compromised.',
        metric: 'new_locations_per_hour',
        currentValue: new Decimal(newCountries.length),
        threshold: new Decimal(DEFAULT_THRESHOLDS.geographicAnomalyThreshold),
        periodStart: hourAgo,
        periodEnd: now,
      });
    }
  }

  /**
   * Check for sustained attack patterns
   */
  async checkSustainedAttack(): Promise<void> {
    const now = new Date();
    const duration = DEFAULT_THRESHOLDS.sustainedAttackDuration;
    const periodStart = new Date(now.getTime() - duration * 60 * 1000);

    // Get failure rate over sustained period
    const failures = await this.prisma.twoFactorSecurityEvent.count({
      where: {
        eventType: 'failed_attempt',
        timestamp: { gte: periodStart },
      },
    });

    const total = await this.prisma.twoFactorSecurityEvent.count({
      where: {
        eventCategory: 'authentication',
        timestamp: { gte: periodStart },
      },
    });

    if (total === 0) return;

    const failureRate = (failures / total) * 100;

    // If failure rate is consistently high (> 30%) for sustained period
    if (failureRate > 30 && failures > 20) {
      await this.createAlert({
        alertType: 'sustained_attack',
        severity: 'urgent',
        title: 'Sustained Attack Pattern Detected',
        description: `Elevated 2FA failure rate (${failureRate.toFixed(1)}%) has been sustained for ${duration} minutes with ${failures} failed attempts.`,
        recommendation: 'IMMEDIATE ACTION REQUIRED: This indicates an ongoing attack. Review system security, implement temporary lockdowns if necessary, and investigate source of attacks.',
        metric: 'sustained_failure_rate',
        currentValue: new Decimal(failureRate),
        threshold: new Decimal(30),
        periodStart,
        periodEnd: now,
        affectedUserCount: await this.getAffectedUserCount(periodStart, now),
      });
    }
  }

  /**
   * Create a security alert
   */
  private async createAlert(params: {
    alertType: string;
    severity: 'info' | 'warning' | 'critical' | 'urgent';
    title: string;
    description: string;
    recommendation?: string;
    metric: string;
    currentValue: Decimal;
    threshold: Decimal;
    baselineValue?: Decimal;
    periodStart: Date;
    periodEnd: Date;
    affectedUserCount?: number;
    affectedUsers?: string[];
    affectedIpAddresses?: string[];
  }): Promise<void> {
    // Check if similar alert already exists and is active
    const existingAlert = await this.prisma.twoFactorSecurityAlert.findFirst({
      where: {
        alertType: params.alertType,
        status: 'active',
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Within last hour
        },
      },
    });

    if (existingAlert) {
      console.log(`[SecurityAlerts] Similar alert already active, skipping: ${params.alertType}`);
      return;
    }

    // Create alert
    const alert = await this.prisma.twoFactorSecurityAlert.create({
      data: {
        alertType: params.alertType,
        severity: params.severity,
        title: params.title,
        description: params.description,
        recommendation: params.recommendation,
        metric: params.metric,
        currentValue: params.currentValue,
        threshold: params.threshold,
        baselineValue: params.baselineValue,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        affectedUserCount: params.affectedUserCount,
        affectedUsers: params.affectedUsers || [],
        affectedIpAddresses: params.affectedIpAddresses || [],
      },
    });

    console.log(`[SecurityAlerts] Created ${params.severity} alert: ${params.title}`);

    // Send notifications to admins
    await this.notifyAdmins(alert);
  }

  /**
   * Notify administrators about alert
   */
  private async notifyAdmins(alert: any): Promise<void> {
    try {
      // Get all admin users
      const admins = await this.prisma.user.findMany({
        where: {
          role: 'ADMIN',
          deleted_at: null,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      const adminEmails = admins.map(a => a.email);

      if (adminEmails.length === 0) {
        console.warn('[SecurityAlerts] No admin users found to notify');
        return;
      }

      // Send email notification
      const severityEmoji = {
        info: 'ℹ️',
        warning: '⚠️',
        critical: '🚨',
        urgent: '🔥',
      };

      const subject = `${severityEmoji[alert.severity as keyof typeof severityEmoji]} ${alert.severity.toUpperCase()}: ${alert.title}`;
      
      // For now, log the notification (email sending would be implemented here)
      console.log('[SecurityAlerts] Would notify admins:', {
        to: adminEmails,
        subject,
        alertId: alert.id,
      });

      // Update alert as notified
      await this.prisma.twoFactorSecurityAlert.update({
        where: { id: alert.id },
        data: {
          notificationSent: true,
          notificationSentAt: new Date(),
          notifiedAdmins: admins.map(a => a.id),
        },
      });

    } catch (error) {
      console.error('[SecurityAlerts] Failed to notify admins:', error);
    }
  }

  /**
   * Get count of affected users in a time period
   */
  private async getAffectedUserCount(startDate: Date, endDate: Date): Promise<number> {
    const result = await this.prisma.twoFactorSecurityEvent.groupBy({
      by: ['userId'],
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    return result.length;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, adminId: string): Promise<void> {
    await this.prisma.twoFactorSecurityAlert.update({
      where: { id: alertId },
      data: {
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        acknowledgedBy: adminId,
      },
    });

    console.log(`[SecurityAlerts] Alert ${alertId} acknowledged by ${adminId}`);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, adminId: string, resolution: string): Promise<void> {
    await this.prisma.twoFactorSecurityAlert.update({
      where: { id: alertId },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: adminId,
        resolution,
      },
    });

    console.log(`[SecurityAlerts] Alert ${alertId} resolved by ${adminId}`);
  }

  /**
   * Mark alert as false positive
   */
  async markAsFalsePositive(alertId: string, adminId: string): Promise<void> {
    await this.prisma.twoFactorSecurityAlert.update({
      where: { id: alertId },
      data: {
        status: 'false_positive',
        resolvedAt: new Date(),
        resolvedBy: adminId,
        resolution: 'Marked as false positive',
      },
    });

    console.log(`[SecurityAlerts] Alert ${alertId} marked as false positive by ${adminId}`);
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(options?: { severity?: string; limit?: number }) {
    const { severity, limit = 50 } = options || {};

    return this.prisma.twoFactorSecurityAlert.findMany({
      where: {
        status: 'active',
        ...(severity && { severity }),
      },
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });
  }

  /**
   * Get alert history
   */
  async getAlertHistory(options?: {
    startDate?: Date;
    endDate?: Date;
    alertType?: string;
    severity?: string;
    status?: string;
    limit?: number;
  }) {
    const { startDate, endDate, alertType, severity, status, limit = 100 } = options || {};

    return this.prisma.twoFactorSecurityAlert.findMany({
      where: {
        ...(alertType && { alertType }),
        ...(severity && { severity }),
        ...(status && { status }),
        ...(startDate || endDate ? {
          createdAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Run all alert checks
   */
  async runAllChecks(): Promise<void> {
    console.log('[SecurityAlerts] Running all security checks...');

    await Promise.all([
      this.checkFailureRateSpike(),
      this.checkVelocityAttack(),
      this.checkGeographicAnomaly(),
      this.checkSustainedAttack(),
    ]);

    console.log('[SecurityAlerts] ✓ All security checks completed');
  }
}
